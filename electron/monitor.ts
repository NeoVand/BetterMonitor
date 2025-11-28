import si from 'systeminformation';
import { SystemProcess, GlobalStats } from '../shared/types';
import { getAllNetworkConnections, getPerProcessNetworkIO } from './detailed-stats';

export async function getSystemProcesses(): Promise<{ processes: SystemProcess[], global: GlobalStats | null }> {
  try {
    const [procData, memData, netData, diskData, graphicsData, networkConns, networkIO] = await Promise.all([
        si.processes(),
        si.mem(),
        si.networkStats(),
        si.disksIO(),
        si.graphics(),
        getAllNetworkConnections(),
        getPerProcessNetworkIO()
    ]);

    const totalMemMB = memData.total / 1024 / 1024;

    // GPU Load Approximation
    let gpuLoad = 0;
    if (graphicsData && graphicsData.controllers) {
        gpuLoad = graphicsData.controllers.reduce((max, gpu) => Math.max(max, gpu.utilizationGpu || 0), 0);
    }

    const processes: SystemProcess[] = procData.list.map(p => {
        let memoryMB = 0;
        if (p.mem > 0) {
            memoryMB = (p.mem / 100) * totalMemMB;
        } else if (p.memRss > 0) {
             if (p.memRss > 1024 * 1024 * 10) {
                 memoryMB = p.memRss / 1024 / 1024;
             } else {
                 memoryMB = p.memRss / 1024;
             }
        }

        const netStats = networkIO[p.pid];
        
        return {
            pid: p.pid,
            name: p.name,
            command: p.command || '',
            cpu: p.cpu, 
            mem: memoryMB, 
            started: p.started,
            user: p.user,
            path: p.path,
            threads: (p as any).threads || 0, 
            state: p.state,
            priority: p.priority,
            parentPid: p.parentPid,
            connections: networkConns.connectionsByProcess[p.pid] || 0,
            netIn: netStats?.bytesIn || 0,
            netOut: netStats?.bytesOut || 0,
        };
    });

    const globalNet = netData.reduce((acc, iface) => ({
        rx_sec: acc.rx_sec + iface.rx_sec,
        tx_sec: acc.tx_sec + iface.tx_sec,
    }), { rx_sec: 0, tx_sec: 0 });

    return {
        processes,
        global: {
            cpu: procData.list.reduce((acc, p) => acc + p.cpu, 0) / (procData.list.length || 1), 
            mem: {
                total: memData.total,
                used: memData.used,
                active: memData.active,
            },
            net: globalNet,
            disk: {
                rIO_sec: diskData.rIO_sec ?? 0,
                wIO_sec: diskData.wIO_sec ?? 0,
            },
            gpu: gpuLoad,
            connections: networkConns.connections,
            connectionsByProcess: networkConns.connectionsByProcess,
        }
    };
  } catch (e) {
    console.error("Failed to get processes:", e);
    return { processes: [], global: null };
  }
}
