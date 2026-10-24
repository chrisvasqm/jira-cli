# AGENTS.md

`jira` is a Jira Cloud CLI written in TypeScript for Node.js. Agents use it in place of a Jira MCP server.

## Using the CLI

[skills/jira-cli/SKILL.md](skills/jira-cli/SKILL.md) is the agent guide. It covers setup, safety rules, commands, `--json` data shapes and every error code. It is also the skill that `npx skills add chrisvasqm/jira-cli` installs, so it has to stand alone.

When a command, flag, data shape or error code changes, update SKILL.md and the README command table in the same PR.

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
  - Touch a live Jira only with the owner's OK. Create throwaway tickets, and delete them afterwards.
- **Config file.** `.jira-cli.json` (`baseUrl` https only, `email`, `apiToken`, `projectKey`, `boardId`) is gitignored and saved with mode 600. Never read it or commit it.
- **Dependencies.** pnpm only, with exact versions. Never relax the supply-chain policy in `pnpm-workspace.yaml`.
- **Pull requests.** Every change gets a branch and a squash-merged PR. There is no AI credit in commits or PRs. Bumping, release notes and `pnpm release` follow [README → Releasing](README.md#releasing).
