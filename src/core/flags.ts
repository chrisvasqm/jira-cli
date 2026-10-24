import { Command, Option } from "commander";

/** Every two-letter short flag and its long flag, across all commands (`st` → `--status`). */
const pairs = new Map<string, string>();

const PAIR = /^-([a-z]{2}), (--[a-z-]+)(.*)$/;

/**
 * A command whose options may have a two-letter short flag, e.g. "-st, --status <name>".
 * Commander allows one letter after a dash, so such an option is registered by its long
 * flag, help still shows both, and expandShortFlags rewrites `-st` before parsing.
 * A short flag with two meanings fails at startup: one meaning per flag across commands.
 */
export class FlagCommand extends Command {
  override createCommand(name?: string): Command {
    return new FlagCommand(name);
  }

  override createOption(flags: string, description?: string): Option {
    const match = PAIR.exec(flags);
    if (!match) return new Option(flags, description);
    const [, short = "", long = "", rest = ""] = match;
    const known = pairs.get(short);
    if (known !== undefined && known !== long) {
      throw new Error(`-${short} means both ${known} and ${long}`);
    }
    pairs.set(short, long);
    const option = new Option(`${long}${rest}`, description);
    option.flags = flags;
    return option;
  }
}

/** argv with each two-letter short flag (`-st`) replaced by its long flag, up to `--`. */
export function expandShortFlags(argv: string[]): string[] {
  const end = argv.indexOf("--");
  return argv.map((arg, index) => {
    if (end !== -1 && index > end) return arg;
    return (/^-[a-z]{2}$/.test(arg) && pairs.get(arg.slice(1))) || arg;
  });
}
