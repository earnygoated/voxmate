// VoxMate Gemini proxy for Cloudflare Workers.
// Configure GEMINI_API_KEY, ACCESS_CODE, and ALLOWED_ORIGIN as Worker secrets/variables.
// Never put the Gemini API key in the public frontend or repository.
function cors(origin, allowedOrigin) {
  const allowed = origin === allowedOrigin;
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-VoxMate-Access",
    "Vary": "Origin"
  };
}
function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {})
  });
}
function systemPrompt(mode) {
  const base = "You are VoxMate, a warm and practical voice assistant. Keep replies concise and easy to speak aloud. Ask at most one follow-up question at a time. Never claim you sent messages, submitted applications, published content, or performed external actions. Never ask for passwords or secret keys.";
  if (mode === "assistant") return base + " Mode: personal assistant. Help plan, brainstorm, and draft. Do not correct English unless asked. Draft emails and posts for user review; do not send or publish.";
  if (mode === "interview") return base + " Mode: job interview coach. Ask one realistic question at a time. After the user's answer, provide a conversational reply and concise feedback with one strength, one improvement, a stronger sample answer, and one next question. Put the feedback in <feedback>...</feedback> tags.";
  if (mode === "client") return base + " Mode: international client role-play. Play a realistic client, continue the role-play naturally, then provide concise feedback on clarity and professionalism inside <feedback>...</feedback> tags.";
  return base + " Mode: professional English communication coach. Aim for 70% practice and 30% feedback. Continue the conversation naturally, ask one useful follow-up, and provide concise correction if needed, a natural professional alternative, and one tip inside <feedback>...</feedback> tags. Do not overcorrect acceptable English or claim to grade accent from a transcript.";
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "";
    const headers = cors(origin, allowedOrigin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    // Public liveness check: reveals no secrets and does not call Gemini.
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok", service: "voxmate-api" }, 200, headers);
    }
    if (!allowedOrigin || origin !== allowedOrigin) return json({ error: "This VoxMate origin is not allowed by the backend configuration." }, 403, headers);
    if (request.method !== "POST" || url.pathname !== "/api/chat") return json({ error: "Use POST /api/chat." }, 404, headers);
    if (!env.GEMINI_API_KEY || !env.ACCESS_CODE) return json({ error: "Backend secrets are not configured." }, 503, headers);
    if (request.headers.get("X-VoxMate-Access") !== env.ACCESS_CODE) return json({ error: "Access code is missing or incorrect." }, 401, headers);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400, headers); }
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const mode = ["coach", "assistant", "interview", "client"].includes(body.mode) ? body.mode : "coach";
    if (!message) return json({ error: "Message is required." }, 400, headers);
    if (message.length > 3000) return json({ error: "Message is too long (maximum 3000 characters)." }, 413, headers);
    const prior = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const contents = prior.filter(x => x && ["user", "assistant"].includes(x.role) && typeof x.text === "string")
      .map(x => ({ role: x.role === "assistant" ? "model" : "user", parts: [{ text: x.text.slice(0, 3000) }] }));
    if (!contents.length || contents[contents.length - 1].role !== "user" || contents[contents.length - 1].parts[0].text !== message) {
      contents.push({ role: "user", parts: [{ text: message }] });
    }
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt(mode) }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 700 }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Gemini's structured error message helps diagnose invalid requests.
        // Never log API keys, request headers, prompts, or full upstream payloads.
        const upstreamMessage = data && data.error && typeof data.error.message === "string"
          ? data.error.message.slice(0, 500) : "";
        const upstreamStatus = data && data.error && typeof data.error.status === "string"
          ? data.error.status.slice(0, 80) : "";
        console.error("Gemini API request failed", {
          status: response.status,
          upstreamStatus,
          message: upstreamMessage
        });
        if (response.status === 429) return json({ error: "Gemini HTTP 429: quota or rate limit reached. " + (upstreamMessage || "Wait and check API usage.") }, 429, headers);
        return json({ error: "Gemini HTTP " + response.status + (upstreamMessage ? ": " + upstreamMessage : ": check API key/project access, model availability, and request format.") }, 502, headers);
      }
      const reply = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
        ? data.candidates[0].content.parts.map(x => x.text || "").join("").trim() : "";
      // Safe diagnostics only: do not log prompts, replies, API keys, or request headers.
      console.info("VoxMate Gemini result", {
        upstreamStatus: response.status,
        upstreamOk: response.ok,
        hasText: Boolean(reply)
      });
      if (!reply) return json({ error: "The AI returned no text. Try a shorter message." }, 502, headers);
      return json({ reply: reply }, 200, headers);
    } catch (err) {
      return json({ error: "Could not reach the AI service. Check internet connectivity and try again." }, 502, headers);
    }
  }
};
