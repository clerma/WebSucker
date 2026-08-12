#!/bin/bash
set -e

# Install any newly merged dependencies
npm install --no-audit --no-fund

# Sync database schema non-interactively.
# Safe: user_sessions is declared in shared/schema.ts, so push won't drop it.
npx drizzle-kit push --force
