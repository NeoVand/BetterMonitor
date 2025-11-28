"use client";

import { useMemo } from 'react';
import { SystemProcess } from '../../shared/types';

interface ProcessRadarProps {
  processes: SystemProcess[];
  selectedPid: number | null;
  onSelect: (pid: number | null) => void;
}

// Generate a consistent HSL color from a string (process name)
// Uses a simple but effective hash that produces well-distributed hues
function stringToColor(str: string): string {
  // FNV-1a hash - fast and good distribution
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  
  // Convert hash to color components
  // Hue: full 360 degree range
  const hue = Math.abs(hash) % 360;
  
  // Use different parts of hash for saturation and lightness variation
  // Keep saturation high (60-90%) and lightness in visible range (45-65%)
  const saturation = 60 + (Math.abs(hash >> 8) % 30);
  const lightness = 45 + (Math.abs(hash >> 16) % 20);
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// Axes arranged for better visual clustering
const AXES = [
  { key: 'cpu', label: 'CPU', angle: 0 },
  { key: 'mem', label: 'MEM', angle: 60 },
  { key: 'threads', label: 'THREADS', angle: 120 },
  { key: 'connections', label: 'CONN', angle: 180 },
  { key: 'netOut', label: 'NET ↑', angle: 240 },
  { key: 'netIn', label: 'NET ↓', angle: 300 },
];

// Centripetal Catmull-Rom spline - guaranteed no self-intersection
function centipetalCatmullRom(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
  alpha: number = 0.5
): { x: number; y: number } {
  const getT = (t: number, p0: { x: number; y: number }, p1: { x: number; y: number }) => {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    return t + Math.pow(d, alpha);
  };

  const t0 = 0;
  const t1 = getT(t0, p0, p1);
  const t2 = getT(t1, p1, p2);
  const t3 = getT(t2, p2, p3);

  const tt = t1 + t * (t2 - t1);

  const A1x = (t1 - tt) / (t1 - t0) * p0.x + (tt - t0) / (t1 - t0) * p1.x;
  const A1y = (t1 - tt) / (t1 - t0) * p0.y + (tt - t0) / (t1 - t0) * p1.y;
  const A2x = (t2 - tt) / (t2 - t1) * p1.x + (tt - t1) / (t2 - t1) * p2.x;
  const A2y = (t2 - tt) / (t2 - t1) * p1.y + (tt - t1) / (t2 - t1) * p2.y;
  const A3x = (t3 - tt) / (t3 - t2) * p2.x + (tt - t2) / (t3 - t2) * p3.x;
  const A3y = (t3 - tt) / (t3 - t2) * p2.y + (tt - t2) / (t3 - t2) * p3.y;

  const B1x = (t2 - tt) / (t2 - t0) * A1x + (tt - t0) / (t2 - t0) * A2x;
  const B1y = (t2 - tt) / (t2 - t0) * A1y + (tt - t0) / (t2 - t0) * A2y;
  const B2x = (t3 - tt) / (t3 - t1) * A2x + (tt - t1) / (t3 - t1) * A3x;
  const B2y = (t3 - tt) / (t3 - t1) * A2y + (tt - t1) / (t3 - t1) * A3y;

  const Cx = (t2 - tt) / (t2 - t1) * B1x + (tt - t1) / (t2 - t1) * B2x;
  const Cy = (t2 - tt) / (t2 - t1) * B1y + (tt - t1) / (t2 - t1) * B2y;

  return { x: Cx, y: Cy };
}

// Create smooth closed path using centripetal Catmull-Rom
function createSmoothClosedPath(points: { x: number; y: number }[], segments: number = 12): string {
  if (points.length < 3) return '';
  
  const n = points.length;
  const getPoint = (i: number) => points[((i % n) + n) % n];
  
  const pathPoints: { x: number; y: number }[] = [];
  
  for (let i = 0; i < n; i++) {
    const p0 = getPoint(i - 1);
    const p1 = getPoint(i);
    const p2 = getPoint(i + 1);
    const p3 = getPoint(i + 2);
    
    for (let j = 0; j < segments; j++) {
      const t = j / segments;
      pathPoints.push(centipetalCatmullRom(p0, p1, p2, p3, t));
    }
  }
  
  if (pathPoints.length === 0) return '';
  
  let path = `M ${pathPoints[0].x.toFixed(2)} ${pathPoints[0].y.toFixed(2)}`;
  for (let i = 1; i < pathPoints.length; i++) {
    path += ` L ${pathPoints[i].x.toFixed(2)} ${pathPoints[i].y.toFixed(2)}`;
  }
  path += ' Z';
  
  return path;
}

export function ProcessRadar({ processes, selectedPid, onSelect }: ProcessRadarProps) {
  const size = 220;
  const center = size / 2;
  const maxRadius = size / 2 - 35;
  
  // Calculate normalized values for each process
  const { topProcesses, ghostProcesses } = useMemo(() => {
    const activeProcesses = processes.filter(p => 
      p.cpu > 0.1 || p.mem > 5 || (p.netIn || 0) > 0 || (p.netOut || 0) > 0
    );
    
    const maxVals = {
      cpu: Math.max(1, ...activeProcesses.map(p => p.cpu)),
      mem: Math.max(1, ...activeProcesses.map(p => p.mem)),
      netIn: Math.max(1, ...activeProcesses.map(p => p.netIn || 0)),
      netOut: Math.max(1, ...activeProcesses.map(p => p.netOut || 0)),
      threads: Math.max(1, ...activeProcesses.map(p => p.threads || 1)),
      connections: Math.max(1, ...activeProcesses.map(p => p.connections || 0)),
    };
    
    const normalize = (p: SystemProcess) => ({
      cpu: Math.sqrt(p.cpu / maxVals.cpu),
      mem: Math.sqrt(p.mem / maxVals.mem),
      netIn: Math.sqrt((p.netIn || 0) / maxVals.netIn),
      netOut: Math.sqrt((p.netOut || 0) / maxVals.netOut),
      threads: Math.sqrt((p.threads || 1) / maxVals.threads),
      connections: Math.sqrt((p.connections || 0) / maxVals.connections),
    });
    
    // Top 10 get full colors (derived from name for consistency)
    const top = activeProcesses.slice(0, 10).map((p, idx) => ({
      process: p,
      color: stringToColor(p.name),
      values: normalize(p),
      rank: idx,
    }));
    
    // Rest become ghosts
    const ghosts = activeProcesses.slice(10, 50).map((p, idx) => ({
      process: p,
      values: normalize(p),
      rank: idx + 10,
      opacity: Math.max(0.03, 0.15 - idx * 0.003),
    }));
    
    return { topProcesses: top, ghostProcesses: ghosts };
  }, [processes]);
  
  // Generate axis lines and labels
  const axisElements = AXES.map((axis) => {
    const angleRad = (axis.angle - 90) * (Math.PI / 180);
    const x2 = center + maxRadius * Math.cos(angleRad);
    const y2 = center + maxRadius * Math.sin(angleRad);
    const labelX = center + (maxRadius + 16) * Math.cos(angleRad);
    const labelY = center + (maxRadius + 16) * Math.sin(angleRad);
    
    return (
      <g key={axis.key}>
        <line
          x1={center}
          y1={center}
          x2={x2}
          y2={y2}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={1}
        />
        <text
          x={labelX}
          y={labelY}
          fill="rgba(255,255,255,0.4)"
          fontSize={9}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.02em' }}
        >
          {axis.label}
        </text>
      </g>
    );
  });
  
  // Generate concentric circles (grid)
  const gridCircles = [0.25, 0.5, 0.75, 1].map((ratio, i) => (
    <circle
      key={i}
      cx={center}
      cy={center}
      r={maxRadius * ratio}
      fill="none"
      stroke="rgba(255,255,255,0.05)"
      strokeWidth={1}
    />
  ));
  
  // Helper to generate points for a process
  const getProcessPoints = (values: Record<string, number>) => {
    return AXES.map(axis => {
      const value = values[axis.key as keyof typeof values] || 0;
      const radius = Math.max(0.05, value) * maxRadius;
      const angleRad = (axis.angle - 90) * (Math.PI / 180);
      return {
        x: center + radius * Math.cos(angleRad),
        y: center + radius * Math.sin(angleRad),
      };
    });
  };
  
  // Ghost process shapes
  const ghostShapes = ghostProcesses.map(({ process, values, opacity }) => {
    const points = getProcessPoints(values);
    const pathD = createSmoothClosedPath(points, 8);
    
    return (
      <path
        key={`ghost-${process.pid}`}
        d={pathD}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={0.5}
        opacity={opacity}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(process.pid);
        }}
        style={{ cursor: 'pointer' }}
      />
    );
  });
  
  // Top process shapes with consistent colors
  const processShapes = topProcesses.map(({ process, color, values, rank }) => {
    const points = getProcessPoints(values);
    const pathD = createSmoothClosedPath(points, 10);
    const isSelected = process.pid === selectedPid;
    
    const strokeWidth = isSelected ? 2.5 : Math.max(0.8, 1.8 - rank * 0.1);
    const fillOpacity = isSelected ? 0.2 : Math.max(0.02, 0.08 - rank * 0.006);
    
    return (
      <g 
        key={process.pid} 
        onClick={(e) => {
          e.stopPropagation();
          onSelect(process.pid);
        }}
        style={{ cursor: 'pointer' }}
      >
        {isSelected && (
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth={8}
            opacity={0.2}
            style={{ filter: 'blur(6px)' }}
          />
        )}
        
        <path
          d={pathD}
          fill={color}
          fillOpacity={fillOpacity}
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={isSelected ? 1 : 0.7}
          className="transition-all duration-150 hover:opacity-100"
          style={{
            filter: isSelected ? `drop-shadow(0 0 10px ${color})` : 'none'
          }}
        />
      </g>
    );
  });
  
  const totalActive = topProcesses.length + ghostProcesses.length;
  
  // Handle click on empty space to deselect
  const handleBackgroundClick = () => {
    onSelect(null);
  };
  
  return (
    <div className="p-3 bg-white/[0.02] rounded-xl border border-white/5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
          Process Fingerprints
        </h3>
        <span className="text-[8px] text-gray-600 font-mono">
          {totalActive} active
        </span>
      </div>
      
      <div className="flex justify-center">
        <svg 
          width={size} 
          height={size} 
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible cursor-pointer"
          onClick={handleBackgroundClick}
        >
          <defs>
            <radialGradient id="radarBg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.02)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
          </defs>
          
          {/* Clickable background area */}
          <circle 
            cx={center} 
            cy={center} 
            r={maxRadius + 20} 
            fill="transparent"
          />
          
          <circle cx={center} cy={center} r={maxRadius} fill="url(#radarBg)" />
          
          {gridCircles}
          {axisElements}
          {ghostShapes}
          {[...processShapes].reverse()}
          
          <circle
            cx={center}
            cy={center}
            r={2}
            fill="rgba(255,255,255,0.25)"
          />
        </svg>
      </div>
      
      {/* Minimal info footer */}
      {ghostProcesses.length > 0 && (
        <div className="text-center mt-2">
          <span className="text-[8px] text-gray-600">
            +{ghostProcesses.length} more
          </span>
        </div>
      )}
    </div>
  );
}
