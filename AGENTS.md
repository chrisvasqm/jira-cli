# AGENTS.md

`jira` is a small Jira Cloud CLI built for people and for LLM agents. It replaces a Jira MCP server with plain shell commands. The output is short in human mode and exact in `--json` mode, so it costs few tokens.

This file has two parts: **Using the CLI** (for agents that run `jira`) and **Working on this repo** (for agents that change the code).

## Using the CLI

### Rules for agents

- Always add `--json`, and read `ok` before anything else. Never parse the human output.
- Read before you write: `ticket view` a ticket before you `edit`, `move` or `delete` it.
- Deletes need `--yes` when there is no terminal. Without it they fail with `CONFIRM_REQUIRED` and change nothing. Pass `--yes` only when the user asked for the delete.
- Never read, print or commit `.jira-cli.json`. It holds the API token. Run `jira setup` only when a person is at the terminal, because it prompts for the token.
- Text you put into Jira (comments, descriptions) is plain text. A blank line starts a new paragraph, a single newline is a line break, and lines between ` ``` ` fences become a code block. Write longer text to a file and pass `--file <path>`, or pipe it in with `--file -`.

### Commands

| Command                                 | Does                                                                    | Useful flags                                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jira board` (= `jira board view [id]`) | Tickets on the configured board (or board `id`), grouped by column      | `--status <column or status>`, `--assignee me\|none\|<email, name or accountId>`, `--sprint active\|all\|<id>`, `--jql <extra JQL>`, `--order-by <JQL>`, `--limit <n>` (100)            |
| `jira board list`                       | Boards you can see; `current: true` marks the configured one            |                                                                                                                                                                                         |
| `jira board use <id>`                   | Make a board (and its project) the default in the config file           |                                                                                                                                                                                         |
| `jira ticket view <KEY>`                | Fields, description (ADF as Markdown-like text) and the latest comments | `--comments <0-100>` (5)                                                                                                                                                                |
| `jira ticket create`                    | New ticket in the configured project                                    | `--summary` (required), `--type` (Task), `--parent <KEY>`, `--project <KEY>`, plus the field flags below except `--remove-label`                                                        |
| `jira ticket edit <KEY>`                | Changes only the fields you pass                                        | `--summary`, `--description <text>` (`""` clears it) or `--description-file <path\|->`, `--priority <name>`, `--assignee me\|none\|<who>`, `--add-label`, `--remove-label` (repeatable) |
| `jira ticket move <KEY> [target]`       | Change status. Without a target, lists the allowed moves                | target = status name, transition name or id, or board column name (case-insensitive)                                                                                                    |
| `jira ticket delete <KEY>`              | Delete a ticket                                                         | `--yes`, `--with-subtasks`                                                                                                                                                              |
| `jira comment list <KEY>`               | All comments, oldest first                                              | `--limit <n>` (50)                                                                                                                                                                      |
| `jira comment add <KEY> [text]`         | Add a comment                                                           | `--file <path\|->`                                                                                                                                                                      |
| `jira comment edit <KEY> <id> [text]`   | Replace a comment's text                                                | `--file <path\|->`                                                                                                                                                                      |
| `jira comment delete <KEY> <id>`        | Delete a comment                                                        | `--yes`                                                                                                                                                                                 |
| `jira setup`                            | Interactive: URL, email, token, board, project; writes `.jira-cli.json` | `--global`                                                                                                                                                                              |

Global flags, which go before or after the command: `--json` and `--config <path>`. Ticket keys are case-insensitive (`kan-1` works). Comment ids may start with `#`.

### Output contract

- Success: `{"ok": true, "data": {...}}` on stdout, exit `0`.
- Failure: `{"ok": false, "error": {"code", "message", "details"}}` on stdout, exit `1` or `2`.
- Prompts, hints and progress go to stderr, so stdout stays one JSON line.

| Exit | Meaning                                                |
| ---- | ------------------------------------------------------ |
| 0    | Success                                                |
| 1    | Jira, network, config or not-found error               |
| 2    | Bad usage (`USAGE`) or input ended early (`INPUT_EOF`) |
| 130  | Cancelled with Ctrl+C                                  |

The main `data` shapes:

- `board`: `{ boardId, boardType, jql, note, total, fetched, hasMore, columns: [{ name, issues: [{ key, type, summary, status, priority, assignee, updated }] }] }`. Every board column is listed, even an empty one. If `hasMore` is true, raise `--limit`.
- `ticket view`: `{ key, url, type, status, summary, priority, assignee, reporter, labels, parent: { key, summary } | null, created, updated, description, comments: { total, shown: [comment] } }`
- comment: `{ id, author, created, updated, body }` (`body` is text)
- `ticket move` with no target: `{ key, transitions: [{ id, name, to }] }`. With a target: `{ key, status, transition }`.
- `ticket create`: `{ key, id, url }`. `ticket edit`: `{ key, url, changed: [field] }`.
- Deletes: `{ key, deleted: true }` (comments also return `id`).

Timestamps are Jira ISO strings. People are display names, and `null` means unassigned or unknown.

### Error codes

| Code                                                       | What to do                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `USAGE`                                                    | Fix the command (see `jira <cmd> --help`). Do not retry it as is.                                       |
| `CONFIG_MISSING`, `CONFIG_INVALID`                         | Ask the user to run `jira setup`.                                                                       |
| `AUTH_FAILED`                                              | The token or email is wrong or expired. Ask the user to run `jira setup` again.                         |
| `FORBIDDEN`                                                | The account lacks the permission. `details` holds Jira's reason.                                        |
| `TICKET_NOT_FOUND`, `COMMENT_NOT_FOUND`, `BOARD_NOT_FOUND` | Check the key or id (`board list`, `comment list`).                                                     |
| `NO_TRANSITION`                                            | `details` lists the allowed moves `[{ id, name, to }]`. Pick one of them.                               |
| `TRANSITION_AMBIGUOUS`                                     | Pass the transition id from `details`.                                                                  |
| `USER_NOT_FOUND`, `USER_AMBIGUOUS`                         | Use an exact email or accountId. `details` lists the candidates.                                        |
| `NO_SPRINTS`, `NO_ACTIVE_SPRINT`                           | Use `--sprint all`.                                                                                     |
| `CONFIRM_REQUIRED`                                         | A delete needs `--yes`. Only add it when the user asked for the delete.                                 |
| `CANCELLED`, `INTERRUPTED`, `INPUT_EOF`                    | The person stopped, or stdin ended. Nothing changed.                                                    |
| `JIRA_ERROR`                                               | Jira rejected the request (for example a required field or an unknown priority). Read `details.errors`. |
| `NETWORK_ERROR`, `INVALID_RESPONSE`                        | Jira could not be reached, or `baseUrl` is not a Jira site. GETs are already retried.                   |
| `FILE_ERROR`                                               | The `--file` path could not be read.                                                                    |

### Config lookup

1. `--config <path>`.
2. The nearest `.jira-cli.json`, walking up from the current directory. Each project directory can use a different Jira site or board.
3. `~/.config/jira-cli/config.json`, written by `jira setup --global`.

The file holds `baseUrl` (https only), `email`, `apiToken`, `projectKey` and `boardId`. It is saved with mode 600, and `setup` warns when git does not ignore it.

### Workflows

```sh
# What is on the board, and what is mine?
jira board --json
jira board --assignee me --status "In Progress" --json

# Understand a ticket before working on it
jira ticket view KAN-12 --comments 20 --json

# Pick it up: assign, move, leave a note
jira ticket edit KAN-12 --assignee me --json
jira ticket move KAN-12 "In Progress" --json
jira comment add KAN-12 "Starting on this. Plan: ..." --json

# Report back with a longer comment from a file
jira comment add KAN-12 --file notes.md --json

# Not sure which statuses are allowed? List them first
jira ticket move KAN-12 --json

# File a bug under an epic
jira ticket create --type Bug --summary "Login fails on Safari" --parent KAN-3 --description-file bug.md --json
```

## Working on this repo

- **Stack.**
  - Node 24, TypeScript (strict, ESM, NodeNext, `.js` import suffixes), commander and zod.
  - `pnpm build` type-checks with tsc, then bundles everything with esbuild into `dist/index.js`. The release has no runtime dependencies.
- **Layout.**
  - `src/core`: HTTP client singleton (auth, retries, timeouts, error mapping), config, output, prompts, ADF, errors, arg parsers.
  - `src/services`: one class per Jira endpoint. Services map 404s to `*_NOT_FOUND` codes.
  - `src/commands`: commander wiring and rendering only.
- **Checks.**
  - `pnpm check` runs the build (typecheck plus bundle), oxlint and `prettier --check`.
  - Lint rules: max-depth 2, id-length 2 or more, prefer-for-of, no-console.
  - This repo has no automated tests (owner decision). Verify with `pnpm check` plus a smoke run. Only touch a live Jira if the owner allows it.
- **Dependencies.**
  - pnpm only, with exact versions.
  - The supply-chain policy in `pnpm-workspace.yaml` (7-day minimum release age, `trustPolicy: no-downgrade`) is never relaxed.
- **Pull requests.**
  - Every change goes on a branch with a PR. Squash merge.
  - Each PR bumps the version with `pnpm bump minor|patch`.
  - Each PR adds `release-notes/vX.Y.Z.md`: English, then Español, in plain non-technical words, with the install URL.
  - After the merge, run `pnpm release` on `main`. It tags `vX.Y.Z` and creates the GitHub release with the tarball.
- **Commits.** No AI credit in commits or PRs.
