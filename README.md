# Better Monitor

An AI-powered activity monitor for macOS that transforms cryptic system processes into understandable insights.

![Better Monitor Screenshot](assets/screenshot.png)

## Features

### Core Monitoring
- **Real-time Process Monitoring** — Track CPU, memory, and network usage with adjustable sampling rates (1-20 Hz)
- **Per-Process Network I/O** — See actual bytes sent/received per process using macOS's `nettop`
- **Network Connections** — View active TCP/UDP connections per process via `lsof`
- **Process Fingerprints** — Visual radar chart showing process characteristics with smooth Catmull-Rom splines
- **Historical Tracking** — Process snapshots stored locally in SQLite

### AI-Powered Intelligence
- **Semantic Process Clustering** — AI groups related processes into meaningful clusters using embeddings
- **Circle Pack Visualization** — Interactive D3 zoomable circle packing showing process hierarchy
- **Tree View** — Collapsible tree view of process clusters
- **AI Chat Assistant** — Ask questions about your system with streaming responses and rich markdown formatting
- **Smart Context** — Chat includes real-time system data for accurate answers

### Beautiful UI
- **3-Column Layout** — Process list + radar, AI hub (clusters + chat), and detail view
- **Native macOS Vibrancy** — Glass-like effects with the native look
- **Smart Formatting** — Adaptive units (K/M/G) for all metrics
- **Consistent Colors** — Process colors derived from name hash for easy tracking
- **Dark Theme** — Easy on the eyes

## Tech Stack

- **Electron** — Desktop app framework with native macOS integration
- **Next.js 15** — React framework for the renderer process
- **TypeScript** — Full type safety across the codebase
- **Tailwind CSS** — Utility-first styling
- **SQLite** — Local database via `better-sqlite3`
- **OpenRouter** — AI provider supporting multiple models (Gemini, Llama, Mistral, GPT-4, Claude)
- **LangChain** — AI orchestration and embeddings
- **D3.js** — Circle packing and tree visualizations
- **Recharts** — Real-time charts and visualizations
- **Zustand** — Lightweight state management
- **react-markdown** — Rich markdown rendering for AI responses

## Requirements

- **macOS** 14+ (Sonoma or later recommended)
- **Node.js** 18+ 
- **npm** 9+
- **Make** (comes with Xcode Command Line Tools)
- **OpenRouter API Key** (free tier available at [openrouter.ai](https://openrouter.ai))

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

## Setting Up AI Features

1. Get an API key from [OpenRouter](https://openrouter.ai/keys)
2. Launch the app — an overlay will prompt you to enter your API key
3. Paste your API key and click "Test Connection"
4. Select your preferred models for chat and embeddings

### Supported Models

| Model | Cost | Best For |
|-------|------|----------|
| Mistral Small 3.1 24B | Free | General use, supports system prompts |
| Gemini 2.0 Flash | Free | Fast responses |
| Llama 3.2 3B | Free | Quick answers |
| GPT-4o Mini | ~$0.15/1M tokens | Higher quality |
| Claude 3.5 Sonnet | ~$3/1M tokens | Complex analysis |

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

## Project Structure

```
BetterMonitor/
├── electron/               # Electron main process
│   ├── main.ts             # App entry, window creation, IPC handlers
│   ├── monitor.ts          # System process monitoring
│   ├── detailed-stats.ts   # Network connections (lsof, nettop)
│   ├── database.ts         # SQLite operations
│   ├── openrouter.ts       # OpenRouter API client
│   ├── clustering.ts       # Semantic process clustering
│   ├── vector-store.ts     # In-memory embedding store
│   └── chat-agent.ts       # AI chat with system context
├── renderer/               # Next.js renderer process
│   ├── app/                # Next.js app router
│   ├── components/         # React components
│   │   ├── Dashboard.tsx   # Main 3-column layout
│   │   ├── MindMap.tsx     # D3 cluster visualization
│   │   ├── ChatPanel.tsx   # AI chat interface
│   │   ├── SettingsModal.tsx # AI configuration
│   │   ├── ProcessRadar.tsx  # Process fingerprint chart
│   │   └── ArcSlider.tsx   # Sampling rate control
│   └── lib/
│       ├── store.ts        # Zustand state management
│       ├── process-utils.ts # Shared utilities
│       └── cluster-pack.ts # D3 visualization class
├── shared/                 # Shared TypeScript types
│   └── types.ts
├── assets/                 # App icons and resources
├── Makefile                # Build commands
└── package.json
```

## Using the AI Chat

The AI assistant has access to your system's real-time data:

- **Process information** — CPU, memory, network usage
- **Cluster data** — Semantic groupings of processes
- **System stats** — Overall resource utilization

### Example Questions

- "What's using the most CPU right now?"
- "Why is Chrome using so much memory?"
- "What background processes are running?"
- "Explain what kernel_task does"
- "Which processes are making network connections?"

### Rich Responses

AI responses support full markdown:
- **Bold** and *italic* text
- `Code snippets` and code blocks
- Bullet points and numbered lists
- Tables for data comparison
- Headers for organization

## Troubleshooting

### Native Module Errors

```bash
make rebuild-native
# or
npx electron-builder install-app-deps
```

### Build Failures

```bash
make rebuild
```

### AI Not Working

1. Check your API key in Settings (⚙️ button)
2. Click "Test Connection" to verify
3. Ensure you have an OpenRouter account (even free models need one)
4. Try a different model if one isn't responding

### Clustering Takes Too Long

- First clustering embeds all unique process names
- Subsequent updates are faster due to caching
- Rate limits may slow things down with free models

## Contributing

Contributions welcome! Please open an issue first to discuss what you'd like to change.

## License

ISC
