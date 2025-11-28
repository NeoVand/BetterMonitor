/**
 * Shared utilities for process data
 * Single source of truth for filtering, sorting, and coloring
 */

import { SystemProcess } from '../../shared/types';

/**
 * FNV-1a hash-based color generation
 * Produces consistent colors for the same string input
 */
export function stringToColor(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = Math.abs(hash) % 360;
  const saturation = 65 + (Math.abs(hash >> 8) % 20);
  const lightness = 55 + (Math.abs(hash >> 16) % 15);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Category color palette
 */
export const CATEGORY_COLORS: Record<string, string> = {
  'System': '#6366f1',
  'Development': '#10b981',
  'Browser': '#f59e0b',
  'Communication': '#ec4899',
  'Media': '#8b5cf6',
  'Background': '#64748b',
  'Other': '#71717a',
};

export type SortMode = 'cpu' | 'mem' | 'net';

/**
 * Filter to active processes (those with meaningful resource usage)
 */
export function filterActiveProcesses(processes: SystemProcess[]): SystemProcess[] {
  return processes.filter(p => 
    p.cpu > 0.1 || p.mem > 5 || (p.netIn || 0) > 0 || (p.netOut || 0) > 0
  );
}

/**
 * Sort processes by the given mode
 */
export function sortProcesses(processes: SystemProcess[], sortMode: SortMode = 'cpu'): SystemProcess[] {
  return [...processes].sort((a, b) => {
    switch (sortMode) {
      case 'cpu':
        return b.cpu - a.cpu;
      case 'mem':
        return b.mem - a.mem;
      case 'net':
        return ((b.netIn || 0) + (b.netOut || 0)) - ((a.netIn || 0) + (a.netOut || 0));
      default:
        return b.cpu - a.cpu;
    }
  });
}

/**
 * Get the top N active processes sorted by the given mode
 * This is the single source of truth for what appears in radar/clusters with colors
 */
export function getTopProcesses(
  processes: SystemProcess[], 
  sortMode: SortMode = 'cpu',
  count: number = 10
): SystemProcess[] {
  const active = filterActiveProcesses(processes);
  const sorted = sortProcesses(active, sortMode);
  return sorted.slice(0, count);
}

/**
 * Get process names that should be colored (top 10 active based on sort mode)
 */
export function getColoredProcessNames(processes: SystemProcess[], sortMode: SortMode = 'cpu'): Set<string> {
  return new Set(getTopProcesses(processes, sortMode, 10).map(p => p.name));
}

/**
 * Get color for a process - uses stringToColor if in top 10, otherwise category color
 */
export function getProcessColor(
  processName: string | undefined, 
  category: string | undefined,
  coloredNames: Set<string>
): string {
  if (processName && coloredNames.has(processName)) {
    return stringToColor(processName);
  }
  return CATEGORY_COLORS[category || 'Other'] || CATEGORY_COLORS['Other'];
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): { value: string; unit: string } {
  if (bytes >= 1073741824) return { value: (bytes / 1073741824).toFixed(1), unit: 'GB' };
  if (bytes >= 1048576) return { value: (bytes / 1048576).toFixed(1), unit: 'MB' };
  if (bytes >= 1024) return { value: (bytes / 1024).toFixed(0), unit: 'KB' };
  return { value: bytes.toFixed(0), unit: 'B' };
}

/**
 * Format memory (MB) to human readable
 */
export function formatMem(mb: number): { value: string; unit: string } {
  if (mb >= 1024) return { value: (mb / 1024).toFixed(1), unit: 'G' };
  return { value: mb.toFixed(0), unit: 'M' };
}

/**
 * Format CPU percentage
 */
export function formatCpu(cpu: number): string {
  return cpu >= 10 ? cpu.toFixed(0) : cpu.toFixed(1);
}

