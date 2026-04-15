import ToggleInput from './ToggleInput';

interface ModelOption {
  id: string;
  label: string;
  provider: string;
}

interface AgentConfigSectionProps {
  agentName: string;
  setAgentName: (v: string) => void;
  selectedModel: string;
  setSelectedModel: (v: string) => void;
  availableModels: ModelOption[];
  memory: boolean;
  setMemory: (v: boolean) => void;
}

export default function AgentConfigSection({
  agentName, setAgentName,
  selectedModel, setSelectedModel,
  availableModels,
  memory, setMemory,
}: AgentConfigSectionProps) {
  return (
    <section className="settings-section card">
      <div className="section-header">
        <span className="section-title">◈ AGENT CONFIGURATION</span>
      </div>
      <div className="settings-rows">
        <div className="settings-row">
          <div className="settings-row-label">
            <div className="settings-label">Agent Name</div>
            <div className="settings-hint">Identifier for this agent instance</div>
          </div>
          <input
            className="settings-input"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="G-CLAW-01"
          />
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <div className="settings-label">LLM Model</div>
            <div className="settings-hint">Primary language model for reasoning</div>
          </div>
          <select
            className="settings-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {availableModels.some((m) => m.provider === 'google') && (
              <optgroup label="Google Gemini">
                {availableModels.filter((m) => m.provider === 'google').map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </optgroup>
            )}
            {availableModels.some((m) => m.provider === 'moonshot') && (
              <optgroup label="Moonshot Kimi">
                {availableModels.filter((m) => m.provider === 'moonshot').map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </optgroup>
            )}
            {availableModels
              .filter((m) => m.provider !== 'google' && m.provider !== 'moonshot')
              .map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
          </select>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <div className="settings-label">Long-term Memory</div>
            <div className="settings-hint">Persist context and memories across sessions</div>
          </div>
          <ToggleInput checked={memory} onChange={setMemory} />
        </div>
      </div>
    </section>
  );
}
