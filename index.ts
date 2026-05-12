export type PiContextAttributeValue = string | number | boolean | null | undefined;
export type PiContextTruncationMode = "head" | "tail";

export type TruncateTextResult = {
	text: string;
	truncated: boolean;
	originalChars: number;
	omittedChars: number;
};

export type TruncationResult = {
	content: string;
	truncated: boolean;
	truncatedBy: "lines" | "bytes" | null;
	totalLines: number;
	totalBytes: number;
	outputLines: number;
	outputBytes: number;
	lastLinePartial: boolean;
	firstLineExceedsLimit: boolean;
	maxLines: number;
	maxBytes: number;
};

export type PiContextTruncateOptions = {
	mode?: PiContextTruncationMode;
	maxLines?: number;
	maxBytes?: number;
	appendNotice?: boolean;
};

export type PiContextTruncate = PiContextTruncationMode | PiContextTruncateOptions | false | undefined;

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
	/**
	 * Optional model-context truncation using Pi's normal tool-output limits:
	 * 2000 lines or 50KB, whichever is hit first. Disabled by default.
	 */
	truncate?: PiContextTruncate;
};

export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB
export const GREP_MAX_LINE_LENGTH = 500; // Max chars per grep match line

const SECRET_PATTERNS: Array<[RegExp, string]> = [
	[/\b(sk-[A-Za-z0-9_-]{20,})\b/g, "[REDACTED_SECRET]"],
	[/\b(gh[pousr]_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_SECRET]"],
	[/\b(xox[baprs]-[A-Za-z0-9-]{20,})\b/g, "[REDACTED_SECRET]"],
	[/\b([A-Za-z0-9+/]{40,}={0,2})\b/g, "[REDACTED_LONG_TOKEN]"],
	[/("(?:api[_-]?key|token|password|secret|authorization|cookie)"\s*:\s*")([^"]+)(")/gi, "$1[REDACTED]$3"],
];

/**
 * Format bytes as human-readable size.
 */
export function formatSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes}B`;
	} else if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)}KB`;
	} else {
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	}
}

/**
 * Truncate content from the head (keep first N lines/bytes).
 * Suitable for file reads where you want to see the beginning.
 *
 * Never returns partial lines. If first line exceeds byte limit,
 * returns empty content with firstLineExceedsLimit=true.
 */
export function truncateHead(content: string, options: { maxLines?: number; maxBytes?: number } = {}): TruncationResult {
	const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
	const totalBytes = Buffer.byteLength(content, "utf-8");
	const lines = content.split("\n");
	const totalLines = lines.length;

	// Check if no truncation needed
	if (totalLines <= maxLines && totalBytes <= maxBytes) {
		return {
			content,
			truncated: false,
			truncatedBy: null,
			totalLines,
			totalBytes,
			outputLines: totalLines,
			outputBytes: totalBytes,
			lastLinePartial: false,
			firstLineExceedsLimit: false,
			maxLines,
			maxBytes,
		};
	}

	// Check if first line alone exceeds byte limit
	const firstLine = lines[0] ?? "";
	const firstLineBytes = Buffer.byteLength(firstLine, "utf-8");
	if (firstLineBytes > maxBytes) {
		return {
			content: "",
			truncated: true,
			truncatedBy: "bytes",
			totalLines,
			totalBytes,
			outputLines: 0,
			outputBytes: 0,
			lastLinePartial: false,
			firstLineExceedsLimit: true,
			maxLines,
			maxBytes,
		};
	}

	// Collect complete lines that fit
	const outputLinesArr: string[] = [];
	let outputBytesCount = 0;
	let truncatedBy: "lines" | "bytes" = "lines";

	for (let i = 0; i < lines.length && i < maxLines; i++) {
		const line = lines[i] ?? "";
		const lineBytes = Buffer.byteLength(line, "utf-8") + (i > 0 ? 1 : 0); // +1 for newline
		if (outputBytesCount + lineBytes > maxBytes) {
			truncatedBy = "bytes";
			break;
		}
		outputLinesArr.push(line);
		outputBytesCount += lineBytes;
	}

	// If we exited due to line limit
	if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
		truncatedBy = "lines";
	}

	const outputContent = outputLinesArr.join("\n");
	const finalOutputBytes = Buffer.byteLength(outputContent, "utf-8");

	return {
		content: outputContent,
		truncated: true,
		truncatedBy,
		totalLines,
		totalBytes,
		outputLines: outputLinesArr.length,
		outputBytes: finalOutputBytes,
		lastLinePartial: false,
		firstLineExceedsLimit: false,
		maxLines,
		maxBytes,
	};
}

/**
 * Truncate content from the tail (keep last N lines/bytes).
 * Suitable for bash output where you want to see the end (errors, final results).
 *
 * May return partial first line if the last line of original content exceeds byte limit.
 */
export function truncateTail(content: string, options: { maxLines?: number; maxBytes?: number } = {}): TruncationResult {
	const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
	const totalBytes = Buffer.byteLength(content, "utf-8");
	const lines = content.split("\n");
	const totalLines = lines.length;

	// Check if no truncation needed
	if (totalLines <= maxLines && totalBytes <= maxBytes) {
		return {
			content,
			truncated: false,
			truncatedBy: null,
			totalLines,
			totalBytes,
			outputLines: totalLines,
			outputBytes: totalBytes,
			lastLinePartial: false,
			firstLineExceedsLimit: false,
			maxLines,
			maxBytes,
		};
	}

	// Work backwards from the end
	const outputLinesArr: string[] = [];
	let outputBytesCount = 0;
	let truncatedBy: "lines" | "bytes" = "lines";
	let lastLinePartial = false;

	for (let i = lines.length - 1; i >= 0 && outputLinesArr.length < maxLines; i--) {
		const line = lines[i] ?? "";
		const lineBytes = Buffer.byteLength(line, "utf-8") + (outputLinesArr.length > 0 ? 1 : 0); // +1 for newline
		if (outputBytesCount + lineBytes > maxBytes) {
			truncatedBy = "bytes";
			// Edge case: if we haven't added ANY lines yet and this line exceeds maxBytes,
			// take the end of the line (partial)
			if (outputLinesArr.length === 0) {
				const truncatedLine = truncateStringToBytesFromEnd(line, maxBytes);
				outputLinesArr.unshift(truncatedLine);
				outputBytesCount = Buffer.byteLength(truncatedLine, "utf-8");
				lastLinePartial = true;
			}
			break;
		}
		outputLinesArr.unshift(line);
		outputBytesCount += lineBytes;
	}

	// If we exited due to line limit
	if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
		truncatedBy = "lines";
	}

	const outputContent = outputLinesArr.join("\n");
	const finalOutputBytes = Buffer.byteLength(outputContent, "utf-8");

	return {
		content: outputContent,
		truncated: true,
		truncatedBy,
		totalLines,
		totalBytes,
		outputLines: outputLinesArr.length,
		outputBytes: finalOutputBytes,
		lastLinePartial,
		firstLineExceedsLimit: false,
		maxLines,
		maxBytes,
	};
}

/**
 * Truncate a string to fit within a byte limit (from the end).
 * Handles multi-byte UTF-8 characters correctly.
 */
function truncateStringToBytesFromEnd(str: string, maxBytes: number): string {
	const buf = Buffer.from(str, "utf-8");
	if (buf.length <= maxBytes) {
		return str;
	}
	// Start from the end, skip maxBytes back
	let start = buf.length - maxBytes;
	// Find a valid UTF-8 boundary (start of a character)
	while (start < buf.length && ((buf[start] ?? 0) & 0xc0) === 0x80) {
		start++;
	}
	return buf.slice(start).toString("utf-8");
}

/**
 * Truncate a single line to max characters, adding [truncated] suffix.
 * Used for grep match lines.
 */
export function truncateLine(line: string, maxChars = GREP_MAX_LINE_LENGTH): { text: string; wasTruncated: boolean } {
	if (line.length <= maxChars) {
		return { text: line, wasTruncated: false };
	}
	return { text: `${line.slice(0, maxChars)}... [truncated]`, wasTruncated: true };
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

function normalizeTruncateOptions(truncate: PiContextTruncate): Required<PiContextTruncateOptions> | undefined {
	if (!truncate) return undefined;
	if (typeof truncate === "string") {
		return { mode: truncate, maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES, appendNotice: true };
	}
	return {
		mode: truncate.mode ?? "tail",
		maxLines: truncate.maxLines ?? DEFAULT_MAX_LINES,
		maxBytes: truncate.maxBytes ?? DEFAULT_MAX_BYTES,
		appendNotice: truncate.appendNotice ?? true,
	};
}

export function formatTruncationNotice(truncation: TruncationResult, mode: PiContextTruncationMode): string {
	if (!truncation.truncated) return "";
	if (truncation.firstLineExceedsLimit) {
		return `[First line exceeds ${formatSize(truncation.maxBytes)} limit]`;
	}
	if (mode === "tail") {
		const startLine = truncation.totalLines - truncation.outputLines + 1;
		const endLine = truncation.totalLines;
		if (truncation.lastLinePartial) {
			return `[Showing last ${formatSize(truncation.outputBytes)} of line ${endLine} (${formatSize(truncation.maxBytes)} limit)]`;
		}
		if (truncation.truncatedBy === "lines") {
			return `[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}]`;
		}
		return `[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(truncation.maxBytes)} limit)]`;
	}
	const endLine = truncation.outputLines;
	if (truncation.truncatedBy === "lines") {
		return `[Showing lines 1-${endLine} of ${truncation.totalLines}]`;
	}
	return `[Showing lines 1-${endLine} of ${truncation.totalLines} (${formatSize(truncation.maxBytes)} limit)]`;
}

export function truncateContextText(content: string, truncate: PiContextTruncate): { content: string; truncation?: TruncationResult } {
	const options = normalizeTruncateOptions(truncate);
	if (!options) return { content };
	const truncation = options.mode === "head"
		? truncateHead(content, { maxLines: options.maxLines, maxBytes: options.maxBytes })
		: truncateTail(content, { maxLines: options.maxLines, maxBytes: options.maxBytes });
	if (!truncation.truncated) return { content: truncation.content };
	const notice = options.appendNotice ? formatTruncationNotice(truncation, options.mode) : "";
	return {
		content: notice ? `${truncation.content}\n\n${notice}` : truncation.content,
		truncation,
	};
}

function isNameStart(char: string): boolean {
	const code = char.charCodeAt(0);
	return char === "_" || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isNameChar(char: string): boolean {
	const code = char.charCodeAt(0);
	return isNameStart(char) || char === "." || char === ":" || char === "-" || (code >= 48 && code <= 57);
}

export function assertContextName(name: string, label = "name"): string {
	const first = name[0];
	if (first === undefined || !isNameStart(first)) throw new Error(`Invalid ${label}: ${name}`);
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

export function renderSection(child: PiContextChild, truncate?: PiContextTruncate): string {
	const tag = assertContextName(child.tag, "section tag");
	const attrs = child.attrs ? attrsToString(child.attrs) : "";
	const open = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
	const { content } = truncateContextText(child.body, truncate);
	return `${open}\n${content}\n</${tag}>`;
}

export function piContext(options: PiContextOptions): string {
	const attrs = attrsToString({
		source: options.source,
		kind: options.kind,
		...(options.id !== undefined ? { id: options.id } : {}),
		...(options.name !== undefined ? { name: options.name } : {}),
		...(options.attrs ?? {}),
	});
	const children = options.children?.map((child) => renderSection(child, options.truncate));
	const { content: body } = children && children.length > 0
		? { content: children.join("\n") }
		: truncateContextText(options.body ?? "", options.truncate);
	return `<pi_context ${attrs}>\n${body}\n</pi_context>`;
}
