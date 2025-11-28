import { SystemProcess, ProcessAnalysis, GlobalStats, NetworkConnection } from '../../shared/types';

declare global {
  interface Window {
    electron: {
      ping: () => Promise<string>;
      getProcesses: () => Promise<{ processes: SystemProcess[], global: GlobalStats | null }>;
      saveApiKey: (key: string) => Promise<boolean>;
      getApiKey: () => Promise<string | undefined>;
      analyzeProcess: (name: string, command: string) => Promise<ProcessAnalysis | null>;
      getProcessNetwork: (pid: number) => Promise<string[]>;
      getProcessConnections: (pid: number) => Promise<NetworkConnection[]>;
    };
  }
}

export {};

