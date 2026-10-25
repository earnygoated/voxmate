// VoxMate Gemini proxy for Cloudflare Workers.
// Required secrets/variables (names unchanged): GEMINI_API_KEY, ACCESS_CODE, ALLOWED_ORIGIN.
// Optional variable: GEMINI_MODEL (overrides DEFAULT_MODEL without editing code).
// Never put the Gemini API key in the public frontend or repository.

const DEFAULT_MODEL = "gemini-3.8-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const UPSTREAM_TIMEOUT_MS = 25000;
const MAX_MESSAGE_CHARS = 3000;
const MAX_BODY_CHARS = 40000;
const MAX_HISTORY_TURNS = 10;
const MAX_OUTPUT_TOKENS = 2048;
// Best-effort limit per client IP. Each Worker instance keeps its own counter, so this slows
// accidental loops and casual abuse; it is not a hard global quota.
const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 60 };
const hits = new Map();

function cors(origin, allowedOrigin) {
  const allowed = Boolean(allowedOrigin) && origin === allowedOrigin;
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-VoxMate-Access",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, headers || {})
  });
}

// Compares strings without exiting early on the first mismatch.
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function rateLimited(key) {
  const now = Date.now();
  if (hits.size > 500) {
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }
  let entry = hits.get(key);
  if (!entry || entry.reset <= now) {
    entry = { count: 0, reset: now + RATE_LIMIT.windowMs };
    hits.set(key, entry);
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT.max;
}

function systemPrompt(mode) {
  const base = "You are VoxMate, a warm and practical voice assistant. Keep replies concise and easy to speak aloud. Ask at most one follow-up question at a time. Never claim you sent messages, submitted applications, published content, or performed external actions. Never ask for passwords or secret keys.";
  if (mode === "assistant") return base + " Mode: personal assistant. Help plan, brainstorm, and draft. Do not correct English unless asked. Draft emails and posts for user review; do not send or publish.";
  if (mode === "interview") return base + " Mode: job interview coach. Ask one realistic question at a time. After the user's answer, provide a conversational reply and concise feedback with one strength, one improvement, a stronger sample answer, and one next question. Put the feedback in <feedback>...</feedback> tags.";
  if (mode === "client") return base + " Mode: international client role-play. Play a realistic client, continue the role-play naturally, then provide concise feedback on clarity and professionalism inside <feedback>...</feedback> tags.";
  return base + " Mode: professional English communication coach. Aim for 70% practice and 30% feedback. Continue the conversation naturally, ask one useful follow-up, and provide concise correction if needed, a natural professional alternative, and one tip inside <feedback>...</feedback> tags. Do not overcorrect acceptable English or claim to grade accent from a transcript.";
}

// Builds a valid Gemini "contents" array: roles are only user/model, strictly alternating,
// starting and ending with a user turn. Malformed history is repaired instead of sent upstream.
function buildContents(history, message) {
  let turns = [];
  const raw = Array.isArray(history) ? history.slice(-MAX_HISTORY_TURNS - 2) : [];
  for (const item of raw) {
    if (!item || (item.role !== "user" && item.role !== "assistant") || typeof item.text !== "string") continue;
    const text = item.text.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!text) continue;
    turns.push({ role: item.role === "assistant" ? "model" : "user", text });
  }
  // The browser already includes the newest user message in history; avoid sending it twice.
  if (turns.length && turns[turns.length - 1].role === "user" && turns[turns.length - 1].text === message) turns.pop();
  turns.push({ role: "user", text: message });
  // Merge consecutive turns from the same speaker (for example after a failed earlier request).
  const merged = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) last.text = (last.text + "\n\n" + turn.text).slice(0, MAX_MESSAGE_CHARS * 2);
    else merged.push({ role: turn.role, text: turn.text });
  }
  turns = merged.slice(-MAX_HISTORY_TURNS);
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns.map(t => ({ role: t.role, parts: [{ text: t.text }] }));
}

function scrub(text) {
  return String(text || "").replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]").slice(0, 300);
}

function upstreamError(status, upstreamMessage) {
  const detail = scrub(upstreamMessage);
  const suffix = detail ? " Details: " + detail : "";
  if (status === 429) return { status: 429, error: "Gemini HTTP 429: quota or rate limit reached. Wait a minute or check API usage." + suffix };
  if (status === 400 && /api key/i.test(detail)) return { status: 502, error: "Gemini HTTP 400: the API key was rejected. Check the GEMINI_API_KEY secret." + suffix };
  if (status === 400) return { status: 502, error: "Gemini HTTP 400: the request was rejected." + suffix };
  if (status === 401 || status === 403) return { status: 502, error: "Gemini HTTP " + status + ": the API key or project does not have access to this model." + suffix };
  if (status === 404) return { status: 502, error: "Gemini HTTP 404: model not found. Set the GEMINI_MODEL variable to an available model." + suffix };
  if (status >= 500) return { status: 502, error: "Gemini HTTP " + status + ": the AI service is temporarily unavailable. Try again shortly." + suffix };
  return { status: 502, error: "Gemini HTTP " + status + ": unexpected response." + suffix };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "";
    const headers = cors(origin, allowedOrigin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    // Public liveness check: reveals no secrets, needs no secret, and never calls Gemini.
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok", service: "voxmate-api" }, 200, headers);
    }
    if (!allowedOrigin || origin !== allowedOrigin) return json({ error: "This VoxMate origin is not allowed by the backend configuration." }, 403, headers);
    if (url.pathname !== "/api/chat") return json({ error: "Not found. Use POST /api/chat." }, 404, headers);
    if (request.method !== "POST") return json({ error: "Use POST /api/chat." }, 405, headers);
    if (!env.GEMINI_API_KEY || !env.ACCESS_CODE) return json({ error: "Backend secrets are not configured." }, 503, headers);
    // Counted before the access check so repeated wrong guesses are also slowed down.
    if (rateLimited(request.headers.get("CF-Connecting-IP") || "unknown")) {
      return json({ error: "Too many requests. Please wait a few minutes and try again." }, 429, headers);
    }
    if (!safeEqual(request.headers.get("X-VoxMate-Access") || "", env.ACCESS_CODE)) return json({ error: "Access code is missing or incorrect." }, 401, headers);

    let body;
    try {
      const rawBody = await request.text();
      if (rawBody.length > MAX_BODY_CHARS) return json({ error: "Request is too large." }, 413, headers);
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON request." }, 400, headers);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid JSON request." }, 400, headers);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const mode = ["coach", "assistant", "interview", "client"].includes(body.mode) ? body.mode : "coach";
    if (!message) return json({ error: "Message is required." }, 400, headers);
    if (message.length > MAX_MESSAGE_CHARS) return json({ error: "Message is too long (maximum " + MAX_MESSAGE_CHARS + " characters)." }, 413, headers);

    const contents = buildContents(body.history, message);
    const model = /^[A-Za-z0-9._-]{3,60}$/.test(env.GEMINI_MODEL || "") ? env.GEMINI_MODEL : DEFAULT_MODEL;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      // The API key travels in a header, not in the URL, so it cannot leak through URL logs.
      const response = await fetch(GEMINI_BASE + model + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt(mode) }] },
          contents,
          // Gemini 3.x guidance is to omit temperature/top_p/top_k. The output limit is generous
          // because "thinking" models can spend part of it before writing the visible reply.
          generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const upstreamMessage = data && data.error && typeof data.error.message === "string" ? data.error.message : "";
        const upstreamStatus = data && data.error && typeof data.error.status === "string" ? data.error.status.slice(0, 80) : "";
        // Safe diagnostics only: never log keys, access codes, headers, prompts or replies.
        console.error("Gemini API request failed", { model, status: response.status, upstreamStatus, message: scrub(upstreamMessage) });
        const mapped = upstreamError(response.status, upstreamMessage);
        return json({ error: mapped.error }, mapped.status, headers);
      }
      const candidate = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
      const parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
      const reply = parts.filter(p => p && !p.thought).map(p => (typeof p.text === "string" ? p.text : "")).join("").trim();
      const finishReason = candidate && typeof candidate.finishReason === "string" ? candidate.finishReason.slice(0, 40) : "";
      const blockReason = data && data.promptFeedback && typeof data.promptFeedback.blockReason === "string" ? data.promptFeedback.blockReason.slice(0, 40) : "";
      console.info("VoxMate Gemini result", { model, upstreamStatus: response.status, hasText: Boolean(reply), finishReason, blockReason });
      if (!reply) {
        if (blockReason) return json({ error: "The AI declined this request (" + blockReason + "). Try rephrasing." }, 422, headers);
        if (finishReason === "MAX_TOKENS") return json({ error: "The AI ran out of space before replying. Try a shorter message." }, 502, headers);
        return json({ error: "The AI returned no text" + (finishReason ? " (" + finishReason + ")" : "") + ". Try again or shorten your message." }, 502, headers);
      }
      return json({ reply }, 200, headers);
    } catch (err) {
      const timedOut = err && err.name === "AbortError";
      console.error("Gemini request did not complete", { model, timedOut });
      return json({ error: timedOut ? "The AI took too long to respond. Please try again." : "Could not reach the AI service. Please try again." }, 502, headers);
    } finally {
      clearTimeout(timer);
    }
  }
};
