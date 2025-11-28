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
