import test from "node:test";
import assert from "node:assert/strict";
import { escapeAttr, escapeClosingTags, piContext, redactSecrets, sanitizeText, section, stringifyPayload, truncateText } from "../index.ts";

test("piContext renders minimal envelope and escapes attrs", () => {
  const text = piContext({
    source: "pi-background-bash",
    kind: "background_bash_result",
    id: "bg_1",
    attrs: { command: "echo \"hi\"\nnext", exit_code: 0, skipped: false },
    body: "done",
  });
  assert.equal(text, '<pi_context source="pi-background-bash" kind="background_bash_result" id="bg_1" command="echo &quot;hi&quot;&#10;next" exit_code="0">\ndone\n</pi_context>');
});

test("piContext escapes closing wrapper tags in payload", () => {
  const text = piContext({ source: "x", kind: "y", body: "before </pi_context> after" });
  assert.match(text, /before <\\\/pi_context> after/);
  assert.equal((text.match(/<\/pi_context>/g) ?? []).length, 1);
});

test("sections escape their own closing tags and wrapper tags", () => {
  const text = piContext({
    source: "pi-claude-code",
    kind: "provider_tool",
    name: "Skill",
    children: [section("input", "</input> </pi_context>"), section("output", "ok")],
  });
  assert.match(text, /<input>\n<\\\/input> <\\\/pi_context>\n<\/input>/);
  assert.match(text, /<output>\nok\n<\/output>/);
});

test("truncate and sanitize helpers report loss", () => {
  assert.deepEqual(truncateText("abcdef", { maxChars: 3 }), {
    text: "abc\n...[truncated 3 chars]",
    truncated: true,
    originalChars: 6,
    omittedChars: 3,
  });
  const sanitized = sanitizeText('{"apiKey":"sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}', { maxChars: 200 });
  assert.match(sanitized.text, /\[REDACTED\]/);
  assert.equal(sanitized.truncated, false);
});

test("payload and primitive escaping helpers", () => {
  assert.equal(escapeAttr('<&"\n'), '&lt;&amp;&quot;&#10;');
  assert.equal(escapeClosingTags("</A></b>", ["a"]), "<\\/A></b>");
  assert.equal(stringifyPayload({ a: 1 }), '{\n  "a": 1\n}');
  assert.equal(redactSecrets("token sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), "token [REDACTED_SECRET]");
});
