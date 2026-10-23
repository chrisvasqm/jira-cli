/**
 * Atlassian Document Format (ADF) helpers. Jira Cloud v3 stores descriptions and
 * comments as ADF; the CLI shows them as Markdown-like text.
 */
export interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export function adfToText(node: AdfNode | null | undefined): string {
  if (!node) return "";
  return render(node).trim();
}

function children(node: AdfNode): string[] {
  return (node.content ?? []).map(render);
}

/** Join non-empty children, by default as blocks separated by one blank line. */
function blocks(node: AdfNode, separator = "\n\n"): string {
  return children(node)
    .filter((block) => block.trim().length > 0)
    .join(separator);
}

function attr(node: AdfNode, name: string): string {
  const value = node.attrs?.[name];
  return typeof value === "string" ? value : "";
}

const MARK_WRAP: Record<string, string> = { strong: "**", em: "_", strike: "~~" };

function inline(node: AdfNode): string {
  const text = node.text ?? "";
  const marks = node.marks ?? [];
  const link = marks.find((mark) => mark.type === "link")?.attrs?.["href"];
  let body = marks.some((mark) => mark.type === "code") ? codeSpan(text) : text;
  for (const mark of marks) {
    const wrap = MARK_WRAP[mark.type];
    if (wrap) body = wrapTrimmed(body, wrap);
  }
  return typeof link === "string" && link !== text ? `[${body}](${link})` : body;
}

/** Wrap inside surrounding spaces: "bold " becomes "**bold** ", which Markdown reads as emphasis. */
function wrapTrimmed(body: string, wrap: string): string {
  const core = body.trim();
  if (!core) return body;
  const lead = body.length - body.trimStart().length;
  const tail = body.length - body.trimEnd().length;
  return `${body.slice(0, lead)}${wrap}${core}${wrap}${body.slice(body.length - tail)}`;
}

/** Longest run of backticks in text, so fences can be made longer than it. */
function longestTicks(text: string): number {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  return longest;
}

function codeSpan(text: string): string {
  const ticks = "`".repeat(longestTicks(text) + 1);
  return ticks.length > 1 ? `${ticks} ${text} ${ticks}` : `${ticks}${text}${ticks}`;
}

function codeBlock(node: AdfNode): string {
  const code = children(node).join("");
  const fence = "`".repeat(Math.max(3, longestTicks(code) + 1));
  return `${fence}${attr(node, "language")}\n${code}\n${fence}`;
}

function taskItems(node: AdfNode): string {
  return (node.content ?? [])
    .map((item) => {
      if (item.type === "taskList") return prefixLines("  ", taskItems(item));
      const box = item.type === "decisionItem" ? "-" : item.attrs?.["state"] === "DONE" ? "- [x]" : "- [ ]";
      return `${box} ${children(item).join("")}`;
    })
    .join("\n");
}

/** Continuation lines of an item are indented under its bullet, which also nests sublists. */
function listItems(node: AdfNode, ordered: boolean): string {
  const start = Number(node.attrs?.["order"] ?? 1);
  const first = Number.isFinite(start) ? start : 1;
  return (node.content ?? [])
    .map((item, index) => {
      const bullet = ordered ? `${first + index}.` : "-";
      const pad = " ".repeat(bullet.length + 1);
      const [head = "", ...rest] = children(item).join("\n").split("\n");
      return [`${bullet} ${head}`, ...rest.map((line) => (line ? pad + line : line))].join("\n");
    })
    .join("\n");
}

function cell(node: AdfNode): string {
  return blocks(node, "<br>").replaceAll("\n", "<br>").replaceAll("|", "\\|");
}

function table(node: AdfNode): string {
  const rows = (node.content ?? []).map((row) => `| ${(row.content ?? []).map(cell).join(" | ")} |`);
  const width = (node.content ?? []).reduce((widest, row) => Math.max(widest, rowWidth(row)), 0);
  if (rows.length === 0 || width === 0) return "";
  const separator = `|${" --- |".repeat(width)}`;
  return [rows[0], separator, ...rows.slice(1)].join("\n");
}

function rowWidth(row: AdfNode): number {
  return (row.content ?? []).reduce(
    (sum, item) => sum + Math.max(1, Number(item.attrs?.["colspan"]) || 1),
    0,
  );
}

function headingLevel(node: AdfNode): number {
  const level = Math.trunc(Number(node.attrs?.["level"]));
  return Number.isFinite(level) ? Math.min(6, Math.max(1, level)) : 1;
}

function date(node: AdfNode): string {
  const parsed = new Date(Number(node.attrs?.["timestamp"]));
  return Number.isNaN(parsed.getTime()) ? "[date]" : parsed.toISOString().slice(0, 10);
}

function render(node: AdfNode): string {
  switch (node.type) {
    case "blockquote":
      return prefixLines("> ", blocks(node));
    case "doc":
    case "panel":
    case "expand":
    case "nestedExpand":
    case "layoutSection":
    case "layoutColumn":
    case "bodiedExtension":
      return blocks(node);
    case "listItem":
      return children(node).join("\n");
    case "text":
      return inline(node);
    case "hardBreak":
      return "\n";
    case "paragraph":
      return children(node).join("");
    case "heading":
      return `${"#".repeat(headingLevel(node))} ${children(node).join("")}`;
    case "bulletList":
      return listItems(node, false);
    case "orderedList":
      return listItems(node, true);
    case "codeBlock":
      return codeBlock(node);
    case "taskList":
    case "decisionList":
      return taskItems(node);
    case "rule":
      return "---";
    case "mention":
      return attr(node, "text") || "@user";
    case "emoji":
      return attr(node, "text") || attr(node, "shortName");
    case "inlineCard":
    case "blockCard":
      return attr(node, "url");
    case "status":
      return `[${attr(node, "text")}]`;
    case "date":
      return date(node);
    case "table":
      return table(node);
    case "mediaSingle":
    case "mediaGroup":
    case "media":
      return "[attachment]";
    default:
      return children(node).join("");
  }
}

function prefixLines(prefix: string, text: string): string {
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}
