export type PiContextAttributeValue = string | number | boolean | null | undefined;

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

function isNameStart(char: string): boolean {
	const code = char.charCodeAt(0);
	return char === "_" || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isNameChar(char: string): boolean {
	const code = char.charCodeAt(0);
	return isNameStart(char) || char === "." || char === ":" || char === "-" || (code >= 48 && code <= 57);
}

export function assertContextName(name: string, label = "name"): string {
	if (name.length === 0 || !isNameStart(name[0] ?? "")) throw new Error(`Invalid ${label}: ${name}`);
	for (let i = 1; i < name.length; i += 1) {
		if (!isNameChar(name[i] ?? "")) throw new Error(`Invalid ${label}: ${name}`);
	}
	return name;
}

export function escapeAttr(value: string): string {
	return value
		.split("&").join("&amp;")
		.split('"').join("&quot;")
		.split("<").join("&lt;")
		.split(">").join("&gt;")
		.split("\r").join("&#13;")
		.split("\n").join("&#10;");
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

export function section(tag: string, body: string, attrs?: Record<string, PiContextAttributeValue>): PiContextChild {
	assertContextName(tag, "section tag");
	return attrs === undefined ? { tag, body } : { tag, body, attrs };
}

export function renderSection(child: PiContextChild): string {
	const tag = assertContextName(child.tag, "section tag");
	const attrs = child.attrs ? attrsToString(child.attrs) : "";
	const open = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
	return `${open}\n${child.body}\n</${tag}>`;
}

export function piContext(options: PiContextOptions): string {
	const attrs = attrsToString({
		source: options.source,
		kind: options.kind,
		...(options.id !== undefined ? { id: options.id } : {}),
		...(options.name !== undefined ? { name: options.name } : {}),
		...(options.attrs ?? {}),
	});
	const children = options.children?.map((child) => renderSection(child));
	const body = children && children.length > 0 ? children.join("\n") : (options.body ?? "");
	return `<pi_context ${attrs}>\n${body}\n</pi_context>`;
}
