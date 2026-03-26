import { create } from 'zustand';
import { fetchIntegrations, normalizeIntegration, type LiveIntegration } from '../lib/liveApi';

export type IntegrationStatus = LiveIntegration;

interface IntegrationState {
  integrations: IntegrationStatus[];
  hydrated: boolean;
  lastUpdated: number;
  loadIntegrations: (options?: { force?: boolean }) => Promise<void>;
  replaceIntegrations: (integrations: IntegrationStatus[]) => void;
  upsertIntegration: (integration: IntegrationStatus) => void;
}

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  integrations: [],
  hydrated: false,
  lastUpdated: 0,

  loadIntegrations: async (options) => {
    if (get().hydrated && !options?.force) {
      return;
    }

    try {
      const integrations = await fetchIntegrations();
      set({
        integrations,
        hydrated: true,
        lastUpdated: Date.now(),
      });
    } catch {
      set({ hydrated: true, lastUpdated: Date.now() });
    }
  },

  replaceIntegrations: (integrations) =>
    set({
      integrations: integrations.map((integration) => normalizeIntegration(integration)),
      hydrated: true,
      lastUpdated: Date.now(),
    }),

  upsertIntegration: (integration) =>
    set((state) => {
      const nextIntegration = normalizeIntegration(integration);
      const integrations = state.integrations.some((item) => item.id === nextIntegration.id)
        ? state.integrations.map((item) =>
            item.id === nextIntegration.id ? nextIntegration : item,
          )
        : [nextIntegration, ...state.integrations];

      return {
        integrations,
        hydrated: true,
        lastUpdated: Date.now(),
      };
    }),
}));

