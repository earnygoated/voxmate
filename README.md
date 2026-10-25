# VoxMate — Voice Coach & Personal Assistant

VoxMate is a mobile-first voice assistant prototype designed to help users practise professional English, prepare for interviews, role-play client conversations, and draft everyday work content. It is intended to work in supported desktop and Android browsers.

## Current frontend features

- Responsive interface for mobile and desktop
- Browser speech recognition where supported
- Spoken responses using device/browser text-to-speech
- Communication Coach, Job Interview, International Client, and Personal Assistant modes
- Typed input fallback
- Built-in demo mode with no API key
- Optional Gemini connection through a separate Cloudflare Worker backend
- No Gemini API key in frontend code

## Publish the frontend

1. Open repository Settings.
2. Select Pages.
3. Choose Deploy from a branch, select main and /(root), then save.
4. Open the published site on Android Chrome or desktop Chrome.
5. Allow microphone access if prompted. If voice input is unavailable, use the text box.
6. Without a backend URL, the app runs in demo mode. This tests the interface and browser voice features but does not provide open-ended AI answers.

## Optional Gemini backend

The Worker code is in worker.js. Do not paste the Gemini API key into this repository.

1. Create a Cloudflare Worker in your own account.
2. Add Worker secrets named GEMINI_API_KEY and ACCESS_CODE.
3. Add a Worker variable ALLOWED_ORIGIN equal to https://earnygoated.github.io (the origin has no repository path).
4. Deploy the Worker. It expects POST /api/chat.
5. In VoxMate Settings, enter the Worker URL and the same private access code.
6. Test with a non-sensitive message.

Optional Worker variable: `GEMINI_MODEL`. If it is not set, the Worker uses `gemini-3.8-flash`. Set it only if you need a different model (for example, if Google retires a model name). The older `gemini-3.5-flash` name is deprecated by Google.

The Worker also: sends the API key in a request header (never in a URL), repairs malformed chat history before calling Gemini, stops waiting for Gemini after 25 seconds, and applies a best-effort limit of 60 requests per 10 minutes per client address. That limit is per Worker instance, so it reduces accidental loops and casual abuse but is not a hard quota.

**Important: the Worker does not update automatically from GitHub.** After changing `worker.js`, open the Worker in the Cloudflare dashboard, choose Edit code, paste the full contents of `worker.js`, and click Deploy. Your secrets stay as they are.

Run the automated checks locally with `node --test tests/worker.test.mjs tests/frontend.test.mjs` (Node 20 or newer). They use a pretend Gemini, so no key is needed.

Use a long, random ACCESS_CODE and keep it private. It is an extra barrier, not a full account system. CORS is not authentication by itself. A public Worker endpoint can still be called outside the browser if someone obtains the access code. Before sharing the AI-enabled endpoint widely, add rate limiting or abuse protection and monitor quotas.

Gemini API access is separate from a Gemini consumer subscription. Check current free-tier availability, limits, and data-use terms before enabling it. Do not configure billing if the requirement is strict zero spending.

## Privacy and limitations

- Do not enter passwords, recovery codes, sensitive client/employer information, or confidential documents. Google's Gemini API free tier may use submitted content to improve Google products; check the current terms and avoid sending private or sensitive content.
- When backend mode is enabled, conversation text is sent through the Worker to the Gemini API.
- Browser speech recognition varies by device and may rely on online services. Text-to-speech voices vary by device.
- A transcript cannot reliably measure accent, intonation, or physical pronunciation. Feedback focuses on word choice, grammar, clarity, and communication structure.
- This is a prototype. Verify it on your actual laptop and phone before describing it as fully working or production-ready.

## Project files

- index.html — app interface and browser-side logic
- worker.js — optional server-side Gemini proxy
- manifest.webmanifest — installation metadata
- sw.js — service worker (network first for the app's own files; never caches the backend)
- tests/ — automated tests for the Worker and the coaching-feedback parser
- README.md — setup, security, privacy, and limitations
