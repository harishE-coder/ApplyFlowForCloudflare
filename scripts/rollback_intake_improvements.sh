#!/bin/bash
# ==============================================================================
# ApplyFlow - Rollback Application Intake Improvements
# Restores the codebase to the checkpoint tag `intake-before-improvements`.
# ==============================================================================

set -e

echo "⚠️  Rolling back Application Intake improvements to checkpoint 'intake-before-improvements'..."

# Ensure we are in the repository root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Stash any untracked / dirty changes just in case
if [ -n "$(git status --porcelain)" ]; then
    echo "📦 Stashing any uncommitted changes..."
    git stash push -u -m "Auto-stashed before intake rollback $(date +%Y-%m-%d_%H-%M-%S)"
fi

# Hard reset main to the checkpoint tag
git reset --hard intake-before-improvements

echo "✅ Successfully rolled back all application intake improvements to checkpoint 'intake-before-improvements'!"
echo "Current commit: $(git rev-parse --short HEAD)"
