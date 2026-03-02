import { useState } from 'react';
import type { Skill } from '../data/skills';
import { SKILLS, SKILL_CATEGORIES } from '../data/skills';
import './Skills.css';

export default function Skills() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [query, setQuery] = useState('');

  const filtered = SKILLS.filter((s) => {
    const matchCat = activeCategory === 'All' || s.category === activeCategory;
    const matchQ =
      !query ||
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.description.toLowerCase().includes(query.toLowerCase()) ||
      s.tags.some((t) => t.includes(query.toLowerCase()));
    return matchCat && matchQ;
  });

  return (
    <div className="skills-page animate-in">
      {/* Header */}
      <div className="skills-header">
        <div>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: 4 }}>Skill Browser</h3>
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
            {SKILLS.length} skills available — {SKILLS.filter((s) => s.status === 'active').length}{' '}
            active
          </p>
        </div>
        <input
          className="skills-search"
          placeholder="Search skills..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Category tabs */}
      <div className="category-tabs">
        {SKILL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`category-tab ${activeCategory === cat ? 'category-tab--active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
            {cat !== 'All' && (
              <span className="category-count">
                {SKILLS.filter((s) => s.category === cat).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Skill Grid */}
      <div className="skills-grid">
        {filtered.map((skill) => (
          <SkillCard key={skill.id} skill={skill} />
        ))}
        {filtered.length === 0 && (
          <div className="skills-empty font-code text-muted">No skills match your search.</div>
        )}
      </div>
    </div>
  );
}

function SkillCard({ skill }: { skill: Skill }) {
  const statusColor =
    skill.status === 'active' ? 'green' : skill.status === 'beta' ? 'amber' : 'muted';

  return (
    <div className="skill-card">
      <div className="skill-card-top">
        <span className="skill-icon">{skill.icon}</span>
        <span className={`badge badge-${statusColor}`}>{skill.status.toUpperCase()}</span>
      </div>
      <div className="skill-name">{skill.name}</div>
      <p className="skill-desc">{skill.description}</p>
      <div className="skill-footer">
        <span className="skill-use-count font-code text-muted text-xs">
          ◉ {skill.useCount.toLocaleString()} uses
        </span>
        <button
          className={`btn ${skill.status === 'inactive' ? 'btn-ghost' : 'btn-primary'} skill-btn`}
        >
          {skill.status === 'inactive' ? 'Install' : 'Use'}
        </button>
      </div>
      <div className="skill-tags">
        {skill.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
