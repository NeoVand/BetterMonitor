import { create } from 'zustand';
import { SystemProcess, ProcessAnalysis, GlobalStats, NetworkConnection, ProcessCluster, ClusterTree, ChatMessage, AISettings } from '../../shared/types';
import { getColoredProcessNames, SortMode } from './process-utils';

interface ProcessStore {
  // Core data
  processes: SystemProcess[];
  globalStats: GlobalStats | null;
  analyses: Record<string, ProcessAnalysis>;
  
  // Sort mode - affects which processes are "top" and colored
  sortMode: SortMode;
  
  // Computed - single source of truth for colored process names
  coloredProcessNames: Set<string>;
  
  // Selection state
  selectedPid: number | null;
  selectedProcessSnapshot: SystemProcess | null;
  selectedClusterId: string | null;
  
  // Network details for selected process
  networkDetails: string[];
  processConnections: NetworkConnection[];
  
  // Cluster state
  clusters: ProcessCluster[];
  clusterTree: ClusterTree | null;
  isClusteringLoading: boolean;
  
  // UI state
  isLoading: boolean;
  isSettingsOpen: boolean;
  
  // Chat state
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  
  // AI settings
  aiSettings: AISettings | null;
  apiKey: string | null;
  
  // Actions
  setProcessData: (data: { processes: SystemProcess[], global: GlobalStats | null }) => void;
  setProcesses: (processes: SystemProcess[]) => void;
  setSortMode: (mode: SortMode) => void;
  setAnalysis: (id: string, analysis: ProcessAnalysis) => void;
  setApiKey: (key: string | null) => void;
  setSelectedPid: (pid: number | null) => void;
  setSelectedCluster: (id: string | null) => void;
  setNetworkDetails: (details: string[]) => void;
  setProcessConnections: (connections: NetworkConnection[]) => void;
  setClusters: (clusters: ProcessCluster[]) => void;
  setClusterTree: (tree: ClusterTree) => void;
  setClusteringLoading: (loading: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
  setChatLoading: (loading: boolean) => void;
  setAISettings: (settings: AISettings | null) => void;
}

export const useProcessStore = create<ProcessStore>((set, get) => ({
  // Initial state
  processes: [],
  globalStats: null,
  analyses: {},
  sortMode: 'cpu',
  coloredProcessNames: new Set(),
  selectedPid: null,
  selectedProcessSnapshot: null,
  selectedClusterId: null,
  networkDetails: [],
  processConnections: [],
  clusters: [],
  clusterTree: null,
  isClusteringLoading: false,
  isLoading: true,
  isSettingsOpen: false,
  chatMessages: [],
  isChatLoading: false,
  aiSettings: null,
  apiKey: null,

  // Actions
  setProcessData: ({ processes, global }) => {
    const safeProcesses = Array.isArray(processes) ? processes : [];
    const currentSelected = get().selectedPid;
    const currentSortMode = get().sortMode;
    let snapshot = get().selectedProcessSnapshot;
    
    if (currentSelected) {
      const found = safeProcesses.find(p => p.pid === currentSelected);
      if (found) snapshot = found;
    }

    set({ 
      processes: safeProcesses, 
      globalStats: global, 
      isLoading: false, 
      selectedProcessSnapshot: snapshot,
      coloredProcessNames: getColoredProcessNames(safeProcesses, currentSortMode)
    });
  },

  setProcesses: (processes) => {
    const currentSortMode = get().sortMode;
    set({ 
      processes,
      coloredProcessNames: getColoredProcessNames(processes, currentSortMode)
    });
  },
  
  setSortMode: (sortMode) => {
    const processes = get().processes;
    set({
      sortMode,
      coloredProcessNames: getColoredProcessNames(processes, sortMode)
    });
  },
  
  setAnalysis: (id, analysis) => 
    set((state) => ({ 
      analyses: { ...state.analyses, [id]: analysis } 
    })),
  
  setApiKey: (apiKey) => set({ apiKey }),
  
  setSelectedPid: (pid) => {
    const proc = get().processes.find(p => p.pid === pid) || null;
    set({ 
      selectedPid: pid, 
      selectedProcessSnapshot: proc, 
      networkDetails: [], 
      processConnections: [],
      selectedClusterId: null // Clear cluster selection
    });
  },

  setSelectedCluster: (id) => set({ 
    selectedClusterId: id,
    selectedPid: null // Clear process selection
  }),

  setNetworkDetails: (details) => set({ networkDetails: details }),
  setProcessConnections: (connections) => set({ processConnections: connections }),
  
  setClusters: (clusters) => set({ clusters }),
  
  setClusterTree: (tree) => set({ 
    clusterTree: tree,
    clusters: tree.flatList.filter(c => c.id !== 'root')
  }),
  
  setClusteringLoading: (loading) => set({ isClusteringLoading: loading }),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setChatMessages: (messages) => set({ chatMessages: messages }),
  addChatMessage: (message) => set((state) => ({ 
    chatMessages: [...state.chatMessages, message] 
  })),
  clearChat: () => set({ chatMessages: [] }),
  setChatLoading: (loading) => set({ isChatLoading: loading }),
  setAISettings: (settings) => set({ aiSettings: settings }),
}));

export const generateProcessId = (p: SystemProcess) => `${p.name}-${p.command}`.slice(0, 255);
