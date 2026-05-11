import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  escapeAttr,
  piContext,
  section,
  stringifyPayload,
  truncateContextText,
  truncateHead,
  truncateTail,
} from "../index.ts";

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

test("sections render simple child blocks", () => {
  const text = piContext({
    source: "pi-claude-code",
    kind: "provider_tool",
    name: "Skill",
    children: [section("input", "query"), section("output", "ok")],
  });
  assert.equal(text, '<pi_context source="pi-claude-code" kind="provider_tool" name="Skill">\n<input>\nquery\n</input>\n<output>\nok\n</output>\n</pi_context>');
});

test("payload and primitive escaping helpers", () => {
  assert.equal(escapeAttr('<&"\n'), '&lt;&amp;&quot;&#10;');
  assert.equal(stringifyPayload({ a: 1 }), '{\n  "a": 1\n}');
});

test("rejects invalid tag and attribute names", () => {
  assert.throws(() => section("bad tag", "x"), (error) => error instanceof Error && error.message.includes("Invalid section tag"));
  assert.throws(
    () => piContext({ source: "x", kind: "y", attrs: { "bad attr": "x" } }),
    (error) => error instanceof Error && error.message.includes("Invalid attribute"),
  );
});

test("exports Pi tool-output truncation defaults", () => {
  assert.equal(DEFAULT_MAX_LINES, 2000);
  assert.equal(DEFAULT_MAX_BYTES, 50 * 1024);
});

test("truncateHead keeps complete leading lines with Pi tool-output metadata", () => {
  const result = truncateHead("a\nb\nc", { maxLines: 2, maxBytes: 100 });
  assert.deepEqual(result, {
    content: "a\nb",
    truncated: true,
    truncatedBy: "lines",
    totalLines: 3,
    totalBytes: 5,
    outputLines: 2,
    outputBytes: 3,
    lastLinePartial: false,
    firstLineExceedsLimit: false,
    maxLines: 2,
    maxBytes: 100,
  });
});

test("truncateTail keeps complete trailing lines with Pi tool-output metadata", () => {
  const result = truncateTail("a\nb\nc", { maxLines: 2, maxBytes: 100 });
  assert.equal(result.content, "b\nc");
  assert.equal(result.truncated, true);
  assert.equal(result.truncatedBy, "lines");
  assert.equal(result.outputLines, 2);
});

test("piContext can opt into tool-output truncation notices", () => {
  const text = piContext({ source: "x", kind: "y", body: "a\nb\nc", truncate: { mode: "head", maxLines: 2, maxBytes: 100 } });
  assert.equal(text, '<pi_context source="x" kind="y">\na\nb\n\n[Showing lines 1-2 of 3]\n</pi_context>');
});

test("truncateContextText defaults to tail mode for tool-like output", () => {
  const { content, truncation } = truncateContextText("a\nb\nc", { maxLines: 2, maxBytes: 100 });
  assert.equal(content, "b\nc\n\n[Showing lines 2-3 of 3]");
  assert.equal(truncation?.truncated, true);
});
