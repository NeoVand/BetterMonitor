import { SystemProcess, ProcessAnalysis, GlobalStats, NetworkConnection, AISettings, ChatMessage, ProcessCluster, ClusterTree } from '../../shared/types';

declare global {
  interface Window {
    electron: {
      // System monitoring
      ping: () => Promise<string>;
      getProcesses: () => Promise<{ processes: SystemProcess[], global: GlobalStats | null }>;
      getProcessNetwork: (pid: number) => Promise<string[]>;
      getProcessConnections: (pid: number) => Promise<NetworkConnection[]>;
      
      // Legacy API key (backwards compatibility)
      saveApiKey: (key: string) => Promise<boolean>;
      getApiKey: () => Promise<string | undefined>;
      
      // Process analysis
      analyzeProcess: (name: string, command: string) => Promise<ProcessAnalysis | null>;
      
      // AI Settings
      getAISettings: () => Promise<AISettings>;
      saveAISettings: (settings: Partial<AISettings>) => Promise<boolean>;
      testAIConnection: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
      getAIModels: () => Promise<{
        chatModels: { id: string; name: string; free: boolean }[];
        embeddingModels: { id: string; name: string; dimensions: number }[];
      }>;
      
      // Chat
      sendChatMessage: (message: string) => Promise<{ success: boolean; response?: string; error?: string }>;
      getChatHistory: () => Promise<ChatMessage[]>;
      clearChatHistory: () => Promise<boolean>;
      onChatStream?: (callback: (chunk: string) => void) => () => void;
      
      // Clustering
      clusterProcesses: () => Promise<{ success: boolean; tree?: ClusterTree; error?: string }>;
      getClusters: () => Promise<ProcessCluster[]>;
      refreshClusterStats: () => Promise<{ success: boolean; clusters?: ProcessCluster[]; error?: string }>;
    };
  }
}

export {};
