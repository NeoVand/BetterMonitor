"use client";

import { useEffect, useRef, useState, useMemo } from 'react';
import { ProcessCluster, SystemProcess } from '../../shared/types';
import { useProcessStore } from '@/lib/store';
import { ClusterPackVisualization, PackNode } from '@/lib/cluster-pack';
import { CATEGORY_COLORS, getProcessColor } from '@/lib/process-utils';
import { RefreshCw, Loader2, ChevronRight, ChevronDown, List, Circle } from 'lucide-react';
import clsx from 'clsx';

type ViewMode = 'tree' | 'pack';

export function MindMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const vizRef = useRef<ClusterPackVisualization | null>(null);
  
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('pack');
  const [dimensions, setDimensions] = useState({ width: 300, height: 300 });
  const [stableClusters, setStableClusters] = useState<ProcessCluster[]>([]);
  
  const { 
    clusters, 
    processes,
    coloredProcessNames, // From store - single source of truth
    selectedPid,
    selectedClusterId, 
    setSelectedCluster,
    setSelectedPid,
    isClusteringLoading,
    setClusteringLoading,
    setClusterTree,
  } = useProcessStore();

  // Keep stable clusters
  useEffect(() => {
    if (clusters.length > 0) {
      setStableClusters(clusters);
    }
  }, [clusters]);

  // Build category nodes from CURRENT processes, using clusters for grouping hints
  // This ensures all current processes are shown, not just the ones that were clustered
  const categoryNodes = useMemo((): PackNode[] => {
    // Filter to meaningful processes
    const activeProcesses = processes.filter(p => 
      p.cpu > 0.1 || p.mem > 5 || (p.netIn || 0) > 0 || (p.netOut || 0) > 0
    );
    
    if (activeProcesses.length === 0) return [];

    // Build a map of PID -> cluster info from stable clusters
    const pidToCluster = new Map<number, { clusterId: string; clusterName: string; category: string }>();
    for (const cluster of stableClusters) {
      for (const pid of cluster.processIds) {
        pidToCluster.set(pid, {
          clusterId: cluster.id,
          clusterName: cluster.name,
          category: cluster.category || 'Other',
        });
      }
    }

    // Group current processes by cluster (or by name if not clustered)
    const groups = new Map<string, { 
      id: string; 
      name: string; 
      category: string; 
      processes: SystemProcess[];
    }>();

    for (const proc of activeProcesses) {
      const clusterInfo = pidToCluster.get(proc.pid);
      
      if (clusterInfo) {
        // Process is in a known cluster
        const key = clusterInfo.clusterId;
        if (!groups.has(key)) {
          groups.set(key, {
            id: clusterInfo.clusterId,
            name: clusterInfo.clusterName,
            category: clusterInfo.category,
            processes: [],
          });
        }
        groups.get(key)!.processes.push(proc);
      } else {
        // Process is NOT in any cluster - group by name
        const key = `unclustered-${proc.name}`;
        if (!groups.has(key)) {
          groups.set(key, {
            id: key,
            name: proc.name,
            category: inferCategory(proc.name),
            processes: [],
          });
        }
        groups.get(key)!.processes.push(proc);
      }
    }

    // Now group by category
    const byCategory: Record<string, typeof groups extends Map<string, infer V> ? V[] : never> = {};
    for (const group of groups.values()) {
      const cat = group.category;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(group);
    }

    return Object.entries(byCategory).map(([category, categoryGroups]) => {
      let processCount = 0;
      let totalCpu = 0;

      for (const group of categoryGroups) {
        processCount += group.processes.length;
        totalCpu += group.processes.reduce((sum, p) => sum + p.cpu, 0);
      }

      return {
        id: `cat-${category}`,
        name: category,
        category,
        processCount,
        cpu: totalCpu,
        children: categoryGroups.map(group => {
          const groupCpu = group.processes.reduce((sum, p) => sum + p.cpu, 0);

          return {
            id: group.id,
            name: group.name,
            category: group.category,
            processCount: group.processes.length,
            cpu: groupCpu,
            processName: group.processes[0]?.name || group.name,
            children: group.processes.map(proc => ({
              id: `proc-${proc.pid}`,
              name: proc.name,
              category,
              value: 1,
              processName: proc.name,
              pid: proc.pid,
            })),
          };
        }),
      };
    });
  }, [stableClusters, processes]);

  // Helper to infer category from process name
  function inferCategory(name: string): string {
    const lower = name.toLowerCase();
    if (/chrome|safari|firefox|edge|browser|webkit/i.test(lower)) return 'Browser';
    if (/node|python|ruby|java|vscode|xcode|git|npm|yarn|cursor/i.test(lower)) return 'Development';
    if (/slack|zoom|teams|discord|telegram|messages/i.test(lower)) return 'Communication';
    if (/spotify|music|video|vlc|quicktime|audio/i.test(lower)) return 'Media';
    if (/kernel|launchd|system|daemon|agent/i.test(lower)) return 'System';
    if (/helper|service|worker/i.test(lower)) return 'Background';
    return 'Other';
  }

  const existingCategories = useMemo(() => 
    [...new Set(stableClusters.map(c => c.category || 'Other'))],
    [stableClusters]
  );

  // Handle resize - update dimensions but don't recreate viz
  useEffect(() => {
    if (viewMode !== 'pack' || !containerRef.current) return;
    
    const updateDimensions = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        const newDims = { width: rect.width, height: rect.height };
        setDimensions(newDims);
        // Just update dimensions on existing viz, don't recreate
        vizRef.current?.updateDimensions(newDims.width, newDims.height);
      }
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [viewMode]);

  // Initialize D3 visualization ONCE when view mode changes to pack
  useEffect(() => {
    if (viewMode !== 'pack' || !svgRef.current) {
      vizRef.current?.destroy();
      vizRef.current = null;
      return;
    }
    
    if (dimensions.width <= 10 || dimensions.height <= 10) return;

    // Only create if not exists
    if (!vizRef.current) {
      vizRef.current = new ClusterPackVisualization(svgRef.current, {
        width: dimensions.width,
        height: dimensions.height,
        coloredNames: coloredProcessNames,
        selectedPid,
        onSelectCluster: setSelectedCluster,
        onSelectProcess: setSelectedPid,
      });
    }
    
    // Render/update data - the viz will decide if it needs to rebuild
    if (categoryNodes.length > 0) {
      vizRef.current.render(categoryNodes);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, dimensions.width, dimensions.height, setSelectedCluster, setSelectedPid]);

  // Update data when categoryNodes change - viz will only rebuild if structure changed
  useEffect(() => {
    if (vizRef.current && categoryNodes.length > 0) {
      vizRef.current.render(categoryNodes);
    }
  }, [categoryNodes]);

  // Update colors/selection without recreating viz
  useEffect(() => {
    vizRef.current?.updateColors(coloredProcessNames, selectedPid);
  }, [coloredProcessNames, selectedPid]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleRecluster = async () => {
    if (!window.electron || isClusteringLoading) return;
    
    setClusteringLoading(true);
    try {
      const result = await window.electron.clusterProcesses();
      if (result.success && result.tree) {
        setClusterTree(result.tree);
        setExpandedNodes(new Set(Object.keys(CATEGORY_COLORS).map(c => `cat-${c}`)));
      }
    } catch (error) {
      console.error('Clustering failed:', error);
    } finally {
      setClusteringLoading(false);
    }
  };

  const handleTreeNodeClick = (node: PackNode) => {
    if (node.id.startsWith('proc-')) {
      setSelectedPid(parseInt(node.id.replace('proc-', '')));
    } else if (node.id.startsWith('cat-')) {
      toggleNode(node.id);
      setSelectedCluster(node.id === selectedClusterId ? null : node.id);
    } else {
      setSelectedCluster(node.id === selectedClusterId ? null : node.id);
    }
  };

  const renderNode = (node: PackNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isNodeSelected = node.id === selectedClusterId || (node.pid !== undefined && node.pid === selectedPid);
    const isCategory = node.id.startsWith('cat-');
    const isProcess = node.id.startsWith('proc-');
    const color = getProcessColor(node.processName, node.category, coloredProcessNames);

    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => handleTreeNodeClick(node)}
          className={clsx(
            "flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-all",
            isNodeSelected && "bg-white/20 ring-1 ring-white/40",
            !isNodeSelected && "hover:bg-white/5"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {hasChildren && !isProcess ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }}
              className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-white"
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : <span className="w-4" />}

          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />

          <span className={clsx(
            "flex-1 truncate",
            isCategory && "text-[11px] font-semibold text-gray-400",
            !isCategory && !isProcess && "text-[11px] font-medium text-gray-300",
            isProcess && "text-[10px] text-gray-500"
          )}>
            {node.name}
          </span>

          {node.processCount !== undefined && !isProcess && (
            <span className="text-[9px] text-gray-600 font-mono">{node.processCount}</span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="border-l border-white/5 ml-4">
            {node.children!.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-black/20 rounded-xl border border-white/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/[0.02] shrink-0">
        <span className="text-xs font-medium text-gray-400">Process Clusters</span>
        <div className="flex items-center gap-1">
          {stableClusters.length > 0 && (
            <div className="flex bg-white/5 rounded-md p-0.5 mr-1">
              <button onClick={() => setViewMode('tree')} className={clsx("p-1 rounded transition-colors", viewMode === 'tree' ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300")}>
                <List size={12} />
              </button>
              <button onClick={() => setViewMode('pack')} className={clsx("p-1 rounded transition-colors", viewMode === 'pack' ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300")}>
                <Circle size={12} />
              </button>
            </div>
          )}
          {stableClusters.length > 0 && <span className="text-[9px] text-gray-600 mr-1">{stableClusters.length}</span>}
          <button onClick={handleRecluster} disabled={isClusteringLoading} className={clsx("p-1.5 rounded-lg transition-colors", isClusteringLoading ? "text-gray-600" : "text-gray-500 hover:text-gray-300 hover:bg-white/10")}>
            {isClusteringLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden relative">
        {categoryNodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
              <RefreshCw size={20} className="text-gray-600" />
            </div>
            <p className="text-xs text-gray-500 mb-3">No clusters yet</p>
            <button onClick={handleRecluster} disabled={isClusteringLoading} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
              {isClusteringLoading ? 'Analyzing...' : 'Analyze Processes'}
            </button>
          </div>
        ) : viewMode === 'tree' ? (
          <div className="h-full overflow-y-auto custom-scrollbar p-2">
            {categoryNodes.map(category => renderNode(category, 0))}
          </div>
        ) : (
          <>
            <svg ref={svgRef} width={dimensions.width} height={dimensions.height} style={{ display: 'block' }} />
            <div className="absolute bottom-2 left-2 text-[9px] text-gray-600 pointer-events-none">
              Click to zoom • Click outside to fit all
            </div>
          </>
        )}
      </div>

      {stableClusters.length > 0 && (
        <div className="px-3 py-2 border-t border-white/5 bg-white/[0.02] shrink-0">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {existingCategories.map(category => (
              <div key={category} className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[category] }} />
                <span className="text-[8px] text-gray-600">{category}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
