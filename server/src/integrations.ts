import type { GravityClawConfig } from './config.js';
import type { McpServerHealth } from './mcp-health.js';

export type IntegrationStatus = 'online' | 'offline' | 'degraded' | 'disabled' | 'configured';

export interface IntegrationChannel {
  id: string;
  name: string;
  status: IntegrationStatus;
  details: string;
  lastChecked: number;
}

export interface IntegrationSnapshot {
  channels: IntegrationChannel[];
  mcpServers: McpServerHealth[];
  summary: {
    total: number;
    online: number;
    offline: number;
    degraded: number;
    configured: number;
    disabled: number;
  };
}

export interface TelegramBridgeState {
  status: IntegrationStatus;
  details: string;
  lastChecked: number;
}

const DEFAULT_TELEGRAM_STATUS: TelegramBridgeState = {
  status: 'disabled',
  details: 'Telegram bridge has not been initialized yet.',
  lastChecked: Date.now(),
};

let telegramBridgeStatus = { ...DEFAULT_TELEGRAM_STATUS };

function aggregateMcpStatus(mcpServers: McpServerHealth[]): IntegrationStatus {
  if (mcpServers.length === 0) {
    return 'offline';
  }

  const onlineServers = mcpServers.filter((server) => server.status === 'online').length;
  const degradedServers = mcpServers.filter((server) => server.status === 'degraded').length;

  if (onlineServers === 0 && degradedServers === 0) {
    return 'offline';
  }

  if (onlineServers !== mcpServers.length || degradedServers > 0) {
    return 'degraded';
  }

  return 'online';
}

function describeMcpGateway(mcpServers: McpServerHealth[]): string {
  if (mcpServers.length === 0) {
    return 'No MCP servers responded yet.';
  }

  const respondingServers = mcpServers.filter((server) => server.status !== 'offline').length;
  const offlineServers = mcpServers.length - respondingServers;

  if (offlineServers === 0) {
    return `${respondingServers} server(s) healthy through the gateway.`;
  }

  return `${respondingServers}/${mcpServers.length} server(s) responding through the gateway; ${offlineServers} offline.`;
}

function createPlatformChannel(
  id: keyof GravityClawConfig['platforms'],
  enabled: boolean,
  telegramState?: TelegramBridgeState
): IntegrationChannel {
  const label = id.charAt(0).toUpperCase() + id.slice(1);

  if (!enabled) {
    return {
      id,
      name: label,
      status: 'disabled',
      details: 'Disabled in config.',
      lastChecked: Date.now(),
    };
  }

  if (id === 'telegram' && telegramState) {
    return {
      id,
      name: label,
      status: telegramState.status,
      details: telegramState.details,
      lastChecked: telegramState.lastChecked,
    };
  }

  return {
    id,
    name: label,
    status: 'configured',
    details: 'Enabled in config; backend connector can use it when wired up.',
    lastChecked: Date.now(),
  };
}

function createConfiguredChannel(
  id: string,
  name: string,
  status: IntegrationStatus,
  details: string
): IntegrationChannel {
  return {
    id,
    name,
    status,
    details,
    lastChecked: Date.now(),
  };
}

export function setTelegramBridgeStatus(nextStatus: Partial<TelegramBridgeState>) {
  telegramBridgeStatus = {
    ...telegramBridgeStatus,
    ...nextStatus,
    lastChecked: nextStatus.lastChecked ?? Date.now(),
  };

  return { ...telegramBridgeStatus };
}

export function getTelegramBridgeStatus(): TelegramBridgeState {
  return { ...telegramBridgeStatus };
}

export function buildIntegrationSnapshot(
  config: GravityClawConfig,
  mcpServers: McpServerHealth[],
  telegramState = getTelegramBridgeStatus()
): IntegrationSnapshot {
  const channels: IntegrationChannel[] = [
    createConfiguredChannel(
      'mcp-gateway',
      'MCP Gateway',
      aggregateMcpStatus(mcpServers),
      describeMcpGateway(mcpServers)
    ),
    createPlatformChannel('telegram', config.platforms.telegram, telegramState),
    createPlatformChannel('discord', config.platforms.discord),
    createPlatformChannel('whatsapp', config.platforms.whatsapp),
    createPlatformChannel('slack', config.platforms.slack),
    createPlatformChannel('email', config.platforms.email),
    createPlatformChannel('signal', config.platforms.signal),
  ];

  const summary = channels.reduce(
    (accumulator, channel) => {
      accumulator.total += 1;
      accumulator[channel.status] += 1;
      return accumulator;
    },
    {
      total: 0,
      online: 0,
      offline: 0,
      degraded: 0,
      configured: 0,
      disabled: 0,
    } satisfies IntegrationSnapshot['summary']
  );

  return {
    channels,
    mcpServers,
    summary,
  };
}
