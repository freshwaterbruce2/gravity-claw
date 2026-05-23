import { useCallback, useEffect, useState } from 'react';
import { checkForUpdate, installUpdate, type UpdateInfo } from './lib/updater';
import './App.css';
import LoginScreen from './components/auth/LoginScreen';
import CommandPalette from './components/CommandPalette';
import Sidebar from './components/layout/Sidebar';
import StatusBar from './components/layout/StatusBar';
import TopBar from './components/layout/TopBar';
import { useEventStream } from './hooks/useEventStream';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import Chat from './pages/Chat';
import Console from './pages/Console';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Skills from './pages/Skills';
import Tasks from './pages/Tasks';
import { useAgentStore } from './stores/agentStore';
import { useAuthStore } from './stores/authStore';
import { useChatStore } from './stores/chatStore';

export type Page = 'dashboard' | 'chat' | 'skills' | 'tasks' | 'console' | 'settings';

export default function App() {
  const { initializeAuth, isAuthenticated, isHydrated } = useAuthStore();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const { tick, initializeConfig } = useAgentStore();
  const { initializeChat } = useChatStore();

  // Connect to backend SSE stream — routes events to Zustand stores
  const { connectionStatus } = useEventStream();

  // Global keyboard shortcuts (Ctrl+K, 1-6, Ctrl+/)
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useKeyboardShortcuts({ onOpenPalette: openPalette, onNavigate: setCurrentPage });

  useEffect(() => {
    void initializeAuth();
    void initializeConfig();
    void initializeChat();

    // Check for updates after auth/config init
    void (async () => {
      const info = await checkForUpdate();
      if (info) setUpdate(info);
    })();
  }, [initializeAuth, initializeChat, initializeConfig]);

  // Uptime ticker (local display counter — real uptime comes from system.metrics SSE)
  useEffect(() => {
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tick]);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'chat':
        return <Chat />;
      case 'skills':
        return <Skills />;
      case 'tasks':
        return <Tasks />;
      case 'console':
        return <Console />;
      case 'settings':
        return <Settings />;
    }
  };

  if (!isHydrated) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-logo">
            <span className="login-logo-icon">🦀</span>
            <div>
              <div className="login-logo-name">GRAVITY-CLAW</div>
              <div className="login-logo-sub font-code">INITIALIZING SESSION BRIDGE</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="app-shell">
      {update && (
        <div className="update-banner">
          <span className="update-banner-text">
            Update available: <strong>{update.version}</strong>
          </span>
          <button
            className="update-banner-btn"
            onClick={() => {
              setUpdating(true);
              void installUpdate();
            }}
            disabled={updating}
          >
            {updating ? 'Downloading...' : 'Install & Restart'}
          </button>
          <button className="update-banner-dismiss" onClick={() => setUpdate(null)}>
            Dismiss
          </button>
        </div>
      )}
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="app-main">
        <TopBar currentPage={currentPage} />
        <main className="app-content">{renderPage()}</main>
        <StatusBar connectionStatus={connectionStatus} />
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={setCurrentPage}
      />
    </div>
  );
}
