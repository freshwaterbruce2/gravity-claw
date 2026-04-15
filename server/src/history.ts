import { state } from './state.js';
import { callMemoryTool } from './memory.js';

const MAX_HISTORY_CHARS = 3_200_000;
const MAX_SINGLE_MESSAGE_CHARS = 200_000;
const MIN_KEEP = 4;

export function trimHistory(
  messages: { role: string; content: string }[],
): { role: string; content: string }[] {
  // Pass 1: truncate any single oversized message
  let trimmed = messages.map(m => ({
    role: m.role,
    content:
      m.content.length > MAX_SINGLE_MESSAGE_CHARS
        ? m.content.slice(0, MAX_SINGLE_MESSAGE_CHARS) +
          '\n\n[Message truncated — original was ' +
          m.content.length +
          ' chars]'
        : m.content,
  }));

  // Pass 2: drop oldest messages if total exceeds budget
  let totalChars = trimmed.reduce((sum, m) => sum + m.content.length, 0);
  let dropped = 0;

  while (totalChars > MAX_HISTORY_CHARS && trimmed.length > MIN_KEEP) {
    totalChars -= trimmed[0].content.length;
    trimmed = trimmed.slice(1);
    dropped++;
  }

  // Ensure history starts with 'user' role (Gemini requirement)
  while (trimmed.length > 1 && trimmed[0].role !== 'user') {
    totalChars -= trimmed[0].content.length;
    trimmed = trimmed.slice(1);
    dropped++;
  }

  if (dropped > 0) {
    if (state.appConfig.memoryEnabled && state.appConfig.beeMemoryEnabled) {
      callMemoryTool('memory_add_semantic', {
        text: `Trimmed ${dropped} message(s) from gravity-claw chat history due to context limits.`,
        category: 'trimmed-history',
      }).catch((err) => { console.warn('[memory] failed to log history trim:', err); });
    }
    trimmed.unshift({
      role: 'user',
      content: `[System: ${dropped} older message(s) were trimmed to stay within context limits. Continue from the most recent context.]`,
    });
  }

  return trimmed;
}
