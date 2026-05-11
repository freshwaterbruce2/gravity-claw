# Gravity Claw

Gravity Claw is an AI agent orchestrator with a React frontend and Hono backend. It routes conversations through Gemini models, dispatches tool calls to MCP servers, manages tasks, and bridges to messaging platforms (Telegram, Discord, WhatsApp, Email). An optional Tauri 2 shell wraps the web UI for desktop use.

## Architecture

```
React UI (Vite)  -->  Hono API server  -->  Gemini LLM
     :5177              :5187                  |
                          |               MCP Gateway
                          |               (tool execution)
                          |
                    Inngest (background jobs)
                    Telegram / Discord / WhatsApp bridges
```

- **Frontend** -- React 19 + Zustand, served by Vite dev server.
- **Backend** -- Hono on Node, handles chat, streaming, task CRUD, MCP tool dispatch, and platform bridges.
- **MCP Gateway** -- Discovers and invokes tools from configured MCP servers; health-polled automatically.
- **Inngest** -- Durable background functions (heartbeat, tool refresh).

## Prerequisites

- Node.js 22+
- pnpm (workspace-aware -- always use `--filter gravity-claw`)
- Gemini API key (required)
- Optional: Telegram bot token, Kimi API key

## Quick Start

```bash
# Install dependencies (from repo root)
pnpm install --filter gravity-claw

# Start UI + API together (dev mode)
pnpm --filter gravity-claw start

# Start everything (UI + API + MCP gateway + Inngest)
pnpm --filter gravity-claw start:full

# Or run individually
pnpm --filter gravity-claw dev           # Vite UI only
pnpm --filter gravity-claw server:dev    # API only (watch mode)

# Build
pnpm --filter gravity-claw build

# Test
pnpm --filter gravity-claw test

# Typecheck
pnpm --filter gravity-claw typecheck
pnpm --filter gravity-claw typecheck:server

# Desktop (Tauri)
pnpm --filter gravity-claw tauri:dev
```

## API Endpoints

All endpoints are served from the backend on port **5187**.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health and uptime |
| GET | `/api/config` | Read runtime configuration |
| PUT | `/api/config` | Update runtime configuration |
| POST | `/api/chat` | Send a message; returns Gemini response with tool-call results |
| GET | `/api/stream` | SSE stream for real-time events |
| GET | `/api/tasks` | List all tasks |
| POST | `/api/tasks` | Create a task |
| PUT | `/api/tasks` | Bulk replace / update tasks |
| GET | `/api/skills` | List available agent skills |
| GET | `/api/models` | List available Gemini models |
| GET | `/api/dashboard` | Dashboard summary (tasks + metrics) |
| GET | `/api/integrations` | Platform bridge status |
| POST | `/api/refresh-tools` | Re-scan MCP servers for tools |
| GET | `/api/mcp/status` | MCP server health snapshot |

## Configuration

Runtime config lives in `.gravity-claw.config.json` at the project root. Key flags:

| Flag | Default | Purpose |
|------|---------|---------|
| `model` | `gemini-2.5-flash` | Primary LLM model (falls back through a chain) |
| `gravityMechanicEnabled` | `true` | Enable gravity-based priority ranking |
| `memoryEnabled` | `true` | Conversation memory |
| `selfImprovementEnabled` | `true` | Agent self-improvement loop |
| `directShellEnabled` | `true` | Allow shell command execution via tools |
| `gitPipelineEnabled` | `true` | Git operations through tool calls |
| `platforms.telegram` | `true` | Telegram bridge |
| `platforms.discord` | `true` | Discord bridge |
| `skillEngine.maxConcurrentSkills` | `3` | Parallel skill execution cap |

The config can also be read/written at runtime via `GET/PUT /api/config`.

## Environment Variables

Create a `.env` file in `apps/gravity-claw/`:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `KIMI_API_KEY` | No | Kimi (Moonshot) API key for alternate model |
| `TELEGRAM_BOT_TOKEN` | No | Telegraf bot token for Telegram bridge |
| `MCP_GATEWAY_URL` | No | MCP gateway base URL (default: `http://localhost:3100`) |

## Ports

| Service | Port |
|---------|------|
| Vite dev server | 5177 |
| Hono API server | 5187 |


## Desktop Build (Tauri)

Gravity Claw includes a Tauri 2 desktop shell. Building the Rust backend requires a working MSVC toolchain on Windows.

### Prerequisites

- Rust stable (`rustc >= 1.70`)
- **VS 2022 BuildTools** with the C++ workload — the VS "18" Community install at `C:\Program Files\Microsoft Visual Studio\18` is **incomplete** and will fail with missing `excpt.h` / `msvcrt.lib`.

### Required MSVC Environment

Set these environment variables before running `cargo check` or `pnpm tauri build`:

```powershell
$msvc = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207"
$sdk  = "C:\Program Files (x86)\Windows Kits\10"

$env:LIB     = "$msvc\lib\x64;$sdk\Lib\10.0.26100.0\ucrt\x64;$sdk\Lib\10.0.26100.0\um\x64"
$env:INCLUDE = "$msvc\include;$sdk\Include\10.0.26100.0\ucrt;$sdk\Include\10.0.26100.0\um;$sdk\Include\10.0.26100.0\shared"
$env:PATH    = "$msvc\bin\HostX64\x64;" + $env:PATH
```

### Commands

```bash
# Type-check the Rust backend
cd src-tauri
cargo check

# Build the desktop app
pnpm tauri build
```

The Electron wrapper and `electron-builder.config.cjs` were removed in the Tauri 2 migration.
