import { deleteSession } from "../lib/sessions.js";

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
  const { sessionId } = body || {};
  if (sessionId) deleteSession(sessionId);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
