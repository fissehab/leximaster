#!/bin/sh
# Publish the built site (docs/) to GitHub Pages.
#
#     make site && make deploy
#
# docs/ is not kept in main's history: each deploy makes ONE commit of it on
# the gh-pages branch and force-pushes it over the last one, so the repository
# doesn't grow with every rebuild. Only files that changed are uploaded.
# GitHub Pages serves gh-pages (root); the site updates a minute or so later.
set -eu
cd "$(dirname "$0")/.."
[ -f docs/index.html ] || { echo "docs/ is not built: run 'make site' first." >&2; exit 1; }

git_dir=$(cd "$(git rev-parse --git-dir)" && pwd)
index="$git_dir/deploy-index"
rm -f "$index"
(cd docs && GIT_DIR="$git_dir" GIT_WORK_TREE=. GIT_INDEX_FILE="$index" \
    git add -A -- . ':(exclude,glob)**/.DS_Store')
tree=$(GIT_INDEX_FILE="$index" git write-tree)
rm -f "$index"

src=$(git rev-parse --short HEAD)
dirty=$(git status --porcelain --untracked-files=no | head -1)
commit=$(git commit-tree "$tree" -m "Site built from $src${dirty:+ (with uncommitted changes)}")

# Push as the repository's owner (never a work account).
GH_TOKEN=$(gh auth token --user fissehab)
export GH_TOKEN
git -c credential.helper= \
    -c credential.helper='!f() { echo username=fissehab; echo "password=$GH_TOKEN"; }; f' \
    push -f origin "$commit:refs/heads/gh-pages"
git update-ref refs/remotes/origin/gh-pages "$commit"
echo "Deployed $commit (from $src). Live in a minute or so: https://fissehab.github.io/leximaster/"
