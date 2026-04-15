import ToggleInput from './ToggleInput';

interface GravityMechanicsSectionProps {
  gravityEnabled: boolean;
  setGravityEnabled: (v: boolean) => void;
  beeMemory: boolean;
  setBeeMemory: (v: boolean) => void;
  selfImprovement: boolean;
  setSelfImprovement: (v: boolean) => void;
  loopholeEmail: string;
  setLoopholeEmail: (v: string) => void;
}

export default function GravityMechanicsSection({
  gravityEnabled, setGravityEnabled,
  beeMemory, setBeeMemory,
  selfImprovement, setSelfImprovement,
  loopholeEmail, setLoopholeEmail,
}: GravityMechanicsSectionProps) {
  return (
    <section className="settings-section card">
      <div className="section-header">
        <span className="section-title">🪐 GRAVITY MECHANICS</span>
      </div>
      <div className="settings-rows">
        <div className="settings-row">
          <div className="settings-row-label">
            <div className="settings-label">Gravity</div>
            <div className="settings-hint">
              Prioritize and pull relevant context, memory, and tools toward specific tasks
            </div>
          </div>
          <ToggleInput checked={gravityEnabled} onChange={setGravityEnabled} />
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <div className="settings-label">Bee Memory</div>
            <div className="settings-hint">
              Long-term state retention and cross-task memory synthesis
            </div>
          </div>
          <ToggleInput checked={beeMemory} onChange={setBeeMemory} />
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <div className="settings-label">Self-Improvement Loop</div>
            <div className="settings-hint">
              Agent analyzes its own errors to refine prompts and execution
            </div>
          </div>
          <ToggleInput checked={selfImprovement} onChange={setSelfImprovement} />
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <div className="settings-label">OAuth Loophole Email</div>
            <div className="settings-hint">
              Dedicated email for seamless integrations without breaking primary OAuth
            </div>
          </div>
          <input
            className="settings-input"
            value={loopholeEmail}
            onChange={(e) => setLoopholeEmail(e.target.value)}
            placeholder="bot@gmail.com"
          />
        </div>
      </div>
    </section>
  );
}
