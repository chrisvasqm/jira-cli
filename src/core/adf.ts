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

/** Join block-level children with one blank line, skipping empty blocks. */
function blocks(node: AdfNode): string {
  return children(node)
    .filter((block) => block.trim().length > 0)
    .join("\n\n");
}

function attr(node: AdfNode, name: string): string {
  const value = node.attrs?.[name];
  return typeof value === "string" ? value : "";
}

function inline(node: AdfNode): string {
  const text = node.text ?? "";
  const link = node.marks?.find((mark) => mark.type === "link")?.attrs?.["href"];
  const isCode = node.marks?.some((mark) => mark.type === "code");
  const body = isCode ? `\`${text}\`` : text;
  return typeof link === "string" && link !== text ? `[${body}](${link})` : body;
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
  return children(node)
    .filter((part) => part.trim().length > 0)
    .join("<br>")
    .replaceAll("\n", "<br>")
    .replaceAll("|", "\\|");
}

function table(node: AdfNode): string {
  const rows = (node.content ?? []).map((row) => `| ${(row.content ?? []).map(cell).join(" | ")} |`);
  const width = node.content?.[0]?.content?.length ?? 0;
  if (rows.length === 0 || width === 0) return "";
  const separator = `|${" --- |".repeat(width)}`;
  return [rows[0], separator, ...rows.slice(1)].join("\n");
}

function date(node: AdfNode): string {
  const parsed = new Date(Number(node.attrs?.["timestamp"]));
  return Number.isNaN(parsed.getTime()) ? "[date]" : parsed.toISOString().slice(0, 10);
}

function render(node: AdfNode): string {
  switch (node.type) {
    case "doc":
    case "blockquote":
    case "panel":
    case "expand":
      return node.type === "blockquote" ? quote(blocks(node)) : blocks(node);
    case "listItem":
      return children(node).join("\n");
    case "text":
      return inline(node);
    case "hardBreak":
      return "\n";
    case "paragraph":
      return children(node).join("");
    case "heading":
      return `${"#".repeat(Number(node.attrs?.["level"] ?? 1))} ${children(node).join("")}`;
    case "bulletList":
      return listItems(node, false);
    case "orderedList":
      return listItems(node, true);
    case "codeBlock":
      return `\`\`\`${attr(node, "language")}\n${children(node).join("")}\n\`\`\``;
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

function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}
