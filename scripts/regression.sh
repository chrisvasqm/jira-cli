#!/usr/bin/env bash
# Live regression of every command using only short flags.
# Creates throwaway tickets in the configured project and deletes them at the end.
# Usage: pnpm build && scripts/regression.sh .
set -u
REPO=${1:?repo path}
J=(node "$REPO/dist/index.js")
PASS=0 FAIL=0 SOFT=0
KEY="" SUB="" SPR=""
TMP=$(mktemp -d)
KEY="" SUB="" SPR="" LNK=""
KEY="" SUB="" SPR="" RNK=""
BK1="" BK2=""
EPC="" ECH=""

# run <name> <expect: ok|fail|soft> -- cmd...   (soft = may fail on some boards/projects)
run() {
  local name=$1 expect=$2; shift 3
  local out code
  out=$("${J[@]}" "$@" 2>/dev/null); code=$?
  local okv; okv=$(jq -r '.ok | tostring' <<<"$out" 2>/dev/null)
  if [[ $expect == ok && $code == 0 && $okv == true ]] || [[ $expect == soft && $code == 0 && $okv == true ]] || [[ $expect == fail && $code != 0 && $okv == false ]]; then
    PASS=$((PASS + 1)); echo "PASS $name"
  elif [[ $expect == soft ]]; then
    SOFT=$((SOFT + 1)); echo "SOFT $name (exit $code) $(jq -c '.error // empty' <<<"$out" 2>/dev/null)"
  else
    FAIL=$((FAIL + 1)); echo "FAIL $name (exit $code) $(head -c 300 <<<"$out")"
  fi
  LAST=$out
}

# code_is <name> <code>: the last run failed with exactly this error code.
code_is() {
  if [[ $(jq -r '.error.code // empty' <<<"$LAST") == "$2" ]]; then
    PASS=$((PASS + 1)); echo "PASS $1"
  else
    FAIL=$((FAIL + 1)); echo "FAIL $1 $(head -c 300 <<<"$LAST")"
  fi
}

cleanup() {
  [[ -n $SPR ]] && "${J[@]}" sprint delete "$SPR" -y -j >/dev/null 2>&1
  [[ -n $LNK ]] && "${J[@]}" ticket delete "$LNK" -y -w -j >/dev/null 2>&1
  [[ -n $SUB ]] && "${J[@]}" ticket delete "$SUB" -y -j >/dev/null 2>&1
  [[ -n $RNK ]] && "${J[@]}" ticket delete "$RNK" -y -j >/dev/null 2>&1
  [[ -n $ECH ]] && "${J[@]}" ticket delete "$ECH" -y -w -j >/dev/null 2>&1
  [[ -n $EPC ]] && "${J[@]}" ticket delete "$EPC" -y -w -j >/dev/null 2>&1
  [[ -n $KEY ]] && "${J[@]}" ticket delete "$KEY" -y -w -j >/dev/null 2>&1
  [[ -n $BK1 ]] && "${J[@]}" ticket delete "$BK1" -y -w -j >/dev/null 2>&1
  [[ -n $BK2 ]] && "${J[@]}" ticket delete "$BK2" -y -w -j >/dev/null 2>&1
  rm -rf "$TMP"
}
trap cleanup EXIT

# Global flags
"${J[@]}" -v >/dev/null && { PASS=$((PASS + 1)); echo "PASS -v"; } || { FAIL=$((FAIL + 1)); echo "FAIL -v"; }
run "-c missing file fails" fail -- board list -j -c /nonexistent/jira.json
run "-j before subcommand" ok -- -j board list
run "--json long form still works" ok -- board list --json
"${J[@]}" setup -h | grep -q -- "-g, --global" && { PASS=$((PASS + 1)); echo "PASS setup -g in help"; } || { FAIL=$((FAIL + 1)); echo "FAIL setup -g in help"; }

# Board
run "board view -n" ok -- board view -j -n 5
run "board view -a -o -q" ok -- board view -j -a me -o "updated DESC" -q "created >= -3650d" -n 5
run "board view -sp all" ok -- board view -j -sp all -n 5
run "board view -st" ok -- board view -j -st "Done" -n 5
run "board view -sp active" soft -- board view -j -sp active -n 5

# Project metadata
run "project list -n" ok -- project list -j -n 5
run "component list" ok -- component list -j
run "component list -k bad project fails" fail -- component list -j -k ZZZNOPE9
code_is "component list -k bad: PROJECT_NOT_FOUND" PROJECT_NOT_FOUND
run "version list -k" ok -- version list -j -k "$("${J[@]}" project list -j | jq -r '.data.projects[] | select(.current) | .key')"
run "label list -n" ok -- label list -j -n 5
run "field list (filter)" ok -- field list -j summary
run "ticket create -co unknown fails" fail -- ticket create -j -s "x (delete me)" -co "No such component zz"
code_is "ticket create -co unknown: COMPONENT_NOT_FOUND" COMPONENT_NOT_FOUND
# User
run "user view (me)" ok -- user view -j
ME_ID=$(jq -r '.data.accountId // empty' <<<"$LAST")
ME_NAME=$(jq -r '.data.name // empty' <<<"$LAST")
run "user view <accountId>" ok -- user view "$ME_ID" -j
run "user search -n" ok -- user search "${ME_NAME%% *}" -j -n 5
[[ $(jq -r '.data.users | length' <<<"$LAST") -ge 1 ]] && { PASS=$((PASS + 1)); echo "PASS user search finds me"; } || { FAIL=$((FAIL + 1)); echo "FAIL user search finds me"; }
run "user search no match" ok -- user search zzzq-no-such-user -j
[[ $(jq -r '.data.users | length' <<<"$LAST") == 0 ]] && { PASS=$((PASS + 1)); echo "PASS user search no match is empty"; } || { FAIL=$((FAIL + 1)); echo "FAIL user search no match is empty"; }
run "user search -k unknown fails" fail -- user search a -j -k NOPE99
code_is "user search -k unknown: PROJECT_NOT_FOUND" PROJECT_NOT_FOUND
run "user search -n 0 fails" fail -- user search a -j -n 0
run "user view unknown fails" fail -- user view zzzq-no-such-user -j
code_is "user view unknown: USER_NOT_FOUND" USER_NOT_FOUND

# Ticket create / view / edit
run "ticket create -s -d -t -a -l" ok -- ticket create -j -s "Regression short flags (delete me)" -d "Created by regression" -t Task -a me -l regression-short
KEY=$(jq -r '.data.key // empty' <<<"$LAST")
[[ -z $KEY ]] && { echo "No ticket created; stopping"; exit 1; }
run "user search -k" ok -- user search "${ME_NAME%% *}" -j -k "${KEY%%-*}"
echo "  created $KEY"
run "ticket create -pa (sub-task)" soft -- ticket create -j -s "Regression sub-task (delete me)" -t Subtask -pa "$KEY"
SUB=$(jq -r '.data.key // empty' <<<"$LAST")
run "ticket create -k bad project fails" fail -- ticket create -j -s "x" -k ZZZNOPE9
run "ticket view -n 0" ok -- ticket view "$KEY" -j -n 0
run "ticket view -n 999 fails" fail -- ticket view "$KEY" -j -n 999
run "ticket edit -s -l -rl" ok -- ticket edit "$KEY" -j -s "Regression short flags edited (delete me)" -l short-two -rl regression-short
run "ticket edit -f stdin" ok -- ticket edit "$KEY" -j -f - <<<"Description from stdin"
run "ticket edit -p" soft -- ticket edit "$KEY" -j -p Medium
run "ticket edit -sp active" soft -- ticket edit "$KEY" -j -sp active
run "ticket edit -sp none" soft -- ticket edit "$KEY" -j -sp none
run "ticket edit -fv unknown fails" fail -- ticket edit "$KEY" -j -fv "No such version zz"
code_is "ticket edit -fv unknown: VERSION_NOT_FOUND" VERSION_NOT_FOUND
# Soft: the fields may not be on the project's edit screen.
run "ticket edit -co -fv clear" soft -- ticket edit "$KEY" -j -co "" -fv ""
run "ticket move (list)" ok -- ticket move "$KEY" -j
run "ticket history -n" ok -- ticket history "$KEY" -j -n 5
run "ticket history -n 0 fails" fail -- ticket history "$KEY" -j -n 0

# Ticket search and filters
run "ticket list -n" ok -- ticket list -j -n 5
run "ticket list -q -a -t -st -o -k" ok -- ticket list -j -q "key = $KEY" -a me -t Task -st "To Do" -o "created DESC" -k "${KEY%%-*}"
[[ $(jq -r '.data.issues[0].key // empty' <<<"$LAST") == "$KEY" ]] && { PASS=$((PASS + 1)); echo "PASS ticket list finds $KEY"; } || { FAIL=$((FAIL + 1)); echo "FAIL ticket list finds $KEY"; }
run "ticket list -sp none" soft -- ticket list -j -sp none -n 5
run "ticket list -n 1001 fails" fail -- ticket list -j -n 1001
run "ticket list -q bad JQL fails" fail -- ticket list -j -q "this is not jql ==="
code_is "ticket list -q bad JQL: JQL_INVALID" JQL_INVALID
run "ticket list -fi unknown fails" fail -- ticket list -j -fi "No such filter (regression)"
code_is "ticket list -fi unknown: FILTER_NOT_FOUND" FILTER_NOT_FOUND
run "filter list -n" ok -- filter list -j -n 5
# Rank: a second throwaway ticket to rank against
run "ticket create (rank target)" ok -- ticket create -j -s "Regression rank target (delete me)"
RNK=$(jq -r '.data.key // empty' <<<"$LAST")
if [[ -n $RNK ]]; then
  run "ticket rank -bf" ok -- ticket rank "$KEY" -j -bf "$RNK"
  run "ticket rank -af" ok -- ticket rank "$KEY" -j -af "$RNK"
  run "ticket rank no target fails" fail -- ticket rank "$KEY" -j
  run "ticket rank -bf -af fails" fail -- ticket rank "$KEY" -j -bf "$RNK" -af "$RNK"
  run "ticket rank onto itself fails" fail -- ticket rank "$KEY" -j -bf "$KEY"
  run "ticket rank unknown target fails" fail -- ticket rank "$KEY" -j -af "${KEY%%-*}-999999"
  code_is "ticket rank unknown target: TICKET_NOT_FOUND" TICKET_NOT_FOUND
  run "ticket delete (rank target)" ok -- ticket delete "$RNK" -j -y
  [[ $(jq -r '.ok' <<<"$LAST") == true ]] && RNK=""
fi

# Comments
run "comment add -f stdin" ok -- comment add "$KEY" -j -f - <<<"Comment from stdin"
CID=$(jq -r '.data.comment.id // empty' <<<"$LAST")
run "comment list -n" ok -- comment list "$KEY" -j -n 10
run "comment edit -f stdin" ok -- comment edit "$KEY" "$CID" -j -f - <<<"Edited comment"
run "comment delete without -y fails" fail -- comment delete "$KEY" "$CID" -j </dev/null
run "comment delete -y" ok -- comment delete "$KEY" "$CID" -j -y

# Attachments
printf 'regression attachment\n' >"$TMP/note.txt"
mkdir -p "$TMP/out"
run "attachment add missing file fails" fail -- attachment add "$KEY" -j "$TMP/missing.txt"
code_is "attachment add missing file: FILE_ERROR" FILE_ERROR
run "attachment add" ok -- attachment add "$KEY" -j "$TMP/note.txt"
AID=$(jq -r '.data.attachments[0].id // empty' <<<"$LAST")
run "attachment list" ok -- attachment list "$KEY" -j
run "attachment get -ou dir" ok -- attachment get "$KEY" "$AID" -j -ou "$TMP/out"
cmp -s "$TMP/note.txt" "$TMP/out/note.txt" && { PASS=$((PASS + 1)); echo "PASS attachment get content"; } || { FAIL=$((FAIL + 1)); echo "FAIL attachment get content"; }
run "attachment get existing file fails" fail -- attachment get "$KEY" "$AID" -j -ou "$TMP/out"
code_is "attachment get existing file: FILE_EXISTS" FILE_EXISTS
run "attachment get -ou -y overwrites" ok -- attachment get "$KEY" "$AID" -j -ou "$TMP/out/note.txt" -y
run "attachment get unknown id fails" fail -- attachment get "$KEY" 999999999 -j -ou "$TMP/out"
code_is "attachment get unknown id: ATTACHMENT_NOT_FOUND" ATTACHMENT_NOT_FOUND
run "attachment delete without -y fails" fail -- attachment delete "$KEY" "$AID" -j </dev/null
run "attachment delete -y" ok -- attachment delete "$KEY" "$AID" -j -y
# Worklogs and estimates (soft: the site may have time tracking off)
run "ticket edit -es -re" soft -- ticket edit "$KEY" -j -es 1d -re 6h
run "ticket edit -re only" soft -- ticket edit "$KEY" -j -re 5h
run "ticket view after -re" ok -- ticket view "$KEY" -j -n 0
[[ $(jq -r '.data.timeTracking.estimate // empty' <<<"$LAST") == 1d ]] && { PASS=$((PASS + 1)); echo "PASS -re keeps the original estimate"; } || { SOFT=$((SOFT + 1)); echo "SOFT -re keeps the original estimate"; }
run "ticket edit -es bad fails" fail -- ticket edit "$KEY" -j -es 2x
run "worklog add bad duration fails" fail -- worklog add "$KEY" 0h -j
run "worklog add -sd -d" soft -- worklog add "$KEY" 2h30m -j -sd 2026-10-20 -d "Regression worklog"
WID=$(jq -r '.data.worklog.id // empty' <<<"$LAST")
run "worklog add -f stdin" soft -- worklog add "$KEY" 45m -j -f - <<<"Worklog from stdin"
run "worklog list -n" soft -- worklog list "$KEY" -j -n 10
if [[ -n $WID ]]; then
  run "ticket view time tracking" ok -- ticket view "$KEY" -j -n 0
  [[ $(jq -r '.data.timeTracking.spent // empty' <<<"$LAST") == "3h 15m" ]] && { PASS=$((PASS + 1)); echo "PASS ticket view time spent"; } || { FAIL=$((FAIL + 1)); echo "FAIL ticket view time spent $(jq -c .data.timeTracking <<<"$LAST")"; }
  run "worklog delete without -y fails" fail -- worklog delete "$KEY" "$WID" -j </dev/null
  run "worklog delete -y" ok -- worklog delete "$KEY" "$WID" -j -y
  run "worklog delete unknown fails" fail -- worklog delete "$KEY" 999999999 -j -y
  code_is "worklog delete unknown: WORKLOG_NOT_FOUND" WORKLOG_NOT_FOUND
fi
# Links
run "link types" ok -- link types -j
run "ticket create (link target)" ok -- ticket create -j -s "Regression link target (delete me)"
LNK=$(jq -r '.data.key // empty' <<<"$LAST")
run "link add <type>" ok -- link add "$KEY" blocks "$LNK" -j
LID=$(jq -r '.data.link.id // empty' <<<"$LAST")
run "link add inward phrase" ok -- link add "$KEY" is blocked by "$LNK" -j
[[ $(jq -r '.data.link.direction // empty' <<<"$LAST") == inward ]] && { PASS=$((PASS + 1)); echo "PASS link add inward direction"; } || { FAIL=$((FAIL + 1)); echo "FAIL link add inward direction"; }
run "link add bad type fails" fail -- link add "$KEY" nope "$LNK" -j
code_is "link add bad type: LINK_TYPE_NOT_FOUND" LINK_TYPE_NOT_FOUND
run "link add <url> -ti" ok -- link add "$KEY" "https://example.com/regression" -ti "Regression page" -j
WID=$(jq -r '.data.webLink.id // empty' <<<"$LAST")
run "link list" ok -- link list "$KEY" -j
run "link remove without -y fails" fail -- link remove "$KEY" "$LID" -j </dev/null
code_is "link remove without -y: CONFIRM_REQUIRED" CONFIRM_REQUIRED
run "link remove -y" ok -- link remove "$KEY" "$LID" -j -y
run "link remove web -y" ok -- link remove "$KEY" "$WID" -j -y
run "link remove unknown fails" fail -- link remove "$KEY" "$LID" -j -y
code_is "link remove unknown: LINK_NOT_FOUND" LINK_NOT_FOUND
run "ticket delete link target" ok -- ticket delete "$LNK" -j -y
[[ $(jq -r '.ok' <<<"$LAST") == true ]] && LNK=""
# Epics
run "epic list -n" ok -- epic list -j -n 5
run "epic list -n 101 fails" fail -- epic list -j -n 101
run "ticket create (epic)" ok -- ticket create -j -s "Regression epic (delete me)" -t Epic
EPC=$(jq -r '.data.key // empty' <<<"$LAST")
if [[ -n $EPC ]]; then
  run "ticket create -pa (epic child)" ok -- ticket create -j -s "Regression epic child (delete me)" -pa "$EPC"
  ECH=$(jq -r '.data.key // empty' <<<"$LAST")
  run "epic view -n" ok -- epic view "$EPC" -j -n 10
  [[ $(jq -r '"\(.data.progress.done)/\(.data.progress.total) \(.data.children[0].key)"' <<<"$LAST") == "0/1 $ECH" ]] && { PASS=$((PASS + 1)); echo "PASS epic view progress"; } || { FAIL=$((FAIL + 1)); echo "FAIL epic view progress $(jq -c .data.progress <<<"$LAST")"; }
  run "epic list -k -st" ok -- epic list -j -k "${EPC%%-*}" -st "To Do" -n 100
  [[ $(jq -r --arg k "$EPC" '.data.epics[] | select(.key == $k) | .progress.total' <<<"$LAST") == 1 ]] && { PASS=$((PASS + 1)); echo "PASS epic list progress"; } || { FAIL=$((FAIL + 1)); echo "FAIL epic list progress"; }
  run "ticket view statusCategory" ok -- ticket view "$EPC" -j -n 0
  [[ $(jq -r '.data.statusCategory' <<<"$LAST") == new ]] && { PASS=$((PASS + 1)); echo "PASS ticket view statusCategory"; } || { FAIL=$((FAIL + 1)); echo "FAIL ticket view statusCategory"; }
  run "epic view non-epic fails" fail -- epic view "$ECH" -j
  code_is "epic view non-epic: NOT_AN_EPIC" NOT_AN_EPIC
  run "ticket delete (epic child)" ok -- ticket delete "$ECH" -j -y
  [[ $(jq -r '.ok' <<<"$LAST") == true ]] && ECH=""
  run "ticket delete (epic)" ok -- ticket delete "$EPC" -j -y -w
  [[ $(jq -r '.ok' <<<"$LAST") == true ]] && EPC=""
fi
run "epic view unknown fails" fail -- epic view "${KEY%%-*}-999999" -j
code_is "epic view unknown: EPIC_NOT_FOUND" EPIC_NOT_FOUND
# Watchers
run "watcher list" ok -- watcher list "$KEY" -j
run "watcher remove (me)" ok -- watcher remove "$KEY" -j
run "watcher remove again is a no-op" ok -- watcher remove "$KEY" me -j
[[ $(jq -r '.data.changed' <<<"$LAST") == false ]] && { PASS=$((PASS + 1)); echo "PASS watcher remove changed:false"; } || { FAIL=$((FAIL + 1)); echo "FAIL watcher remove changed:false"; }
run "watcher add (me)" ok -- watcher add "$KEY" -j
run "watcher add unknown user fails" fail -- watcher add "$KEY" nobody-regression@example.invalid -j
code_is "watcher add unknown user code" USER_NOT_FOUND
run "watcher list bad key fails" fail -- watcher list nope -j

# Reports
run "report flow -da -n" ok -- report flow -j -da 7 -n 50
run "report workload -n" ok -- report workload -j -n 50
run "report sprint" soft -- report sprint -j
run "report velocity -n" soft -- report velocity -j -n 2
run "report flow -b bad fails" fail -- report flow -j -b 0

# Sprints (soft: the board may not use sprints)
run "sprint list -se" soft -- sprint list -j -se all
run "sprint view (active)" soft -- sprint view -j
run "sprint list -se bad fails" fail -- sprint list -j -se nope
run "sprint create -na -go -sd -e" soft -- sprint create -j -na "Regression sprint (delete me)" -go "Regression" -sd 2030-01-07 -e 2030-01-21
SPR=$(jq -r '.data.id // empty' <<<"$LAST")
if [[ -n $SPR ]]; then
  run "sprint create -na too long fails" fail -- sprint create -j -na "$(printf 'x%.0s' {1..31})"
  run "sprint create -sd bad date fails" fail -- sprint create -j -na x -sd nope
  run "sprint create -sd impossible date fails" fail -- sprint create -j -na x -sd 2030-02-30
  run "sprint create -sd junk after date fails" fail -- sprint create -j -na x -sd 2030-01-07junk
  run "sprint create -e before -sd fails" fail -- sprint create -j -na x -sd 2030-01-21 -e 2030-01-07
  run "sprint edit -na -go" ok -- sprint edit "$SPR" -j -na "Regression sprint 2 (delete)" -go ""
  run "sprint edit nothing fails" fail -- sprint edit "$SPR" -j
  run "sprint edit -e before start fails" fail -- sprint edit "$SPR" -j -e 2029-12-01
  run "sprint close (future) fails" fail -- sprint close "$SPR" -j -y
  run "ticket edit -sp <id>" ok -- ticket edit "$KEY" -j -sp "$SPR"
  run "sprint start -e before -sd fails" fail -- sprint start "$SPR" -j -sd 2030-01-07 -e 2030-01-01
  # Soft: Jira refuses a second active sprint unless the board allows parallel sprints.
  run "sprint start" soft -- sprint start "$SPR" -j
  if [[ $(jq -r '.data.state // empty' <<<"$LAST") == active ]]; then
    run "sprint start (active) fails" fail -- sprint start "$SPR" -j
    run "sprint view <id>" ok -- sprint view "$SPR" -j
    # Two active sprints only when the board already had one: the default must not pick one silently.
    ACTIVE=$("${J[@]}" sprint list -j -se active | jq '.data.sprints | length' 2>/dev/null)
    if [[ ${ACTIVE:-0} -gt 1 ]]; then
      run "sprint view, 2 active fails" fail -- sprint view -j
      code_is "sprint view, 2 active: SPRINT_AMBIGUOUS" SPRINT_AMBIGUOUS
      run "report sprint, 2 active fails" fail -- report sprint -j
      code_is "report sprint, 2 active: SPRINT_AMBIGUOUS" SPRINT_AMBIGUOUS
      run "ticket edit -sp active, 2 active fails" fail -- ticket edit "$KEY" -j -sp active
      code_is "ticket edit -sp active, 2 active: SPRINT_AMBIGUOUS" SPRINT_AMBIGUOUS
    else
      SOFT=$((SOFT + 1)); echo "SOFT two active sprints not set up (active: ${ACTIVE:-error}); SPRINT_AMBIGUOUS not checked"
    fi
    run "sprint close without -y fails" fail -- sprint close "$SPR" -j </dev/null
    run "sprint close -y" ok -- sprint close "$SPR" -j -y
  fi
  run "sprint delete without -y fails" fail -- sprint delete "$SPR" -j </dev/null
  run "sprint delete -y" ok -- sprint delete "$SPR" -j -y
  [[ $(jq -r '.ok' <<<"$LAST") == true ]] && { run "sprint view deleted fails" fail -- sprint view "$SPR" -j; SPR=""; }
fi

# Bulk edit / move: two throwaway tickets
run "ticket create (bulk 1)" ok -- ticket create -j -s "Regression bulk one (delete me)"
BK1=$(jq -r '.data.key // empty' <<<"$LAST")
run "ticket create (bulk 2)" ok -- ticket create -j -s "Regression bulk two (delete me)"
BK2=$(jq -r '.data.key // empty' <<<"$LAST")
BLBL="regression-bulk-$$"
run "ticket edit KEY,KEY without -y fails" fail -- ticket edit "$BK1,$BK2" -j -l "$BLBL" </dev/null
code_is "ticket edit KEY,KEY without -y: CONFIRM_REQUIRED" CONFIRM_REQUIRED
run "ticket edit KEY,KEY -l -y" ok -- ticket edit "$BK1,$BK2" -j -l "$BLBL" -y
[[ $(jq -r '.data.updated | length' <<<"$LAST") == 2 ]] && { PASS=$((PASS + 1)); echo "PASS bulk edit updated 2"; } || { FAIL=$((FAIL + 1)); echo "FAIL bulk edit updated 2"; }
run "ticket edit KEY -q together fails" fail -- ticket edit "$BK1" -j -q "labels = $BLBL" -l x
run "ticket edit -q -n too many fails" fail -- ticket edit -j -q "labels = $BLBL" -n 1 -l x -y
code_is "ticket edit -q -n: TOO_MANY_TICKETS" TOO_MANY_TICKETS
run "ticket move KEY,KEY no target fails" fail -- ticket move "$BK1,$BK2" -j
run "ticket move KEY,KEY -y" ok -- ticket move "$BK1,$BK2" "In Progress" -j -y
run "ticket move -q -y" ok -- ticket move -j -q "labels = $BLBL" Done -y
# A partial failure is ok:true with one failed entry, and exit 1.
out=$("${J[@]}" ticket move "$BK1,ZZZNOPE9-1" "To Do" -j -y 2>/dev/null); code=$?
if [[ $code == 1 && $(jq -r '"\(.ok) \(.data.updated | length) \(.data.failed | length)"' <<<"$out") == "true 1 1" ]]; then
  PASS=$((PASS + 1)); echo "PASS ticket move KEY,missing partly fails"
else
  FAIL=$((FAIL + 1)); echo "FAIL ticket move KEY,missing partly fails (exit $code) $(head -c 300 <<<"$out")"
fi
run "ticket move all fail" fail -- ticket move "$BK1,ZZZNOPE9-1" "No such status zz" -j -y
code_is "ticket move all fail: BULK_FAILED" BULK_FAILED
run "ticket delete (bulk 1)" ok -- ticket delete "$BK1" -j -y
[[ $(jq -r '.ok' <<<"$LAST") == true ]] && BK1=""
run "ticket delete (bulk 2)" ok -- ticket delete "$BK2" -j -y
[[ $(jq -r '.ok' <<<"$LAST") == true ]] && BK2=""
# Delete
run "ticket delete without -y fails" fail -- ticket delete "$KEY" -j </dev/null
if [[ -n $SUB ]]; then
  run "ticket delete -y -w" ok -- ticket delete "$KEY" -j -y -w
else
  run "ticket delete -y" ok -- ticket delete "$KEY" -j -y
fi
SUB="" KEY=""

echo "pass $PASS  fail $FAIL  soft $SOFT"
[[ $FAIL == 0 ]]
