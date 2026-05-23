# Gravity Claw — Memory & Build Notes

> Persistent context for the Tauri desktop migration and build process.

---

## Architecture Overview

Gravity Claw is a Tauri 2 desktop app (React frontend + Rust main process) that replaces the previous Electron architecture. The Rust main process spawns a Node.js Hono backend server at runtime.

```
Tauri Window (WebView) ←→ Rust IPC ←→ Node.js Hono Server (localhost:5187)
                                    ↓
                         MCP Gateway, Gemini, SQLite, etc.
```

---

## Build Pipeline

### Prerequisites
- **Rust** stable toolchain (`stable-x86_64-pc-windows-msvc`)
- **Node.js** >=22 (found via `where node.exe`, `npm_node_execpath`, or `GRAVITY_CLAW_NODE_PATH`)
- **MSVC Build Tools** with Windows SDK (required for `tauri-winres` / `vswhom-sys`)
- **pnpm** for package management

> **Critical:** The release build requires the MSVC developer environment. If `excpt.h` is missing, run the build from a VS Developer Command Prompt or initialize `vcvarsall.bat x64` first.

### Build Commands

```powershell
# Full desktop build (frontend + server bundle + Tauri release + installers)
pnpm run build:desktop

# Individual steps
pnpm run build          # Vite frontend build → dist/
pnpm run build:server   # Rollup server bundle → server/dist/bundle.mjs
pnpm exec tauri build   # Rust release binary + MSI + NSIS installers
```

### Build Outputs

| Artifact | Path | Size (typical) |
|----------|------|----------------|
| Release binary | `..\..\target\gravity-claw\release\gravity-claw.exe` | ~3.5 MB |
| MSI installer | `..\..\target\gravity-claw\release\bundle\msi\Gravity Claw_0.2.0_x64_en-US.msi` | ~2.4 MB |
| NSIS installer | `..\..\target\gravity-claw\release\bundle\nsis\Gravity Claw_0.2.0_x64-setup.exe` | ~1.5 MB |

---

## Runtime Behavior

### Backend Spawn Logic (`src-tauri/src/lib.rs`)

1. On app startup, `ensure_backend_server()` spawns the Node.js backend asynchronously.
2. The backend entry point is selected by build type:
   - **Debug builds** (`cargo run`, `cfg!(debug_assertions)`): `server/src/index.ts` via `tsx`
   - **Release builds** (`tauri build`): `server/dist/bundle.mjs` via `node`
3. The server writes its active port to `.server-port` in the app root after boot.
4. Rust polls for the port file and probes `/api/health` before declaring the backend ready.
5. On app exit (`RunEvent::Exit`), the Rust process kills the backend child process.

### Important Timing

- **Backend boot time:** ~20-35 seconds in release mode (MCP gateway initialization + tool refresh)
- **Rust timeout:** `BACKEND_START_TIMEOUT_MS = 30_000` (was 15s — too short)
- **Poll interval:** 300ms

> **If the backend times out:** Check `.server-port` exists and port 5187 is listening. The server may just need more time on slower machines.

### Process Discovery

- The `.server-port` file is written by `server/src/index.ts` (line ~374) using:
  ```ts
  const PORT_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.server-port');
  ```
- For the bundled server, this resolves to the app root (`apps/gravity-claw/.server-port`).

---

## Known Issues & Fixes

### Issue: Release binary tried to use `tsx` on TypeScript source
- **Root cause:** Entry point selection only checked `server_src.exists()`, not build type.
- **Fix:** Use `cfg!(debug_assertions) && server_src.exists()` to prefer bundled server in release.
- **Commit:** `2017fa1`

### Issue: Backend spawn path wrong when running from `src-tauri`
- **Root cause:** `cargo run` changes cwd to `src-tauri`, breaking relative path resolution.
- **Fix:** `resolve_app_root()` detects `src-tauri` cwd and walks up one level.
- **Commit:** `646ac77`

### Issue: Backend timeout too short for release bundle
- **Root cause:** Server bundle takes ~20-35s to boot (MCP tool refresh), but timeout was 15s.
- **Fix:** Bumped `BACKEND_START_TIMEOUT_MS` from `15_000` to `30_000`.
- **Commit:** `bec1045`

### Issue: MSVC `excpt.h` missing during `tauri build`
- **Root cause:** PowerShell session lacks VS developer environment variables.
- **Fix:** Run build after initializing `vcvarsall.bat x64` (BuildTools or Community).

---

## Configuration

### Tauri Config (`src-tauri/tauri.conf.json`)
- **Product name:** Gravity Claw
- **Version:** 0.2.0
- **Identifier:** `com.vibetech.gravity-claw`
- **Window:** 1440x960, min 1100x720, centered, dark background `#0b0d10`
- **CSP:** Configured for OpenRouter, Anthropic, OpenAI, DeepSeek, Groq, Gemini, GitHub, Google Fonts

### Rust Release Profile (`src-tauri/Cargo.toml`)
```toml
[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
strip = true
panic = "abort"
```

### Bundle Targets
- **MSI** (Windows Installer)
- **NSIS** (Current-user install mode)

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GRAVITY_CLAW_NODE_PATH` | Override Node.js executable path |
| `GRAVITY_CLAW_PORT` | Set backend port (default: 5187) |
| `GRAVITY_CLAW_CONFIG_PATH` | Path to `.gravity-claw.config.json` |

---

## Git Workflow

- **Branch:** `feature/tauri-migration`
- **Nested repo:** Gravity Claw is a nested git repo inside the VibeTech monorepo.
- **Commits:** Made directly in `C:\dev\apps\gravity-claw` (nested repo root).
- **Push:** `git push origin feature/tauri-migration`

---

## Debugging Tips

### Check if backend spawned
```powershell
# After starting the app, wait 30-40s then:
Test-Path C:\dev\apps\gravity-claw\.server-port
Get-Content C:\dev\apps\gravity-claw\.server-port  # should be 5187
(Get-NetTCPConnection -LocalPort 5187 -ErrorAction SilentlyContinue).OwningProcess
```

### Run server bundle manually
```powershell
cd C:\dev\apps\gravity-claw
node server/dist/bundle.mjs
# Wait for `.server-port` to appear (~20-35s)
```

### Capture release binary stderr
GUI apps on Windows don't have a console. To see spawn errors, temporarily add `std::fs::write` logging in `lib.rs`, or run from a debug build (`cargo run`).

---

## Changelog (Tauri Migration)

| Commit | Description |
|--------|-------------|
| `b22c301` | Scaffold Tauri 2 migration |
| `17eb047` | Migration updates; ignore `src-tauri/gen` |
| `011bf26` | Remove Electron artifacts, complete Tauri migration |
| `39801d4` | Add Tauri build instructions and MSVC requirements |
| `646ac77` | Fix backend spawn path when running from `src-tauri` |
| `2017fa1` | Prefer bundled server in release builds |
| `bec1045` | Extend backend spawn timeout to 30s |

---

*Last updated: 2026-05-09*
