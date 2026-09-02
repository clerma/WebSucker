#!/bin/bash
set -e

# Install any newly merged dependencies
npm install --no-audit --no-fund

# Apply additive development-schema updates after task merges. Intentionally
# omit --force so a destructive change stops for review instead of dropping
# data automatically during reconciliation.
npm run db:push
