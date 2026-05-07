export type PiContextAttributeValue = string | number | boolean | null | undefined;

export type TruncateTextResult = {
	text: string;
	truncated: boolean;
	originalChars: number;
	omittedChars: number;
};

export type PiContextChild = {
	tag: string;
	body: string;
	attrs?: Record<string, PiContextAttributeValue> | undefined;
};

export type PiContextOptions = {
	source: string;
	kind: string;
	id?: PiContextAttributeValue;
	name?: PiContextAttributeValue;
	attrs?: Record<string, PiContextAttributeValue>;
	body?: string;
	children?: PiContextChild[];
};

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const SECRET_PATTERNS: Array<[RegExp, string]> = [
	[/\b(sk-[A-Za-z0-9_-]{20,})\b/g, "[REDACTED_SECRET]"],
	[/\b(gh[pousr]_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_SECRET]"],
	[/\b(xox[baprs]-[A-Za-z0-9-]{20,})\b/g, "[REDACTED_SECRET]"],
	[/\b([A-Za-z0-9+/]{40,}={0,2})\b/g, "[REDACTED_LONG_TOKEN]"],
	[/("(?:api[_-]?key|token|password|secret|authorization|cookie)"\s*:\s*")([^"]+)(")/gi, "$1[REDACTED]$3"],
];

export function assertContextName(name: string, label = "name"): string {
	if (!NAME_PATTERN.test(name)) throw new Error(`Invalid ${label}: ${name}`);
	return name;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function escapeAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\r/g, "&#13;")
		.replace(/\n/g, "&#10;");
}

export function escapeClosingTags(text: string, tags: string[]): string {
	if (tags.length === 0) return text;
	const escaped = tags.map((tag) => escapeRegExp(assertContextName(tag, "tag")));
	return text.replace(new RegExp(`</(${escaped.join("|")})>`, "gi"), "<\\/$1>");
}

export function attrsToString(attrs: Record<string, PiContextAttributeValue>): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(attrs)) {
		if (value === undefined || value === null || value === false) continue;
		assertContextName(key, "attribute");
		parts.push(`${key}="${escapeAttr(String(value))}"`);
	}
	return parts.join(" ");
}

export function stringifyPayload(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value ?? null, null, 2);
	} catch {
		return String(value);
	}
}

export function truncateText(text: string, options: { maxChars?: number; marker?: (omittedChars: number) => string } = {}): TruncateTextResult {
	const maxChars = options.maxChars;
	if (maxChars === undefined || maxChars < 0 || text.length <= maxChars) {
		return { text, truncated: false, originalChars: text.length, omittedChars: 0 };
	}
	const omittedChars = text.length - maxChars;
	const marker = options.marker?.(omittedChars) ?? `\n...[truncated ${omittedChars} chars]`;
	return { text: `${text.slice(0, maxChars)}${marker}`, truncated: true, originalChars: text.length, omittedChars };
}

export function redactSecrets(text: string): string {
	let out = text;
	for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
	return out;
}

export function sanitizeText(text: string, options: { redact?: boolean; maxChars?: number } = {}): TruncateTextResult {
	const redacted = options.redact === false ? text : redactSecrets(text);
	return options.maxChars === undefined ? truncateText(redacted) : truncateText(redacted, { maxChars: options.maxChars });
}

export function section(tag: string, body: string, attrs?: Record<string, PiContextAttributeValue>): PiContextChild {
	assertContextName(tag, "section tag");
	return attrs === undefined ? { tag, body } : { tag, body, attrs };
}

export function renderSection(child: PiContextChild, extraEscapeTags: string[] = []): string {
	const tag = assertContextName(child.tag, "section tag");
	const attrs = child.attrs ? attrsToString(child.attrs) : "";
	const open = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
	return `${open}\n${escapeClosingTags(child.body, [tag, ...extraEscapeTags])}\n</${tag}>`;
}

export function piContext(options: PiContextOptions): string {
	const attrs = attrsToString({
		source: options.source,
		kind: options.kind,
		...(options.id !== undefined ? { id: options.id } : {}),
		...(options.name !== undefined ? { name: options.name } : {}),
		...(options.attrs ?? {}),
	});
	const children = options.children?.map((child) => renderSection(child, ["pi_context"]));
	const rawBody = children && children.length > 0 ? children.join("\n") : (options.body ?? "");
	return `<pi_context ${attrs}>\n${escapeClosingTags(rawBody, ["pi_context"])}\n</pi_context>`;
}
