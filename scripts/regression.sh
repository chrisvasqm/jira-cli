#!/usr/bin/env bash
# Live regression of every command using only short flags.
# Creates throwaway tickets in the configured project and deletes them at the end.
# Usage: pnpm build && scripts/regression.sh .
set -u
REPO=${1:?repo path}
J=(node "$REPO/dist/index.js")
PASS=0 FAIL=0 SOFT=0
KEY="" SUB="" SPR=""

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
  [[ -n $SUB ]] && "${J[@]}" ticket delete "$SUB" -y -j >/dev/null 2>&1
  [[ -n $KEY ]] && "${J[@]}" ticket delete "$KEY" -y -w -j >/dev/null 2>&1
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

# Ticket create / view / edit
run "ticket create -s -d -t -a -l" ok -- ticket create -j -s "Regression short flags (delete me)" -d "Created by regression" -t Task -a me -l regression-short
KEY=$(jq -r '.data.key // empty' <<<"$LAST")
[[ -z $KEY ]] && { echo "No ticket created; stopping"; exit 1; }
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
run "ticket move (list)" ok -- ticket move "$KEY" -j

# Comments
run "comment add -f stdin" ok -- comment add "$KEY" -j -f - <<<"Comment from stdin"
CID=$(jq -r '.data.comment.id // empty' <<<"$LAST")
run "comment list -n" ok -- comment list "$KEY" -j -n 10
run "comment edit -f stdin" ok -- comment edit "$KEY" "$CID" -j -f - <<<"Edited comment"
run "comment delete without -y fails" fail -- comment delete "$KEY" "$CID" -j </dev/null
run "comment delete -y" ok -- comment delete "$KEY" "$CID" -j -y

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
