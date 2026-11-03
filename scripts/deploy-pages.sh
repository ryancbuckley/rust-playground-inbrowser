#!/bin/sh
# Publish the built site (build/pages, from build-pages.sh) to the repository GitHub Pages serves
# it from ("Deploy from a branch": main, /).
#
#   scripts/deploy-pages.sh [repository-url]
#
# repository-url defaults to rust-playground-inbrowser-site. Each deploy replaces the branch with a
# single commit, so the repository doesn't collect every version of the site and of the 76 MB
# toolchain. The repository in build/deploy keeps the last deploy, so a push only sends the files
# that changed.
set -eu
cd "$(dirname "$0")/.."
ROOT=$(pwd)
SITE=$ROOT/build/pages
DEPLOY=$ROOT/build/deploy
URL=${1:-https://github.com/ryancbuckley/rust-playground-inbrowser-site.git}
BRANCH=main
test -f "$SITE/coi-sw.js" \
  || { echo "build the site first: scripts/build-web.sh, then scripts/build-pages.sh" >&2; exit 1; }

if [ ! -d "$DEPLOY/.git" ]; then
  git init -q -b "$BRANCH" "$DEPLOY"
  git -C "$DEPLOY" remote add origin "$URL"
  # The first push can be large.
  git -C "$DEPLOY" config http.postBuffer 524288000
fi
git -C "$DEPLOY" remote set-url origin "$URL"
# What the branch has now, so that the push leaves it out. Nothing to download if it is the last
# deploy from here; there is no branch before the first deploy.
git -C "$DEPLOY" fetch -q --depth 1 origin "$BRANCH" 2>/dev/null || true

rsync -a --delete --exclude /.git "$SITE/" "$DEPLOY/"
git -C "$DEPLOY" add -A
tree=$(git -C "$DEPLOY" write-tree)
if [ "$tree" = "$(git -C "$DEPLOY" rev-parse -q --verify "origin/$BRANCH^{tree}" || true)" ]; then
  echo "$BRANCH already has this build"
  exit 0
fi
source=$(git -C "$ROOT" rev-parse --short HEAD)
commit=$(git -C "$DEPLOY" commit-tree "$tree" -m "Rust in the Browser, built from rust-playground-inbrowser $source")
git -C "$DEPLOY" update-ref "refs/heads/$BRANCH" "$commit"
git -C "$DEPLOY" push --force origin "$BRANCH"
# Older deploys are no longer needed here.
git -C "$DEPLOY" reflog expire --expire=now --all
git -C "$DEPLOY" gc -q --prune=now
echo "Published $commit (from $source) to $BRANCH"
