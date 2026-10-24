import type { Command } from "commander";
import { issueKey } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { grid, printResult } from "../../core/output.js";
import { LinkService, type LinkView } from "../../services/link.service.js";
import { RemoteLinkService, type WebLinkView } from "../../services/remote-link.service.js";

interface LinkList {
  key: string;
  links: LinkView[];
  webLinks: WebLinkView[];
}

export function registerList(link: Command): void {
  link
    .command("list <key>")
    .description("Show a ticket's issue links and web links")
    .action(async (rawKey: string, _opts: unknown, cmd: Command) => {
      const key = issueKey(rawKey);
      const { mode } = bootstrap(cmd);
      const [links, webLinks] = await Promise.all([
        new LinkService().list(key),
        new RemoteLinkService().list(key),
      ]);
      const view: LinkList = { key, links, webLinks };
      printResult(mode, view, () => renderHuman(view));
    });
}

function renderHuman(view: LinkList): string {
  if (view.links.length === 0 && view.webLinks.length === 0) return `${view.key} has no links.`;
  const parts: string[] = [];
  if (view.links.length > 0) {
    const rows = view.links.map((item) => [
      item.id,
      item.phrase,
      item.key,
      item.status ?? "",
      item.summary ?? "",
    ]);
    parts.push(
      `${view.key} links (${view.links.length})`,
      grid([["ID", "LINK", "TICKET", "STATUS", "SUMMARY"], ...rows]),
    );
  }
  if (view.webLinks.length > 0) {
    const rows = view.webLinks.map((item) => [item.id, item.title, item.url]);
    parts.push(`Web links (${view.webLinks.length})`, grid([["ID", "TITLE", "URL"], ...rows]));
  }
  return parts.join("\n\n");
}
