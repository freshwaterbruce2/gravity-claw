import { useEffect, useMemo } from 'react';
import type { Page } from '../../App';
import { getSkillCategories, useSkillsStore } from '../../stores/skillsStore';

const BAR_COLORS = ['amber', 'cyan', 'green', 'blue'] as const;

interface SkillCategoriesWidgetProps {
  onNavigate: (page: Page) => void;
}

export default function SkillCategoriesWidget({ onNavigate }: SkillCategoriesWidgetProps) {
  const { skills, loadSkills } = useSkillsStore();

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const { categories, maxCount } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skills) {
      counts.set(skill.category, (counts.get(skill.category) ?? 0) + 1);
    }

    const allowedCategories = new Set(getSkillCategories(skills));
    allowedCategories.delete('All');
    const entries = Array.from(counts.entries())
      .filter(([name]) => allowedCategories.has(name))
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const max = Math.max(...entries.map((e) => e.count), 1);

    return { categories: entries, maxCount: max };
  }, [skills]);

  return (
    <div>
      <div className="skill-cat-list">
        {categories.map((cat, i) => (
          <div key={cat.name} className="skill-cat-row">
            <span className="skill-cat-name">{cat.name}</span>
            <div className="skill-cat-bar-track">
              <div
                className="skill-cat-bar-fill"
                style={{
                  width: `${(cat.count / maxCount) * 100}%`,
                  backgroundColor: `var(--${BAR_COLORS[i % BAR_COLORS.length]})`,
                }}
              />
            </div>
            <span className="skill-cat-count">{cat.count}</span>
          </div>
        ))}
      </div>

      <div className="skill-cat-total">{skills.length} skills loaded</div>

      <div style={{ textAlign: 'right', marginTop: 8 }}>
        <button
          className="btn btn-ghost"
          style={{ height: 26, fontSize: 11 }}
          onClick={() => onNavigate('skills')}
        >
          View all
        </button>
      </div>
    </div>
  );
}
