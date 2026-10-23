# jira-cli

A small command-line tool for working with Jira from the terminal as an alternative to the official JIRA MCP to consume less tokens while using agents.

## Install

Download the latest release from the [Releases page](https://github.com/chrisvasqm/jira-cli/releases). Each release lists a one-line `npm install -g` command. You need Node.js 24 or newer.

## Getting started (development)

```sh
pnpm install
pnpm dev setup      # prompts for Jira URL, email, API token, board
pnpm check          # typecheck + build + lint + format
```

`setup` writes `.jira-cli.json` in the current directory (file mode 600). Keep it out of git; the command warns when it is not in `.gitignore`. Each directory can hold its own config, so different projects can point at different Jira sites or boards. `--global` writes `~/.config/jira-cli/config.json` as a fallback.

Config lookup order: `--config <path>`, nearest `.jira-cli.json` walking up from the current directory, then the global file.

Create an API token at https://id.atlassian.com/manage/api-tokens.

## Commands

| Command                         | What it does                                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jira setup`                    | Prompt for Jira URL, email, API token and board; write `.jira-cli.json`                                                                                                                                                                                                                 |
| `jira board`                    | List tickets on the configured board grouped by column. Sprint boards default to the active sprint(s). Filters: `--sprint active\|<id>\|all`, `--status <column or status>`, `--assignee me\|<email or accountId>`, `--jql <query>`, `--order-by <fields>`, `--limit <n>` (default 100) |
| `jira ticket view <KEY>`        | Show a ticket: fields, description (ADF rendered as text) and the latest comments. `--comments <n>` (default 5, 0 hides them)                                                                                                                                                           |
| `jira comment list <KEY>`       | All comments, oldest first. `--limit <n>` (default 50)                                                                                                                                                                                                                                  |
| `jira comment add <KEY> [text]` | Add a comment. `--file <path>` reads it from a file, `--file -` from stdin. Blank lines split paragraphs; ``` fences make code blocks                                                                                                                                                   |

## Output

Every command prints a human-readable result by default. Add `--json` for `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code", "message", "details" } }` with a non-zero exit code on failure.

## Releasing

Every feature or fix PR ships a release:

1. In the PR, bump the version: `pnpm bump minor` for a new command or visible feature, `pnpm bump patch` for fixes only. `1.0.0` comes when the roadmap is complete.
2. In the same PR, add `release-notes/vX.Y.Z.md`: English first, then Español, in plain non-technical language (what users can now do, how to install).
3. After the PR merges, sync `main` and run `pnpm release` before the next code PR merges (docs-only merges in between are fine). It needs `gh` logged in (`gh auth login`) with push access. If it fails after tagging, fix the cause and rerun it. It checks the tree, runs `pnpm check`, packs the CLI, tags the merge commit, and creates the GitHub release with the notes and the install tarball.
