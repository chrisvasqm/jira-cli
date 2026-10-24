import type { Command } from "commander";
import { issueKey, linkId } from "../../core/args.js";
import { bootstrap } from "../../core/bootstrap.js";
import { confirm } from "../../core/confirm.js";
import { printResult } from "../../core/output.js";
import { LinkService } from "../../services/link.service.js";
import { RemoteLinkService, WEB_LINK_PREFIX } from "../../services/remote-link.service.js";

interface RemoveOptions {
  yes?: boolean;
}

export function registerRemove(link: Command): void {
  link
    .command("remove <key> <id>")
    .description(
      'Remove an issue link (id like 10001) or a web link (id like w10000), as "link list" shows them',
    )
    .option("-y, --yes", "Remove without asking")
    .action(async (rawKey: string, rawId: string, opts: RemoveOptions, cmd: Command) => {
      const key = issueKey(rawKey);
      const { web, id } = linkId(rawId);
      const shown = web ? `${WEB_LINK_PREFIX}${id}` : id;
      const { mode } = bootstrap(cmd);
      const service = web ? new RemoteLinkService() : new LinkService();
      // A missing ticket or link fails before the question.
      await service.find(key, id);
      if (!opts.yes) await confirm(`Remove link ${shown} from ${key}?`);
      await service.remove(key, id);
      printResult(mode, { key, id: shown, deleted: true }, () => `Removed link ${shown} from ${key}.`);
    });
}
