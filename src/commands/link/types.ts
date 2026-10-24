import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { grid, printResult } from "../../core/output.js";
import { LinkService } from "../../services/link.service.js";

export function registerTypes(link: Command): void {
  link
    .command("types")
    .description("Show the issue link types: name, outward phrase, inward phrase")
    .action(async (_opts: unknown, cmd: Command) => {
      const { mode } = bootstrap(cmd);
      const types = await new LinkService().types();
      const rows = types.map((type) => [type.name, type.outward, type.inward]);
      printResult(mode, { types }, () => grid([["NAME", "OUTWARD", "INWARD"], ...rows]));
    });
}
