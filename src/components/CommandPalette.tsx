import { useEffect, useMemo, useRef, useState } from 'react';
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
  { page: 'settings', icon: '⚙', label: 'Configuration', key: '6' },
];

export default function CommandPalette({ open, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { skills, loadSkills } = useSkillsStore();

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
        action: () => {
          onNavigate(p.page);
          onClose();
        },
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
        action: () => {
          onNavigate('chat');
          onClose();
        },
      });
    }

    // Actions
    list.push({
      id: 'action-console',
      icon: '▶',
      label: 'Open Console',
      hint: 'Ctrl+/',
      group: 'Actions',
      action: () => {
        onNavigate('console');
        onClose();
      },
    });

    return list;
  }, [onNavigate, onClose, skills]);

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

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      void loadSkills();
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [loadSkills, open]);

  // Clamp active index
  useEffect(() => {
    setActiveIdx((prev) => Math.min(prev, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' && filtered[activeIdx]) {
      filtered[activeIdx].action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  if (!open) return null;

  // Group items for display
  const groups = new Map<string, PaletteItem[]>();
  for (const item of filtered) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }

  let flatIdx = 0;

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="palette-input-wrap">
          <span className="palette-search-icon">⌕</span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search pages, skills, actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="palette-kbd">ESC</span>
        </div>

        <div className="palette-results">
          {filtered.length === 0 && <div className="palette-empty">No results for "{query}"</div>}
          {[...groups.entries()].map(([group, groupItems]) => (
            <div key={group}>
              <div className="palette-group-label">{group}</div>
              {groupItems.map((item) => {
                const idx = flatIdx++;
                return (
                  <div
                    key={item.id}
                    className={`palette-item${idx === activeIdx ? ' palette-item--active' : ''}`}
                    onClick={item.action}
                    onMouseEnter={() => setActiveIdx(idx)}
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
