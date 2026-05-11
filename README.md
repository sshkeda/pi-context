# pi-context

Tiny XML-ish context envelope helpers for Pi extensions, LLM tool results, and cross-provider agent transcripts.

Use `pi-context` when a Pi extension needs to inject model-visible context with stable provenance, sparse metadata, and human-readable transcript formatting.

## Canonical envelope

```xml
<pi_context source="pi-background-bash" kind="background_bash_result" id="bg_1">
...payload text...
</pi_context>
```

`pi_context` is the canonical **tag**. `pi-context` is the package/repo name.
Use hyphenated `pi-context` for JavaScript/npm/GitHub naming and underscored
`pi_context` for the XML-ish transcript tag.

## Goals

- **Minimalism**: one stable outer wrapper, small attribute set.
- **Consistency**: every Pi-injected context record uses `<pi_context>`.
- **Losslessness**: payload text is emitted as-is.

## Envelope rules

Required attributes:

- `source`: producer id, usually the extension/package name, e.g. `pi-claude-code`.
- `kind`: controlled payload class, e.g. `provider_tool` or `background_bash_result`.

Common optional attributes:

- `id`: job/tool/trace correlation id.
- `name`: named provider/tool label.

Extension-specific attributes are allowed, but keep them sparse. Put verbose data
in the payload or child sections, not on the wrapper.

## Structured sections

Use child sections only when they add useful boundaries:

```xml
<pi_context source="pi-claude-code" kind="provider_tool" name="ToolSearch">
<input>
{"query":"select:ask_gpt"}
</input>
<output>
schema
</output>
</pi_context>
```

## Escaping policy

This is **not strict XML**. It is stable, human/LLM-readable text.

- Attribute values are XML-escaped.
- Payload text is emitted as-is.
- `pi-context` does not parse payloads, redact payloads, truncate payloads, or rewrite closing tags.

## Install

Use as a GitHub dependency from another Pi package:

```json
{
  "dependencies": {
    "pi-context": "github:sshkeda/pi-context#v0.1.2"
  }
}
```

## API

```ts
import {
  piContext,
  section,
  stringifyPayload,
} from "pi-context";
```

### `piContext(options)`

```ts
piContext({
  source: "pi-background-bash",
  kind: "background_bash_result",
  id: "bg_1",
  attrs: { outcome: "exit", exit_code: 0 },
  body: "done\n",
});
```

### `section(tag, body, attrs?)`

```ts
piContext({
  source: "pi-claude-code",
  kind: "provider_tool",
  name: "ToolSearch",
  children: [
    section("input", stringifyPayload({ query: "select:ask_gpt" })),
    section("output", "schema"),
  ],
});
```

## Development

```bash
npm install
npm test
```

## License

MIT
