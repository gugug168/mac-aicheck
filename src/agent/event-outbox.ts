/**
 * event-outbox.ts
 *
 * 持久化事件队列（event outbox pattern）。
 * 用于 crash-safe 地暂存待上传事件，替代原有的纯内存 storeEvent。
 *
 * 设计：
 * - 写入 ~/.mac-aicheck/events-outbox.jsonl（每行一个 JSON）
 * - syncEvents() 读取 outbox，批量上传，成功后清空已确认的事件
 * - 支持 crash recovery：重启后自动重试未确认的事件
 * - 重试策略：指数退避（base=30s, max=30min, jitter）
 *
 * 对应 Milestone 2：embedded-agent-lite.js / event-outbox
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface OutboxEvent {
  eventId: string;
  fingerprint: string;
  agent: string;
  message: string;
  severity?: string;
  eventType: string;
  createdAt: string;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  syncAttempts: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

const MAX_JSONL_READ = 5000;
const OUTBOX_RETRY_BASE_MS = 30_000;       // 30 seconds
const OUTBOX_RETRY_MAX_MS = 30 * 60_000;  // 30 minutes
const MAX_OUTBOX_EVENTS = 5000;

function getBaseDir(): string {
  return process.env.MAC_AICCHECK_BASE_DIR || path.join(os.homedir(), '.mac-aicheck');
}

function outboxPath(): string {
  return path.join(getBaseDir(), 'events-outbox.jsonl');
}

function ensureParent(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonlLines(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
}

function parseJsonlLines(lines: string[]): OutboxEvent[] {
  return lines
    .map(line => {
      try { return JSON.parse(line) as OutboxEvent; }
      catch { return null; }
    })
    .filter((e): e is OutboxEvent => e !== null);
}

function writeJsonl(file: string, rows: OutboxEvent[]): void {
  ensureParent(file);
  fs.writeFileSync(
    file,
    rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''),
    'utf8',
  );
}

/**
 * Append a single event to the outbox (append-only, crash-safe).
 */
export function enqueueEvent(event: OutboxEvent): void {
  const file = outboxPath();
  ensureParent(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8');

  // Rotation: keep at most MAX_OUTBOX_EVENTS
  try {
    const lines = readJsonlLines(file);
    if (lines.length > MAX_OUTBOX_EVENTS) {
      const parsed = parseJsonlLines(lines);
      writeJsonl(file, parsed.slice(-MAX_OUTBOX_EVENTS));
    }
  } catch {
    // rotation failure is non-critical
  }
}

/**
 * Mark specific eventIds as synced (remove from outbox).
 * Call after successful syncEvents upload.
 */
export function acknowledgeEvents(eventIds: string[]): void {
  const file = outboxPath();
  if (!fs.existsSync(file)) return;

  const lines = readJsonlLines(file);
  const idSet = new Set(eventIds);
  const remaining = parseJsonlLines(lines).filter(e => !idSet.has(e.eventId));
  writeJsonl(file, remaining);
}

/**
 * Mark specific eventIds as failed (increment attempt counter + set error).
 */
export function markEventsFailed(
  eventIds: string[],
  error: string,
): void {
  const file = outboxPath();
  if (!fs.existsSync(file)) return;

  const lines = readJsonlLines(file);
  const idSet = new Set(eventIds);
  const updated = parseJsonlLines(lines).map(e => {
    if (!idSet.has(e.eventId)) return e;
    return {
      ...e,
      syncStatus: 'failed' as const,
      syncAttempts: e.syncAttempts + 1,
      lastSyncAt: new Date().toISOString(),
      lastSyncError: error,
    };
  });
  writeJsonl(file, updated);
}

/**
 * Get events that are ready for retry (backoff elapsed).
 */
export function getRetryableEvents(): OutboxEvent[] {
  const file = outboxPath();
  if (!fs.existsSync(file)) return [];

  const now = Date.now();
  return parseJsonlLines(readJsonlLines(file)).filter(e => {
    if (e.syncStatus === 'syncing') return false;
    if (e.syncStatus === 'synced') return false;
    if (e.syncAttempts === 0) return true;
    const backoffMs = Math.min(
      OUTBOX_RETRY_BASE_MS * Math.pow(2, e.syncAttempts - 1),
      OUTBOX_RETRY_MAX_MS,
    );
    // Add jitter ±25%
    const jitter = backoffMs * 0.25 * (Math.random() * 2 - 1);
    const elapsed = now - (e.lastSyncAt ? new Date(e.lastSyncAt).getTime() : 0);
    return elapsed >= backoffMs + jitter;
  });
}

/**
 * Get all pending/failed events (for syncEvents integration).
 */
export function getOutboxEvents(): OutboxEvent[] {
  const file = outboxPath();
  if (!fs.existsSync(file)) return [];
  return parseJsonlLines(readJsonlLines(file))
    .filter(e => e.syncStatus !== 'synced');
}

/**
 * Count events in outbox.
 */
export function outboxSize(): number {
  const file = outboxPath();
  if (!fs.existsSync(file)) return 0;
  return readJsonlLines(file).length;
}

/**
 * Reset stuck 'syncing' events back to 'pending' (for crash recovery).
 * Call on startup.
 */
export function recoverStuckEvents(): number {
  const file = outboxPath();
  if (!fs.existsSync(file)) return 0;

  const lines = readJsonlLines(file);
  let recovered = 0;
  const updated = parseJsonlLines(lines).map(e => {
    if (e.syncStatus === 'syncing') {
      recovered++;
      return { ...e, syncStatus: 'pending' as const };
    }
    return e;
  });
  if (recovered > 0) writeJsonl(file, updated);
  return recovered;
}

/**
 * Clear all events (after full sync with no partial failures).
 */
export function clearOutbox(): void {
  const file = outboxPath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
