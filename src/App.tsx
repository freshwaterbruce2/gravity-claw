import { GoogleOAuthProvider } from '@react-oauth/google';
import { useEffect, useState } from 'react';
import './App.css';
import LoginScreen from './components/auth/LoginScreen';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Chat from './pages/Chat';
import Console from './pages/Console';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Skills from './pages/Skills';
import Tasks from './pages/Tasks';
import { useAgentStore } from './stores/agentStore';
import { useAuthStore } from './stores/authStore';

export type Page = 'dashboard' | 'chat' | 'skills' | 'tasks' | 'console' | 'settings';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export default function App() {
  const { isAuthenticated } = useAuthStore();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const { tick, addActivity } = useAgentStore();

  // Uptime ticker
  useEffect(() => {
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tick]);

  // Simulated live activity events
  useEffect(() => {
    const LIVE_EVENTS = [
      {
        type: 'skill' as const,
        message: 'Web Search: monitoring keyword alerts',
        skill: 'Web Search',
      },
      {
        type: 'message' as const,
        message: 'Incoming message via Discord bridge',
        skill: 'Discord Bridge',
      },
      { type: 'task' as const, message: 'Reminder: Check market prices', skill: 'Market Watcher' },
      {
        type: 'skill' as const,
        message: 'File Writer: Updated task_log.json',
        skill: 'File Writer',
      },
      { type: 'system' as const, message: 'Memory checkpoint saved', skill: undefined },
      {
        type: 'skill' as const,
        message: 'Browser Control: Navigated to competitor site',
        skill: 'Browser Control',
      },
      {
        type: 'task' as const,
        message: 'Email draft generated and queued',
        skill: 'Email Manager',
      },
      {
        type: 'skill' as const,
        message: 'Git Manager: Pushed 3 commits to main',
        skill: 'Git Manager',
      },
    ];

    let i = 0;
    const interval = setInterval(() => {
      addActivity(LIVE_EVENTS[i % LIVE_EVENTS.length]);
      i++;
    }, 8000);

    return () => clearInterval(interval);
  }, [addActivity]);

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

  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      {!isAuthenticated ? (
        <LoginScreen />
      ) : (
        <div className="app-shell">
          <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
          <div className="app-main">
            <TopBar currentPage={currentPage} />
            <main className="app-content">{renderPage()}</main>
          </div>
        </div>
      )}
    </GoogleOAuthProvider>
  );
}
