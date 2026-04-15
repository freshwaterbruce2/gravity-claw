# gravity-claw — AI Context

## What this is
AI agent orchestrator desktop app — Electron wrapper around a Vite + React UI + Hono API server, featuring the "gravity mechanic" for multi-platform messaging (Telegram, Discord, email) powered by kimi-k2.5.

## Stack
- **Runtime**: Node.js 22 + Electron 40
- **Framework**: Vite + React 19 (UI) + Hono (API) + Electron (desktop shell)
- **Key deps**: telegraf, inngest, zustand, @vibetech/inngest-client, @vibetech/mcp-gateway

## Dev
```bash
pnpm --filter gravity-claw dev          # Vite UI dev server (port 5177)
pnpm --filter gravity-claw server:dev   # Hono API server (tsx watch)
pnpm --filter gravity-claw start        # Both UI + API concurrently
pnpm --filter gravity-claw desktop:dev  # Full Electron desktop mode
pnpm --filter gravity-claw build        # Vite production build
```

## Notes
- **This is a git submodule** — `apps/gravity-claw/.git` is its own repo
- Config in `.gravity-claw.config.json` (model, platforms, skill engine settings)
- Connects to `apps/mcp-gateway` for MCP tool dispatch
- Uses Inngest for background job scheduling; run `inngest:dev` alongside
- Electron build target: Windows NSIS installer
