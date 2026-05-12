# Hermes Integration Guide

> How Hermes Agent reports errors to mac-aicheck for AICO EVO bounty/review routing

## Overview

Hermes Agent can report errors to mac-aicheck via **CLI call** or **MCP callback**. mac-aicheck then:
1. Writes the error to `~/.mac-aicheck/outbox/hermes-events.jsonl`
2. Merges a sanitized version into `~/.mac-aicheck/outbox/events.jsonl` for AICO EVO sync
3. Worker daemon periodically flushes events to AICO EVO

```
Hermes Agent
    │
    ├─ CLI mode:  mac-aicheck agent report-error --json '{...}'
    ├─ MCP mode:  mac-aicheck agent mcp serve  →  report_hermes_error tool
    └─ Log mode:  tail ~/.hermes/logs/*.log   →  auto-capture errors
```

## Log Path Convention

mac-aicheck monitors: `~/.hermes/logs/`

```
~/.hermes/logs/
├── gateway.log          ← Hermes gateway logs
├── errors.log           ← Hermes error aggregator
└── agent.log            ← Agent session logs
```

Hermes is configured via `mac-aicheck agent hermes-connect --log-path ~/.hermes/logs`.

---

## CLI Mode (Recommended)

Hermes calls mac-aicheck CLI on error:

```bash
mac-aicheck agent report-error --json '{
  "type": "hermes-error",
  "kind": "auth_failure",
  "message": "401 invalid api key (2049)",
  "severity": "error",
  "agent": "hermes",
  "timestamp": "2026-05-11T12:00:00Z"
}'
```

### Supported `kind` values

| kind | Description |
|------|-------------|
| `auth_failure` | API key invalid / expired / 401 |
| `network_instability` | Connection timeout / DNS failure |
| `tool_missing` | Required tool not installed |
| `config_breakage` | Config file invalid or missing |
| `perf_bottleneck` | Latency threshold exceeded |
| `capability_gap` | Model lacks required capability |

### Streaming / Pipe mode

```bash
echo '{"type":"hermes-error","kind":"network_instability","message":"timeout"}' \
  | mac-aicheck agent report-error --json -
```

---

## MCP Mode

Start the MCP server:

```bash
mac-aicheck agent mcp serve
```

This exposes a `report_hermes_error` tool. Hermes then calls it via MCP protocol:

```json
{
  "tool": "report_hermes_error",
  "arguments": {
    "type": "hermes-error",
    "kind": "auth_failure",
    "message": "401 invalid api key",
    "severity": "error"
  }
}
```

> **Note:** MCP mode requires Hermes to have the mac-aicheck MCP server configured. See [Hermes MCP setup](#hermes-mcp-setup) below.

---

## Hermes MCP Setup

In your Hermes `config.yaml`, add the mac-aicheck MCP server:

```yaml
mcp:
  servers:
    mac-aicheck:
      command: ["npx", "@mac-aicheck/mcp"]
      # OR from source:
      # command: ["node", "/path/to/mac-aicheck/dist/mcp-server.js"]
```

Alternatively, use the CLI wrapper:

```bash
hermes mcp add mac-aicheck mac-aicheck agent mcp-serve
```

---

## Verify Integration

### Check Hermes status

```bash
mac-aicheck agent hermes-status
```

Expected output:
```json
{
  "hermesConnected": true,
  "hermesLogPath": "/Users/gugu/.hermes/logs",
  "errorCount": 3,
  "mergedErrorCount": 3,
  "lastErrorAt": "2026-05-11T12:00:00.000Z"
}
```

### Check event outbox

```bash
# Hermes-specific events
cat ~/.mac-aicheck/outbox/hermes-events.jsonl | wc -l

# All events (including merged Hermes events)
cat ~/.mac-aicheck/outbox/events.jsonl | wc -l
```

### Manual test

```bash
mac-aicheck agent report-error --json '{
  "type": "hermes-error",
  "kind": "auth_failure",
  "message": "401 invalid api key (2049)",
  "severity": "error"
}'

# Verify it was written
mac-aicheck agent hermes-status
```

---

## Hermes Log Path Configuration

```bash
# Set custom Hermes log path
mac-aicheck agent hermes-connect --log-path /custom/hermes/logs

# View current log path
mac-aicheck agent hermes-connect
```

The path is stored in `~/.mac-aicheck/config.json` under `hermesLogPath`.

---

## Error Sanitization

mac-aicheck automatically sanitizes sensitive data before syncing to AICO EVO:

| Pattern | Replacement |
|---------|-------------|
| `sk-...` | `sk-***REDACTED***` |
| `ghp_...` / `gho_...` | `gh***REDACTED***` |
| `Bearer ...` | `Bearer ***REDACTED***` |
| Email addresses | `***@***.com` |
| `/Users/...` paths | `~/...` (macOS normalized) |
| IP addresses | `***.***.***.***` |

---

## Architecture

```
~/.mac-aicheck/
├── config.json              ← authToken, profileId, hermesLogPath
└── outbox/
    ├── hermes-events.jsonl  ← Raw Hermes events (never synced directly)
    └── events.jsonl         ← Merged events (synced to AICO EVO)
```

**Flow:**
1. Hermes error → `report-error --json` → `hermes-events.jsonl`
2. mac-aicheck merges → sanitized → `events.jsonl` (source: 'hermes')
3. Worker daemon → heartbeat → flushes to AICO EVO
4. AICO EVO routes to bounty/review queue

---

## Troubleshooting

### `mac-aicheck agent hermes-status` shows `hermesConnected: false`

Run:
```bash
mac-aicheck agent hermes-connect --log-path ~/.hermes/logs
```

### Events not appearing in AICO EVO

Check worker is running:
```bash
mac-aicheck agent worker status
```

If worker is stopped:
```bash
mac-aicheck agent worker start
```

### API key error (401)

Re-bind the device:
```bash
mac-aicheck agent bind
```
