#!/usr/bin/env bash
# Publish the version in package.json as a GitHub release tagged v<version>.
# Run on synced main right after the PR that bumped the version merged.
# Safe to rerun: reuses a tag already on HEAD and re-uploads a missing asset.
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
git fetch -q origin main --tags || die "git fetch failed (a local tag may conflict with origin; check git tag -l $tag)"
head=$(git rev-parse HEAD)
[ "$head" = "$(git rev-parse origin/main)" ] || die "main is not level with origin/main (git pull --ff-only)"
[ -f "$notes" ] || die "missing $notes"
[ "$(git log -1 --format=%H -- "$notes")" = "$head" ] ||
  die "HEAD is not the commit that added $notes; other changes merged after it need their own version bump"
grep -qF "releases/download/$tag/$asset_name" "$notes" || die "$notes must link releases/download/$tag/$asset_name"
if tagged=$(git rev-parse -q --verify "refs/tags/$tag^{commit}"); then
  [ "$tagged" = "$head" ] || die "$tag exists on another commit; bump the version in the PR first"
fi

# Release state: none, complete (asset present), or partial (asset missing).
state=none
if lookup=$(gh api "repos/{owner}/{repo}/releases/tags/$tag" --jq '[.assets[].name] | join(" ")' 2>&1); then
  case " $lookup " in
    *" $asset_name "*) die "release $tag is already published; bump the version in the PR first" ;;
    *) state=partial ;;
  esac
else
  case "$lookup" in
    *"HTTP 404"*) ;;
    *) die "could not check release $tag: $lookup" ;;
  esac
fi

pnpm check >&2 || die "pnpm check failed (output above)"

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
pnpm pack --pack-destination "$out" >/dev/null
tarball=$(ls "$out"/*.tgz)
listing=$(tar -tzf "$tarball")
unexpected=$(grep -vE '^package/(package\.json|README\.md|dist/.+\.js)$' <<<"$listing" || true)
[ -z "$unexpected" ] || die "tarball has unexpected files: $unexpected"
grep -qx 'package/dist/index.js' <<<"$listing" || die "tarball is missing dist/index.js"
for js in $(grep -E '^package/dist/.+\.js$' <<<"$listing"); do
  src="src/${js#package/dist/}"
  [ -f "${src%.js}.ts" ] || die "stale build file $js has no source; run rm -rf dist && pnpm build"
done
asset="$out/$asset_name"
[ "$tarball" = "$asset" ] || mv "$tarball" "$asset"

git rev-parse -q --verify "refs/tags/$tag" >/dev/null || git tag -a "$tag" -m "jira-cli $tag"
git push -q origin "$tag"
if [ "$state" = partial ]; then
  gh release upload "$tag" "$asset" --clobber
  echo "uploaded missing $asset_name to existing release $tag"
else
  gh release create "$tag" "$asset" --verify-tag --title "jira-cli $tag" --notes-file "$notes"
fi
