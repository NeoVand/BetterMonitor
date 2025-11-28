/**
 * Process Clustering Module
 * Implements two-tier clustering: fast assignment + full hierarchical recluster
 */

import { SystemProcess, ProcessCluster, ClusterTree } from '../shared/types';
import { vectorStore, ProcessVectorStore, processToText } from './vector-store';
import { cosineSimilarity, chatComplete } from './openrouter';
import { v4 as uuidv4 } from 'uuid';

// Clustering thresholds
const SIMILARITY_THRESHOLD = 0.75;  // Min similarity to join existing cluster
const MERGE_THRESHOLD = 0.8;        // Similarity to merge clusters
const MAX_CLUSTER_SIZE = 25;        // Split clusters larger than this
const MIN_CLUSTER_SIZE = 2;         // Don't create clusters smaller than this

// Track clustering state
let currentClusters: ProcessCluster[] = [];
let lastFullRecluster = 0;
let singletonCount = 0;

/**
 * Generate a unique cluster ID
 */
function generateClusterId(): string {
  return `cluster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create an empty cluster
 */
function createEmptyCluster(overrides?: Partial<ProcessCluster>): ProcessCluster {
  return {
    id: generateClusterId(),
    name: 'Uncategorized',
    description: '',
    category: 'Other',
    processIds: [],
    centroid: [],
    children: [],
    parent: null,
    depth: 1,
    aggregateStats: {
      totalCpu: 0,
      totalMem: 0,
      totalNetIn: 0,
      totalNetOut: 0,
      processCount: 0,
    },
    ...overrides,
  };
}

/**
 * Create a singleton cluster for a single process
 */
function createSingletonCluster(process: SystemProcess, embedding: number[]): ProcessCluster {
  return createEmptyCluster({
    name: process.name,
    description: `Single process: ${process.name}`,
    processIds: [process.pid],
    centroid: embedding,
    aggregateStats: {
      totalCpu: process.cpu,
      totalMem: process.mem,
      totalNetIn: process.netIn || 0,
      totalNetOut: process.netOut || 0,
      processCount: 1,
    },
  });
}

/**
 * Update cluster aggregate stats
 */
function updateClusterStats(cluster: ProcessCluster, processes: SystemProcess[]): void {
  const clusterProcesses = processes.filter(p => cluster.processIds.includes(p.pid));
  
  cluster.aggregateStats = {
    totalCpu: clusterProcesses.reduce((sum, p) => sum + p.cpu, 0),
    totalMem: clusterProcesses.reduce((sum, p) => sum + p.mem, 0),
    totalNetIn: clusterProcesses.reduce((sum, p) => sum + (p.netIn || 0), 0),
    totalNetOut: clusterProcesses.reduce((sum, p) => sum + (p.netOut || 0), 0),
    processCount: clusterProcesses.length,
  };
}

/**
 * Tier 1: Fast assignment of a new process to existing clusters
 */
export async function assignProcessToCluster(
  process: SystemProcess,
  clusters: ProcessCluster[]
): Promise<{ cluster: ProcessCluster; isNew: boolean }> {
  // Get embedding for the process
  const embedding = await vectorStore.getProcessEmbedding(process);
  
  // Find nearest cluster centroid
  const centroids = clusters
    .filter(c => c.centroid.length > 0)
    .map(c => ({ id: c.id, centroid: c.centroid }));
  
  const nearest = vectorStore.findNearestCentroid(embedding, centroids);
  
  if (nearest && nearest.similarity >= SIMILARITY_THRESHOLD) {
    // Assign to existing cluster
    const cluster = clusters.find(c => c.id === nearest.id)!;
    
    if (!cluster.processIds.includes(process.pid)) {
      cluster.processIds.push(process.pid);
      
      // Update centroid (running average)
      const allEmbeddings = await Promise.all(
        cluster.processIds.slice(-10).map(async pid => {
          const p = { pid, name: '', command: '' } as SystemProcess;
          // This is a simplification - in practice we'd look up the actual process
          return cluster.centroid;
        })
      );
      cluster.centroid = ProcessVectorStore.calculateCentroid([...allEmbeddings, embedding]);
    }
    
    return { cluster, isNew: false };
  }
  
  // Create new singleton cluster
  singletonCount++;
  const newCluster = createSingletonCluster(process, embedding);
  
  return { cluster: newCluster, isNew: true };
}

/**
 * Check if full recluster is needed
 */
export function needsFullRecluster(processes: SystemProcess[]): boolean {
  const timeSinceLastRecluster = Date.now() - lastFullRecluster;
  
  // Recluster if:
  // 1. Never clustered before
  if (lastFullRecluster === 0) return true;
  
  // 2. Too many singletons accumulated
  if (singletonCount >= 5) return true;
  
  // 3. More than 60 seconds since last recluster
  if (timeSinceLastRecluster > 60000) return true;
  
  // 4. Process count changed significantly (>20%)
  const currentPidCount = new Set(currentClusters.flatMap(c => c.processIds)).size;
  const newPidCount = processes.length;
  const changeRatio = Math.abs(newPidCount - currentPidCount) / Math.max(currentPidCount, 1);
  if (changeRatio > 0.2) return true;
  
  return false;
}

/**
 * Tier 2: Full hierarchical recluster
 */
export async function fullRecluster(processes: SystemProcess[]): Promise<ClusterTree> {
  console.log(`Starting full recluster of ${processes.length} total processes...`);
  
  // Include ALL processes - don't filter out "inactive" ones
  // Users need to see everything, especially high-memory or high-CPU processes
  // that might momentarily have 0 CPU but still matter
  const activeProcesses = processes.filter(p => 
    // Only filter out truly empty processes (0 everything)
    p.cpu > 0 || p.mem > 0.1 || (p.netIn || 0) > 0 || (p.netOut || 0) > 0
  );
  
  console.log(`Processes to cluster: ${activeProcesses.length}`);
  
  if (activeProcesses.length === 0) {
    return createEmptyTree();
  }
  
  // IMPORTANT: Deduplicate by process name to reduce embedding calls
  // Group processes by name, keep all PIDs but only embed unique names
  const byName = new Map<string, SystemProcess[]>();
  for (const p of activeProcesses) {
    const existing = byName.get(p.name) || [];
    existing.push(p);
    byName.set(p.name, existing);
  }
  
  // Get one representative process per unique name
  const uniqueProcesses = Array.from(byName.values()).map(procs => procs[0]);
  console.log(`Unique process names to embed: ${uniqueProcesses.length}`);
  
  // Get embeddings for unique processes only
  const embeddingsMap = await vectorStore.batchGetEmbeddings(uniqueProcesses);
  
  // Build process-to-embedding lookup (use representative process for each name)
  const processEmbeddings: { process: SystemProcess; embedding: number[]; allPids: number[] }[] = [];
  for (const [name, procs] of byName.entries()) {
    const representative = procs[0];
    const key = `${representative.name}::${representative.command}`.slice(0, 500);
    const embedding = embeddingsMap.get(key);
    if (embedding) {
      processEmbeddings.push({ 
        process: representative, 
        embedding,
        allPids: procs.map(p => p.pid) // Keep ALL PIDs for this name
      });
    }
  }
  
  // Perform agglomerative clustering on unique processes
  const clusters = agglomerativeClusterWithPids(processEmbeddings);
  
  // Generate AI names for clusters (use heuristics first, AI only if needed)
  await generateClusterNames(clusters, activeProcesses);
  
  // Update stats using all active processes
  for (const cluster of clusters) {
    updateClusterStats(cluster, activeProcesses);
  }
  
  // Build tree structure
  const tree = buildClusterTree(clusters);
  
  // Update state
  currentClusters = clusters;
  lastFullRecluster = Date.now();
  singletonCount = 0;
  
  console.log(`Recluster complete: ${clusters.length} clusters created from ${uniqueProcesses.length} unique names`);
  
  return tree;
}

/**
 * Agglomerative hierarchical clustering with grouped PIDs
 */
function agglomerativeClusterWithPids(
  items: { process: SystemProcess; embedding: number[]; allPids: number[] }[]
): ProcessCluster[] {
  if (items.length === 0) return [];
  
  // Start with each unique process name in its own cluster (but include all PIDs)
  let clusters: {
    id: string;
    processIds: number[];
    embeddings: number[][];
    centroid: number[];
  }[] = items.map(item => ({
    id: generateClusterId(),
    processIds: item.allPids, // Include ALL PIDs for this process name
    embeddings: [item.embedding],
    centroid: item.embedding,
  }));
  
  // Merge until no more merges possible
  let merged = true;
  while (merged && clusters.length > 1) {
    merged = false;
    
    // Find most similar pair
    let bestPair: [number, number] | null = null;
    let bestSimilarity = 0;
    
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const similarity = cosineSimilarity(clusters[i].centroid, clusters[j].centroid);
        if (similarity > bestSimilarity && similarity >= MERGE_THRESHOLD) {
          bestSimilarity = similarity;
          bestPair = [i, j];
        }
      }
    }
    
    // Merge best pair
    if (bestPair) {
      const [i, j] = bestPair;
      const merged1 = clusters[i];
      const merged2 = clusters[j];
      
      // Check size limit (by number of unique process names, not total PIDs)
      if (merged1.embeddings.length + merged2.embeddings.length <= MAX_CLUSTER_SIZE) {
        const newCluster = {
          id: generateClusterId(),
          processIds: [...merged1.processIds, ...merged2.processIds],
          embeddings: [...merged1.embeddings, ...merged2.embeddings],
          centroid: ProcessVectorStore.calculateCentroid([...merged1.embeddings, ...merged2.embeddings]),
        };
        
        // Remove old clusters and add new one
        clusters = clusters.filter((_, idx) => idx !== i && idx !== j);
        clusters.push(newCluster);
        merged = true;
      }
    }
  }
  
  // Convert to ProcessCluster format
  return clusters
    .filter(c => c.embeddings.length >= MIN_CLUSTER_SIZE || clusters.length <= 5)
    .map(c => createEmptyCluster({
      id: c.id,
      processIds: c.processIds,
      centroid: c.centroid,
    }));
}

/**
 * Generate names for clusters - use heuristics first, AI only for ambiguous cases
 */
async function generateClusterNames(
  clusters: ProcessCluster[], 
  processes: SystemProcess[]
): Promise<void> {
  // First pass: use heuristics for all clusters
  const needsAI: ProcessCluster[] = [];
  
  for (const cluster of clusters) {
    const clusterProcesses = processes.filter(p => cluster.processIds.includes(p.pid));
    const uniqueNames = [...new Set(clusterProcesses.map(p => p.name))];
    
    // If only one unique name, use it directly
    if (uniqueNames.length === 1) {
      cluster.name = uniqueNames[0];
      cluster.description = `${clusterProcesses.length} instance(s) of ${uniqueNames[0]}`;
      cluster.category = inferCategory(uniqueNames);
      continue;
    }
    
    // Try common prefix
    const commonPrefix = findCommonPrefix(uniqueNames);
    if (commonPrefix.length >= 3) {
      cluster.name = commonPrefix;
      cluster.description = `${uniqueNames.length} related processes`;
      cluster.category = inferCategory(uniqueNames);
      continue;
    }
    
    // Try to find a dominant name (>50% of processes)
    const nameCounts = new Map<string, number>();
    for (const name of uniqueNames) {
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    }
    const dominant = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (dominant && dominant[1] > uniqueNames.length * 0.5) {
      cluster.name = `${dominant[0]} & related`;
      cluster.description = `${uniqueNames.length} related processes`;
      cluster.category = inferCategory(uniqueNames);
      continue;
    }
    
    // Category-based naming
    const category = inferCategory(uniqueNames);
    cluster.category = category;
    cluster.name = `${category} processes`;
    cluster.description = `${uniqueNames.length} ${category.toLowerCase()} processes`;
    
    // Only use AI for truly ambiguous clusters (skip for now to avoid rate limits)
    // needsAI.push(cluster);
  }
  
  // Skip AI naming for now - heuristics are good enough and avoid rate limits
  // If you want AI naming, uncomment the code below and the needsAI.push above
  
  /*
  if (needsAI.length > 0 && needsAI.length <= 5) {
    // Only use AI for a few ambiguous clusters
    for (const cluster of needsAI) {
      try {
        const clusterProcesses = processes.filter(p => cluster.processIds.includes(p.pid));
        const processNames = [...new Set(clusterProcesses.map(p => p.name))].slice(0, 10);
        
        const prompt = `Given these macOS process names: ${processNames.join(', ')}
Provide a short, friendly group name (2-4 words) and category.
Categories: System, Development, Browser, Communication, Media, Background, Other
Respond in JSON format: {"name": "Group Name", "category": "Category"}`;

        const response = await chatComplete([
          { role: 'system', content: 'You are a helpful assistant. Respond only with valid JSON.' },
          { role: 'user', content: prompt },
        ]);
        
        const parsed = JSON.parse(response);
        cluster.name = parsed.name || cluster.name;
        cluster.category = parsed.category || cluster.category;
      } catch (error) {
        // Keep heuristic name
      }
    }
  }
  */
}

/**
 * Find common prefix among strings
 */
function findCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  if (strings.length === 1) return strings[0];
  
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix) && prefix.length > 0) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

/**
 * Infer category from process names
 */
function inferCategory(names: string[]): ProcessCluster['category'] {
  const joined = names.join(' ').toLowerCase();
  
  if (/chrome|safari|firefox|edge|browser|webkit/i.test(joined)) return 'Browser';
  if (/node|python|ruby|java|vscode|xcode|git|npm|yarn/i.test(joined)) return 'Development';
  if (/slack|zoom|teams|discord|telegram|messages/i.test(joined)) return 'Communication';
  if (/spotify|music|video|vlc|quicktime|audio/i.test(joined)) return 'Media';
  if (/kernel|launchd|system|daemon|agent/i.test(joined)) return 'System';
  if (/helper|agent|service|worker/i.test(joined)) return 'Background';
  
  return 'Other';
}

/**
 * Build hierarchical tree from flat clusters
 */
function buildClusterTree(clusters: ProcessCluster[]): ClusterTree {
  // Create virtual root
  const root = createEmptyCluster({
    id: 'root',
    name: 'All Processes',
    depth: 0,
    children: clusters,
  });
  
  // Set parent references
  for (const cluster of clusters) {
    cluster.parent = 'root';
    cluster.depth = 1;
  }
  
  // Calculate root stats
  root.aggregateStats = {
    totalCpu: clusters.reduce((sum, c) => sum + c.aggregateStats.totalCpu, 0),
    totalMem: clusters.reduce((sum, c) => sum + c.aggregateStats.totalMem, 0),
    totalNetIn: clusters.reduce((sum, c) => sum + c.aggregateStats.totalNetIn, 0),
    totalNetOut: clusters.reduce((sum, c) => sum + c.aggregateStats.totalNetOut, 0),
    processCount: clusters.reduce((sum, c) => sum + c.aggregateStats.processCount, 0),
  };
  
  return {
    root,
    flatList: [root, ...clusters],
    lastUpdated: Date.now(),
  };
}

/**
 * Create an empty tree
 */
function createEmptyTree(): ClusterTree {
  const root = createEmptyCluster({
    id: 'root',
    name: 'All Processes',
    depth: 0,
  });
  
  return {
    root,
    flatList: [root],
    lastUpdated: Date.now(),
  };
}

/**
 * Get current clusters
 */
export function getCurrentClusters(): ProcessCluster[] {
  return currentClusters;
}

/**
 * Update cluster stats with current process data
 */
export function refreshClusterStats(processes: SystemProcess[]): void {
  for (const cluster of currentClusters) {
    updateClusterStats(cluster, processes);
  }
}

