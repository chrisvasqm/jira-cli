#!/usr/bin/env bash
# Publish the version in package.json as a GitHub release.
# Run on synced main right after the PR that bumped the version merged.
# usage: pnpm release
set -euo pipefail

die() { echo "release: $*" >&2; exit 1; }

version=$(node -p "require('./package.json').version")
tag="v$version"
notes="release-notes/$tag.md"

[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "switch to main first"
[ -z "$(git status --porcelain)" ] || die "working tree is not clean"
git fetch -q origin main --tags
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "main is not level with origin/main (git pull --ff-only)"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "$tag already exists; bump the version in the PR first"
[ -f "$notes" ] || die "missing $notes"

pnpm check >/dev/null || die "pnpm check failed"

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
pnpm pack --pack-destination "$out" >/dev/null
tarball=$(ls "$out"/*.tgz)
contents=$(tar -tzf "$tarball")
echo "$contents" | grep -qE '(^|/)\.jira-cli\.json$|(^|/)\.env' && die "tarball contains a config or env file"
echo "$contents" | grep -q '^package/dist/index.js$' || die "tarball is missing dist/index.js"
asset="$out/jira-cli-$version.tgz"
[ "$tarball" = "$asset" ] || mv "$tarball" "$asset"

git tag -a "$tag" -m "jira-cli $tag"
git push -q origin "$tag"
gh release create "$tag" "$asset" --verify-tag --title "jira-cli $tag" --notes-file "$notes"
