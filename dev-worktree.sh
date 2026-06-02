#!/bin/bash
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
cd /Users/eva/mbt-gym/.claude/worktrees/eloquent-hoover
exec /usr/local/bin/node /Users/eva/mbt-gym/node_modules/.bin/next dev --webpack
