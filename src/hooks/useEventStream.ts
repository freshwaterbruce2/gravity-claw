import { useEffect, useRef, useState } from 'react';
import {
  fetchDashboardSnapshot,
  normalizeIntegrationList,
  normalizeMcpStatusList,
  normalizeSkillList,
  normalizeTaskList,
} from '../lib/liveApi';
import { buildSseUrl } from '../lib/runtime';
import type { GravityClawRuntimeConfig } from '../lib/runtimeConfig';
import { useAgentStore } from '../stores/agentStore';
import type { ActivityItem } from '../stores/agentStore';
import { useIntegrationStore } from '../stores/integrationStore';
import { useMcpStore } from '../stores/mcpStore';
import type { McpServerStatus } from '../stores/mcpStore';
import { useMetricsStore } from '../stores/metricsStore';
import type { SystemMetrics } from '../stores/metricsStore';
import { useLogStore } from '../stores/logStore';
import { useSkillsStore } from '../stores/skillsStore';
import { useTaskStore } from '../stores/taskStore';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

function safeJsonParse(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

export function useEventStream() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const retryRef = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    async function bootstrapDashboard() {
      const dashboard = await fetchDashboardSnapshot();
      if (!dashboard || typeof dashboard !== 'object') {
        await Promise.allSettled([
          useTaskStore.getState().loadTasks(),
          useSkillsStore.getState().loadSkills(),
          useIntegrationStore.getState().loadIntegrations(),
        ]);
        return;
      }

      const typedDashboard = dashboard as Record<string, unknown>;

      const metrics = typedDashboard.systemMetrics;
      if (metrics && typeof metrics === 'object') {
        useMetricsStore.getState().updateMetrics(metrics as SystemMetrics);
      }

      const mcpStatus = normalizeMcpStatusList({
        mcpStatus: (typedDashboard.mcpStatus as unknown[]) ?? [],
      });
      if (mcpStatus.length > 0) {
        useMcpStore.getState().updateServers(mcpStatus);
      }

      const config = typedDashboard.config;
      if (config && typeof config === 'object') {
        useAgentStore.getState().applyRuntimeConfig(config as GravityClawRuntimeConfig);
      }

      const taskItems = normalizeTaskList((typedDashboard.tasks as { items?: unknown[] }) ?? {});
      await useTaskStore.getState().replaceTasks(taskItems, { sync: false });

      const taskSummary = (typedDashboard.tasks as { summary?: { total?: number } } | undefined)?.summary;
      useAgentStore.getState().setCounts({
        taskCount: taskSummary?.total ?? taskItems.length,
      });

      const skills = normalizeSkillList(typedDashboard.skills ?? {});
      useSkillsStore.getState().replaceSkills(skills);
      useAgentStore.getState().setCounts({ skillCount: skills.length });

      const integrations = normalizeIntegrationList(
        typedDashboard.integrations ?? {}
      );
      useIntegrationStore.getState().replaceIntegrations(integrations);

      const recentActivity = typedDashboard.recentActivity as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(recentActivity)) {
        useAgentStore.getState().replaceActivities(recentActivity);
      }

      const recentLogs = typedDashboard.recentLogs as Array<{ level: string; message: string; source?: string; ts?: number }> | undefined;
      if (Array.isArray(recentLogs)) {
        useLogStore.getState().replaceLogs(recentLogs);
      }
    }

    function connect() {
      setStatus(retryRef.current > 0 ? 'reconnecting' : 'connecting');
      es = new EventSource(buildSseUrl('/api/stream'));

      es.onopen = () => {
        setStatus('connected');
        retryRef.current = 0;
        void bootstrapDashboard();
      };

      // Route events to stores
      es.addEventListener('snapshot', (e) => {
        const data = safeJsonParse(e.data) as Record<string, unknown> | undefined;
        if (!data) return;
        const systemMetrics = data['system.metrics'];
        if (systemMetrics && typeof systemMetrics === 'object') {
          useMetricsStore.getState().updateMetrics(systemMetrics as SystemMetrics);
        }
        const mcpStatus = normalizeMcpStatusList({ servers: data['mcp.status'] });
        if (mcpStatus.length > 0) {
          useMcpStore.getState().updateServers(mcpStatus);
        }
        const configUpdate = data['config.update'];
        if (configUpdate && typeof configUpdate === 'object') {
          useAgentStore.getState().applyRuntimeConfig(configUpdate as GravityClawRuntimeConfig);
        }
        const taskUpdate = data['task.update'] as { tasks?: unknown[]; summary?: { total?: number } } | undefined;
        if (taskUpdate?.tasks) {
          void useTaskStore.getState().replaceTasks(normalizeTaskList({ tasks: taskUpdate.tasks }), {
            sync: false,
          });
          useAgentStore.getState().setCounts({
            taskCount: taskUpdate.summary?.total ?? taskUpdate.tasks.length,
          });
        }
        const integrations = normalizeIntegrationList(data['integration.status']);
        if (integrations.length > 0) {
          useIntegrationStore.getState().replaceIntegrations(integrations);
        }
      });

      es.addEventListener('system.metrics', (e) => {
        const data = safeJsonParse(e.data);
        if (data && typeof data === 'object') {
          useMetricsStore.getState().updateMetrics(data as SystemMetrics);
        }
      });

      es.addEventListener('mcp.status', (e) => {
        const data = safeJsonParse(e.data);
        if (data && typeof data === 'object') {
          useMcpStore.getState().updateServers(data as McpServerStatus[]);
        }
      });

      es.addEventListener('agent.activity', (e) => {
        const data = safeJsonParse(e.data);
        if (data && typeof data === 'object') {
          useAgentStore.getState().addActivity(data as Omit<ActivityItem, 'id' | 'timestamp'>);
        }
      });

      es.addEventListener('log.entry', (e) => {
        const data = safeJsonParse(e.data);
        if (data && typeof data === 'object') {
          useLogStore.getState().addLog(data as { level: string; message: string; source?: string; ts?: number });
        }
      });

      es.addEventListener('task.update', (e) => {
        const data = safeJsonParse(e.data) as { tasks?: unknown[]; summary?: { total?: number } } | undefined;
        if (data?.tasks) {
          void useTaskStore.getState().replaceTasks(normalizeTaskList({ tasks: data.tasks }), {
            sync: false,
          });
          useAgentStore.getState().setCounts({
            taskCount: data.summary?.total ?? data.tasks.length,
          });
        }
      });

      es.addEventListener('integration.status', (e) => {
        const data = safeJsonParse(e.data);
        const integrations = normalizeIntegrationList(data);
        if (integrations.length > 0) {
          useIntegrationStore.getState().replaceIntegrations(integrations);
        }
      });

      es.addEventListener('config.update', (e) => {
        const data = safeJsonParse(e.data);
        if (data && typeof data === 'object') {
          useAgentStore.getState().applyRuntimeConfig(data as GravityClawRuntimeConfig);
        }
      });

      es.addEventListener('notification', (e) => {
        const data = safeJsonParse(e.data) as { message?: string } | undefined;
        useAgentStore.getState().addActivity({
          type: 'system',
          message: data?.message ?? 'Notification',
        });
      });

      es.onerror = () => {
        es?.close();
        setStatus('reconnecting');
        const delay = Math.min(1000 * 2 ** retryRef.current, 30000);
        retryRef.current++;
        retryTimeout = setTimeout(connect, delay);
      };
    }

    void Promise.allSettled([
      useTaskStore.getState().loadTasks(),
      useSkillsStore.getState().loadSkills(),
      useIntegrationStore.getState().loadIntegrations(),
    ]);
    connect();
    return () => {
      es?.close();
      clearTimeout(retryTimeout);
    };
  }, []);

  return { connectionStatus: status };
}
