import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, table } from "../../core/output.js";
import { UserService } from "../../services/user.service.js";

interface UserView {
  accountId: string;
  name: string;
  email: string | null;
  timeZone: string | null;
  active: boolean;
}

export function registerView(user: Command): void {
  user
    .command("view [who]")
    .description("Show a user: me (default), an email, a name or an accountId")
    .action(async (who: string | undefined, _opts: unknown, cmd: Command) => {
      const { mode } = bootstrap(cmd);
      const users = new UserService();
      const { accountId } = await users.resolve(who?.trim() || "me");
      const found = await users.get(accountId);
      const view: UserView = {
        accountId: found.accountId,
        name: found.displayName,
        email: found.emailAddress ?? null,
        timeZone: found.timeZone ?? null,
        active: found.active !== false,
      };
      printResult(mode, view, () =>
        table([
          ["Name", view.name],
          ["Email", view.email ?? "-"],
          ["Account ID", view.accountId],
          ["Time zone", view.timeZone ?? "-"],
          ["Active", view.active ? "yes" : "no"],
        ]),
      );
    });
}
