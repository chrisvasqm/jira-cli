#!/bin/sh
# Install or update jira-cli to the latest release:
#   curl -fsSL https://raw.githubusercontent.com/chrisvasqm/jira-cli/main/install.sh | sh
set -eu

url="https://github.com/chrisvasqm/jira-cli/releases/latest/download/jira-cli.tgz"

fail() {
  echo "jira-cli: $*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "needs Node.js 24 or newer; install it from https://nodejs.org"
major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge 24 ] || fail "needs Node.js 24 or newer (found $(node -v)); update it from https://nodejs.org"
command -v npm >/dev/null 2>&1 || fail "needs npm, which comes with Node.js"

echo "Installing the latest jira-cli..."
npm install -g "$url" >/dev/null || fail "npm install failed (see the error above)"

if command -v jira >/dev/null 2>&1; then
  echo "Installed jira $(jira -v). Run 'jira setup' in your project directory to connect it to Jira."
else
  echo "Installed. Open a new terminal if 'jira' is not found, or add $(npm prefix -g)/bin to your PATH."
fi
