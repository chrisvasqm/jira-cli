# AGENTS.md

`jira` is a Jira Cloud CLI written in TypeScript for Node.js. Agents use it in place of a Jira MCP server.

## Using the CLI

The agent guide is the `jira-cli` skill in [chrisvasqm/skills](https://github.com/chrisvasqm/skills/blob/main/skills/jira-cli/SKILL.md). It covers setup, safety rules, commands, `--json` data shapes and every error code. `npx skills add chrisvasqm/skills --skill jira-cli` installs it, so it has to stand alone.

When a command, flag, data shape or error code changes, update the README command table in the same PR, and open a matching PR for SKILL.md in chrisvasqm/skills.

Every flag has a short form (`-g` for `--global`). Give each new flag one too:

- Short flags are lowercase. Each one has a single meaning across all commands (`-n` how many, `-f` read text from a file, `-y` yes, `-b` board, `-sp` sprint, `-st` status).
- The first flag to use a letter keeps it. A later flag with another meaning gets two letters (`-st, --status` because `-s` is `--summary`). `src/core/flags.ts` registers these, rewrites them before commander parses, and fails at startup if one short flag gets two meanings.
- Never reuse the global `-j`/`-c` on a subcommand: commander also reads global flags after the subcommand.

## Working on this repo

- **Stack.**
  - Node 24, TypeScript (strict ESM, NodeNext, `.js` import suffixes), commander and zod.
  - `pnpm build` runs `tsc --noEmit`, then esbuild bundles everything into `dist/index.js`. Releases therefore have no runtime dependencies.
- **Layout.**
  - `src/core`: HTTP client singleton (auth, retries, timeouts, error mapping), config, output, prompts, ADF, paging, errors and argument parsers.
  - `src/services`: one class per Jira endpoint. Services turn 404s into `*_NOT_FOUND` codes where the resource is known.
  - `src/commands`: commander wiring and rendering only.
- **Checks.**
  - `pnpm check` runs the build, oxlint (max-depth 2, id-length ≥ 2, prefer-for-of, no-console) and `prettier --check`.
  - There are no automated tests (owner decision). Verify with `pnpm check` and a smoke run.
  - After a command or flag change, run `pnpm build && scripts/regression.sh .`. It runs every command with short flags against the configured Jira, creates throwaway tickets and deletes them. `SOFT` lines are features the board lacks (e.g. sprints).
  - Touch a live Jira only with the owner's OK. Create throwaway tickets, and delete them afterwards.
- **Config file.** `.jira-cli.json` (`baseUrl` https only, `email`, `apiToken`, `projectKey`, `boardId`) is gitignored and saved with mode 600. Never read it or commit it.
- **Dependencies.** pnpm only, with exact versions. Never relax the supply-chain policy in `pnpm-workspace.yaml`.
- **Pull requests.** Every change gets a branch and a squash-merged PR. There is no AI credit in commits or PRs. Bumping, release notes and `pnpm release` follow [README → Releasing](README.md#releasing).
