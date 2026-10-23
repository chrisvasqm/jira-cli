/**
 * Atlassian Document Format (ADF) helpers. Jira Cloud v3 stores descriptions and
 * comments as ADF; the CLI shows them as Markdown-like text and accepts plain text.
 */
export interface AdfNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface AdfDoc {
  type: "doc";
  version: 1;
  content: AdfNode[];
}

const BLOCK_SEPARATOR = "\n\n";

export function adfToText(node: AdfNode | null | undefined): string {
  if (!node) return "";
  return render(node, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function children(node: AdfNode, indent: string): string[] {
  return (node.content ?? []).map((child) => render(child, indent));
}

function inline(node: AdfNode): string {
  const text = node.text ?? "";
  const link = node.marks?.find((mark) => mark.type === "link")?.attrs?.["href"];
  const isCode = node.marks?.some((mark) => mark.type === "code");
  const body = isCode ? `\`${text}\`` : text;
  return typeof link === "string" && link !== text ? `[${body}](${link})` : body;
}

function listItems(node: AdfNode, indent: string, ordered: boolean): string {
  return (node.content ?? [])
    .map((item, index) => {
      const bullet = ordered ? `${index + 1}.` : "-";
      const body = children(item, `${indent}  `).join("\n").trim();
      return `${indent}${bullet} ${body}`;
    })
    .join("\n");
}

function attr(node: AdfNode, name: string): string {
  const value = node.attrs?.[name];
  return typeof value === "string" ? value : "";
}

function render(node: AdfNode, indent: string): string {
  switch (node.type) {
    case "doc":
      return children(node, indent).join(BLOCK_SEPARATOR);
    case "text":
      return inline(node);
    case "hardBreak":
      return "\n";
    case "paragraph":
      return children(node, indent).join("");
    case "heading":
      return `${"#".repeat(Number(node.attrs?.["level"] ?? 1))} ${children(node, indent).join("")}`;
    case "bulletList":
      return listItems(node, indent, false);
    case "orderedList":
      return listItems(node, indent, true);
    case "codeBlock":
      return `\`\`\`${attr(node, "language")}\n${children(node, indent).join("")}\n\`\`\``;
    case "blockquote":
      return children(node, indent)
        .join(BLOCK_SEPARATOR)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
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
      return new Date(Number(node.attrs?.["timestamp"])).toISOString().slice(0, 10);
    case "table":
      return (node.content ?? [])
        .map(
          (row) =>
            `| ${(row.content ?? []).map((cell) => children(cell, "").join(" ").trim()).join(" | ")} |`,
        )
        .join("\n");
    case "mediaSingle":
    case "mediaGroup":
    case "media":
      return "[attachment]";
    default:
      return children(node, indent).join(node.type.endsWith("List") ? "\n" : "");
  }
}

/** Plain text to ADF: blank lines split paragraphs, single newlines become hard breaks. */
export function textToAdf(text: string): AdfDoc {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  return {
    type: "doc",
    version: 1,
    content: paragraphs.map((block) => ({
      type: "paragraph",
      content: block.split("\n").flatMap((line, index): AdfNode[] => {
        const textNode: AdfNode = { type: "text", text: line };
        return index === 0 ? [textNode] : [{ type: "hardBreak" }, textNode];
      }),
    })),
  };
}
