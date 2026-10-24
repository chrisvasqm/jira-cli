# jira-cli

`jira` is a small command-line tool for Jira Cloud. Use it from the terminal, or let an AI agent use it instead of the Jira MCP server, for far fewer tokens.

## Install

You need Node.js 24 or newer. To install the latest release, or update to it, run:

```sh
curl -fsSL https://raw.githubusercontent.com/chrisvasqm/jira-cli/main/install.sh | sh
```

The [script](install.sh) checks your Node.js version, downloads the latest release, verifies its SHA-256 checksum, then installs it with `npm install -g`. Each [release](https://github.com/chrisvasqm/jira-cli/releases) also lists the command for that exact version.

To teach your AI agent (Claude Code, Codex, Cursor and others) to use the CLI, run:

```sh
npx skills add chrisvasqm/skills --skill jira-cli
```

`npx skills add chrisvasqm/skills` adds every skill there, including the one for [testrail-cli](https://github.com/chrisvasqm/testrail-cli).

## Set up

Run `jira setup` in the project directory. It asks for:

- your Jira URL (`https://…`);
- your Atlassian email;
- an [API token](https://id.atlassian.com/manage/api-tokens);
- a board;
- a project key.

It saves them to `.jira-cli.json` with file mode 600. If that file already exists, it asks before replacing it (`--yes`, `-y` skips the question). Add `--global` (`-g`) to save to `~/.config/jira-cli/config.json` instead, or pass `--config <path>` (`-c`) to choose the file.

- Keep the file out of git, because it holds your token. `setup` warns you when git does not ignore it.
- Each directory can have its own config, so different projects can use different Jira sites or boards.

The CLI looks for a config in this order:

1. `--config <path>`;
2. the nearest `.jira-cli.json`, walking up from the current directory;
3. the global file.

## Use it with an agent

With the skill installed, ask in plain words and the agent runs the commands. Some examples:

- **Your day**
  - "What's on my plate today?" → `jira board -a me -sp active`
  - "Catch me up on KAN-42." → `jira ticket view KAN-42 -n 20`, then a summary of the ticket, the discussion and what blocks it
  - "I'm starting KAN-42." → `jira ticket edit KAN-42 -a me` and `jira ticket move KAN-42 "In Progress"`
  - "Done with KAN-42, the fix is in PR #88." → `jira comment add KAN-42 "…"` and `jira ticket move KAN-42 Done`
- **While coding**
  - "Read KAN-57 and implement it." → the agent reads the ticket, writes the code, opens the PR, comments the link and moves the ticket to review.
  - "File a bug for the date parser problem we just found." → `jira ticket create -t Bug -s "…" -f - -p High -l parser`, with repro steps from the code
  - "Split KAN-60 into sub-tasks that match this plan." → one `jira ticket create -pa KAN-60 -t Subtask -s "…"` per step
  - "Put this stack trace on KAN-61." → `jira comment add KAN-61 -f -`, kept as a code block
- **Triage**
  - "Which To Do tickets have no assignee? Give me the backend ones." → `jira board -a none -s "To Do"`, then `jira ticket edit … -a me`
  - "Put every `urgent` ticket in the active sprint." → `jira board -q 'labels = urgent'`, then `jira ticket edit … -sp active`
  - "Rewrite KAN-70's description as acceptance criteria." → `jira ticket view KAN-70`, then `jira ticket edit KAN-70 -f -`
  - "Delete the tickets I made for the demo." → the agent lists them, waits for your OK, then runs `jira ticket delete … -y`
- **Standups and sprints**
  - "Write my standup." → your board and recent comments, turned into yesterday, today and blockers
  - "How is the sprint going?" → `jira report sprint` and `jira report workload`: what is at risk and who is overloaded
  - "Are we getting faster?" → `jira report velocity -s 8` and `jira report flow -d 90`: trends and the oldest stuck tickets
- **With [testrail-cli](https://github.com/chrisvasqm/testrail-cli)**
  - "Write test cases for KAN-80." → the agent reads the acceptance criteria and creates cases linked to KAN-80.
  - "T45 failed. File a bug." → `testrail result add T45 --status failed --comment "…" --create-bug`

The agent adds `--json` to each command, so it reads exact data and stable error codes instead of screen text.

## Commands

| Command                               | What it does                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `jira board [view [id]]`              | Tickets on a board (default: yours), grouped by column                        |
| `jira board list`                     | Boards you can see; `*` marks yours                                           |
| `jira board use <id>`                 | Make a board and its project the default                                      |
| `jira ticket list`                    | Search tickets (default: not done in your project, latest updated first)      |
| `jira filter list`                    | Saved filters you own or marked as favourite (`-n, --limit <n>`, 50)          |
| `jira ticket view <KEY>`              | Fields, description and latest comments (`-n, --comments <0-100>`, 5)         |
| `jira ticket create`                  | New ticket (`-s, --summary` is required)                                      |
| `jira ticket edit <KEY>`              | Change only the fields you pass                                               |
| `jira ticket move <KEY> [target]`     | Change the status; with no target, list the allowed moves                     |
| `jira ticket history <KEY>`           | Change history, newest first: who changed which field (`-n, --limit <n>`, 20) |
| `jira ticket rank <KEY...>`           | Backlog order: put tickets before (`-bf`) or after (`-af`) another ticket     |
| `jira ticket delete <KEY>`            | Delete a ticket (`-w, --with-subtasks` also deletes sub-tasks)                |
| `jira comment list <KEY>`             | All comments, oldest first (`-n, --limit <n>`, 50)                            |
| `jira comment add <KEY> [text]`       | Add a comment                                                                 |
| `jira comment edit <KEY> <id> [text]` | Replace a comment's text                                                      |
| `jira comment delete <KEY> <id>`      | Delete a comment                                                              |
| `jira attachment list <KEY>`          | A ticket's attachments: id, filename, size, type, author, created             |
| `jira attachment add <KEY> <file...>` | Upload one or more files                                                      |
| `jira attachment get <KEY> <id>`      | Download an attachment (`-ou, --output <path>`, default: its filename here)   |
| `jira attachment delete <KEY> <id>`   | Delete an attachment                                                          |
| `jira worklog list <KEY>`             | Time logged on a ticket (`-n, --limit <n>`, 50)                               |
| `jira worklog add <KEY> <duration>`   | Log time, e.g. `2h30m`, `1d`, `45m`                                           |
| `jira worklog delete <KEY> <id>`      | Delete a worklog                                                              |
| `jira link list <KEY>`                | Issue links and web links                                                     |
| `jira link add <KEY> <type> <OTHER>`  | Link two tickets, e.g. `KAN-1 blocks KAN-2` or `KAN-1 is blocked by KAN-2`    |
| `jira link add <KEY> <url>`           | Add a web link (`-ti, --title <text>`, default: the URL)                      |
| `jira link remove <KEY> <id>`         | Remove an issue link (`10001`) or a web link (`w10000`)                       |
| `jira link types`                     | Issue link types: name, outward and inward phrase                             |
| `jira watcher list <KEY>`             | Who watches a ticket, the count, and whether you do                           |
| `jira watcher add <KEY> [user]`       | Watch a ticket, or add a watcher (default: me)                                |
| `jira watcher remove <KEY> [user]`    | Stop watching, or remove a watcher (default: me)                              |
| `jira sprint list`                    | A board's sprints (`-se, --state open\|active\|future\|closed\|all`, open)    |
| `jira sprint view [id]`               | A sprint (default: the active sprint; `SPRINT_AMBIGUOUS` if several)          |
| `jira sprint create`                  | New future sprint (`-na, --name` is required, at most 30 characters)          |
| `jira sprint edit <id>`               | Change only the fields you pass                                               |
| `jira sprint start <id>`              | Start a future sprint (default: now, for two weeks)                           |
| `jira sprint close <id>`              | Close the active sprint; unfinished tickets go back to the backlog            |
| `jira sprint delete <id>`             | Delete a sprint; its tickets go back to the backlog                           |
| `jira report flow`                    | Throughput per week, cycle and lead time, oldest open tickets                 |
| `jira report workload`                | Open tickets per person and status                                            |
| `jira report sprint [id]`             | A sprint's done and not-done tickets (default: active, else last closed)      |
| `jira report velocity`                | Tickets and points done per closed sprint (`-n, --sprints <n>`, 6)            |
| `jira user search <text>`             | People whose name or email starts with the text (`-n, --limit <n>`, 20)       |
| `jira user view [who]`                | A user: `me` (default), an email, a name or an accountId                      |
| `jira setup`                          | Create the config (see [Set up](#set-up))                                     |

- **Board filters:**
  - `-st, --status <column or status>`
  - `-a, --assignee me|none|<email, name or accountId>`
  - `-sp, --sprint active|all|<id>`
  - `-q, --jql <extra JQL>`
  - `-o, --order-by <JQL>`
  - `-n, --limit <n>` (default 100)

  Sprint boards show the active sprints by default.

- **Ticket search (`ticket list`):**
  - `-k, --project <KEY>` (default: your project)
  - `-q, --jql <extra JQL>`, joined with AND. Without `-q`, done tickets are left out.
  - `-a, --assignee me|none|<email, name or accountId>`
  - `-st, --status <name>`
  - `-t, --type <name>`
  - `-sp, --sprint active|<id>|<name>|none`: a sprint of the configured board, or tickets in no sprint
  - `-fi, --filter <id or name>`: start from a saved filter instead of your project (add `-k` to keep a project too)
  - `-o, --order-by <JQL>` (default `updated DESC`)
  - `-n, --limit <n>` (default 50, at most 1000)

  Jira rejects bad JQL with `JQL_INVALID`.

- **Ticket fields (`create` and `edit`):**
  - `-s, --summary`
  - `-d, --description <text>`, or `-f, --description-file <path>` (`-` reads stdin). On `edit`, `--description ""` clears the description.
  - `-p, --priority <name>`
  - `-a, --assignee me|none|<email, name or accountId>`
  - `-l, --add-label` (repeatable)
  - `-sp, --sprint active|<id>|<name>|none`: put the ticket in a sprint of the configured board, or back in the backlog with `none`
  - `-es, --estimate <duration>` and `-re, --remaining <duration>`: original and remaining estimate, e.g. `2h30m` or `1d`. `TIME_TRACKING_DISABLED` when the site has time tracking off.
  - `create` also takes `-t, --type` (default Task), `-pa, --parent <KEY>` and `-k, --project <KEY>`.
  - `edit` also takes `-rl, --remove-label`.
- **Sprint fields (`create`, `edit`, `start`):** `-na, --name`, `-go, --goal` (`""` clears it on `edit`), `-sd, --start <date>`, `-e, --end <date>` (`2026-10-24` or an ISO timestamp). `list`, `view` and `create` take `-b, --board <id>`; `close` and `delete` ask first (`-y, --yes`). The board must use sprints (`NO_SPRINTS` otherwise).
- **Reports** use the configured board, or `-b, --board <id>`. `flow` looks back `-da, --days <n>` (30); `flow` and `workload` take `-n, --limit <n>`. Cycle time runs from the first "in progress" status to done; lead time from created to done.
- **Users:** `user search` takes `-k, --project <KEY>` to list only people who can be assigned tickets in that project. No match prints an empty list. `user view` shows the account id, email (when the profile shows it), time zone and status; a name that matches several people fails with `USER_AMBIGUOUS`.
- **Move targets:** a status name, a transition name or id, or a board column. Case does not matter.
- **History:** each entry shows who changed what and when, one `field: from → to` line per field. Long values are cut to 60 characters; `--json` keeps them whole, with `null` for an empty value.
- **Rank:** `jira ticket rank KAN-5 KAN-6 -bf KAN-2` puts KAN-5, then KAN-6, right before KAN-2; `-af, --after <KEY>` puts them right after. Pass exactly one of `-bf, --before` and `-af, --after`, at most 50 tickets. If Jira ranks only some of them, the command fails with `RANK_FAILED` and lists each failed ticket.
- **Comment text:** pass it inline, or use `-f, --file <path>` (`-` reads stdin).
  - A blank line starts a new paragraph.
  - A single newline is a line break.
  - Lines between ` ``` ` fences become a code block.
- **Attachments:** `get` saves to `-ou, --output <path>`, a file or an existing directory; by default it uses the attachment's filename in the current directory. It does not overwrite a file unless you pass `-y, --yes` (`FILE_EXISTS` otherwise). `add` checks every file before it uploads any (`FILE_ERROR`). `get` and `delete` refuse an id that is not on the ticket (`ATTACHMENT_NOT_FOUND`).
- **Worklogs:** a duration is weeks, days, hours and minutes (`1w`, `1d`, `2h30m`, `45m`). `add` takes `-sd, --start <date>` (default now) and a note with `-d, --description <text>` or `-f, --file <path>` (`-` reads stdin). Logging time lowers the remaining estimate. `ticket view` shows time spent, remaining and the estimate. With time tracking off, worklog commands fail with `TIME_TRACKING_DISABLED`; an unknown worklog id gives `WORKLOG_NOT_FOUND`.
- **Links:** `<type>` is a link type's name, outward or inward phrase from `jira link types`, case-insensitive; quotes are optional (`is blocked by`). An inward phrase links the other way: `jira link add KAN-1 is blocked by KAN-2` means KAN-2 blocks KAN-1. Web link ids start with `w`, so `link remove` knows which kind to remove. `remove` asks first (`-y, --yes`).
- **Watchers:** `[user]` is `me`, an email, a name or an accountId. `add` and `remove` are idempotent: adding a watcher who already watches, or removing one who does not, succeeds with `changed: false` and a `note`. `remove` does not ask first. `WATCHING_DISABLED` means the site turned watching off.
- **Deletes** ask you to type "yes". `--yes` (`-y`) skips the question. With no terminal (scripts, agents), a delete without `--yes` fails with `CONFIRM_REQUIRED`.

Every option has a short form, shown above. Short flags are lowercase, and some have two letters (`-st`, `-sp`), so write them apart: `-y -j`, not `-yj`. Run `jira <command> --help` for every option.

## Output

Every command prints readable text by default. Add `--json` (`-j`) to get one line on stdout:

- on success: `{ "ok": true, "data": … }`
- on failure: `{ "ok": false, "error": { "code", "message", "details" } }`

Exit codes:

- `0`: success
- `2`: bad usage or missing input
- `130`: cancelled with Ctrl+C
- `1`: any other error

The [agent skill](https://github.com/chrisvasqm/skills/blob/main/skills/jira-cli/SKILL.md) lists the data shapes and every error code.

## Development

```sh
pnpm install
pnpm dev board      # run from source
pnpm check          # type-check, bundle, lint, format check
pnpm add -g .       # once: use your local build as the global `jira` (then `pnpm build` after changes)
```

[AGENTS.md](AGENTS.md) covers the layout and the repo rules. `pnpm build && scripts/regression.sh .` runs every command with short flags against your configured Jira; it creates throwaway tickets and deletes them.

## Releasing

Every feature or fix PR ships a release.

1. **Bump the version in the PR:**
   - `pnpm bump minor` for a new command or visible feature;
   - `pnpm bump patch` for fixes only;
   - `pnpm bump major` for a breaking change.
2. **Write a clear squash commit subject** (the PR title), such as "Add ticket delete". The release notes list the subjects of every commit since the previous release.
3. **After the merge, run `pnpm release` on an up-to-date `main`**, before the next code PR merges. Docs-only merges in between are fine.
   - It needs `gh auth login` with push access.
   - It runs `pnpm check`, packs the CLI, tags the commit, and creates the GitHub release with notes built from the commit subjects, the checksum file `jira-cli.tgz.sha256`, `jira-cli-X.Y.Z.tgz` and `jira-cli.tgz` (the latest-version link).
   - If it fails after tagging, fix the cause and run it again. A rerun also finishes a draft or partial release.
