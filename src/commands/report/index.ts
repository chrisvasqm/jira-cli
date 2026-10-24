import type { Command } from "commander";
import { registerFlow } from "./flow.js";
import { registerSprint } from "./sprint.js";
import { registerVelocity } from "./velocity.js";
import { registerWorkload } from "./workload.js";

export function registerReport(program: Command): void {
  const report = program
    .command("report")
    .description("Metrics for managers: flow, workload, sprints, velocity");
  registerFlow(report);
  registerWorkload(report);
  registerSprint(report);
  registerVelocity(report);
}
