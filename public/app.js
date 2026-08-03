const chatEl = document.getElementById("chat");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const modelSelect = document.getElementById("model");
const systemPromptEl = document.getElementById("system-prompt");
const settingsBtn = document.getElementById("settings-btn");
const settingsEl = document.getElementById("settings");
const resetBtn = document.getElementById("reset-btn");
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");
const previewRow = document.getElementById("preview-row");
const previewsEl = document.getElementById("previews");

const DEFAULT_PROMPT =
  "You are a helpful, intelligent AI assistant.\n- Be concise but thorough.\n- Format long answers with markdown (headings, lists, code blocks).\n- If unsure or the request is ambiguous, ask a clarifying question.";

systemPromptEl.placeholder = DEFAULT_PROMPT;

let sessionId = null;
let busy = false;
let attachments = [];

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addMessage(text, role) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.innerHTML =
    role === "assistant" ? marked.parse(escapeHtml(text)) : escapeHtml(text);
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

function addUserMessage(text) {
  const el = document.createElement("div");
  el.className = "msg user";
  if (attachments.length) {
    const wrap = document.createElement("div");
    wrap.className = "attachments";
    for (const att of attachments) {
      const img = document.createElement("img");
      img.src = att.dataUrl;
      img.alt = att.name;
      img.className = "attach-img";
      wrap.appendChild(img);
    }
    el.appendChild(wrap);
  }
  if (text) {
    const p = document.createElement("div");
    p.textContent = text;
    el.appendChild(p);
  }
  chatEl.appendChild(el);
  chatEl.scrollTop = chatEl.scrollHeight;
  return el;
}

function addPreview(att) {
  const thumb = document.createElement("div");
  thumb.className = "preview";
  const img = document.createElement("img");
  img.src = att.dataUrl;
  img.alt = att.name;
  const rmBtn = document.createElement("button");
  rmBtn.type = "button";
  rmBtn.title = "Remove";
  rmBtn.textContent = "\u00d7";
  rmBtn.addEventListener("click", () => {
    attachments = attachments.filter((a) => a.id !== att.id);
    thumb.remove();
    if (attachments.length === 0) previewRow.classList.add("hidden");
  });
  thumb.appendChild(img);
  thumb.appendChild(rmBtn);
  previewsEl.appendChild(thumb);
  previewRow.classList.remove("hidden");
}

function clearAttachments() {
  attachments = [];
  previewsEl.innerHTML = "";
  previewRow.classList.add("hidden");
}

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  for (const file of fileInput.files) {
    if (!file.type.startsWith("image/")) continue;
    const reader = new FileReader();
    reader.onload = (e) => {
      const att = {
        id: crypto.randomUUID(),
        name: file.name,
        dataUrl: e.target.result,
      };
      attachments.push(att);
      addPreview(att);
    };
    reader.readAsDataURL(file);
  }
  fileInput.value = "";
});

async function sendMessage() {
  const message = chatInput.value.trim();
  if ((!message && attachments.length === 0) || busy) return;

  const pendingAttachments = attachments;
  addUserMessage(message);
  chatInput.value = "";
  clearAttachments();
  busy = true;
  sendBtn.disabled = true;

  const assistantEl = document.createElement("div");
  assistantEl.className = "msg assistant typing";
  assistantEl.textContent = "Thinking...";
  chatEl.appendChild(assistantEl);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message,
        attachments: pendingAttachments.map((a) => ({ dataUrl: a.dataUrl })),
        model: modelSelect.value,
        systemPrompt: systemPromptEl.value.trim() || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      assistantEl.textContent = data.error || "Something went wrong.";
      return;
    }

    assistantEl.classList.remove("typing");
    assistantEl.textContent = "";
    let text = "";

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop();
      for (const evt of events) {
        for (const line of evt.split("\n")) {
          if (!line.startsWith("data:")) continue;
          let json;
          try {
            json = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (json.delta) {
            text += json.delta;
            assistantEl.innerHTML = marked.parse(escapeHtml(text));
            chatEl.scrollTop = chatEl.scrollHeight;
          } else if (json.done) {
            sessionId = json.sessionId;
          } else if (json.error) {
            assistantEl.textContent = "Error: " + json.error;
          }
        }
      }
    }
  } catch (err) {
    assistantEl.textContent = "Network error. Is the server running?";
  } finally {
    busy = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage();
});

settingsBtn.addEventListener("click", () => {
  settingsEl.classList.toggle("hidden");
});

resetBtn.addEventListener("click", async () => {
  if (sessionId) {
    await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
  }
  sessionId = null;
  chatEl.innerHTML = "";
  chatInput.focus();
});
