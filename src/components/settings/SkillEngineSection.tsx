import type { Dispatch, SetStateAction } from 'react';
import type { GravityClawSkillEngineConfig } from '../../lib/runtimeConfig';

interface SkillEngineSectionProps {
  skillEngine: GravityClawSkillEngineConfig;
  setSkillEngine: Dispatch<SetStateAction<GravityClawSkillEngineConfig>>;
}

export default function SkillEngineSection({ skillEngine, setSkillEngine }: SkillEngineSectionProps) {
  const numericRow = (
    label: string,
    hint: string,
    key: keyof GravityClawSkillEngineConfig,
    min: number,
    max: number,
  ) => (
    <div className="settings-row">
      <div className="settings-row-label">
        <div className="settings-label">{label}</div>
        <div className="settings-hint">{hint}</div>
      </div>
      <input
        className="settings-input settings-input--sm font-code"
        type="number"
        min={min}
        max={max}
        value={skillEngine[key] as number}
        onChange={(e) =>
          setSkillEngine((prev) => ({
            ...prev,
            [key]: Number.parseInt(e.target.value, 10) || min,
          }))
        }
      />
    </div>
  );

  return (
    <section className="settings-section card">
      <div className="section-header">
        <span className="section-title">⬡ SKILL ENGINE</span>
      </div>
      <div className="settings-rows">
        {numericRow(
          'Max concurrent skills',
          'How many skills can run simultaneously',
          'maxConcurrentSkills',
          1, 12,
        )}
        {numericRow(
          'Skill timeout (seconds)',
          'Cancel skill if it exceeds this duration',
          'skillTimeoutSeconds',
          5, 600,
        )}
        {numericRow(
          'Web search max results',
          'Maximum results to retrieve per search',
          'webSearchMaxResults',
          1, 25,
        )}
      </div>
    </section>
  );
}
