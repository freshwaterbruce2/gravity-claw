import { useState } from 'react';

interface ApiKeyFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saved: boolean;
  placeholder?: string;
}

export default function ApiKeyField({
  label,
  hint,
  value,
  onChange,
  onSave,
  saved,
  placeholder = 'sk-...',
}: ApiKeyFieldProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <div className="settings-label">{label}</div>
        <div className="settings-hint" dangerouslySetInnerHTML={{ __html: hint }} />
      </div>
      <div className="key-field-wrap">
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              className="settings-input"
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              style={{ width: '100%', fontFamily: 'var(--font-code)', fontSize: 12, paddingRight: 52 }}
            />
            <button
              className="key-toggle-btn font-code text-xs"
              onClick={() => setShow((v) => !v)}
              type="button"
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                border: 'none', letterSpacing: '0.08em',
              }}
            >
              {show ? 'HIDE' : 'SHOW'}
            </button>
          </div>
          <button
            className="btn btn-primary"
            style={{ height: 38, fontSize: 12, whiteSpace: 'nowrap' }}
            onClick={onSave}
            disabled={!value.trim()}
          >
            {saved ? '✓ Saved' : 'Save Key'}
          </button>
        </div>
      </div>
    </div>
  );
}
