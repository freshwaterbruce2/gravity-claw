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
        <div className="key-field-row">
          <div className="key-field-input-wrap">
            <input
              className="settings-input key-field-input"
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
            />
            <button
              className="key-toggle-btn font-code text-xs key-field-toggle"
              onClick={() => setShow((v) => !v)}
              type="button"
            >
              {show ? 'HIDE' : 'SHOW'}
            </button>
          </div>
          <button
            className="btn btn-primary key-field-save"
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
