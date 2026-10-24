#!/usr/bin/env bash
# Publish the version in package.json as a GitHub release tagged v<version>.
# Run on synced main right after the PR that bumped the version merged.
# The release notes come from that PR's description, between <!-- release-notes --> markers.
# Safe to rerun: reuses a tag already on HEAD and re-uploads a missing asset.
# usage: pnpm release
set -euo pipefail

die() { echo "release: $*" >&2; exit 1; }

version=$(node -p "require('./package.json').version")
tag="v$version"
asset_name="jira-cli-$version.tgz"

gh auth status >/dev/null 2>&1 || die "gh is not logged in (gh auth login)"
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "switch to main first"
[ -z "$(git status --porcelain)" ] || die "working tree is not clean"
git fetch -q origin main --tags || die "git fetch failed (a local tag may conflict with origin; check git tag -l $tag)"
head=$(git rev-parse HEAD)
[ "$head" = "$(git rev-parse origin/main)" ] || die "main is not level with origin/main (git pull --ff-only)"

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT

# The squash commit that set this version; later commits may only touch docs.
bump_commit=$(git log -1 --format=%H -G'"version":' -- package.json)
shipped_changes=$(git diff --name-only "$bump_commit" HEAD -- src package.json pnpm-lock.yaml tsconfig.json README.md)
[ -z "$shipped_changes" ] ||
  die "code changed after the $tag bump ($shipped_changes); those changes need their own version bump"

notes="$out/notes.md"
gh api "repos/{owner}/{repo}/commits/$bump_commit/pulls" --jq '.[0].body // ""' |
  tr -d '\r' |
  awk '/<!-- \/release-notes -->/ { on = 0 } on { print } /<!-- release-notes -->/ { on = 1 }' >"$notes" ||
  die "could not read the PR for $bump_commit"
[ -s "$notes" ] || die "the PR that bumped to $tag has no notes between <!-- release-notes --> markers"
grep -qF "releases/download/$tag/$asset_name" "$notes" || die "the $tag notes must link releases/download/$tag/$asset_name"
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

pnpm install --frozen-lockfile >&2 || die "pnpm install failed"
rm -rf dist
pnpm check >&2 || die "pnpm check failed (output above)"

pnpm pack --pack-destination "$out" >/dev/null
tarball=$(ls "$out"/*.tgz)
listing=$(tar -tzf "$tarball")
unexpected=$(grep -vE '^package/(package\.json|README\.md|LICEN[CS]E(\.md)?|dist/.+\.(js|d\.ts|js\.map))$' <<<"$listing" || true)
[ -z "$unexpected" ] || die "tarball has unexpected files: $unexpected"
grep -qx 'package/dist/index.js' <<<"$listing" || die "tarball is missing dist/index.js"
# dist/index.js is bundled, so the package must not ask npm to resolve anything at install time.
tar -xzOf "$tarball" package/package.json | node -e '
  const pkg = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  if (Object.keys(pkg.dependencies ?? {}).length) process.exit(1);
' || die "package.json has runtime dependencies; dist/index.js must bundle them"
asset="$out/$asset_name"
[ "$tarball" = "$asset" ] || mv "$tarball" "$asset"
# Same file under a fixed name, so releases/latest/download/jira-cli.tgz always installs the newest version.
stable="$out/jira-cli.tgz"
cp "$asset" "$stable"

git rev-parse -q --verify "refs/tags/$tag" >/dev/null || git tag -a "$tag" -m "jira-cli $tag"
git push -q origin "$tag"
if [ "$state" = partial ]; then
  gh release upload "$tag" "$asset" "$stable" --clobber
  gh release edit "$tag" --notes-file "$notes" >/dev/null
  echo "uploaded missing $asset_name and refreshed the notes of existing release $tag"
else
  gh release create "$tag" "$asset" "$stable" --verify-tag --title "jira-cli $tag" --notes-file "$notes"
fi
