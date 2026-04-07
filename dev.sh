#!/bin/bash
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
export NODE="/usr/local/bin/node"
cd /Users/eva/mbt-move
exec /usr/local/bin/node node_modules/.bin/next dev --webpack
