#!/bin/bash
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
cd /Users/eva/mbt-move/.claude/worktrees/eloquent-hoover
exec /usr/local/bin/node /Users/eva/mbt-move/node_modules/.bin/next dev --webpack
