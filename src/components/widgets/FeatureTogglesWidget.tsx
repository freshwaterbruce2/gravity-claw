import { useAgentStore } from '../../stores/agentStore';

const TOGGLES = [
  { key: 'gravityMechanicEnabled', label: 'Gravity', icon: '\u26A1' },
  { key: 'beeMemoryEnabled', label: 'Bee Memory', icon: '\uD83D\uDC1D' },
  { key: 'selfImprovementEnabled', label: 'Self-Learn', icon: '\uD83E\uDDE0' },
  { key: 'memoryEnabled', label: 'Memory', icon: '\uD83D\uDCBE' },
  { key: 'vectorMemoryEnabled', label: 'Vectors', icon: '\uD83D\uDCD0' },
  { key: 'directShellEnabled', label: 'Shell', icon: '\u2328' },
  { key: 'workspaceWatchersEnabled', label: 'Watchers', icon: '\uD83D\uDC41' },
  { key: 'gitPipelineEnabled', label: 'Git CI', icon: '\uD83C\uDF3F' },
] as const;

type ToggleKey = (typeof TOGGLES)[number]['key'];

export default function FeatureTogglesWidget() {
  const store = useAgentStore();

  return (
    <section>
      <div className="section-header">
        <span className="section-title">FEATURE TOGGLES</span>
      </div>
      <div className="toggle-grid">
        {TOGGLES.map(({ key, label, icon }) => {
          const enabled = Boolean(store[key as ToggleKey]);
          return (
            <div key={key} className="toggle-tile">
              <span className="toggle-icon">{icon}</span>
              <span className="toggle-label">{label}</span>
              <span
                className={`toggle-dot ${enabled ? 'toggle-dot--on' : 'toggle-dot--off'}`}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
