import { useEffect } from 'react';
import type { Page } from '../App';

interface ShortcutOptions {
  onOpenPalette: () => void;
  onNavigate: (page: Page) => void;
}

const PAGE_KEYS: Record<string, Page> = {
  '1': 'dashboard',
  '2': 'chat',
  '3': 'skills',
  '4': 'tasks',
  '5': 'console',
  '6': 'settings',
};

export function useKeyboardShortcuts({ onOpenPalette, onNavigate }: ShortcutOptions) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;

      // Ctrl+K — always opens palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onOpenPalette();
        return;
      }

      // Ctrl+/ — jump to console
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        onNavigate('console');
        return;
      }

      // Number keys 1-6 for page navigation (only when not typing)
      if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const page = PAGE_KEYS[e.key];
        if (page) {
          e.preventDefault();
          onNavigate(page);
        }
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpenPalette, onNavigate]);
}
