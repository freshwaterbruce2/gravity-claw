interface ToggleInputProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  onLabel?: string;
  offLabel?: string;
}

export default function ToggleInput({
  checked,
  onChange,
  onLabel = 'ON',
  offLabel = 'OFF',
}: ToggleInputProps) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span className={`toggle-label ${checked ? 'text-green' : 'text-muted'} font-code`}>
        {checked ? onLabel : offLabel}
      </span>
    </label>
  );
}
