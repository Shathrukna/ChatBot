import express from "express";
import crypto from "node:crypto";
import { streamDeltas, getApiKey } from "./lib/openrouter.js";
import {
  getSession,
  deleteSession,
  buildMessages,
  buildUserContent,
} from "./lib/sessions.js";

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(express.static("public"));

function sendSSE(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

app.post("/api/chat", async (req, res) => {
  const { sessionId, message, model, systemPrompt, attachments } = req.body;
  if (!message && (!attachments || attachments.length === 0)) {
    return res.status(400).json({ error: "message is required" });
  }
  if (!getApiKey()) {
    return res
      .status(500)
      .json({ error: "Server is missing OPENROUTER_API_KEY" });
  }

  const id = sessionId || crypto.randomUUID();
  const session = getSession(id);
  if (systemPrompt && systemPrompt.trim()) {
    session.systemPrompt = systemPrompt.trim();
  }

  session.history.push({ role: "user", content: buildUserContent(message, attachments) });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let fullText = "";
  try {
    for await (const delta of streamDeltas({
      model,
      messages: buildMessages(session),
    })) {
      fullText += delta;
      sendSSE(res, { delta });
    }

    session.history.push({ role: "assistant", content: fullText });
    sendSSE(res, { done: true, sessionId: id });
    res.end();
  } catch (err) {
    console.error(err);
    sendSSE(res, { error: err.message });
    res.end();
  }
});

app.post("/api/reset", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) deleteSession(sessionId);
  res.json({ ok: true });
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`OpenChat running at http://localhost:${PORT}`);
  });
}

export default app;
