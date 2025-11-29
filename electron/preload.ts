import { contextBridge, ipcRenderer } from 'electron';
import { SystemProcess, ProcessAnalysis, GlobalStats, NetworkConnection, AISettings, ChatMessage, ProcessCluster, ClusterTree } from '../shared/types';

contextBridge.exposeInMainWorld('electron', {
  // System monitoring
  ping: () => ipcRenderer.invoke('ping'),
  getProcesses: () => ipcRenderer.invoke('monitor:get-processes') as Promise<{ processes: SystemProcess[], global: GlobalStats | null }>,
  getProcessNetwork: (pid: number) => ipcRenderer.invoke('monitor:get-process-network', pid) as Promise<string[]>,
  getProcessConnections: (pid: number) => ipcRenderer.invoke('monitor:get-process-connections', pid) as Promise<NetworkConnection[]>,
  
  // Legacy API key (for backwards compatibility)
  saveApiKey: (key: string) => ipcRenderer.invoke('settings:save-key', key),
  getApiKey: () => ipcRenderer.invoke('settings:get-key'),
  
  // Process analysis
  analyzeProcess: (name: string, command: string) => 
    ipcRenderer.invoke('ai:analyze', { name, command }) as Promise<ProcessAnalysis | null>,
  
  // AI Settings
  getAISettings: () => ipcRenderer.invoke('ai:get-settings') as Promise<AISettings>,
  saveAISettings: (settings: Partial<AISettings>) => ipcRenderer.invoke('ai:save-settings', settings),
  testAIConnection: (apiKey: string) => ipcRenderer.invoke('ai:test-connection', apiKey) as Promise<{ success: boolean; error?: string }>,
  getAIModels: () => ipcRenderer.invoke('ai:get-models') as Promise<{
    chatModels: { id: string; name: string; free: boolean }[];
    embeddingModels: { id: string; name: string; dimensions: number }[];
  }>,
  
  // Chat with streaming support
  sendChatMessage: (message: string) => ipcRenderer.invoke('chat:send', message) as Promise<{ success: boolean; response?: string; error?: string }>,
  
  // Streaming chat - returns a promise that resolves when complete
  sendChatMessageStreaming: (message: string) => {
    return new Promise<{ success: boolean; response?: string; error?: string }>((resolve) => {
      // Set up one-time listener for completion
      const endHandler = (_event: Electron.IpcRendererEvent, result: { success: boolean; response?: string; error?: string }) => {
        ipcRenderer.removeListener('chat:stream-end', endHandler);
        resolve(result);
      };
      ipcRenderer.on('chat:stream-end', endHandler);
      
      // Send the message (this triggers streaming)
      ipcRenderer.send('chat:send-stream', message);
    });
  },
  
  getChatHistory: () => ipcRenderer.invoke('chat:get-history') as Promise<ChatMessage[]>,
  clearChatHistory: () => ipcRenderer.invoke('chat:clear'),
  
  // Streaming listeners
  onChatStream: (callback: (chunk: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk);
    ipcRenderer.on('chat:stream', handler);
    return () => ipcRenderer.removeListener('chat:stream', handler);
  },
  
  // Clustering
  clusterProcesses: () => ipcRenderer.invoke('ai:cluster-processes') as Promise<{ success: boolean; tree?: ClusterTree; error?: string }>,
  getClusters: () => ipcRenderer.invoke('ai:get-clusters') as Promise<ProcessCluster[]>,
  refreshClusterStats: () => ipcRenderer.invoke('ai:refresh-cluster-stats') as Promise<{ success: boolean; clusters?: ProcessCluster[]; error?: string }>,
});
