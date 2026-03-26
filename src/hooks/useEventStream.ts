import { useEffect, useRef, useState } from 'react';
import {
  fetchDashboardSnapshot,
  normalizeIntegrationList,
  normalizeMcpStatusList,
  normalizeSkillList,
  normalizeTaskList,
} from '../lib/liveApi';
import { useAgentStore } from '../stores/agentStore';
import { useIntegrationStore } from '../stores/integrationStore';
import { useMcpStore } from '../stores/mcpStore';
import { useMetricsStore } from '../stores/metricsStore';
import { useLogStore } from '../stores/logStore';
import { useSkillsStore } from '../stores/skillsStore';
import { useTaskStore } from '../stores/taskStore';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

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

      const metrics = (dashboard as { systemMetrics?: unknown }).systemMetrics;
      if (metrics) {
        useMetricsStore.getState().updateMetrics(metrics as never);
      }

      const mcpStatus = normalizeMcpStatusList({
        mcpStatus: (dashboard as { mcpStatus?: unknown[] }).mcpStatus ?? [],
      });
      if (mcpStatus.length > 0) {
        useMcpStore.getState().updateServers(mcpStatus);
      }

      const config = (dashboard as { config?: unknown }).config;
      if (config) {
        useAgentStore.getState().applyRuntimeConfig(config as never);
      }

      const taskItems = normalizeTaskList((dashboard as { tasks?: { items?: unknown[] } }).tasks ?? {});
      await useTaskStore.getState().replaceTasks(taskItems, { sync: false });

      const taskSummary = (dashboard as { tasks?: { summary?: { total?: number } } }).tasks?.summary;
      useAgentStore.getState().setCounts({
        taskCount: taskSummary?.total ?? taskItems.length,
      });

      const skills = normalizeSkillList((dashboard as { skills?: unknown }).skills ?? {});
      useSkillsStore.getState().replaceSkills(skills);
      useAgentStore.getState().setCounts({ skillCount: skills.length });

      const integrations = normalizeIntegrationList(
        (dashboard as { integrations?: unknown }).integrations ?? {}
      );
      useIntegrationStore.getState().replaceIntegrations(integrations);

      const recentActivity = (
        dashboard as { recentActivity?: Array<Record<string, unknown>> }
      ).recentActivity;
      if (Array.isArray(recentActivity)) {
        useAgentStore.getState().replaceActivities(recentActivity);
      }

      const recentLogs = (
        dashboard as { recentLogs?: Array<{ level: string; message: string; source?: string; ts?: number }> }
      ).recentLogs;
      if (Array.isArray(recentLogs)) {
        useLogStore.getState().replaceLogs(recentLogs);
      }
    }

    function connect() {
      setStatus(retryRef.current > 0 ? 'reconnecting' : 'connecting');
      es = new EventSource('http://localhost:5178/api/stream');

      es.onopen = () => {
        setStatus('connected');
        retryRef.current = 0;
        void bootstrapDashboard();
      };

      // Route events to stores
      es.addEventListener('snapshot', (e) => {
        const data = JSON.parse(e.data) as Record<string, unknown>;
        if (data['system.metrics']) {
          useMetricsStore.getState().updateMetrics(data['system.metrics'] as never);
        }
        const mcpStatus = normalizeMcpStatusList({ servers: data['mcp.status'] });
        if (mcpStatus.length > 0) {
          useMcpStore.getState().updateServers(mcpStatus);
        }
        if (data['config.update']) {
          useAgentStore.getState().applyRuntimeConfig(data['config.update'] as never);
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
        useMetricsStore.getState().updateMetrics(JSON.parse(e.data));
      });

      es.addEventListener('mcp.status', (e) => {
        useMcpStore.getState().updateServers(JSON.parse(e.data));
      });

      es.addEventListener('agent.activity', (e) => {
        const data = JSON.parse(e.data);
        useAgentStore.getState().addActivity(data);
      });

      es.addEventListener('log.entry', (e) => {
        useLogStore.getState().addLog(JSON.parse(e.data));
      });

      es.addEventListener('task.update', (e) => {
        const data = JSON.parse(e.data) as { tasks?: unknown[]; summary?: { total?: number } };
        if (data.tasks) {
          void useTaskStore.getState().replaceTasks(normalizeTaskList({ tasks: data.tasks }), {
            sync: false,
          });
          useAgentStore.getState().setCounts({
            taskCount: data.summary?.total ?? data.tasks.length,
          });
        }
      });

      es.addEventListener('integration.status', (e) => {
        const integrations = normalizeIntegrationList(JSON.parse(e.data));
        useIntegrationStore.getState().replaceIntegrations(integrations);
      });

      es.addEventListener('config.update', (e) => {
        useAgentStore.getState().applyRuntimeConfig(JSON.parse(e.data));
      });

      es.addEventListener('notification', (e) => {
        const data = JSON.parse(e.data);
        useAgentStore.getState().addActivity({
          type: 'system',
          message: data.message ?? 'Notification',
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
