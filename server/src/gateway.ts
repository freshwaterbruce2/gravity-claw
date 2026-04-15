import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { state } from './state.js';

const MCP_GATEWAY_PORT = 3100;
const WORKSPACE_ROOT = path.resolve(process.cwd(), '..', '..');
const MCP_GATEWAY_ROOT = path.resolve(WORKSPACE_ROOT, 'apps', 'mcp-gateway');
const WINDOWS_PYTHON_LAUNCHER = 'C:\\Windows\\py.exe';

export function waitForPort(port: number, timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tryConnect = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.end(); resolve(true); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) { resolve(false); return; }
        setTimeout(tryConnect, 300);
      });
    };
    tryConnect();
  });
}

export async function ensureMcpGateway() {
  const alreadyRunning = await waitForPort(MCP_GATEWAY_PORT, 800);
  if (alreadyRunning) return;

  if (!fs.existsSync(MCP_GATEWAY_ROOT)) {
    console.log('  ⚠️ MCP gateway root not found; continuing without tool gateway.');
    return;
  }

  const gatewayEntry = path.join(MCP_GATEWAY_ROOT, 'src', 'index.ts');
  const nodePath = process.execPath;
  const tsxCli = path.join(WORKSPACE_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const pythonLauncherPath =
    process.platform === 'win32' && fs.existsSync(WINDOWS_PYTHON_LAUNCHER)
      ? WINDOWS_PYTHON_LAUNCHER
      : undefined;

  if (!fs.existsSync(tsxCli)) {
    console.log('  ⚠️ tsx CLI not found; unable to auto-start MCP gateway.');
    return;
  }

  console.log('  🚀 Starting local MCP gateway on port 3100...');
  state.mcpGatewayProcess = spawn(nodePath, [tsxCli, gatewayEntry], {
    cwd: MCP_GATEWAY_ROOT,
    env: {
      ...process.env,
      MCP_CONFIG_PATH: path.join(WORKSPACE_ROOT, '.mcp.json'),
      MCP_GATEWAY_NODE_PATH:
        process.env.MCP_GATEWAY_NODE_PATH ?? process.env.GRAVITY_CLAW_NODE_PATH ?? nodePath,
      ...(pythonLauncherPath
        ? { MCP_GATEWAY_PYTHON_PATH: process.env.MCP_GATEWAY_PYTHON_PATH ?? pythonLauncherPath }
        : {}),
    },
    stdio: 'ignore',
    windowsHide: true,
  });

  state.mcpGatewayProcess.once('exit', () => { state.mcpGatewayProcess = null; });

  const ready = await waitForPort(MCP_GATEWAY_PORT, 15000);
  console.log(
    ready
      ? '  ✅ MCP gateway online at http://localhost:3100'
      : '  ⚠️ MCP gateway failed to start on port 3100.',
  );
}

export function loadSoul(): void {
  const soulPath = path.join(process.cwd(), 'server', 'src', 'soul.md');
  if (fs.existsSync(soulPath)) {
    state.soulContent = fs.readFileSync(soulPath, 'utf-8');
    console.log('  🧠 Loaded soul.md personality matrix.');
  } else {
    console.log('  ⚠️ soul.md not found, using default personality.');
  }
}
