export const DEFAULT_SYSTEM_PROMPT = `You are a helpful, intelligent AI assistant.
- Be concise but thorough.
- Format long answers with markdown (headings, lists, code blocks).
- If unsure or the request is ambiguous, ask a clarifying question.`;

const SESSIONS = new Map();

export function getSession(id) {
  if (!SESSIONS.has(id)) {
    SESSIONS.set(id, {
      history: [],
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
    });
  }
  return SESSIONS.get(id);
}

export function deleteSession(id) {
  SESSIONS.delete(id);
}

export function buildMessages(session) {
  const messages = [
    { role: "system", content: session.systemPrompt || DEFAULT_SYSTEM_PROMPT },
  ];
  for (const m of session.history) messages.push(m);
  return messages;
}

export function buildUserContent(message, attachments) {
  if (!attachments || attachments.length === 0) {
    return message;
  }
  const parts = [];
  if (message && message.trim()) {
    parts.push({ type: "text", text: message });
  }
  for (const att of attachments) {
    if (att.dataUrl) {
      parts.push({ type: "image_url", image_url: { url: att.dataUrl } });
    }
  }
  return parts;
}
