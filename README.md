# Better Monitor

An AI-powered activity monitor for macOS that transforms cryptic system processes into understandable insights.

## Features

### Current Features
- **Real-time Process Monitoring** — Track CPU, memory, and network usage with adjustable sampling rates (1-20 Hz)
- **Per-Process Network I/O** — See actual bytes sent/received per process using macOS's `nettop`
- **Network Connections** — View active TCP/UDP connections per process via `lsof`
- **Beautiful UI** — Native macOS vibrancy effects with a clean, information-dense interface
- **Smart Formatting** — Adaptive units (K/M/G) for all metrics
- **Historical Tracking** — Process snapshots stored locally in SQLite

### Planned Features (AI Integration)
- **AI-Powered Analysis** — Click any process to get a plain-English explanation of what it does
- **Anomaly Detection** — AI identifies suspicious or resource-hogging processes
- **Natural Language Queries** — Ask questions about your system in plain English
- **Smart Recommendations** — Get suggestions for optimizing system performance

## Tech Stack

- **Electron** — Desktop app framework with native macOS integration
- **Next.js** — React framework for the renderer process
- **TypeScript** — Full type safety across the codebase
- **Tailwind CSS** — Utility-first styling
- **SQLite** — Local database via `better-sqlite3`
- **LangChain + OpenAI** — AI analysis with structured outputs (planned)
- **Recharts** — Real-time charts and visualizations
- **Zustand** — Lightweight state management

## Requirements

- **macOS** 14+ (Sonoma or later recommended)
- **Node.js** 18+
- **npm** 9+
- **Make** (comes with Xcode Command Line Tools)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/BetterMonitor.git
cd BetterMonitor

# Install dependencies
make install

# Start development server
make dev
```

## Available Commands

Run `make help` to see all available commands:

```
make install     Install all dependencies
make dev         Start development server (hot reload)
make build       Build for production
make start       Run production build locally
make pack        Package as macOS .app (for testing)
make dist        Create distributable DMG/ZIP
make clean       Remove build artifacts
make lint        Run ESLint
make typecheck   Run TypeScript type checking
make rebuild     Clean and rebuild everything
```

## Development

### Starting Development Server

```bash
make dev
```

This will:
1. Start the Next.js dev server on `http://localhost:3000`
2. Compile the Electron TypeScript
3. Launch the Electron app pointing to the dev server

Hot reload works for the renderer (React components). For Electron main process changes, restart the app.

### Type Checking

```bash
make typecheck
```

### Linting

```bash
make lint
```

## Building for Production

### Build and Test Locally

```bash
# Build the app
make build

# Run production build
make start
```

### Package as macOS App

```bash
# Create .app bundle (unpacked, for testing)
make pack

# Create DMG and ZIP for distribution
make dist
```

The packaged app will be in the `release/` folder.

## Project Structure

```
BetterMonitor/
├── electron/               # Electron main process
│   ├── main.ts             # App entry, window creation, IPC handlers
│   ├── monitor.ts          # System process monitoring (systeminformation)
│   ├── detailed-stats.ts   # Network connections (lsof, nettop)
│   ├── database.ts         # SQLite operations
│   └── ai.ts               # LangChain/OpenAI integration (planned)
├── renderer/               # Next.js renderer process
│   ├── app/                # Next.js app router
│   ├── components/         # React components
│   │   ├── Dashboard.tsx   # Main UI component
│   │   └── ArcSlider.tsx   # Sampling rate control
│   └── lib/                # Utilities and state
│       └── store.ts        # Zustand store
├── shared/                 # Shared TypeScript types
│   └── types.ts
├── assets/                 # App icons and resources
├── Makefile                # Build commands
└── package.json
```

## Configuration

### Sampling Rate

Use the arc slider in the top-right corner to adjust the polling frequency from 1 Hz to 20 Hz. Higher rates provide smoother charts but use more CPU.

### OpenAI API Key (Planned)

When AI features are implemented, the app will prompt you for an OpenAI API key. The key will be stored locally in SQLite and never sent anywhere except OpenAI's API.

## Troubleshooting

### Native Module Errors

If you see errors about `better-sqlite3` or native modules:

```bash
make rebuild-native
# or
npx electron-builder install-app-deps
```

### Build Failures

```bash
# Clean everything and rebuild
make rebuild
```

### Permission Issues

Some features require macOS permissions:
- **Network monitoring** uses `lsof` and `nettop` (no special permissions needed)
- **Full disk access** may be needed for some process details

## Contributing

Contributions welcome! Please open an issue first to discuss what you'd like to change.

## License

ISC
