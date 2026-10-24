import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { grid, printResult } from "../../core/output.js";
import { FieldService } from "../../services/field.service.js";

interface FieldItem {
  id: string;
  name: string;
  custom: boolean;
  /** Schema type such as "string", "array" or "option"; null when Jira gives none. */
  type: string | null;
}

export function registerList(field: Command): void {
  field
    .command("list [text]")
    .description("List fields by name; text keeps only names that contain it (any case)")
    .action(async (text: string | undefined, _opts: unknown, cmd: Command) => {
      const filter = text?.trim().toLowerCase() ?? "";
      const { mode } = bootstrap(cmd);
      const found = await new FieldService().list();
      const fields: FieldItem[] = found
        .filter((item) => item.name.toLowerCase().includes(filter))
        .map((item) => ({
          id: item.id,
          name: item.name,
          custom: item.custom,
          type: item.schema?.type ?? null,
        }))
        .toSorted((left, right) => left.name.localeCompare(right.name));
      printResult(mode, { fields }, () =>
        fields.length === 0
          ? "No fields match."
          : grid([
              ["ID", "NAME", "CUSTOM", "TYPE"],
              ...fields.map((item) => [item.id, item.name, item.custom ? "yes" : "no", item.type ?? ""]),
            ]),
      );
    });
}
