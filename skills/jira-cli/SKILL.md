---
name: jira-cli
description: Read and update Jira Cloud tickets from the shell with the `jira` CLI. Use it to see a board, read a ticket and its comments, create, edit, move (change status) or delete tickets, and add, edit or delete comments. Use it instead of a Jira MCP server when the user mentions Jira, a ticket key like ABC-123, a board, a sprint or a ticket's status.
---

# jira-cli

`jira` is a small Jira Cloud CLI. Every command takes `--json` and then prints one line, either `{"ok":true,"data":...}` or `{"ok":false,"error":{"code","message","details"}}`.

## Before you start

1. Run `jira -v` to check that the CLI is installed. If it is not, ask the user before you install it. It needs Node.js 24 or newer:
   ```sh
   npm install -g https://github.com/chrisvasqm/jira-cli/releases/latest/download/jira-cli.tgz
   ```
2. If a command fails with `CONFIG_MISSING` or `AUTH_FAILED`, ask the user to run `jira setup` in the project directory. It prompts for the Jira URL, email, API token and board.
   - Never run `jira setup` yourself.
   - Never ask the user to paste the token into the chat.
   - Never read or print `.jira-cli.json`. It holds the token.

## Rules

- Always pass `--json`. Check `ok` and branch on `error.code`. Never parse the human output.
- Read before you write: run `jira ticket view <KEY> --json` before you edit, move or delete a ticket.
- Change only what the user asked for. `ticket edit` changes just the flags you pass.
- Deletes need `--yes` in a non-interactive shell. Add it only when the user clearly asked for the delete.
- Text format for comments and descriptions:
  - A blank line starts a new paragraph.
  - A single newline is a line break.
  - A block between ` ``` ` fences is code.
  - For long text, write a file and pass `--file <path>` (comments) or `--description-file <path>`.

## Commands

```sh
jira board --json                                   # configured board, tickets grouped by column
jira board --assignee me --status "In Progress" --json
jira board view <boardId> --json                    # another board; jira board list --json shows ids
jira board use <boardId> --json                     # change the default board (writes the config)

jira ticket view KAN-12 --comments 20 --json        # fields, description, latest comments (max 100)
jira ticket create --summary "..." [--type Bug] [--parent KAN-3] [--description-file f.md] [--assignee me] [--priority High] [--add-label x] --json
jira ticket edit KAN-12 [--summary ...] [--description ... | --description-file f.md] [--priority High] [--assignee me|none|<email>] [--add-label x] [--remove-label y] --json
jira ticket move KAN-12 --json                      # list allowed moves
jira ticket move KAN-12 "In Review" --json          # status, transition or board column name
jira ticket delete KAN-12 --yes --json

jira comment list KAN-12 [--limit 200] --json       # oldest first
jira comment add KAN-12 "text" --json               # or --file notes.md, or --file - (stdin)
jira comment edit KAN-12 10001 "new text" --json
jira comment delete KAN-12 10001 --yes --json
```

Board filters: `--status <column or status>`, `--assignee me|none|<email, name or accountId>`, `--sprint active|all|<id>`, `--jql "<extra JQL>"`, `--order-by "<JQL>"`, `--limit <n>` (100). If `data.hasMore` is true, there are more tickets than were fetched; raise `--limit`.

## Errors

| `error.code`                                               | Next step                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `USAGE` (exit 2)                                           | Fix the command (`jira <cmd> --help`). Do not retry it unchanged.                |
| `CONFIG_MISSING`, `CONFIG_INVALID`, `AUTH_FAILED`          | Ask the user to run `jira setup`.                                                |
| `TICKET_NOT_FOUND`, `COMMENT_NOT_FOUND`, `BOARD_NOT_FOUND` | Check the key or id.                                                             |
| `NO_TRANSITION`                                            | `details` lists the allowed moves `[{id, name, to}]`. Pick one, or ask the user. |
| `TRANSITION_AMBIGUOUS`                                     | Pass a transition `id` from `details`.                                           |
| `USER_NOT_FOUND`, `USER_AMBIGUOUS`                         | Use the exact email or accountId. `details` lists the candidates.                |
| `NO_SPRINTS`, `NO_ACTIVE_SPRINT`                           | Retry with `--sprint all`.                                                       |
| `CONFIRM_REQUIRED`                                         | The delete needs `--yes`. Confirm with the user first.                           |
| `FORBIDDEN`, `JIRA_ERROR`                                  | Jira refused. Tell the user the reason from `details`.                           |
| `NETWORK_ERROR`                                            | Jira is unreachable. GETs were already retried, so tell the user.                |

## Workflow: pick up a ticket

```sh
jira ticket view KAN-12 --comments 20 --json
jira ticket edit KAN-12 --assignee me --json
jira ticket move KAN-12 "In Progress" --json
jira comment add KAN-12 --file plan.md --json
```
