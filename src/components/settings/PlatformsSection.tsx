import type { Dispatch, SetStateAction } from 'react';
import type { GravityClawPlatformConfig } from '../../lib/runtimeConfig';

const PLATFORMS = [
  { id: 'telegram', label: 'Telegram', icon: '✈️' },
  { id: 'discord', label: 'Discord', icon: '🎮' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { id: 'slack', label: 'Slack', icon: '🔔' },
  { id: 'email', label: 'Gmail', icon: '📧' },
  { id: 'signal', label: 'Signal', icon: '🔕' },
];

interface PlatformsSectionProps {
  platforms: GravityClawPlatformConfig;
  setPlatforms: Dispatch<SetStateAction<GravityClawPlatformConfig>>;
}

export default function PlatformsSection({ platforms, setPlatforms }: PlatformsSectionProps) {
  return (
    <section className="settings-section card">
      <div className="section-header">
        <span className="section-title">◉ MESSAGING PLATFORMS</span>
      </div>
      <div className="platform-grid">
        {PLATFORMS.map((platform) => {
          const enabled = platforms[platform.id as keyof typeof platforms];
          return (
            <div key={platform.id} className={`platform-card ${enabled ? 'platform-card--enabled' : ''}`}>
              <div className="platform-icon">{platform.icon}</div>
              <div className="platform-name">{platform.label}</div>
              <span className={`badge ${enabled ? 'badge-green' : 'badge-muted'}`}>
                {enabled ? 'Connected' : 'Off'}
              </span>
              <label className="toggle" style={{ marginTop: 'auto' }}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) =>
                    setPlatforms((prev) => ({ ...prev, [platform.id]: e.target.checked }))
                  }
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}
