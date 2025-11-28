"use client";

import { useEffect, useState } from 'react';
import { useProcessStore, generateProcessId } from '@/lib/store';
import { 
  Activity, Cpu, HardDrive, Bot, 
  BarChart3, Filter, Terminal, User, Clock,
  Wifi, ArrowUp, ArrowDown, Disc, Zap, Globe, Network
} from 'lucide-react';
import clsx from 'clsx';
import { SystemProcess, NetworkConnection } from '../../shared/types';
import { LineChart, Line, ResponsiveContainer, YAxis, AreaChart, Area } from 'recharts';
import { ArcSlider } from './ArcSlider';
import { ProcessRadar } from './ProcessRadar';

type SortMode = 'cpu' | 'mem' | 'net';

interface GlobalHistory {
    cpu: number;
    mem: number;
    netRx: number;
    netTx: number;
    diskR: number;
    diskW: number;
    gpu: number;
}

export function Dashboard() {
  const { 
      processes, globalStats, setProcessData, 
      analyses, setAnalysis, 
      apiKey, setApiKey,
      selectedPid, setSelectedPid, selectedProcessSnapshot,
      networkDetails, setNetworkDetails,
      processConnections, setProcessConnections
  } = useProcessStore();
  
  const [sortMode, setSortMode] = useState<SortMode>('cpu');
  const [showAll, setShowAll] = useState(false);
  const [samplingHz, setSamplingHz] = useState(3); // Samples per second (1-20)
  
  // History for Process (including network)
  const [procHistory, setProcHistory] = useState<{cpu: number, mem: number, netIn: number, netOut: number}[]>([]);
  // History for Global Stats
  const [globalHistory, setGlobalHistory] = useState<GlobalHistory[]>([]);
  // Track previous network values to calculate delta (rate)
  const [prevNetValues, setPrevNetValues] = useState<{pid: number, netIn: number, netOut: number} | null>(null);

  // Polling Loop - frequency controlled by samplingHz
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;

    const fetchProcesses = async () => {
      try {
        const data = await window.electron.getProcesses();
        setProcessData(data);
      } catch (e) {
        console.error("Failed to fetch processes", e);
      }
    };

    window.electron.getApiKey().then(key => setApiKey(key || null));

    fetchProcesses();
    const intervalMs = Math.round(1000 / samplingHz);
    const interval = setInterval(fetchProcesses, intervalMs);
    return () => clearInterval(interval);
  }, [samplingHz]);

  // Clear history when switching processes
  useEffect(() => {
      setProcHistory([]);
      setPrevNetValues(null);
  }, [selectedPid]);

  // Update History (only adds data points, doesn't reset)
  useEffect(() => {
      // Process History (with network rate calculation)
      if (selectedProcessSnapshot && selectedPid === selectedProcessSnapshot.pid) {
          const currentNetIn = selectedProcessSnapshot.netIn || 0;
          const currentNetOut = selectedProcessSnapshot.netOut || 0;
          
          // Calculate rate (delta since last update)
          let netInRate = 0;
          let netOutRate = 0;
          
          if (prevNetValues && prevNetValues.pid === selectedProcessSnapshot.pid) {
              netInRate = Math.max(0, currentNetIn - prevNetValues.netIn);
              netOutRate = Math.max(0, currentNetOut - prevNetValues.netOut);
          }
          
          setPrevNetValues({
              pid: selectedProcessSnapshot.pid,
              netIn: currentNetIn,
              netOut: currentNetOut
          });
          
          setProcHistory(prev => {
              const newPt = { 
                  cpu: selectedProcessSnapshot.cpu, 
                  mem: selectedProcessSnapshot.mem,
                  netIn: netInRate,
                  netOut: netOutRate
              };
              const newHist = [...prev, newPt];
              if (newHist.length > 60) newHist.shift(); // ~20 seconds at 3 samples/sec
              return newHist;
          });
      }
  }, [selectedProcessSnapshot]);

  // Global History (separate from process history)
  useEffect(() => {
      if (globalStats) {
          setGlobalHistory(prev => {
              const newPt: GlobalHistory = {
                  cpu: globalStats.cpu || 0,
                  mem: (globalStats.mem?.used || 0) / 1024 / 1024 / 1024,
                  netRx: globalStats.net.rx_sec,
                  netTx: globalStats.net.tx_sec,
                  diskR: globalStats.disk.rIO_sec,
                  diskW: globalStats.disk.wIO_sec,
                  gpu: globalStats.gpu || 0
              };
              const newHist = [...prev, newPt];
              if (newHist.length > 60) newHist.shift(); // ~20 seconds at 3 samples/sec
              return newHist;
          });
      }
  }, [globalStats]);

  // Fetch network connections when process is selected
  useEffect(() => {
      if (typeof window === 'undefined' || !window.electron) return;
      if (!selectedPid) {
          setProcessConnections([]);
          return;
      }
      
      const fetchConnections = async () => {
          try {
              const conns = await window.electron.getProcessConnections(selectedPid);
              setProcessConnections(conns);
          } catch {
              setProcessConnections([]);
          }
      };
      
      fetchConnections();
      const interval = setInterval(fetchConnections, 1000); // Update connections every second
      return () => clearInterval(interval);
  }, [selectedPid, setProcessConnections]);

  const handleAnalyze = async (p: SystemProcess) => {
    if (!apiKey) {
        const key = prompt("Enter OpenAI API Key:");
        if (key) {
            await window.electron.saveApiKey(key);
            setApiKey(key);
        } else {
            return;
        }
    }
    const id = generateProcessId(p);
    const result = await window.electron.analyzeProcess(p.name, p.command);
    if (result) setAnalysis(id, result);
  };

  // Smart number formatters - defined before use
  const fmtSpeed = (bytes: number) => {
      if (!bytes) return '0 B/s';
      const mb = bytes / 1024 / 1024;
      if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
      return `${(bytes / 1024).toFixed(0)} KB/s`;
  };

  const fmtBytes = (bytes: number): { value: string; unit: string } => {
      if (!bytes || bytes === 0) return { value: '0', unit: '' };
      if (bytes >= 1024 * 1024 * 1024) return { value: (bytes / 1024 / 1024 / 1024).toFixed(1), unit: 'G' };
      if (bytes >= 1024 * 1024) return { value: (bytes / 1024 / 1024).toFixed(1), unit: 'M' };
      if (bytes >= 1024) return { value: (bytes / 1024).toFixed(0), unit: 'K' };
      return { value: bytes.toFixed(0), unit: 'B' };
  };

  const fmtCpu = (cpu: number): string => {
      if (cpu >= 100) return cpu.toFixed(0);
      if (cpu >= 10) return cpu.toFixed(1);
      return cpu.toFixed(1);
  };

  const fmtMem = (mb: number): { value: string; unit: string } => {
      if (mb >= 1024) return { value: (mb / 1024).toFixed(1), unit: 'G' };
      if (mb >= 100) return { value: mb.toFixed(0), unit: 'M' };
      return { value: mb.toFixed(0), unit: 'M' };
  };

  const getNetTotal = (p: SystemProcess) => (p.netIn || 0) + (p.netOut || 0);

  // Now use the formatters
  const processedList = [...processes]
    .sort((a, b) => {
        if (sortMode === 'cpu') return b.cpu - a.cpu;
        if (sortMode === 'mem') return b.mem - a.mem;
        return getNetTotal(b) - getNetTotal(a);
    })
    .filter(p => showAll ? true : (p.cpu > 0.1 || p.mem > 10 || getNetTotal(p) > 0)); 

  const displayedList = showAll ? processedList : processedList.slice(0, 100);
  const displayedProcess = selectedProcessSnapshot;
  const displayedAnalysis = displayedProcess ? analyses[generateProcessId(displayedProcess)] : null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0A0A0A] text-gray-200 font-sans selection:bg-blue-500/30">
       
       {/* LEFT: Global & List */}
       <div className="w-[450px] flex flex-col border-r border-white/5 bg-black/40 backdrop-blur-xl">
          <div className="h-8 draggable shrink-0" /> 
          
          {/* NEW GLOBAL DASHBOARD */}
          <div className="px-4 pb-4 space-y-3">
             <h1 className="font-bold text-sm text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                <Activity size={14} /> Global Health
             </h1>
             
             <div className="grid grid-cols-2 gap-2">
                 {/* Network Card */}
                 <div className="p-3 bg-white/5 rounded-xl border border-white/5 relative overflow-hidden">
                     <div className="flex justify-between items-start mb-1 relative z-10">
                         <div className="text-[10px] font-bold text-blue-400 flex items-center gap-1"><Wifi size={10} /> NET</div>
                         <div className="text-[10px] font-mono text-gray-300">{fmtSpeed(globalStats?.net.rx_sec || 0)}</div>
                     </div>
                     <div className="h-8 w-full opacity-50 min-h-[32px]">
                        <ResponsiveContainer width="100%" height={32}>
                            <AreaChart data={globalHistory}>
                                <Area type="monotone" dataKey="netRx" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} isAnimationActive={false} />
                                <Area type="monotone" dataKey="netTx" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.2} isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                     </div>
                 </div>

                 {/* Disk Card */}
                 <div className="p-3 bg-white/5 rounded-xl border border-white/5 relative overflow-hidden">
                     <div className="flex justify-between items-start mb-1 relative z-10">
                         <div className="text-[10px] font-bold text-purple-400 flex items-center gap-1"><Disc size={10} /> DISK</div>
                         <div className="text-[10px] font-mono text-gray-300">{(globalStats?.disk.rIO_sec || 0).toFixed(0)}/s</div>
                     </div>
                     <div className="h-8 w-full opacity-50 min-h-[32px]">
                        <ResponsiveContainer width="100%" height={32}>
                            <AreaChart data={globalHistory}>
                                <Area type="monotone" dataKey="diskR" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.2} isAnimationActive={false} />
                                <Area type="monotone" dataKey="diskW" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                     </div>
                 </div>
                 
                 {/* GPU Card (Only show if data available) */}
                 {(globalStats?.gpu || 0) > 0 && (
                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 col-span-2 flex items-center justify-between">
                        <div className="text-[10px] font-bold text-emerald-400 flex items-center gap-1"><Zap size={10} /> GPU Load</div>
                        <div className="text-xs font-mono text-white">{(globalStats?.gpu || 0).toFixed(1)}%</div>
                    </div>
                 )}

                 {/* Active Connections Summary */}
                 <div className="p-3 bg-white/5 rounded-xl border border-white/5 col-span-2">
                     <div className="flex justify-between items-center mb-2">
                         <div className="text-[10px] font-bold text-cyan-400 flex items-center gap-1"><Network size={10} /> Active Connections</div>
                         <div className="text-xs font-mono text-white">{globalStats?.connections?.length || 0}</div>
                     </div>
                     <div className="flex gap-3 text-[9px] text-gray-400">
                         <span className="flex items-center gap-1">
                             <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                             TCP: {globalStats?.connections?.filter((c: NetworkConnection) => c.protocol === 'TCP').length || 0}
                         </span>
                         <span className="flex items-center gap-1">
                             <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                             UDP: {globalStats?.connections?.filter((c: NetworkConnection) => c.protocol === 'UDP').length || 0}
                         </span>
                         <span className="flex items-center gap-1">
                             <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                             LISTEN: {globalStats?.connections?.filter((c: NetworkConnection) => c.state === 'LISTEN').length || 0}
                         </span>
                     </div>
                 </div>
             </div>
          </div>

          {/* Process Radar Visualization */}
          <div className="px-4 pb-3">
             <ProcessRadar 
               processes={processedList}
               selectedPid={selectedPid}
               onSelect={setSelectedPid}
             />
          </div>

          {/* Filters & Column Headers */}
          <div className="px-4 pb-1 border-t border-white/5 pt-3">
             <div className="flex items-center justify-between mb-2">
                <div className="flex bg-white/5 rounded-lg p-0.5">
                    <button onClick={() => setSortMode('cpu')} className={clsx("px-3 py-1 rounded text-[10px] font-bold transition-colors", sortMode === 'cpu' ? "bg-white/10 text-white" : "text-gray-500")}>CPU</button>
                    <button onClick={() => setSortMode('mem')} className={clsx("px-3 py-1 rounded text-[10px] font-bold transition-colors", sortMode === 'mem' ? "bg-white/10 text-white" : "text-gray-500")}>MEM</button>
                    <button onClick={() => setSortMode('net')} className={clsx("px-3 py-1 rounded text-[10px] font-bold transition-colors", sortMode === 'net' ? "bg-white/10 text-white" : "text-gray-500")}>NET</button>
                </div>
                <div className="text-[10px] text-gray-500 font-mono">
                    {globalStats?.connections?.length || 0} conn
                </div>
             </div>
             {/* Column headers */}
             <div className="flex items-center justify-between px-3 text-[9px] text-gray-600 uppercase tracking-wider font-medium">
                <div className="flex-1">Process</div>
                <div className="flex items-center gap-1 font-mono">
                    <div className="w-12 text-right">CPU</div>
                    <div className="w-12 text-right">MEM</div>
                    <div className="w-20 text-right">NET ↓/↑</div>
                </div>
             </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2 space-y-px">
            {displayedList.map((p) => {
                const id = generateProcessId(p);
                const analysis = analyses[id];
                const isSelected = p.pid === selectedPid;

                return (
                    <div
                        key={p.pid}
                        onClick={() => setSelectedPid(p.pid)}
                        className={clsx(
                            "flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-all duration-150 group select-none border border-transparent",
                            isSelected 
                                ? "bg-blue-600/10 border-blue-500/30 text-white" 
                                : "hover:bg-white/5 text-gray-400 hover:text-gray-200"
                        )}
                    >
                        <div className="min-w-0 flex-1 pr-3 flex items-center gap-2">
                             <div className={clsx("w-1 h-1 rounded-full shrink-0", 
                                p.cpu > 20 ? "bg-red-500" : 
                                p.mem > 500 ? "bg-yellow-500" : "bg-white/20"
                             )} />
                             <span className="truncate text-xs font-medium">{analysis?.friendlyName || p.name}</span>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-1 tabular-nums font-mono">
                            {/* CPU Column */}
                            <div className={clsx(
                                "w-12 text-right",
                                sortMode === 'cpu' ? "text-white" : "text-gray-500"
                            )}>
                                <span className={clsx("text-[11px]", p.cpu > 50 && "text-red-400 font-semibold")}>
                                    {fmtCpu(p.cpu)}
                                </span>
                                <span className="text-[8px] text-gray-600 ml-0.5">%</span>
                            </div>
                            
                            {/* MEM Column */}
                            <div className={clsx(
                                "w-12 text-right",
                                sortMode === 'mem' ? "text-white" : "text-gray-500"
                            )}>
                                <span className={clsx("text-[11px]", p.mem > 500 && "text-yellow-400 font-semibold")}>
                                    {fmtMem(p.mem).value}
                                </span>
                                <span className="text-[8px] text-gray-600 ml-0.5">{fmtMem(p.mem).unit}</span>
                            </div>
                            
                            {/* NET Column - Shows both ↓ and ↑ */}
                            <div className={clsx(
                                "w-20 text-right flex items-center justify-end gap-1",
                                sortMode === 'net' ? "text-white" : "text-gray-500"
                            )}>
                                {getNetTotal(p) > 0 ? (
                                    <>
                                        <span className="flex items-center text-[9px] text-green-500">
                                            <ArrowDown size={7} />
                                            {fmtBytes(p.netIn || 0).value}<span className="text-[7px]">{fmtBytes(p.netIn || 0).unit}</span>
                                        </span>
                                        <span className="flex items-center text-[9px] text-orange-500">
                                            <ArrowUp size={7} />
                                            {fmtBytes(p.netOut || 0).value}<span className="text-[7px]">{fmtBytes(p.netOut || 0).unit}</span>
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-[9px] text-gray-700">—</span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
          </div>
       </div>

       {/* RIGHT: Detail View */}
       <div className="flex-1 bg-[#050505] flex flex-col overflow-hidden relative">
          <div className="h-8 draggable shrink-0" />
          
          {/* Elegant Arc Frequency Slider - Top Right */}
          <ArcSlider value={samplingHz} onChange={setSamplingHz} min={1} max={20} /> 
          
          {displayedProcess ? (
             <div className="flex-1 overflow-y-auto p-8 animate-in fade-in slide-in-from-right-4 duration-300">
                {/* Header */}
                <div className="flex items-start justify-between mb-8">
                    <div>
                        <h2 className="text-3xl font-bold text-white tracking-tight mb-2">
                            {displayedAnalysis?.friendlyName || displayedProcess.name}
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-mono text-gray-400">PID {displayedProcess.pid}</span>
                            <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-mono text-gray-400">{displayedProcess.user}</span>
                            {displayedAnalysis && (
                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[10px] font-bold uppercase">{displayedAnalysis.category}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Stats Grid */}
                <div className="grid grid-cols-3 gap-3 mb-8">
                     {/* CPU Card */}
                     <div className="p-4 rounded-2xl bg-white/5 border border-white/5 relative overflow-hidden flex flex-col">
                        <div className="flex justify-between items-start mb-2 z-10">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">CPU</div>
                            <div className="text-xl font-mono text-white">{fmtCpu(displayedProcess.cpu)}<span className="text-xs text-gray-500">%</span></div>
                        </div>
                        <div className="flex-1 min-h-[50px]" style={{ minHeight: 50 }}>
                             <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={procHistory}>
                                        <defs>
                                            <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#colorCpu)" strokeWidth={2} isAnimationActive={false} />
                                    </AreaChart>
                            </ResponsiveContainer>
                        </div>
                     </div>

                     {/* Memory Card */}
                     <div className="p-4 rounded-2xl bg-white/5 border border-white/5 relative overflow-hidden flex flex-col">
                        <div className="flex justify-between items-start mb-2 z-10">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Memory</div>
                            <div className="text-xl font-mono text-white">{fmtMem(displayedProcess.mem).value}<span className="text-xs text-gray-500">{fmtMem(displayedProcess.mem).unit}</span></div>
                        </div>
                        <div className="flex-1 min-h-[50px]" style={{ minHeight: 50 }}>
                             <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={procHistory}>
                                    <Area type="monotone" dataKey="mem" stroke="#a855f7" fill="#a855f7" fillOpacity={0.2} isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                     </div>

                     {/* Network I/O Card with Chart */}
                     <div className="p-4 rounded-2xl bg-white/5 border border-white/5 relative overflow-hidden flex flex-col">
                        <div className="flex justify-between items-start mb-1 z-10">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Network</div>
                            <div className="flex items-center gap-2 text-[10px] font-mono">
                                <span className="flex items-center gap-0.5 text-green-400">
                                    <ArrowDown size={8} />
                                    {fmtBytes(displayedProcess.netIn || 0).value}{fmtBytes(displayedProcess.netIn || 0).unit}
                                </span>
                                <span className="flex items-center gap-0.5 text-orange-400">
                                    <ArrowUp size={8} />
                                    {fmtBytes(displayedProcess.netOut || 0).value}{fmtBytes(displayedProcess.netOut || 0).unit}
                                </span>
                            </div>
                        </div>
                        <div className="flex-1 min-h-[50px]" style={{ minHeight: 50 }}>
                             <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={procHistory}>
                                    <defs>
                                        <linearGradient id="colorNetIn" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorNetOut" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <Area type="monotone" dataKey="netIn" stroke="#22c55e" fill="url(#colorNetIn)" strokeWidth={1.5} isAnimationActive={false} />
                                    <Area type="monotone" dataKey="netOut" stroke="#f97316" fill="url(#colorNetOut)" strokeWidth={1.5} isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                     </div>
                </div>

                {/* Network Connections */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Network Connections</div>
                        <span className="text-[10px] font-mono text-cyan-400">{processConnections.length || 0} active</span>
                    </div>
                    <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                        {processConnections && processConnections.length > 0 ? (
                            <div className="divide-y divide-white/5 max-h-[200px] overflow-y-auto custom-scrollbar">
                                {processConnections.map((conn, i) => (
                                    <div key={i} className="px-4 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors">
                                        <span className={clsx(
                                            "text-[9px] font-bold px-1.5 py-0.5 rounded",
                                            conn.protocol === 'TCP' ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"
                                        )}>
                                            {conn.protocol}
                                        </span>
                                        <span className={clsx(
                                            "text-[9px] px-1.5 py-0.5 rounded",
                                            conn.state === 'ESTABLISHED' ? "bg-emerald-500/20 text-emerald-400" :
                                            conn.state === 'LISTEN' ? "bg-yellow-500/20 text-yellow-400" :
                                            "bg-gray-500/20 text-gray-400"
                                        )}>
                                            {conn.state || 'OPEN'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] font-mono text-gray-300 truncate">
                                                {conn.localAddress}
                                                {conn.remoteAddress && (
                                                    <span className="text-gray-500"> → </span>
                                                )}
                                                {conn.remoteAddress && (
                                                    <span className="text-cyan-300">{conn.remoteAddress}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="px-4 py-6 text-center">
                                <Globe size={24} className="mx-auto mb-2 text-gray-700" />
                                <div className="text-xs text-gray-600">No active network connections</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Command */}
                <div className="mb-8">
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Process Command</div>
                    <div className="p-4 bg-black/40 border border-white/10 rounded-xl">
                        <code className="text-xs font-mono text-gray-400 break-all leading-relaxed">
                            {displayedProcess.command}
                        </code>
                    </div>
                </div>

                {/* AI Insight */}
                <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-transparent p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Bot size={20} className="text-indigo-400" />
                        <h3 className="text-sm font-bold text-white">AI Analysis</h3>
                    </div>
                    
                    {displayedAnalysis ? (
                        <p className="text-sm text-gray-300 leading-relaxed">
                            {displayedAnalysis.description}
                        </p>
                    ) : (
                        <div className="text-center py-4">
                            <p className="text-xs text-gray-500 mb-3">No analysis available.</p>
                            <button 
                                onClick={() => handleAnalyze(displayedProcess)}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-indigo-500/20 transition-all"
                            >
                                Generate Insight
                            </button>
                        </div>
                    )}
                </div>
             </div>
          ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-gray-800">
                <Activity size={64} strokeWidth={0.5} className="mb-4" />
                <p className="text-xs font-medium uppercase tracking-widest">Select a process to inspect</p>
             </div>
          )}
       </div>
    </div>
  );
}
