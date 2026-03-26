import type { Page } from '../../App';
import { useChatStore } from '../../stores/chatStore';

interface RecentChatWidgetProps {
  onNavigate: (page: Page) => void;
}

export default function RecentChatWidget({ onNavigate }: RecentChatWidgetProps) {
  const { messages } = useChatStore();

  // Show last 5 non-welcome messages, newest first
  const recent = messages
    .filter((m) => m.id !== 'welcome' && !m.isTyping)
    .slice(-5)
    .reverse();

  return (
    <section className="card widget-chat">
      <div className="section-header">
        <span className="section-title">◉ RECENT CHAT</span>
        <button
          className="btn btn-ghost"
          style={{ height: 26, fontSize: 11 }}
          onClick={() => onNavigate('chat')}
        >
          Open chat
        </button>
      </div>

      {recent.length === 0 ? (
        <div className="widget-empty">No messages yet</div>
      ) : (
        <div className="widget-chat-list">
          {recent.map((msg) => (
            <div
              key={msg.id}
              className={`widget-chat-item widget-chat-item--${msg.role}`}
              onClick={() => onNavigate('chat')}
            >
              <span className={`widget-chat-role font-code ${msg.role === 'agent' ? 'text-cyan' : 'text-green'}`}>
                {msg.role === 'agent' ? 'AGENT' : 'YOU'}
              </span>
              <span className="widget-chat-text">{msg.content.slice(0, 120)}{msg.content.length > 120 ? '...' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
