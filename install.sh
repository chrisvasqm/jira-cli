#!/bin/sh
# Install or update jira-cli to the latest release:
#   curl -fsSL https://raw.githubusercontent.com/chrisvasqm/jira-cli/main/install.sh | sh
# It downloads the release tarball, checks its SHA-256 against the release's checksum file,
# then installs it with npm. Source: https://github.com/chrisvasqm/jira-cli
set -eu

base="https://github.com/chrisvasqm/jira-cli/releases/latest/download"

fail() {
  echo "jira-cli: $*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "needs Node.js 24 or newer; install it from https://nodejs.org"
major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge 24 ] || fail "needs Node.js 24 or newer (found $(node -v)); update it from https://nodejs.org"
command -v npm >/dev/null 2>&1 || fail "needs npm, which comes with Node.js"
command -v curl >/dev/null 2>&1 || fail "needs curl"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading the latest jira-cli..."
curl -fsSL "$base/jira-cli.tgz" -o "$tmp/jira-cli.tgz" || fail "download failed"
if curl -fsSL "$base/jira-cli.tgz.sha256" -o "$tmp/jira-cli.tgz.sha256" 2>/dev/null; then
  if command -v shasum >/dev/null 2>&1; then
    (cd "$tmp" && shasum -a 256 -c jira-cli.tgz.sha256 >/dev/null) || fail "checksum mismatch; the download was not installed"
  elif command -v sha256sum >/dev/null 2>&1; then
    (cd "$tmp" && sha256sum -c jira-cli.tgz.sha256 >/dev/null) || fail "checksum mismatch; the download was not installed"
  else
    echo "jira-cli: no shasum or sha256sum found; skipping the checksum check" >&2
  fi
else
  echo "jira-cli: this release has no checksum file; skipping the checksum check" >&2
fi

npm install -g "$tmp/jira-cli.tgz" >/dev/null || fail "npm install failed (see the error above)"

if command -v jira >/dev/null 2>&1; then
  echo "Installed jira $(jira -v). Run 'jira setup' in your project directory to connect it to Jira."
else
  echo "Installed. Open a new terminal if 'jira' is not found, or add $(npm prefix -g)/bin to your PATH."
fi
