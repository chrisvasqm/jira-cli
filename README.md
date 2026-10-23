# jira-cli

A small command-line tool for working with Jira from the terminal as an alternative to the official JIRA MCP to consume less tokens while using agents.

## Getting started

```sh
pnpm install
pnpm dev setup      # prompts for Jira URL, email, API token, board
```

`setup` writes `.jira-cli.json` in the current directory (file mode 600). Keep it out of git; the command warns when it is not in `.gitignore`. Each directory can hold its own config, so different projects can point at different Jira sites or boards. `--global` writes `~/.config/jira-cli/config.json` as a fallback.

Config lookup order: `--config <path>`, nearest `.jira-cli.json` walking up from the current directory, then the global file.

Create an API token at https://id.atlassian.com/manage/api-tokens.

## Output

Every command prints a human-readable result by default. Add `--json` for `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code", "message", "details" } }` with a non-zero exit code on failure.
