// Tests the coaching-feedback parser used in index.html (no browser needed).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const start = html.indexOf("/*PF*/");
const end = html.indexOf("/*PF-END*/");
assert.ok(start >= 0 && end > start, "parseFeedback markers not found in index.html");
const parseFeedback = new Function(html.slice(start + 6, end) + "; return parseFeedback;")();
const noMarkup = s => !/<\s*\/?\s*feed/i.test(s);

test("normal reply with a complete feedback block", () => {
  const p = parseFeedback("Great answer! What happened next?\n<feedback>Strength: clear.\nTip: slow down.</feedback>");
  assert.equal(p.reply, "Great answer! What happened next?");
  assert.match(p.notes, /Strength: clear/);
  assert.ok(noMarkup(p.reply) && noMarkup(p.notes));
});

test("unclosed feedback tag keeps the reply and shows the notes", () => {
  const p = parseFeedback("Nice work.\n<feedback>Tip: use 'I would like'");
  assert.equal(p.reply, "Nice work.");
  assert.match(p.notes, /Tip/);
});

test("no feedback block returns the plain reply", () => {
  const p = parseFeedback("Just a normal reply.");
  assert.equal(p.reply, "Just a normal reply.");
  assert.equal(p.notes, "");
});

test("stray closing tag and odd spacing/case are stripped", () => {
  const p = parseFeedback("Reply text </feedback>");
  assert.equal(p.reply, "Reply text");
  const q = parseFeedback("Hi\n< FEEDBACK >Notes here< / Feedback >");
  assert.equal(q.reply, "Hi");
  assert.equal(q.notes, "Notes here");
});

test("truncated opening tag at the end is removed", () => {
  for (const tail of ["<", "<feed", "<feedback", "</feedb"]) {
    const p = parseFeedback("Answer so far " + tail);
    assert.equal(p.reply, "Answer so far");
    assert.ok(noMarkup(p.reply));
  }
});

test("multiple blocks are merged and empty or odd input is safe", () => {
  const p = parseFeedback("A<feedback>one</feedback>B<feedback>two</feedback>");
  assert.match(p.notes, /one/);
  assert.match(p.notes, /two/);
  assert.ok(noMarkup(p.reply));
  assert.deepEqual(parseFeedback(""), { reply: "", notes: "" });
  assert.deepEqual(parseFeedback(null), { reply: "", notes: "" });
  assert.equal(parseFeedback("<feedback></feedback>").reply, "");
});
