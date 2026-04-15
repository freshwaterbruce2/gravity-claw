import ApiKeyField from './ApiKeyField';

interface AuthSectionProps {
  geminiKey: string | null;
  kimiKey: string | null;
  apiKey: string;
  setApiKey: (v: string) => void;
  kimiApiKey: string;
  setKimiApiKey: (v: string) => void;
  keySaved: boolean;
  kimiKeySaved: boolean;
  onSaveGeminiKey: () => void;
  onSaveKimiKey: () => void;
  onLogout: () => void;
}

export default function AuthSection({
  geminiKey, kimiKey,
  apiKey, setApiKey, keySaved, onSaveGeminiKey,
  kimiApiKey, setKimiApiKey, kimiKeySaved, onSaveKimiKey,
  onLogout,
}: AuthSectionProps) {
  const sessionStatus =
    geminiKey && kimiKey ? 'Gemini + Kimi keys loaded'
    : geminiKey ? 'Gemini API key loaded'
    : kimiKey ? 'Kimi API key loaded'
    : 'No API keys configured';

  return (
    <section className="settings-section card">
      <div className="section-header">
        <span className="section-title">🔑 AUTHENTICATION</span>
      </div>
      <div className="settings-rows">
        <div className="settings-row">
          <div className="settings-row-label">
            <div className="settings-label">Session status</div>
            <div className="settings-hint">{sessionStatus}</div>
          </div>
          <button
            className="btn btn-ghost"
            style={{ height: 36, fontSize: 12 }}
            onClick={onLogout}
          >
            Sign Out
          </button>
        </div>

        <ApiKeyField
          label="Gemini API Key"
          hint="Used for all Gravity-Claw chat requests. Stored via the desktop auth bridge when available."
          value={apiKey}
          onChange={setApiKey}
          onSave={onSaveGeminiKey}
          saved={keySaved}
          placeholder="AIzaSy..."
        />

        <ApiKeyField
          label="Kimi K2.5 API Key"
          hint={`${kimiKey ? 'Moonshot Kimi key loaded' : 'Optional — enables Kimi K2.5 models.'} Get a key at <a href="https://platform.moonshot.ai" target="_blank" rel="noreferrer" style="color:var(--text-amber)">platform.moonshot.ai</a>`}
          value={kimiApiKey}
          onChange={setKimiApiKey}
          onSave={onSaveKimiKey}
          saved={kimiKeySaved}
          placeholder="sk-..."
        />
      </div>
    </section>
  );
}
