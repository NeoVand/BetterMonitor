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
