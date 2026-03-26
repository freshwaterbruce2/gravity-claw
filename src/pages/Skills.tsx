import { useEffect, useMemo, useState } from 'react';
import { getSkillCategories, useSkillsStore, type Skill } from '../stores/skillsStore';
import './Skills.css';

export default function Skills() {
  const { skills, hydrated, loadSkills } = useSkillsStore();
  const [activeCategory, setActiveCategory] = useState('All');
  const [query, setQuery] = useState('');

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const categories = useMemo(() => getSkillCategories(skills), [skills]);

  const filtered = useMemo(
    () =>
      skills.filter((s) => {
        const matchCat = activeCategory === 'All' || s.category === activeCategory;
        const queryValue = query.toLowerCase();
        const matchQ =
          !queryValue ||
          s.name.toLowerCase().includes(queryValue) ||
          s.description.toLowerCase().includes(queryValue) ||
          s.tags.some((tag) => tag.toLowerCase().includes(queryValue));
        return matchCat && matchQ;
      }),
    [activeCategory, query, skills]
  );

  return (
    <div className="skills-page animate-in">
      {/* Header */}
      <div className="skills-header">
        <div>
          <h3 style={{ color: 'var(--text-primary)', marginBottom: 4 }}>Skill Browser</h3>
          <p className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
            {!hydrated
              ? 'Syncing live skill inventory...'
              : `${skills.length} skills available — ${skills.filter((s) => s.status === 'active').length} active`}
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
        {categories.map((cat) => (
          <button
            key={cat}
            className={`category-tab ${activeCategory === cat ? 'category-tab--active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
            {cat !== 'All' && (
              <span className="category-count">
                {skills.filter((s) => s.category === cat).length}
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
