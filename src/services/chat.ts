import { Mode } from '../types';

export const DEFAULT_BACKEND_URL = "https://voxmate-api.crypdigi51.workers.dev";
export const DEFAULT_RATE = 0.95;

export function resolveTargetUrl(rawBackendUrl: string): string {
  const cleanUrl = rawBackendUrl ? rawBackendUrl.trim().replace(/\/+$/, "") : "";
  // In development/preview (outside GitHub Pages), route the Cloudflare Worker through the local Vite proxy
  if (
    typeof window !== "undefined" &&
    window.location.origin !== "https://earnygoated.github.io" &&
    (cleanUrl === DEFAULT_BACKEND_URL || cleanUrl.includes("voxmate-api.crypdigi51.workers.dev"))
  ) {
    return "/worker-proxy";
  }
  return cleanUrl;
}

export function sanitizeError(msg: any): string {
  if (!msg) return "Unknown error";
  const str = typeof msg === "string" ? msg : typeof msg.message === "string" ? msg.message : JSON.stringify(msg);
  return str
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_KEY]")
    .replace(/(?:key|access[-_]?code|token)=([^\s&]+)/gi, "$1=[REDACTED]")
    .slice(0, 300);
}

export function demoReply(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("interview")) {
    return "Let's practise. Imagine I'm the hiring manager: “Could you briefly introduce yourself and explain why you're interested in this role?” Answer in your own words, and then we'll improve it together.<feedback>Sample answer structure:\n1. 15-second summary of your experience.\n2. Key skill matched to the role.\n3. Enthusiasm for the company mission.</feedback>";
  }
  if (t.includes("linkedin")) {
    return "I can help draft a LinkedIn post. Let's describe the problem, what you built, which tools you used, and what you learned. What features have you actually tested so far?<feedback>Tip: Keep the opening line punchy without buzzwords. Share real numbers or real challenges you overcame.</feedback>";
  }
  if (t.includes("email")) {
    return "I can draft a professional email. Who is it for, what do you need to communicate, and what tone should it have? I'll prepare a draft for your approval—not send it.<feedback>Tip: Start with a clear subject line and put the core request or call to action in the first two sentences.</feedback>";
  }
  if (t.includes("hello") || t === "hi") {
    return "Hello! Would you like to practise workplace English, prepare for an interview, role-play a client call, or plan your day?";
  }
  if (t.includes("practice") || t.includes("speak")) {
    return "Let's start with one question: “Tell me about a time you helped a customer or solved a problem at work.” Speak for 30–60 seconds. Then we can improve your answer.<feedback>Tip: Use the STAR method (Situation, Task, Action, Result) to keep your story structured.</feedback>";
  }
  return "Demo mode is active. I can guide you through built-in practice prompts, but open-ended AI replies require a configured backend. Try “Let's practise a job interview” or “Help me draft a LinkedIn post.”";
}

export function cleanFeedback(rawText: string): { spokenText: string; feedbackText?: string } {
  const openMatch = rawText.match(/<feedback>/i);
  if (openMatch && openMatch.index !== undefined) {
    const before = rawText.slice(0, openMatch.index).trim();
    const after = rawText.slice(openMatch.index + openMatch[0].length);
    const closeMatch = after.match(/<\/feedback>/i);
    const feedbackText = (closeMatch ? after.slice(0, closeMatch.index) : after).trim();
    return {
      spokenText: before || "Here are your coaching notes.",
      feedbackText: feedbackText || "No additional coaching notes were returned."
    };
  }
  return {
    spokenText: rawText.replace(/<\/?feedback>/gi, "").trim(),
    feedbackText: undefined
  };
}

export async function checkBackendHealth(rawBackendUrl: string): Promise<{ ok: boolean; message: string }> {
  if (!rawBackendUrl) {
    return { ok: false, message: "Backend not set" };
  }
  const resolved = resolveTargetUrl(rawBackendUrl);
  const target = resolved.startsWith("http") ? `${resolved}/health` : `${resolved}/health`;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(target, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status !== "ok") {
      return { ok: false, message: "Health check failed" };
    }
    return { ok: true, message: "Backend online" };
  } catch (err: any) {
    return { ok: false, message: "Backend unavailable" };
  }
}

export async function sendChatMessage(
  backendUrl: string,
  accessCode: string,
  mode: Mode,
  message: string,
  history: { role: string; text: string }[]
): Promise<string> {
  const cleanBackend = backendUrl ? backendUrl.trim().replace(/\/+$/, "") : "";
  
  // If backend & access code are set, make API call to backend
  if (cleanBackend && accessCode) {
    const resolved = resolveTargetUrl(cleanBackend);
    const endpoint = resolved.startsWith("http") ? `${resolved}/api/chat` : `${resolved}/api/chat`;
    
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VoxMate-Access": accessCode
        },
        body: JSON.stringify({
          mode,
          message,
          history: history.slice(-10)
        })
      });
    } catch (fetchErr: any) {
      throw new Error(`Network failure (${fetchErr.message || "Failed to fetch"})`);
    }

    const rawText = await res.text().catch(() => "");
    let data: any = null;
    try {
      if (rawText) {
        data = JSON.parse(rawText);
      }
    } catch {
      // not valid JSON
    }

    // Distinguish HTTP error statuses (4xx, 5xx)
    if (!res.ok) {
      const serverErr = data?.error || data?.message || rawText;
      const cleanErr = sanitizeError(serverErr);
      throw new Error(`HTTP ${res.status}: ${cleanErr || "Server error"}`);
    }

    // Distinguish HTTP success (2xx) that returned an error object
    if (data && data.error) {
      const cleanErr = sanitizeError(data.error);
      throw new Error(`HTTP ${res.status} returned error: ${cleanErr}`);
    }

    // Check expected 'reply' field as well as alternative text fields
    const replyText =
      data && typeof data.reply === "string" ? data.reply :
      data && typeof data.text === "string" ? data.text :
      data && typeof data.response === "string" ? data.response :
      data && typeof data.message === "string" ? data.message :
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof replyText === "string" && replyText.trim()) {
      return replyText;
    }

    // Detailed safe diagnostics for 2xx with missing/empty text
    if (!rawText.trim()) {
      throw new Error(`HTTP ${res.status} OK returned an empty response body (0 bytes)`);
    }

    if (data === null) {
      const contentType = res.headers.get("content-type") || "unknown";
      const snippet = rawText.replace(/[\r\n\t]/g, " ").slice(0, 60);
      throw new Error(`Endpoint "${endpoint}" returned HTTP ${res.status} (${contentType}): "${snippet}..."`);
    }

    const receivedKeys = Object.keys(data).join(", ");
    throw new Error(
      `HTTP ${res.status} OK returned JSON without reply text (received fields: [${receivedKeys || "none"}])`
    );
  }

  // Fallback to demo reply
  return demoReply(message);
}
