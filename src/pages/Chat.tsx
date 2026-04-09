import { useEffect, useRef, useState } from 'react';
import { useAgentStore } from '../stores/agentStore';
import { useAuthStore } from '../stores/authStore';
import { QUICK_COMMANDS, useChatStore } from '../stores/chatStore';
import './Chat.css';

export default function Chat() {
  const { messages, isTyping, sendMessage, clearMessages } = useChatStore();
  const { incrementMessages, addActivity, model, setStatus } = useAgentStore();
  const { geminiKey, kimiKey } = useAuthStore();
  const [input, setInput] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping) return;
    setInput('');
    setShowCommands(false);

    incrementMessages();
    addActivity({
      type: 'message',
      message: `User: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`,
    });
    setStatus('busy');

    await sendMessage(text, geminiKey ?? '', model, kimiKey ?? undefined);

    setStatus('online');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
    if (e.key === 'Escape') setShowCommands(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    setShowCommands(val.startsWith('/') && val.length === 1);
  };

  const selectCommand = (cmd: string) => {
    setInput(cmd + ' ');
    setShowCommands(false);
    inputRef.current?.focus();
  };

  const isKimiModel = model.startsWith('kimi-');
  const needsKey = isKimiModel ? !kimiKey : !geminiKey;

  return (
    <div className="chat-page">
      {/* No-key warning */}
      {needsKey && (
        <div className="chat-banner animate-in">
          ⚠️ No {isKimiModel ? 'Kimi' : 'Gemini'} API key configured. Go to <strong>Settings → Authentication</strong> to add one.
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-msg chat-msg--${msg.role} animate-in`}>
            <div className="chat-msg-avatar">{msg.role === 'agent' ? '🦀' : '◉'}</div>
            <div className="chat-msg-body">
              <div className="chat-msg-header">
                <span className="chat-msg-name">{msg.role === 'agent' ? 'G-CLAW' : 'YOU'}</span>
                <span className="chat-msg-time font-code text-muted">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {msg.toolCall && (
                <div className="tool-call-badge">
                  <span className="badge badge-amber">⬡ SKILL</span>
                  <span className="font-code text-xs text-secondary">{msg.toolCall.skill}</span>
                </div>
              )}
              <div className={`chat-msg-content ${msg.isTyping ? 'streaming' : ''}`}>
                {msg.content ? (
                  msg.content
                    .split('**')
                    .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
                ) : msg.isTyping ? (
                  <span className="chat-typing">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Command palette */}
      {showCommands && (
        <div className="command-palette animate-in">
          <div className="command-palette-header font-code text-xs text-muted">QUICK COMMANDS</div>
          {QUICK_COMMANDS.map((c) => (
            <button key={c.cmd} className="command-item" onClick={() => selectCommand(c.cmd)}>
              <span className="command-cmd text-amber font-code">{c.cmd}</span>
              <span className="command-desc text-secondary">{c.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input Bar */}
      <div className="chat-input-bar">
        <button className="btn btn-ghost chat-clear-btn" onClick={clearMessages} title="Clear chat">
          ✕
        </button>
        <input
          ref={inputRef}
          id="chatMessageInput"
          type="text"
          aria-label="Chat message input"
          className="chat-input"
          placeholder={
            needsKey
              ? 'Add an API key in Settings first...'
              : 'Message G-CLAW... (type / for quick commands)'
          }
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={isTyping || needsKey}
        />
        <button
          className="btn btn-primary chat-send-btn"
          onClick={() => void handleSend()}
          disabled={!input.trim() || isTyping || needsKey}
        >
          SEND ▶
        </button>
      </div>
    </div>
  );
}
