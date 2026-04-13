#!/bin/bash

# ─────────────────────────────────────────────
#  TodoLander Public Deploy Script
#  Scrubs DailyTodo, pushes to public repo,
#  then returns you to main.
# ─────────────────────────────────────────────

set -e  # Exit immediately on any error

PUBLIC_REMOTE="https://github.com/Samsong1018/TodoLander.git"
PRIVATE_BRANCH="main"
PUBLIC_BRANCH="PublicVers"
SCRUB_FOLDER="DailyTodo"

echo ""
echo "🔒 TodoLander Public Deploy"
echo "─────────────────────────────"

# 1. Make sure we're on main and up to date
echo "▸ Switching to $PRIVATE_BRANCH..."
git checkout $PRIVATE_BRANCH

# 2. Make sure working tree is clean
if ! git diff-index --quiet HEAD --; then
  echo ""
  echo "⚠️  You have uncommitted changes."
  read -p "   Stash them and continue? (y/n): " choice
  if [[ "$choice" == "y" ]]; then
    git stash
    STASHED=true
  else
    echo "   Aborting. Commit or stash your changes first."
    exit 1
  fi
fi

# 3. Delete and recreate the PublicVers branch cleanly
echo "▸ Recreating $PUBLIC_BRANCH from $PRIVATE_BRANCH..."
git branch -D $PUBLIC_BRANCH 2>/dev/null || true
git checkout -b $PUBLIC_BRANCH

# 4. Scrub the private folder
if [ -d "$SCRUB_FOLDER" ]; then
  echo "▸ Removing $SCRUB_FOLDER/..."

  # Self-preservation: if this script lives inside the scrub folder, copy it out first
  SCRIPT_PATH="$(realpath "$0")"
  SCRUB_PATH="$(realpath "$SCRUB_FOLDER")"
  if [[ "$SCRIPT_PATH" == "$SCRUB_PATH"* ]]; then
    echo "▸ Script is inside $SCRUB_FOLDER — temporarily moving it out..."
    cp "$SCRIPT_PATH" /tmp/deploy-public-backup.sh
    SELF_BACKUP=true
  fi

  git rm -r --cached $SCRUB_FOLDER > /dev/null 2>&1 || true
  rm -rf $SCRUB_FOLDER
  git add -A
  git commit -m "chore: remove private files for public release" --allow-empty

  # Restore script to repo root if it was moved
  if [ "$SELF_BACKUP" = true ]; then
    echo "▸ Restoring deploy script to repo root..."
    cp /tmp/deploy-public-backup.sh ./deploy-public.sh
    chmod +x ./deploy-public.sh
    rm /tmp/deploy-public-backup.sh
  fi
else
  echo "▸ $SCRUB_FOLDER not found — skipping scrub (already clean?)"
fi

# 5. Make sure public remote exists
if ! git remote get-url public > /dev/null 2>&1; then
  echo "▸ Adding public remote..."
  git remote add public $PUBLIC_REMOTE
fi

# 6. Push to public repo
echo "▸ Force-pushing to public repo..."
git push public $PUBLIC_BRANCH:main --force

echo ""
echo "✅ Public repo updated successfully!"
echo ""

# 7. Switch back to private main
echo "▸ Switching back to $PRIVATE_BRANCH..."
git checkout $PRIVATE_BRANCH

# 8. Restore stash if we stashed earlier
if [ "$STASHED" = true ]; then
  echo "▸ Restoring stashed changes..."
  git stash pop
fi

echo ""
echo "🔓 Back on $PRIVATE_BRANCH — safe to keep working."
echo ""