import { stdin } from "node:process";
import { CliError } from "./errors.js";
import { ask } from "./prompt.js";

/**
 * Ask before a destructive action. `--yes` skips the question; without a terminal
 * (agents, scripts) the action needs `--yes`, so nothing is deleted by accident.
 */
export async function confirm(question: string, yes: boolean | undefined): Promise<void> {
  if (yes) return;
  if (!stdin.isTTY) throw new CliError("CONFIRM_REQUIRED", `${question} Pass --yes to confirm.`);
  const answer = await ask(`${question} Type "yes" to confirm`);
  if (answer.toLowerCase() !== "yes") throw new CliError("CANCELLED", "Nothing was changed.");
}
