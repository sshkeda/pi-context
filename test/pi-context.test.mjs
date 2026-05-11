import test from "node:test";
import assert from "node:assert/strict";
import { escapeAttr, piContext, section, stringifyPayload } from "../index.ts";

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
