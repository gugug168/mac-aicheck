#!/bin/bash
# mac-aicheck.js wrapper for hermes-delegate subcommand
# This script delegates to dist/agent/index.js for hermes-delegate commands

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAC_AICHECK_DIR="$(dirname "$AGENT_DIR")"

# For hermes-delegate, we call dist/agent/index.js directly
if [ -f "$MAC_AICHECK_DIR/dist/agent/index.js" ]; then
  exec node "$MAC_AICHECK_DIR/dist/agent/index.js" "$@"
else
  echo "Error: mac-aicheck agent not found. Run: npm run build" >&2
  exit 1
fi
