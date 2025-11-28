import { contextBridge, ipcRenderer } from 'electron';
import { SystemProcess, ProcessAnalysis, GlobalStats, NetworkConnection } from '../shared/types';

contextBridge.exposeInMainWorld('electron', {
  ping: () => ipcRenderer.invoke('ping'),
  getProcesses: () => ipcRenderer.invoke('monitor:get-processes') as Promise<{ processes: SystemProcess[], global: GlobalStats | null }>,
  saveApiKey: (key: string) => ipcRenderer.invoke('settings:save-key', key),
  getApiKey: () => ipcRenderer.invoke('settings:get-key'),
  analyzeProcess: (name: string, command: string) => 
    ipcRenderer.invoke('ai:analyze', { name, command }) as Promise<ProcessAnalysis | null>,
  getProcessNetwork: (pid: number) => ipcRenderer.invoke('monitor:get-process-network', pid) as Promise<string[]>,
  getProcessConnections: (pid: number) => ipcRenderer.invoke('monitor:get-process-connections', pid) as Promise<NetworkConnection[]>,
});
