import { create } from 'zustand';
import { SystemProcess, ProcessAnalysis, GlobalStats, NetworkConnection } from '../../shared/types';

interface ProcessState {
  processes: SystemProcess[];
  globalStats: GlobalStats | null;
  analyses: Record<string, ProcessAnalysis>;
  apiKey: string | null;
  isLoading: boolean;
  selectedPid: number | null; 
  selectedProcessSnapshot: SystemProcess | null;
  networkDetails: string[]; // Raw lsof output for selected process
  processConnections: NetworkConnection[]; // Parsed connections for selected process
  
  setProcessData: (data: { processes: SystemProcess[], global: GlobalStats | null }) => void;
  setAnalysis: (id: string, analysis: ProcessAnalysis) => void;
  setApiKey: (key: string | null) => void;
  setSelectedPid: (pid: number | null) => void;
  setNetworkDetails: (details: string[]) => void;
  setProcessConnections: (connections: NetworkConnection[]) => void;
}

export const useProcessStore = create<ProcessState>((set, get) => ({
  processes: [],
  globalStats: null,
  analyses: {},
  apiKey: null,
  isLoading: true,
  selectedPid: null,
  selectedProcessSnapshot: null,
  networkDetails: [],
  processConnections: [],

  setProcessData: ({ processes, global }) => {
      const safeProcesses = Array.isArray(processes) ? processes : [];
      const currentSelected = get().selectedPid;
      let snapshot = get().selectedProcessSnapshot;
      
      if (currentSelected) {
          const found = safeProcesses.find(p => p.pid === currentSelected);
          if (found) snapshot = found;
      }

      set({ processes: safeProcesses, globalStats: global, isLoading: false, selectedProcessSnapshot: snapshot });
  },
  
  setAnalysis: (id, analysis) => 
    set((state) => ({ 
      analyses: { ...state.analyses, [id]: analysis } 
    })),
  
  setApiKey: (apiKey) => set({ apiKey }),
  
  setSelectedPid: (pid) => {
      const proc = get().processes.find(p => p.pid === pid) || null;
      set({ selectedPid: pid, selectedProcessSnapshot: proc, networkDetails: [], processConnections: [] });
  },

  setNetworkDetails: (details) => set({ networkDetails: details }),
  setProcessConnections: (connections) => set({ processConnections: connections }),
}));

export const generateProcessId = (p: SystemProcess) => `${p.name}-${p.command}`.slice(0, 255);
