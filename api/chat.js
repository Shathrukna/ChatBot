import crypto from "node:crypto";
import { streamDeltas, getApiKey } from "../lib/openrouter.js";
import {
  getSession,
  buildMessages,
  buildUserContent,
} from "../lib/sessions.js";

function readBody(req) {
  if (req.body !== undefined && typeof req.body !== "function") {
    return Promise.resolve(req.body);
  }
  if (typeof req.json === "function") {
    return req.json().catch(() => null);
  }
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await readBody(req);
  const { sessionId, message, model, systemPrompt, attachments } = body || {};

  if (!message && (!attachments || attachments.length === 0)) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!getApiKey()) {
    return new Response(
      JSON.stringify({ error: "Server is missing OPENROUTER_API_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const id = sessionId || crypto.randomUUID();
  const session = getSession(id);
  if (systemPrompt && systemPrompt.trim()) {
    session.systemPrompt = systemPrompt.trim();
  }

  session.history.push({ role: "user", content: buildUserContent(message, attachments) });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      try {
        for await (const delta of streamDeltas({
          model,
          messages: buildMessages(session),
        })) {
          fullText += delta;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`)
          );
        }
        session.history.push({ role: "assistant", content: fullText });
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, sessionId: id })}\n\n`)
        );
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`)
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
