import type { Command } from "commander";
import { issueKey, webUrl } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { CliError } from "../../core/errors.js";
import { printResult } from "../../core/output.js";
import { LinkService } from "../../services/link.service.js";
import { RemoteLinkService } from "../../services/remote-link.service.js";

interface AddOptions {
  title?: string;
}

const USAGE = 'Use "jira link add <KEY> <type> <OTHER-KEY>" or "jira link add <KEY> <url>"';

export function registerAdd(link: Command): void {
  link
    .command("add <key> <target...>")
    .description(
      'Link to a ticket ("KAN-1 blocks KAN-2", "KAN-1 is blocked by KAN-2") or to a web page (a URL)',
    )
    .option("-ti, --title <text>", "Web link title (default: the URL)")
    .action(async (rawKey: string, target: string[], opts: AddOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const url = webUrl(target[0] ?? "");
      if (url && target.length > 1) {
        throw new CliError("USAGE", 'A web link takes one URL; pass its title with -ti, --title "<text>"');
      }
      if (url) {
        const { mode } = bootstrap(cmd);
        const created = await new RemoteLinkService().add(key, url, opts.title?.trim() || url);
        printResult(mode, { key, webLink: created }, () => `Added web link ${created.id} to ${key}.`);
        return;
      }
      if (target.length < 2) throw new CliError("USAGE", USAGE);
      if (opts.title !== undefined) throw new CliError("USAGE", "--title is only for web links");
      // The last word is the other ticket, so "is blocked by" works with or without quotes.
      const other = issueKey(target.at(-1) ?? "");
      const typed = target.slice(0, -1).join(" ");
      const { mode } = bootstrap(cmd);
      const service = new LinkService();
      const choice = await service.resolveType(typed);
      const created = await service.add(key, choice, other);
      const phrase = choice.direction === "outward" ? choice.type.outward : choice.type.inward;
      printResult(mode, { key, link: created ?? null }, () => {
        const id = created ? ` (link ${created.id})` : "";
        return `Linked: ${key} ${phrase} ${other}${id}.`;
      });
    });
}
