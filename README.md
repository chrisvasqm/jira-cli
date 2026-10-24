# jira-cli

`jira` is a small command-line tool for Jira Cloud. Use it from the terminal, or let an AI agent use it instead of the Jira MCP server, for far fewer tokens.

## Install

You need Node.js 24 or newer. To install the latest release, or update to it, run:

```sh
curl -fsSL https://raw.githubusercontent.com/chrisvasqm/jira-cli/main/install.sh | sh
```

The [script](install.sh) checks your Node.js version, then runs `npm install -g` on the latest release. Each [release](https://github.com/chrisvasqm/jira-cli/releases) also lists the command for that exact version.

To teach your AI agent (Claude Code, Codex, Cursor and others) to use the CLI, run:

```sh
npx skills add chrisvasqm/jira-cli
```

## Set up

Run `jira setup` in the project directory. It asks for:

- your Jira URL (`https://…`);
- your Atlassian email;
- an [API token](https://id.atlassian.com/manage/api-tokens);
- a board;
- a project key.

It saves them to `.jira-cli.json` with file mode 600. Add `--global` to save to `~/.config/jira-cli/config.json` instead, or pass `--config <path>` to choose the file.

- Keep the file out of git, because it holds your token. `setup` warns you when git does not ignore it.
- Each directory can have its own config, so different projects can use different Jira sites or boards.

The CLI looks for a config in this order:

1. `--config <path>`;
2. the nearest `.jira-cli.json`, walking up from the current directory;
3. the global file.

## Commands

| Command                               | What it does                                                      |
| ------------------------------------- | ----------------------------------------------------------------- |
| `jira board [view [id]]`              | Tickets on a board (default: yours), grouped by column            |
| `jira board list`                     | Boards you can see; `*` marks yours                               |
| `jira board use <id>`                 | Make a board and its project the default                          |
| `jira ticket view <KEY>`              | Fields, description and latest comments (`--comments <0-100>`, 5) |
| `jira ticket create`                  | New ticket (`--summary` is required)                              |
| `jira ticket edit <KEY>`              | Change only the fields you pass                                   |
| `jira ticket move <KEY> [target]`     | Change the status; with no target, list the allowed moves         |
| `jira ticket delete <KEY>`            | Delete a ticket (`--with-subtasks` also deletes its sub-tasks)    |
| `jira comment list <KEY>`             | All comments, oldest first (`--limit <n>`, 50)                    |
| `jira comment add <KEY> [text]`       | Add a comment                                                     |
| `jira comment edit <KEY> <id> [text]` | Replace a comment's text                                          |
| `jira comment delete <KEY> <id>`      | Delete a comment                                                  |
| `jira setup`                          | Create the config (see [Set up](#set-up))                         |

- **Board filters:**
  - `--status <column or status>`
  - `--assignee me|none|<email, name or accountId>`
  - `--sprint active|all|<id>`
  - `--jql <extra JQL>`
  - `--order-by <JQL>`
  - `--limit <n>` (default 100)

  Sprint boards show the active sprints by default.

- **Ticket fields (`create` and `edit`):**
  - `--summary`
  - `--description <text>`, or `--description-file <path>` (`-` reads stdin). On `edit`, `--description ""` clears the description.
  - `--priority <name>`
  - `--assignee me|none|<email, name or accountId>`
  - `--add-label` (repeatable)
  - `create` also takes `--type` (default Task), `--parent <KEY>` and `--project <KEY>`.
  - `edit` also takes `--remove-label`.
- **Move targets:** a status name, a transition name or id, or a board column. Case does not matter.
- **Comment text:** pass it inline, or use `--file <path>` (`-` reads stdin).
  - A blank line starts a new paragraph.
  - A single newline is a line break.
  - Lines between ` ``` ` fences become a code block.
- **Deletes** ask you to type "yes". `--yes` (`-y`) skips the question. With no terminal (scripts, agents), a delete without `--yes` fails with `CONFIRM_REQUIRED`.

Run `jira <command> --help` for every option.

## Output

Every command prints readable text by default. Add `--json` to get one line on stdout:

- on success: `{ "ok": true, "data": … }`
- on failure: `{ "ok": false, "error": { "code", "message", "details" } }`

Exit codes:

- `0`: success
- `2`: bad usage or missing input
- `130`: cancelled with Ctrl+C
- `1`: any other error

The [agent skill](skills/jira-cli/SKILL.md) lists the data shapes and every error code.

## Development

```sh
pnpm install
pnpm dev board      # run from source
pnpm check          # type-check, bundle, lint, format check
pnpm add -g .       # once: use your local build as the global `jira` (then `pnpm build` after changes)
```

[AGENTS.md](AGENTS.md) covers the layout and the repo rules.

## Releasing

Every feature or fix PR ships a release.

1. **Bump the version in the PR:**
   - `pnpm bump minor` for a new command or visible feature;
   - `pnpm bump patch` for fixes only;
   - `pnpm bump major` for a breaking change.
2. **Write a clear squash commit subject** (the PR title), such as "Add ticket delete". The release notes list the subjects of every commit since the previous release.
3. **After the merge, run `pnpm release` on an up-to-date `main`**, before the next code PR merges. Docs-only merges in between are fine.
   - It needs `gh auth login` with push access.
   - It runs `pnpm check`, packs the CLI, tags the commit, and creates the GitHub release with notes built from the commit subjects, `jira-cli-X.Y.Z.tgz` and `jira-cli.tgz` (the latest-version link).
   - If it fails after tagging, fix the cause and run it again.
