// Run with: node --test tests/
// Uses a mocked Gemini, so no API key, network access or quota is needed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "voxmate-"));
fs.copyFileSync(path.join(root, "worker.js"), path.join(tmp, "worker.mjs"));
const worker = (await import(pathToFileURL(path.join(tmp, "worker.mjs")).href)).default;

const ORIGIN = "https://example.github.io";
const ENV = { GEMINI_API_KEY: "TEST_KEY_NOT_REAL", ACCESS_CODE: "test-access-code", ALLOWED_ORIGIN: ORIGIN };
let ipCounter = 0;

function chat(body, opts = {}) {
  const headers = Object.assign({
    "Content-Type": "application/json",
    "Origin": ORIGIN,
    "X-VoxMate-Access": ENV.ACCESS_CODE,
    "CF-Connecting-IP": "10.0.0." + (++ipCounter)
  }, opts.headers || {});
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return worker.fetch(new Request("https://api.test/api/chat", { method: "POST", headers, body: raw }), opts.env || ENV);
}

function mockGemini(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    return handler(calls[calls.length - 1]);
  };
  return { calls, restore() { globalThis.fetch = original; } };
}
const ok = text => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }), { status: 200 });
const err = (status, message, st = "X") => new Response(JSON.stringify({ error: { message, status: st } }), { status });

test("health works without secrets and without calling Gemini", async () => {
  const m = mockGemini(() => { throw new Error("must not be called"); });
  try {
    const res = await worker.fetch(new Request("https://api.test/health", { headers: { Origin: ORIGIN } }), {});
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok", service: "voxmate-api" });
    assert.equal(m.calls.length, 0);
  } finally { m.restore(); }
});

test("missing and wrong access codes are rejected", async () => {
  const m = mockGemini(() => ok("x"));
  try {
    assert.equal((await chat({ message: "hi" }, { headers: { "X-VoxMate-Access": "" } })).status, 401);
    assert.equal((await chat({ message: "hi" }, { headers: { "X-VoxMate-Access": "wrong" } })).status, 401);
    assert.equal(m.calls.length, 0);
  } finally { m.restore(); }
});

test("disallowed or missing origin cannot use chat", async () => {
  const m = mockGemini(() => ok("x"));
  try {
    assert.equal((await chat({ message: "hi" }, { headers: { Origin: "https://evil.example" } })).status, 403);
    assert.equal((await chat({ message: "hi" }, { headers: { Origin: "" } })).status, 403);
    assert.equal(m.calls.length, 0);
  } finally { m.restore(); }
});

test("invalid JSON, non-object JSON and empty messages are rejected", async () => {
  const m = mockGemini(() => ok("x"));
  try {
    assert.equal((await chat("{not json")).status, 400);
    assert.equal((await chat("[1,2]")).status, 400);
    assert.equal((await chat({ message: "   " })).status, 400);
    assert.equal((await chat({ message: "x".repeat(3001) })).status, 413);
    assert.equal(m.calls.length, 0);
  } finally { m.restore(); }
});

test("missing backend secrets give a 503", async () => {
  const res = await chat({ message: "hi" }, { env: { ALLOWED_ORIGIN: ORIGIN } });
  assert.equal(res.status, 503);
});

test("valid request returns the reply; key is sent in a header, not the URL", async () => {
  const m = mockGemini(() => ok("Hello there"));
  try {
    const res = await chat({ message: "hi", mode: "coach", history: [] });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { reply: "Hello there" });
    const call = m.calls[0];
    assert.ok(!call.url.includes("TEST_KEY_NOT_REAL"));
    assert.ok(!call.url.includes("key="));
    assert.equal(call.init.headers["x-goog-api-key"], "TEST_KEY_NOT_REAL");
    assert.ok(call.url.includes("gemini-3.8-flash:generateContent"));
    assert.equal(call.body.generationConfig.temperature, undefined);
  } finally { m.restore(); }
});

test("GEMINI_MODEL overrides the default; invalid values are ignored", async () => {
  const m = mockGemini(() => ok("x"));
  try {
    await chat({ message: "hi" }, { env: Object.assign({}, ENV, { GEMINI_MODEL: "gemini-3.5-flash" }) });
    await chat({ message: "hi" }, { env: Object.assign({}, ENV, { GEMINI_MODEL: "bad/model?x=1" }) });
    assert.ok(m.calls[0].url.includes("/gemini-3.5-flash:generateContent"));
    assert.ok(m.calls[1].url.includes("/gemini-3.8-flash:generateContent"));
  } finally { m.restore(); }
});

test("history is repaired: valid roles, alternating, starts and ends with user, no duplicate message", async () => {
  const m = mockGemini(() => ok("x"));
  try {
    const history = [
      { role: "assistant", text: "orphan model turn" },       // leading model turn must be dropped
      { role: "user", text: "first failed question" },         // two user turns in a row (earlier failure)
      { role: "user", text: "second question" },
      { role: "assistant", text: "answer" },
      { role: "system", text: "ignored role" },
      { role: "user", text: "" },                              // empty ignored
      { role: "user", text: 42 },                              // wrong type ignored
      null,
      { role: "user", text: "current question" }               // same as message: must not be duplicated
    ];
    await chat({ message: "current question", history });
    const contents = m.calls[0].body.contents;
    assert.equal(contents[0].role, "user");
    assert.equal(contents[contents.length - 1].role, "user");
    for (let i = 1; i < contents.length; i++) assert.notEqual(contents[i].role, contents[i - 1].role);
    assert.deepEqual(contents.map(c => c.role), ["user", "model", "user"]);
    assert.ok(contents[0].parts[0].text.includes("first failed question"));
    assert.ok(contents[0].parts[0].text.includes("second question"));
    assert.equal(contents[2].parts[0].text, "current question");
    assert.ok(!JSON.stringify(contents).includes("orphan model turn"));
  } finally { m.restore(); }
});

test("very long history is trimmed and still valid", async () => {
  const m = mockGemini(() => ok("x"));
  try {
    const history = [];
    for (let i = 0; i < 100; i++) history.push({ role: i % 2 ? "assistant" : "user", text: "turn " + i });
    await chat({ message: "now", history });
    const contents = m.calls[0].body.contents;
    assert.ok(contents.length <= 10);
    assert.equal(contents[0].role, "user");
    assert.equal(contents[contents.length - 1].role, "user");
  } finally { m.restore(); }
});

test("Gemini HTTP 400 is reported with a safe, useful message", async () => {
  const m = mockGemini(() => err(400, "Invalid value at 'contents[0]'", "INVALID_ARGUMENT"));
  try {
    const res = await chat({ message: "hi" });
    const data = await res.json();
    assert.equal(res.status, 502);
    assert.match(data.error, /Gemini HTTP 400/);
    assert.match(data.error, /Invalid value/);
  } finally { m.restore(); }
});

test("Gemini 400 'API key not valid' points at the key and never leaks it", async () => {
  const fakeKey = "AI" + "zaSy" + "F".repeat(33); // built at runtime so scanners do not mistake it for a real key
  const m = mockGemini(() => err(400, "API key not valid. Please pass a valid API key. " + fakeKey, "INVALID_ARGUMENT"));
  try {
    const data = await (await chat({ message: "hi" })).json();
    assert.match(data.error, /API key was rejected/);
    assert.ok(!data.error.includes(fakeKey));
  } finally { m.restore(); }
});

test("Gemini 429, 404 and 5xx are classified", async () => {
  for (const [status, pattern, expected] of [[429, /quota or rate limit/, 429], [404, /model not found/, 502], [503, /temporarily unavailable/, 502], [403, /does not have access/, 502]]) {
    const m = mockGemini(() => err(status, "upstream says no"));
    try {
      const res = await chat({ message: "hi" });
      assert.equal(res.status, expected);
      assert.match((await res.json()).error, pattern);
    } finally { m.restore(); }
  }
});

test("network failure and timeout produce friendly errors", async () => {
  let m = mockGemini(() => { throw new TypeError("network down"); });
  try {
    const res = await chat({ message: "hi" });
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /Could not reach/);
  } finally { m.restore(); }
  m = mockGemini(() => { const e = new Error("aborted"); e.name = "AbortError"; throw e; });
  try {
    assert.match((await (await chat({ message: "hi" })).json()).error, /took too long/);
  } finally { m.restore(); }
});

test("empty, blocked and truncated AI responses do not crash", async () => {
  const cases = [
    [new Response(JSON.stringify({}), { status: 200 }), /returned no text/],
    [new Response(JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }), { status: 200 }), /ran out of space/],
    [new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 }), /declined/],
    [new Response("not json at all", { status: 200 }), /returned no text/]
  ];
  for (const [response, pattern] of cases) {
    const m = mockGemini(() => response);
    try {
      const res = await chat({ message: "hi" });
      assert.ok(res.status >= 400);
      assert.match((await res.json()).error, pattern);
    } finally { m.restore(); }
  }
});

test("hidden 'thought' parts are not returned to the user", async () => {
  const m = mockGemini(() => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "secret reasoning", thought: true }, { text: "Visible answer" }] } }] }), { status: 200 }));
  try {
    assert.deepEqual(await (await chat({ message: "hi" })).json(), { reply: "Visible answer" });
  } finally { m.restore(); }
});

test("rate limit triggers after repeated requests from one IP", async () => {
  const m = mockGemini(() => ok("x"));
  try {
    let last;
    for (let i = 0; i < 62; i++) last = await chat({ message: "hi" }, { headers: { "CF-Connecting-IP": "203.0.113.99" } });
    assert.equal(last.status, 429);
  } finally { m.restore(); }
});

test("wrong method or path is refused", async () => {
  const get = await worker.fetch(new Request("https://api.test/api/chat", { method: "GET", headers: { Origin: ORIGIN } }), ENV);
  assert.equal(get.status, 405);
  const other = await worker.fetch(new Request("https://api.test/other", { method: "POST", headers: { Origin: ORIGIN } }), ENV);
  assert.equal(other.status, 404);
});

test("preflight succeeds and only allows the configured origin", async () => {
  const ok1 = await worker.fetch(new Request("https://api.test/api/chat", { method: "OPTIONS", headers: { Origin: ORIGIN } }), ENV);
  assert.equal(ok1.status, 204);
  assert.equal(ok1.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  const bad = await worker.fetch(new Request("https://api.test/api/chat", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), ENV);
  assert.notEqual(bad.headers.get("Access-Control-Allow-Origin"), "https://evil.example");
});
