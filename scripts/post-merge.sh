#!/bin/bash
# post-merge.sh — runs automatically after every Replit task merge.
#
# Steps:
#   1. Install dependencies (idempotent, frozen lockfile)
#   2. Sync DB schema to Postgres
#   3. Backfill muxAssetId on video posts that are still missing it.
#      Idempotent — posts that already have muxAssetId are skipped.
#      Skipped entirely when MUX_TOKEN_ID / MUX_TOKEN_SECRET are absent.
#   4. Mirror HEAD to GitHub as an off-site backup.
#      - Replit is the authoritative source of truth.
#      - A normal push is attempted first to preserve history.
#      - A forced push is used only when the remote has diverged, since
#        Replit's history always wins for this backup mirror.
#      - Credentials are supplied via a transient git credential helper
#        that reads GITHUB_TOKEN from the environment — the token is
#        never written into a remote URL or persisted to .git/config.
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Backfill muxAssetId on video posts that are still missing it.
# Idempotent: posts that already have muxAssetId set are skipped automatically.
# Safe to re-run on every deploy — it exits immediately when nothing needs fixing.
if [ -n "$MUX_TOKEN_ID" ] && [ -n "$MUX_TOKEN_SECRET" ]; then
  echo "Running Mux asset ID backfill..."
  pnpm --filter @workspace/scripts run backfill-mux-asset-ids
  echo "Mux backfill complete."
else
  echo "MUX_TOKEN_ID / MUX_TOKEN_SECRET not set — skipping Mux asset ID backfill."
fi

# Push latest code to GitHub (off-site backup mirror).
if [ -n "$GITHUB_TOKEN" ]; then
  echo "Pushing to GitHub..."

  # Register a temporary credential helper that reads from the environment.
  # This avoids embedding the token in a URL (which can surface in process
  # metadata, error messages, or shell history).
  git config --local credential.helper \
    '!f() { echo "username=x-access-token"; echo "password=$GITHUB_TOKEN"; }; f'

  GITHUB_REMOTE="https://github.com/JPLAI-max/gooncity.git"

  # Attempt a fast-forward push first to preserve remote history.
  # Fall back to --force when the remote has diverged; Replit is
  # always authoritative for this mirror.
  if ! git push "$GITHUB_REMOTE" HEAD:main 2>/dev/null; then
    echo "Remote has diverged — overwriting with Replit state (source of truth)..."
    git push "$GITHUB_REMOTE" HEAD:main --force
  fi

  # Remove the credential helper immediately after use.
  git config --local --unset credential.helper

  echo "GitHub sync complete."
else
  echo "GITHUB_TOKEN not set — skipping GitHub sync."
fi
