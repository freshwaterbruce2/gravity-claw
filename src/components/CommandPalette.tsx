import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Page } from '../App';
import { useSkillsStore } from '../stores/skillsStore';
import './CommandPalette.css';

interface PaletteItem {
  id: string;
  icon: string;
  label: string;
  hint?: string;
  group: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
}

const PAGES: { page: Page; icon: string; label: string; key: string }[] = [
  { page: 'dashboard', icon: '◈', label: 'Dashboard', key: '1' },
  { page: 'chat', icon: '◉', label: 'Agent Chat', key: '2' },
  { page: 'skills', icon: '⬡', label: 'Skill Browser', key: '3' },
  { page: 'tasks', icon: '▦', label: 'Task Board', key: '4' },
  { page: 'console', icon: '▶', label: 'Agent Console', key: '5' },
  { page: 'settings', icon: '◌', label: 'Configuration', key: '6' },
];

const SKILLS_STALE_MS = 60_000;

export default function CommandPalette({ open, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { skills, loadSkills, lastUpdated } = useSkillsStore();

  const handleNavigate = useCallback((page: Page) => {
    onNavigate(page);
    onClose();
  }, [onNavigate, onClose]);

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];

    // Pages
    for (const p of PAGES) {
      list.push({
        id: `page-${p.page}`,
        icon: p.icon,
        label: p.label,
        hint: p.key,
        group: 'Navigate',
        action: () => handleNavigate(p.page),
      });
    }

    // Skills (top 12 by use count)
    const topSkills = [...skills]
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, 12);
    for (const s of topSkills) {
      list.push({
        id: `skill-${s.id}`,
        icon: s.icon,
        label: s.name,
        hint: s.category,
        group: 'Skills',
        action: () => handleNavigate('chat'),
      });
    }

    // Actions
    list.push({
      id: 'action-console',
      icon: '▶',
      label: 'Open Console',
      hint: 'Ctrl+/',
      group: 'Actions',
      action: () => handleNavigate('console'),
    });

    return list;
  }, [handleNavigate, skills]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.group.toLowerCase().includes(q) ||
        (i.hint ?? '').toLowerCase().includes(q),
    );
  }, [items, query]);

  // Reset on open and focus input (layout effect for DOM synchronization).
  useLayoutEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('');
      setActiveIdx(0);
      const stale = !lastUpdated || Date.now() - lastUpdated > SKILLS_STALE_MS;
      if (stale) {
        void loadSkills({ force: true });
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [loadSkills, open, lastUpdated]);

  // Clamp active index to valid range during render instead of in an effect
  const safeActiveIdx = Math.min(activeIdx, Math.max(0, filtered.length - 1));

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' && filtered[safeActiveIdx]) {
      filtered[safeActiveIdx].action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  // Group items for display (memoized to stabilize reference for useMemo below)
  const groups = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of filtered) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return map;
  }, [filtered]);

  // Pre-compute flat indices to avoid mutation during render
  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    for (const [, groupItems] of groups) {
      for (const item of groupItems) {
        map.set(item.id, idx++);
      }
    }
    return map;
  }, [groups]);

  if (!open) return null;

  return (
    <div className="palette-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="palette" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="palette-input-wrap">
          <span className="palette-search-icon">⌕</span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search pages, skills, actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Command palette search"
          />
          <span className="palette-kbd">ESC</span>
        </div>

        <div className="palette-results">
          {filtered.length === 0 && <div className="palette-empty">No results for "{query}"</div>}
          {[...groups.entries()].map(([group, groupItems]) => (
            <div key={group}>
              <div className="palette-group-label">{group}</div>
              {groupItems.map((item) => {
                const idx = itemIndexMap.get(item.id) ?? 0;
                return (
                  <div
                    key={item.id}
                    className={`palette-item${idx === safeActiveIdx ? ' palette-item--active' : ''}`}
                    onClick={item.action}
                    onMouseEnter={() => setActiveIdx(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.action(); } }}
                  >
                    <span className="palette-item-icon">{item.icon}</span>
                    <span className="palette-item-label">{item.label}</span>
                    {item.hint && <span className="palette-item-hint">{item.hint}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="palette-footer">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
