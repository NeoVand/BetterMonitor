export interface SystemProcess {
  pid: number;
  name: string;
  command: string;
  cpu: number;
  mem: number; // in MB
  started: string; // ISO timestamp
  user: string;
  path: string;
  threads: number;
  state?: string;
  priority?: number;
  parentPid?: number;
  connections?: number; // Count of network connections
  netIn?: number; // Bytes received (cumulative)
  netOut?: number; // Bytes sent (cumulative)
}

export interface ProcessAnalysis {
  friendlyName: string;
  category: 'System' | 'Development' | 'Browser' | 'Communication' | 'Media' | 'Suspicious' | 'Other';
  description: string;
  riskLevel: 'Safe' | 'Caution' | 'High';
}

export interface ExtendedProcess extends SystemProcess {
  analysis?: ProcessAnalysis;
}

// Parsed network connection from lsof
export interface NetworkConnection {
  pid: number;
  processName: string;
  user: string;
  fd: string;
  type: 'IPv4' | 'IPv6';
  protocol: 'TCP' | 'UDP';
  localAddress: string;
  remoteAddress?: string;
  state?: string; // ESTABLISHED, LISTEN, etc.
}

export interface GlobalStats {
  cpu: number;
  mem: {
    total: number;
    used: number;
    active: number;
  };
  net: {
    rx_sec: number;
    tx_sec: number;
  };
  disk: {
    rIO_sec: number;
    wIO_sec: number;
  };
  gpu: number;
  connections: NetworkConnection[]; // All active connections
  connectionsByProcess: Record<number, number>; // pid -> connection count
}

// ============ AI Clustering Types ============

export interface ProcessCluster {
  id: string;
  name: string;                    // AI-generated friendly name
  description: string;             // AI-generated explanation
  category: 'System' | 'Development' | 'Browser' | 'Communication' | 'Media' | 'Background' | 'Other';
  processIds: number[];            // PIDs in this cluster
  centroid: number[];              // Average embedding for fast nearest-neighbor
  children: ProcessCluster[];      // Sub-clusters (hierarchical)
  parent: string | null;           // Parent cluster ID
  depth: number;                   // 0 = root, 1 = top-level, etc.
  aggregateStats: {
    totalCpu: number;
    totalMem: number;
    totalNetIn: number;
    totalNetOut: number;
    processCount: number;
  };
}

export interface ClusterTree {
  root: ProcessCluster;            // Virtual root containing all top-level clusters
  flatList: ProcessCluster[];      // All clusters flattened for easy lookup
  lastUpdated: number;             // Timestamp of last full recluster
}

// ============ AI Settings Types ============

export interface AISettings {
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  temperature: number;
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

// ============ Mind Map Visualization Types ============

export interface MindMapNode {
  id: string;
  type: 'cluster' | 'process';
  name: string;
  category?: string;
  parentId: string | null;
  children: string[];              // Child node IDs
  stats?: {
    cpu: number;
    mem: number;
    netIn: number;
    netOut: number;
  };
  // For D3 force simulation
  x?: number;
  y?: number;
  fx?: number | null;              // Fixed x position
  fy?: number | null;              // Fixed y position
}

export interface MindMapLink {
  source: string;
  target: string;
  strength?: number;               // Link strength for force simulation
}
