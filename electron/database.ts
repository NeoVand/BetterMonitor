import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import { ProcessAnalysis, SystemProcess } from '../shared/types';

let db: Database.Database;

export function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'better-monitor.db');
  console.log('Database path:', dbPath);
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS process_knowledge (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      friendly_name TEXT,
      category TEXT,
      description TEXT,
      risk_level TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      pid INTEGER NOT NULL,
      cpu_percent REAL,
      mem_mb REAL
    );
    
    CREATE INDEX IF NOT EXISTS idx_snapshots_pid ON snapshots(pid);
    CREATE INDEX IF NOT EXISTS idx_snapshots_time ON snapshots(timestamp);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- AI Settings (separate from general settings for clarity)
    CREATE TABLE IF NOT EXISTS ai_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Cached embeddings to avoid re-computing
    CREATE TABLE IF NOT EXISTS process_embeddings (
      text_hash TEXT PRIMARY KEY,
      embedding TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Chat history for conversation persistence
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Process clusters (cached clustering results)
    CREATE TABLE IF NOT EXISTS process_clusters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      centroid TEXT,
      process_patterns TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string };
  return row?.value;
}

export function saveSetting(key: string, value: string) {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  stmt.run(key, value);
}

export function getProcessAnalysis(name: string, command: string): ProcessAnalysis | null {
  const id = generateProcessId(name, command);
  const row = db.prepare('SELECT * FROM process_knowledge WHERE id = ?').get(id) as any;
  
  if (!row) return null;
  
  return {
    friendlyName: row.friendly_name,
    category: row.category,
    description: row.description,
    riskLevel: row.risk_level,
  };
}

export function saveProcessAnalysis(name: string, command: string, analysis: ProcessAnalysis) {
  const id = generateProcessId(name, command);
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO process_knowledge (id, name, friendly_name, category, description, risk_level)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(id, name, analysis.friendlyName, analysis.category, analysis.description, analysis.riskLevel);
}

export function addSnapshot(timestamp: number, pid: number, cpu: number, mem: number) {
  const stmt = db.prepare('INSERT INTO snapshots (timestamp, pid, cpu_percent, mem_mb) VALUES (?, ?, ?, ?)');
  stmt.run(timestamp, pid, cpu, mem);
}

export function recordSnapshots(processes: SystemProcess[]) {
  const timestamp = Date.now();
  const insert = db.prepare('INSERT INTO snapshots (timestamp, pid, cpu_percent, mem_mb) VALUES (?, ?, ?, ?)');
  
  const recordMany = db.transaction((procs: SystemProcess[]) => {
    for (const p of procs) {
      insert.run(timestamp, p.pid, p.cpu, p.mem);
    }
  });
  
  recordMany(processes);
}

// Helper: Generate deterministic ID
function generateProcessId(name: string, command: string): string {
  return `${name}-${command}`.slice(0, 255); 
}

// Helper: Simple hash for embedding cache keys
function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// ============ Embedding Cache ============

export function getCachedEmbedding(text: string): number[] | null {
  const hash = hashText(text);
  const row = db.prepare('SELECT embedding FROM process_embeddings WHERE text_hash = ?').get(hash) as { embedding: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.embedding);
  } catch {
    return null;
  }
}

export function cacheEmbedding(text: string, embedding: number[]): void {
  const hash = hashText(text);
  const stmt = db.prepare('INSERT OR REPLACE INTO process_embeddings (text_hash, embedding) VALUES (?, ?)');
  stmt.run(hash, JSON.stringify(embedding));
}

export function getCachedEmbeddings(texts: string[]): Map<string, number[] | null> {
  const result = new Map<string, number[] | null>();
  for (const text of texts) {
    result.set(text, getCachedEmbedding(text));
  }
  return result;
}

// ============ Chat History ============

export interface ChatHistoryMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export function getChatHistory(limit: number = 50): ChatHistoryMessage[] {
  const rows = db.prepare('SELECT * FROM chat_history ORDER BY id DESC LIMIT ?').all(limit) as ChatHistoryMessage[];
  return rows.reverse();
}

export function addChatMessage(role: 'user' | 'assistant' | 'system', content: string): number {
  const stmt = db.prepare('INSERT INTO chat_history (role, content) VALUES (?, ?)');
  const result = stmt.run(role, content);
  return result.lastInsertRowid as number;
}

export function clearChatHistory(): void {
  db.prepare('DELETE FROM chat_history').run();
}

// ============ AI Settings ============

export function getAISetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM ai_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function saveAISetting(key: string, value: string): void {
  const stmt = db.prepare('INSERT OR REPLACE INTO ai_settings (key, value) VALUES (?, ?)');
  stmt.run(key, value);
}

export function getAllAISettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM ai_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// ============ Process Clusters ============

export interface StoredCluster {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  centroid: string | null;
  process_patterns: string | null;
  created_at: string;
  updated_at: string;
}

export function getStoredClusters(): StoredCluster[] {
  return db.prepare('SELECT * FROM process_clusters ORDER BY name').all() as StoredCluster[];
}

export function saveCluster(cluster: { id: string; name: string; description?: string; category?: string; centroid?: number[]; processPatterns?: string[] }): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO process_clusters (id, name, description, category, centroid, process_patterns, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  stmt.run(
    cluster.id,
    cluster.name,
    cluster.description || null,
    cluster.category || null,
    cluster.centroid ? JSON.stringify(cluster.centroid) : null,
    cluster.processPatterns ? JSON.stringify(cluster.processPatterns) : null
  );
}

export function deleteCluster(id: string): void {
  db.prepare('DELETE FROM process_clusters WHERE id = ?').run(id);
}

export function clearClusters(): void {
  db.prepare('DELETE FROM process_clusters').run();
}
