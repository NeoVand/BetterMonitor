"use client";

import { useEffect, useState, useRef } from 'react';
import { useProcessStore, generateProcessId } from '@/lib/store';
import { 
  Activity, Cpu, Settings,
  Wifi, ArrowUp, ArrowDown, Disc, Network
} from 'lucide-react';
import clsx from 'clsx';
import { SystemProcess } from '../../shared/types';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ArcSlider } from './ArcSlider';
import { ProcessRadar } from './ProcessRadar';
import { MindMap } from './MindMap';
import { ChatPanel } from './ChatPanel';
import { SettingsModal } from './SettingsModal';
import { APIKeySetup } from './APIKeySetup';
import { sortProcesses } from '@/lib/process-utils';

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
    analyses,
    selectedPid, setSelectedPid, selectedProcessSnapshot,
    selectedClusterId,
    clusters,
    processConnections, setProcessConnections,
    isSettingsOpen, setSettingsOpen,
    sortMode, setSortMode,
  } = useProcessStore();
  
  const [samplingHz, setSamplingHz] = useState(3);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null); // null = loading
  
  // History for charts
  const [procHistory, setProcHistory] = useState<{cpu: number, mem: number, netIn: number, netOut: number}[]>([]);
  const [globalHistory, setGlobalHistory] = useState<GlobalHistory[]>([]);
  // Use ref instead of state to avoid infinite update loops
  const prevNetValuesRef = useRef<{pid: number, netIn: number, netOut: number} | null>(null);

  // Check if API key is configured
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) {
      setHasApiKey(false);
      return;
    }
    
    window.electron.getAISettings().then(settings => {
      setHasApiKey(!!settings.apiKey);
    }).catch(() => {
      setHasApiKey(false);
    });
  }, []);

  // Polling Loop
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

    fetchProcesses();
    const intervalMs = Math.round(1000 / samplingHz);
    const interval = setInterval(fetchProcesses, intervalMs);
    return () => clearInterval(interval);
  }, [samplingHz, setProcessData]);

  // Clear history when switching processes
  useEffect(() => {
    setProcHistory([]);
    prevNetValuesRef.current = null;
  }, [selectedPid]);

  // Update Process History
  useEffect(() => {
    if (selectedProcessSnapshot && selectedPid === selectedProcessSnapshot.pid) {
      const currentNetIn = selectedProcessSnapshot.netIn || 0;
      const currentNetOut = selectedProcessSnapshot.netOut || 0;
      
      let netInRate = 0;
      let netOutRate = 0;
      
      const prevNetValues = prevNetValuesRef.current;
      if (prevNetValues && prevNetValues.pid === selectedProcessSnapshot.pid) {
        netInRate = Math.max(0, currentNetIn - prevNetValues.netIn);
        netOutRate = Math.max(0, currentNetOut - prevNetValues.netOut);
      }
      
      // Update ref (doesn't trigger re-render)
      prevNetValuesRef.current = {
        pid: selectedProcessSnapshot.pid,
        netIn: currentNetIn,
        netOut: currentNetOut
      };
      
      setProcHistory(prev => {
        const newPt = { 
          cpu: selectedProcessSnapshot.cpu, 
          mem: selectedProcessSnapshot.mem,
          netIn: netInRate,
          netOut: netOutRate
        };
        const newHist = [...prev, newPt];
        if (newHist.length > 60) newHist.shift();
        return newHist;
      });
    }
  }, [selectedProcessSnapshot, selectedPid]);

  // Update Global History
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
        if (newHist.length > 60) newHist.shift();
        return newHist;
      });
    }
  }, [globalStats]);

  // Fetch connections for selected process
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
    const interval = setInterval(fetchConnections, 1000);
    return () => clearInterval(interval);
  }, [selectedPid, setProcessConnections]);

  // Formatters
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
    return cpu.toFixed(1);
  };

  const fmtMem = (mb: number): { value: string; unit: string } => {
    if (mb >= 1024) return { value: (mb / 1024).toFixed(1), unit: 'G' };
    return { value: mb.toFixed(0), unit: 'M' };
  };

  const getNetTotal = (p: SystemProcess) => (p.netIn || 0) + (p.netOut || 0);

  // Process list - use shared sort function for consistency
  const processedList = sortProcesses(processes, sortMode)
    .filter(p => p.cpu > 0.1 || p.mem > 10 || getNetTotal(p) > 0);

  const displayedList = processedList.slice(0, 100);
  const displayedProcess = selectedProcessSnapshot;
  const displayedAnalysis = displayedProcess ? analyses[generateProcessId(displayedProcess)] : null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0A0A0A] text-gray-200 font-sans selection:bg-blue-500/30">
      
      {/* LEFT PANEL - Global Stats + Radar + Process List */}
      <div className="w-[320px] flex flex-col border-r border-white/5 bg-black/40 backdrop-blur-xl shrink-0">
        <div className="h-8 draggable shrink-0" />
        
        {/* Compact Global Stats */}
        <div className="px-3 pb-3 space-y-2">
          <h1 className="font-bold text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <Activity size={10} /> System
          </h1>
          
          <div className="grid grid-cols-2 gap-1.5">
            {/* Network */}
            <div className="p-2 bg-white/5 rounded-lg border border-white/5">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[8px] font-bold text-blue-400 flex items-center gap-1"><Wifi size={8} /> NET</span>
                <span className="text-[8px] font-mono text-gray-400">{fmtSpeed(globalStats?.net.rx_sec || 0)}</span>
              </div>
              <div className="h-6 opacity-50">
                <ResponsiveContainer width="100%" height={24}>
                  <AreaChart data={globalHistory}>
                    <Area type="monotone" dataKey="netRx" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Disk */}
            <div className="p-2 bg-white/5 rounded-lg border border-white/5">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[8px] font-bold text-purple-400 flex items-center gap-1"><Disc size={8} /> DISK</span>
                <span className="text-[8px] font-mono text-gray-400">{(globalStats?.disk.rIO_sec || 0).toFixed(0)}/s</span>
              </div>
              <div className="h-6 opacity-50">
                <ResponsiveContainer width="100%" height={24}>
                  <AreaChart data={globalHistory}>
                    <Area type="monotone" dataKey="diskR" stroke="#a855f7" fill="#a855f7" fillOpacity={0.2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Connections Summary */}
          <div className="p-2 bg-white/5 rounded-lg border border-white/5">
            <div className="flex justify-between items-center">
              <span className="text-[8px] font-bold text-cyan-400 flex items-center gap-1"><Network size={8} /> Connections</span>
              <span className="text-[9px] font-mono text-white">{globalStats?.connections?.length || 0}</span>
            </div>
          </div>
        </div>

        {/* Process Radar */}
        <div className="px-3 pb-3">
          <ProcessRadar 
            processes={processedList}
            selectedPid={selectedPid}
            onSelect={setSelectedPid}
          />
        </div>

        {/* Sort Buttons */}
        <div className="px-3 pb-2">
          <div className="flex bg-white/5 rounded-lg p-0.5">
            <button onClick={() => setSortMode('cpu')} className={clsx("flex-1 px-2 py-1 rounded text-[9px] font-bold transition-colors", sortMode === 'cpu' ? "bg-white/10 text-white" : "text-gray-500")}>CPU</button>
            <button onClick={() => setSortMode('mem')} className={clsx("flex-1 px-2 py-1 rounded text-[9px] font-bold transition-colors", sortMode === 'mem' ? "bg-white/10 text-white" : "text-gray-500")}>MEM</button>
            <button onClick={() => setSortMode('net')} className={clsx("flex-1 px-2 py-1 rounded text-[9px] font-bold transition-colors", sortMode === 'net' ? "bg-white/10 text-white" : "text-gray-500")}>NET</button>
          </div>
        </div>

        {/* Process List */}
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
                  "flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-all duration-150 group select-none border border-transparent",
                  isSelected 
                    ? "bg-blue-600/10 border-blue-500/30 text-white" 
                    : "hover:bg-white/5 text-gray-400 hover:text-gray-200"
                )}
              >
                <div className="min-w-0 flex-1 pr-2 flex items-center gap-1.5">
                  <div className={clsx("w-1 h-1 rounded-full shrink-0", 
                    p.cpu > 20 ? "bg-red-500" : p.mem > 500 ? "bg-yellow-500" : "bg-white/20"
                  )} />
                  <span className="truncate text-[10px] font-medium">{analysis?.friendlyName || p.name}</span>
                </div>
                <div className="text-right shrink-0 flex items-center gap-1 tabular-nums font-mono">
                  <span className={clsx("text-[9px] w-10 text-right", sortMode === 'cpu' ? "text-white" : "text-gray-500")}>
                    {fmtCpu(p.cpu)}%
                  </span>
                  <span className={clsx("text-[9px] w-8 text-right", sortMode === 'mem' ? "text-white" : "text-gray-500")}>
                    {fmtMem(p.mem).value}{fmtMem(p.mem).unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CENTER PANEL - Mind Map + Chat */}
      <div className="flex-1 flex flex-col bg-[#050505] overflow-hidden relative">
        {/* Header with Settings - no-drag on button area */}
        <div className="h-8 shrink-0 flex items-center justify-between px-4">
          <span className="text-[9px] text-gray-600 font-medium draggable flex-1">AI Intelligence</span>
          {hasApiKey && (
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors relative z-50"
              title="AI Settings"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <Settings size={14} />
            </button>
          )}
        </div>
        
        {/* Mind Map - Top Half */}
        <div className="flex-1 p-4 pt-0 min-h-0">
          <MindMap />
        </div>
        
        {/* Chat - Bottom Half */}
        <div className="h-[280px] p-4 pt-0 shrink-0">
          <ChatPanel />
        </div>

        {/* API Key Setup Overlay */}
        {hasApiKey === false && (
          <APIKeySetup onComplete={() => setHasApiKey(true)} />
        )}
      </div>

      {/* RIGHT PANEL - Detail View */}
      <div className="w-[350px] bg-[#030303] flex flex-col overflow-hidden border-l border-white/5 shrink-0">
        <div className="h-8 draggable shrink-0 flex items-center justify-end px-2">
          <ArcSlider value={samplingHz} onChange={setSamplingHz} min={1} max={20} />
        </div>
        
        {displayedProcess ? (
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {/* Header */}
            <div className="mb-4">
              <h2 className="text-lg font-bold text-white mb-1">
                {displayedAnalysis?.friendlyName || displayedProcess.name}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 bg-white/10 rounded text-[9px] font-mono text-gray-400">PID {displayedProcess.pid}</span>
                <span className="px-2 py-0.5 bg-white/10 rounded text-[9px] font-mono text-gray-400">{displayedProcess.user}</span>
                {displayedAnalysis && (
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[9px] font-bold uppercase">{displayedAnalysis.category}</span>
                )}
              </div>
            </div>

            {/* Stats Cards - Stacked */}
            <div className="space-y-2 mb-4">
              {/* CPU */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] text-gray-500 font-bold uppercase">CPU</span>
                  <span className="text-sm font-mono text-white">{fmtCpu(displayedProcess.cpu)}%</span>
                </div>
                <div className="h-10">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={procHistory}>
                      <defs>
                        <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#colorCpu)" strokeWidth={1.5} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Memory */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] text-gray-500 font-bold uppercase">Memory</span>
                  <span className="text-sm font-mono text-white">{fmtMem(displayedProcess.mem).value}{fmtMem(displayedProcess.mem).unit}</span>
                </div>
                <div className="h-10">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={procHistory}>
                      <Area type="monotone" dataKey="mem" stroke="#a855f7" fill="#a855f7" fillOpacity={0.2} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Network */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[9px] text-gray-500 font-bold uppercase">Network</span>
                  <div className="flex items-center gap-2 text-[9px] font-mono">
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
                <div className="h-10">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={procHistory}>
                      <Area type="monotone" dataKey="netIn" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} isAnimationActive={false} />
                      <Area type="monotone" dataKey="netOut" stroke="#f97316" fill="#f97316" fillOpacity={0.1} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Connections */}
            {processConnections.length > 0 && (
              <div className="mb-4">
                <div className="text-[9px] text-gray-500 font-bold uppercase mb-2">Connections ({processConnections.length})</div>
                <div className="bg-black/40 border border-white/10 rounded-lg overflow-hidden max-h-[150px] overflow-y-auto custom-scrollbar">
                  {processConnections.slice(0, 10).map((conn, i) => (
                    <div key={i} className="px-3 py-1.5 flex items-center gap-2 border-b border-white/5 last:border-0">
                      <span className={clsx(
                        "text-[8px] font-bold px-1 py-0.5 rounded",
                        conn.protocol === 'TCP' ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"
                      )}>
                        {conn.protocol}
                      </span>
                      <span className="text-[9px] font-mono text-gray-400 truncate flex-1">
                        {conn.localAddress}
                        {conn.remoteAddress && <span className="text-gray-600"> → </span>}
                        {conn.remoteAddress && <span className="text-cyan-400">{conn.remoteAddress}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Command */}
            <div>
              <div className="text-[9px] text-gray-500 font-bold uppercase mb-2">Command</div>
              <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
                <code className="text-[10px] font-mono text-gray-400 break-all leading-relaxed">
                  {displayedProcess.command}
                </code>
              </div>
            </div>
          </div>
        ) : selectedClusterId ? (
          // Cluster/Category Detail View - calculate live stats from processes
          (() => {
            // Handle different ID types:
            // - cat-XXX: category
            // - unclustered-XXX: dynamic group by process name
            // - cluster-XXX: actual cluster from store
            const isCategory = selectedClusterId.startsWith('cat-');
            const isUnclustered = selectedClusterId.startsWith('unclustered-');
            const categoryName = isCategory ? selectedClusterId.replace('cat-', '') : null;
            const unclusteredName = isUnclustered ? selectedClusterId.replace('unclustered-', '') : null;
            
            // Get all relevant process IDs
            let relevantPids: number[] = [];
            let displayName = '';
            let displayCategory = '';
            let description = '';
            
            if (isCategory) {
              // Category selected - aggregate all processes in this category
              displayName = categoryName || 'Category';
              displayCategory = categoryName || '';
              description = `All ${categoryName} processes`;
              
              // Get PIDs from clusters in this category
              for (const cluster of clusters) {
                if (cluster.category === categoryName) {
                  relevantPids.push(...cluster.processIds);
                }
              }
              
              // Also include unclustered processes that match this category
              const inferCategory = (name: string): string => {
                const lower = name.toLowerCase();
                if (/chrome|safari|firefox|edge|browser|webkit/i.test(lower)) return 'Browser';
                if (/node|python|ruby|java|vscode|xcode|git|npm|yarn|cursor/i.test(lower)) return 'Development';
                if (/slack|zoom|teams|discord|telegram|messages/i.test(lower)) return 'Communication';
                if (/spotify|music|video|vlc|quicktime|audio/i.test(lower)) return 'Media';
                if (/kernel|launchd|system|daemon|agent/i.test(lower)) return 'System';
                if (/helper|service|worker/i.test(lower)) return 'Background';
                return 'Other';
              };
              
              for (const proc of processes) {
                if (!relevantPids.includes(proc.pid) && inferCategory(proc.name) === categoryName) {
                  relevantPids.push(proc.pid);
                }
              }
            } else if (isUnclustered) {
              // Dynamic group by process name
              displayName = unclusteredName || 'Unknown';
              displayCategory = '';
              description = `Processes named "${unclusteredName}"`;
              
              for (const proc of processes) {
                if (proc.name === unclusteredName) {
                  relevantPids.push(proc.pid);
                }
              }
            } else {
              // Actual cluster from store
              const cluster = clusters.find(c => c.id === selectedClusterId);
              if (cluster) {
                displayName = cluster.name;
                displayCategory = cluster.category;
                description = cluster.description;
                relevantPids = cluster.processIds;
              }
            }
            
            // Calculate live aggregate stats from actual processes
            const clusterProcesses = relevantPids
              .map(pid => processes.find(p => p.pid === pid))
              .filter(Boolean) as typeof processes;
            
            const totalCpu = clusterProcesses.reduce((sum, p) => sum + p.cpu, 0);
            const totalMem = clusterProcesses.reduce((sum, p) => sum + p.mem, 0);
            const totalNetIn = clusterProcesses.reduce((sum, p) => sum + (p.netIn || 0), 0);
            const totalNetOut = clusterProcesses.reduce((sum, p) => sum + (p.netOut || 0), 0);
            
            return (
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-white mb-1">{displayName}</h2>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-white/10 rounded text-[9px] font-bold text-gray-400">
                      {clusterProcesses.length} processes
                    </span>
                    {displayCategory && (
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[9px] font-bold uppercase">
                        {displayCategory}
                      </span>
                    )}
                  </div>
                </div>

                {description && <p className="text-xs text-gray-400 mb-4">{description}</p>}

                {/* Aggregate Stats */}
                <div className="space-y-2 mb-4">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex justify-between items-center">
                    <span className="text-[9px] text-gray-500 font-bold uppercase flex items-center gap-1">
                      <Cpu size={10} /> Total CPU
                    </span>
                    <span className="text-sm font-mono text-white">{totalCpu.toFixed(1)}%</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex justify-between items-center">
                    <span className="text-[9px] text-gray-500 font-bold uppercase">Total Memory</span>
                    <span className="text-sm font-mono text-white">{fmtMem(totalMem).value}{fmtMem(totalMem).unit}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex justify-between items-center">
                    <span className="text-[9px] text-gray-500 font-bold uppercase flex items-center gap-1">
                      <ArrowDown size={10} className="text-green-400" /> Network In
                    </span>
                    <span className="text-sm font-mono text-green-400">{fmtBytes(totalNetIn).value}{fmtBytes(totalNetIn).unit}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5 flex justify-between items-center">
                    <span className="text-[9px] text-gray-500 font-bold uppercase flex items-center gap-1">
                      <ArrowUp size={10} className="text-orange-400" /> Network Out
                    </span>
                    <span className="text-sm font-mono text-orange-400">{fmtBytes(totalNetOut).value}{fmtBytes(totalNetOut).unit}</span>
                  </div>
                </div>

                {/* Processes in Cluster */}
                <div>
                  <div className="text-[9px] text-gray-500 font-bold uppercase mb-2">
                    Top Processes {clusterProcesses.length > 10 && `(showing 10 of ${clusterProcesses.length})`}
                  </div>
                  <div className="space-y-1">
                    {clusterProcesses
                      .sort((a, b) => b.cpu - a.cpu)
                      .slice(0, 10)
                      .map(proc => (
                        <div
                          key={proc.pid}
                          onClick={() => setSelectedPid(proc.pid)}
                          className="px-3 py-2 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-300">{proc.name}</span>
                            <span className="text-[9px] text-gray-600 font-mono">PID {proc.pid}</span>
                          </div>
                          <div className="text-[9px] text-gray-500 font-mono mt-0.5">
                            CPU: {proc.cpu.toFixed(1)}% | MEM: {fmtMem(proc.mem).value}{fmtMem(proc.mem).unit}
                            {(proc.netIn || 0) + (proc.netOut || 0) > 0 && (
                              <> | NET: {fmtBytes((proc.netIn || 0) + (proc.netOut || 0)).value}{fmtBytes((proc.netIn || 0) + (proc.netOut || 0)).unit}</>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-800">
            <Activity size={48} strokeWidth={0.5} className="mb-4" />
            <p className="text-[10px] font-medium uppercase tracking-widest">Select a process or cluster</p>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setSettingsOpen(false)} 
      />
    </div>
  );
}
