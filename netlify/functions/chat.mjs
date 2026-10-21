// OZ Assistant chat endpoint. Runs on Netlify, never in the visitor's browser,
// so the OpenAI key (set as the OPENAI_API_KEY environment variable in Netlify) stays private.
import { OZ_PROMPT } from "./oz-prompt.mjs";

const MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const MAX_TURNS = 10;          // most recent messages sent to the model
const MAX_CHARS = 800;         // longest message a visitor can send
const ALLOWED_HOSTS = ["ozintelpro.com", "www.ozintelpro.com", "ozintelpro.netlify.app", "localhost"];

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  // Only answer requests coming from our own site.
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  let host = "";
  try { host = new URL(origin).hostname; } catch (_) {}
  if (!ALLOWED_HOSTS.includes(host) && !host.endsWith("--ozintelpro.netlify.app")) {
    return json(403, { error: "Not allowed." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return json(500, { error: "The assistant isn't set up yet. Please email info@ozintelpro.com." });
  }

  let body;
  try { body = await req.json(); } catch (_) { return json(400, { error: "Bad request." }); }

  const history = Array.isArray(body.messages) ? body.messages : [];
  const input = history
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_TURNS)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  if (!input.length || input[input.length - 1].role !== "user" || !input[input.length - 1].content.trim()) {
    return json(400, { error: "Please type a question." });
  }

  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: OZ_PROMPT,
        input,
        max_output_tokens: 600,
        store: false,
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const busy = r.status === 429;
      console.error("OpenAI error", r.status, data && data.error && data.error.message);
      return json(busy ? 429 : 502, {
        error: busy
          ? "The assistant is busy right now. Please try again in a minute, or email info@ozintelpro.com."
          : "The assistant couldn't answer just now. Please try again, or email info@ozintelpro.com.",
      });
    }

    let text = data.output_text || "";
    if (!text && Array.isArray(data.output)) {
      text = data.output
        .filter(o => o.type === "message")
        .flatMap(o => o.content || [])
        .filter(c => c.type === "output_text" && c.text)
        .map(c => c.text)
        .join("\n")
        .trim();
    }
    if (!text) text = "Sorry, I couldn't come up with an answer. Please email info@ozintelpro.com.";
    return json(200, { reply: text });
  } catch (err) {
    console.error(err);
    return json(502, { error: "The assistant couldn't answer just now. Please try again, or email info@ozintelpro.com." });
  }
};

export const config = { path: "/api/chat" };
