import { SystemProcess, NetworkConnection } from '../shared/types';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

// Get raw lsof output for a specific process
export async function getProcessNetworkStats(pid: number): Promise<string[]> {
  try {
    const { stdout } = await execAsync(`lsof -p ${pid} -i -n -P`);
    return stdout.split('\n').filter(line => line.includes('TCP') || line.includes('UDP'));
  } catch {
    return [];
  }
}

// Parse a single lsof line into a structured NetworkConnection
function parseLsofLine(line: string): NetworkConnection | null {
  // Example: "Google\x20C 12345 user   23u  IPv4 0x1234567890  0t0  TCP 192.168.1.1:54321->142.250.80.46:443 (ESTABLISHED)"
  // Or:      "sharingd    694  neo    4u    IPv4 0x7b3da46071423901       0t0                 UDP *:*"
  
  const parts = line.trim().split(/\s+/);
  if (parts.length < 9) return null;
  
  const processName = parts[0].replace(/\\x20/g, ' '); // Decode escaped spaces
  const pid = parseInt(parts[1], 10);
  const user = parts[2];
  const fd = parts[3];
  
  // Find IPv4 or IPv6
  const typeIndex = parts.findIndex(p => p === 'IPv4' || p === 'IPv6');
  if (typeIndex === -1) return null;
  
  const type = parts[typeIndex] as 'IPv4' | 'IPv6';
  
  // Find TCP or UDP
  const protoIndex = parts.findIndex(p => p === 'TCP' || p === 'UDP');
  if (protoIndex === -1) return null;
  
  const protocol = parts[protoIndex] as 'TCP' | 'UDP';
  
  // Address is usually after protocol
  const addressPart = parts[protoIndex + 1] || '';
  
  // Parse state if present (e.g., "(ESTABLISHED)", "(LISTEN)")
  const statePart = parts.find(p => p.startsWith('(') && p.endsWith(')'));
  const state = statePart ? statePart.slice(1, -1) : undefined;
  
  // Parse local and remote addresses
  let localAddress = addressPart;
  let remoteAddress: string | undefined;
  
  if (addressPart.includes('->')) {
    const [local, remote] = addressPart.split('->');
    localAddress = local;
    remoteAddress = remote;
  }
  
  return {
    pid,
    processName,
    user,
    fd,
    type,
    protocol,
    localAddress,
    remoteAddress,
    state,
  };
}

// Get ALL network connections system-wide
export async function getAllNetworkConnections(): Promise<{
  connections: NetworkConnection[];
  connectionsByProcess: Record<number, number>;
}> {
  try {
    // lsof -i -n -P gets all internet connections
    // Increase maxBuffer to handle large outputs
    const { stdout } = await execAsync('lsof -i -n -P 2>/dev/null', { maxBuffer: 1024 * 1024 * 10 });
    const lines = stdout.split('\n').filter(line => 
      line.includes('TCP') || line.includes('UDP')
    );
        
    const connections: NetworkConnection[] = [];
    const connectionsByProcess: Record<number, number> = {};
    
    for (const line of lines) {
      const conn = parseLsofLine(line);
      if (conn) {
        connections.push(conn);
        connectionsByProcess[conn.pid] = (connectionsByProcess[conn.pid] || 0) + 1;
      }
    }
        
    return { connections, connectionsByProcess };
  } catch (e) {
    console.error('[Network] Failed to get connections:', e);
    return { connections: [], connectionsByProcess: {} };
  }
}

// Get parsed connections for a specific process
export async function getProcessConnections(pid: number): Promise<NetworkConnection[]> {
  try {
    const { stdout } = await execAsync(`lsof -p ${pid} -i -n -P 2>/dev/null`);
    const lines = stdout.split('\n').filter(line => 
      line.includes('TCP') || line.includes('UDP')
    );
    
    return lines.map(parseLsofLine).filter((c): c is NetworkConnection => c !== null);
  } catch {
    return [];
  }
}

export function calculateEnergyScore(p: SystemProcess): number {
    let score = p.cpu * 0.8;
    if (p.threads > 50) score += (p.threads * 0.05);
    if (p.state === 'running') score += 5;
    return Math.min(100, Math.round(score));
}

// Per-process network I/O using nettop
export interface ProcessNetworkIO {
  pid: number;
  bytesIn: number;
  bytesOut: number;
}

export async function getPerProcessNetworkIO(): Promise<Record<number, { bytesIn: number; bytesOut: number }>> {
  try {
    // nettop -P: machine parseable, -L 1: one sample, -J: specific columns
    const { stdout } = await execAsync('nettop -P -L 1 -J bytes_in,bytes_out 2>/dev/null', { maxBuffer: 1024 * 1024 * 5 });
    
    const result: Record<number, { bytesIn: number; bytesOut: number }> = {};
    const lines = stdout.split('\n').slice(1); // Skip header
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Format: "processName.PID,bytes_in,bytes_out,"
      const parts = line.split(',');
      if (parts.length < 3) continue;
      
      const processInfo = parts[0];
      const pidMatch = processInfo.match(/\.(\d+)$/);
      if (!pidMatch) continue;
      
      const pid = parseInt(pidMatch[1], 10);
      const bytesIn = parseInt(parts[1], 10) || 0;
      const bytesOut = parseInt(parts[2], 10) || 0;
      
      result[pid] = { bytesIn, bytesOut };
    }
    
    return result;
  } catch (e) {
    console.error('[Network IO] Failed:', e);
    return {};
  }
}

