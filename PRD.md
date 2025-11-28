# Product Requirement Document (PRD): Better Monitor

## 1. Executive Summary
**Better Monitor** is a reimagined system activity monitor for macOS (v1). Unlike traditional tools that display raw, cryptic data (e.g., `mds_stores`, `WindowServer`), Better Monitor uses local system hooks combined with Generative AI (OpenAI) to provide a "humanized," semantic, and historically aware view of system performance. 

It allows users to:
- Instantly understand *what* is running and *why*.
- Identify "Zombie" processes (abandoned dev servers, idle scripts).
- Visualize system health through a beautiful, modern UI.
- Interactively query their system state using natural language.

## 2. Core Philosophy
- **Information over Data:** Don't show `PID 1234`; show "Vite Dev Server (Started 4h ago)".
- **Beauty as Function:** The UI should be calm, structured, and "gorgeous" (Glassmorphism, fluid animations), avoiding the spreadsheet look.
- **Privacy-First Architecture:** System metrics stay local. Only *process names* and *metadata* are sent to AI for classification.

## 3. Technical Stack

### 3.1 Application Shell (Electron)
- **Framework:** Electron (Latest Stable).
- **Language:** TypeScript (Strict Mode).
- **Build Tool:** `electron-builder` for packaging.
- **Inter-Process Communication (IPC):** Strongly typed IPC handlers using `electron-trpc` or standard `ipcMain/ipcRenderer` patterns.

### 3.2 Frontend (Renderer)
- **Framework:** Next.js 14+ (App Router).
- **Configuration:** `output: 'export'` (Static Export mode) for compatibility with Electron file serving.
- **UI Library:** Tailwind CSS + Shadcn UI + Radix Primitives.
- **Animation:** Framer Motion.
- **State Management:** Zustand (Global Store) + TanStack Query (Async State).

### 3.3 Backend & Data (Main Process)
- **System Hooks:** `systeminformation` (npm) for cross-platform metrics.
- **Local Database:** `better-sqlite3` (SQLite).
  - *Reason:* High-performance synchronous writes for time-series data (process snapshots).
- **AI Orchestration:** `langchain` (Node.js) + `openai` SDK.
- **Validation:** `zod` for all data schemas (AI output, DB rows, IPC payloads).

## 4. Data Architecture & Models

### 4.1 The Database Schema (SQLite)

We will use a local SQLite database (`better-monitor.db`) in the user's AppData folder.

#### Table: `process_knowledge`
Stores the AI's understanding of specific processes.
| Column | Type | Description |
|:---|:---|:---|
| `id` | TEXT (PK) | Composite Key: `name` + `signature` (e.g., "node-vite") |
| `name` | TEXT | Raw process name (e.g., "node") |
| `friendly_name` | TEXT | AI-generated name (e.g., "Vite Development Server") |
| `description` | TEXT | Short explanation |
| `category` | TEXT | ENUM: 'System', 'Dev', 'Browser', 'Media', 'Suspicious' |
| `risk_level` | TEXT | ENUM: 'Safe', 'Caution', 'Critical' |
| `created_at` | DATETIME | When we first analyzed this. |

#### Table: `snapshots`
Time-series data for historical graphing.
| Column | Type | Description |
|:---|:---|:---|
| `timestamp` | INTEGER | Unix Timestamp |
| `pid` | INTEGER | Process ID |
| `cpu_percent` | REAL | CPU Usage |
| `mem_mb` | REAL | RAM Usage in MB |

### 4.2 API Contracts (IPC)

The Main Process (Backend) exposes these methods to the Renderer (Frontend):

**1. `monitor:getSnapshot()`**
- **Returns:** `SystemSnapshot` (Array of current running processes with CPU/RAM).
- **Frequency:** Polled every 2s by Frontend.

**2. `ai:analyzeProcess(payload: { name: string, command: string })`**
- **Input:** Raw process data.
- **Behavior:** 
  1. Checks `process_knowledge` DB table.
  2. If exists, returns cached data.
  3. If missing, calls OpenAI -> saves to DB -> returns data.
- **Returns:** `ProcessAnalysis` (Friendly name, category, etc.).

**3. `system:killProcess(pid: number)`**
- **Returns:** `boolean` (Success/Fail).

**4. `history:getStats(pid: number, timeRange: string)`**
- **Returns:** Array of `{ timestamp, cpu, mem }`.

## 5. Agentic Workflow (The "Brain")

### 5.1 The Analysis Loop
1. **Ingest:** App receives raw process list from `ps aux`.
2. **Fingerprint:** We generate a unique signature for each process.
   - Example: `node /Users/me/project/server.js` -> Signature: `node-server.js`
3. **Resolve:** Frontend asks "Do we know what this is?"
4. **Agent Action:** 
   - If Unknown: Agent constructs a prompt: *"I see a process named 'python3.9' running 'manage.py runserver'. Explain it."*
   - Agent receives Structured Output (JSON).
   - Agent caches result.

### 5.2 The "Zombie" Heuristic
The Agent monitors for:
- **Criteria:** Category == 'Development' AND CPU < 0.1% AND Uptime > 2 hours.
- **Action:** Flags process as "Zombie Candidate" in UI.

## 6. Development Phases

### Phase 1: The Foundation
- Set up Electron + Next.js (Manual Config).
- Configure `systeminformation` to stream raw data to UI.
- Build the "Grid View" (Basic visualization).

### Phase 2: The Brain
- Integrate SQLite (`better-sqlite3`).
- Implement the `ai:analyzeProcess` IPC handler.
- Create the "Process Detail" modal with AI explanations.

### Phase 3: The Polish
- Add historical graphs (Sparklines).
- Implement "Zombie Hunter" logic.
- Refine animations and Glassmorphism UI.

## 7. Testing Strategy
- **Unit Tests:** `vitest` for the AI parsing logic and Data filtering helpers.
- **Integration Tests:** Check that SQLite writes/reads correctly.
- **E2E Tests:** `playwright` (configured for Electron) to ensure the App launches and renders the grid.




