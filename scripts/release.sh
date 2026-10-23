#!/usr/bin/env bash
# Publish the version in package.json as a GitHub release.
# Run on synced main right after the PR that bumped the version merged.
# Safe to rerun: an existing tag on HEAD is reused if the release step failed.
# usage: pnpm release
set -euo pipefail

die() { echo "release: $*" >&2; exit 1; }

version=$(node -p "require('./package.json').version")
tag="v$version"
notes="release-notes/$tag.md"
asset_name="jira-cli-$version.tgz"

gh auth status >/dev/null 2>&1 || die "gh is not logged in (gh auth login)"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "switch to main first"
[ -z "$(git status --porcelain)" ] || die "working tree is not clean"
git fetch -q origin main --tags
head=$(git rev-parse HEAD)
[ "$head" = "$(git rev-parse origin/main)" ] || die "main is not level with origin/main (git pull --ff-only)"
gh release view "$tag" >/dev/null 2>&1 && die "release $tag already exists; bump the version in the PR first"
if tagged=$(git rev-parse -q --verify "refs/tags/$tag^{commit}"); then
  [ "$tagged" = "$head" ] || die "$tag exists on another commit; bump the version in the PR first"
fi
[ -f "$notes" ] || die "missing $notes"
grep -qF "releases/download/$tag/$asset_name" "$notes" || die "$notes must link releases/download/$tag/$asset_name"

rm -rf dist
pnpm check >/dev/null || die "pnpm check failed (output above)"

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
pnpm pack --pack-destination "$out" >/dev/null
tarball=$(ls "$out"/*.tgz)
unexpected=$(tar -tzf "$tarball" | grep -vE '^package/(package\.json|README\.md|dist/.+\.js)$' || true)
[ -z "$unexpected" ] || die "tarball has unexpected files: $unexpected"
tar -tzf "$tarball" | grep -q '^package/dist/index.js$' || die "tarball is missing dist/index.js"
asset="$out/$asset_name"
[ "$tarball" = "$asset" ] || mv "$tarball" "$asset"

git rev-parse -q --verify "refs/tags/$tag" >/dev/null || git tag -a "$tag" -m "jira-cli $tag"
git push -q origin "$tag"
gh release create "$tag" "$asset" --verify-tag --title "jira-cli $tag" --notes-file "$notes"
