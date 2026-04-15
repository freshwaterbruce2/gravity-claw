import { OPTIMIZATION_VECTORS } from '../../data/systemProfile';
import ToggleInput from './ToggleInput';

interface OptimizationVectorsSectionProps {
  vectorMemory: boolean;
  setVectorMemory: (v: boolean) => void;
  directShell: boolean;
  setDirectShell: (v: boolean) => void;
  workspaceWatchers: boolean;
  setWorkspaceWatchers: (v: boolean) => void;
  gitPipeline: boolean;
  setGitPipeline: (v: boolean) => void;
}

export default function OptimizationVectorsSection({
  vectorMemory, setVectorMemory,
  directShell, setDirectShell,
  workspaceWatchers, setWorkspaceWatchers,
  gitPipeline, setGitPipeline,
}: OptimizationVectorsSectionProps) {
  const stateMap: Record<string, { checked: boolean; onChange: (v: boolean) => void }> = {
    vectorMemory: { checked: vectorMemory, onChange: setVectorMemory },
    directShell: { checked: directShell, onChange: setDirectShell },
    workspaceWatchers: { checked: workspaceWatchers, onChange: setWorkspaceWatchers },
    gitPipeline: { checked: gitPipeline, onChange: setGitPipeline },
  };

  return (
    <section className="settings-section card">
      <div className="section-header">
        <span className="section-title">⬡ OPTIMIZATION VECTORS</span>
      </div>
      <div className="settings-rows">
        {OPTIMIZATION_VECTORS.map((vector) => {
          const { checked, onChange } = stateMap[vector.id] ?? { checked: false, onChange: () => {} };
          return (
            <div key={vector.id} className="settings-row settings-row--stacked">
              <div className="settings-row-label">
                <div className="settings-label">{vector.title}</div>
                <div className="settings-hint"><strong>Bottleneck:</strong> {vector.bottleneck}</div>
                <div className="settings-hint"><strong>Fix:</strong> {vector.fix}</div>
              </div>
              <ToggleInput
                checked={checked}
                onChange={onChange}
                onLabel="ENABLED"
                offLabel="PLANNED"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
