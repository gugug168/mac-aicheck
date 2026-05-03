/**
 * AICO EVO 平台 API 客户端
 * 文档: https://github.com/gugug168/aicoevo-platform
 * 基础URL: https://aicoevo.net (环境变量 AICO_EVO_URL 配置)
 *
 * 与 WinAICheck 对齐的流程:
 * 1. scan-intake: POST /api/v1/problem-briefs/scan-intake → 获取 token + problem brief（无需登录）
 * 2. claim: 浏览器打开 https://aicoevo.net/claim?t=TOKEN
 * 3. feedback: POST /api/v1/feedback（无需登录）
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir, hostname as osHostname, arch as osArch, release as osRelease } from 'os';
import { execSync } from 'child_process';
import type { ScanResult } from '../scanners/types';
import type { ScoreResult } from '../scoring/calculator';

function getAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as { version?: string };
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

const DEFAULT_ORIGIN = 'https://aicoevo.net';
const REPORT_DIR = join(homedir(), '.mac-aicheck', 'reports');

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  const blocked = ['169.254.169.254', 'metadata.google.internal', '100.100.100.200',
    '127.0.0.1', '0.0.0.0', '::1', 'localhost'];
  if (blocked.includes(h)) return true;
  // Block private IP ranges
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(h)) return true;
  return false;
}

function getOrigin(): string {
  const env = process.env.AICO_EVO_URL || process.env.AICOEVO_BASE_URL || '';
  if (!env) return DEFAULT_ORIGIN;
  const trimmed = env.trim().replace(/\/+$/, '');
  let url: string;
  if (/^https?:\/\//i.test(trimmed)) url = trimmed;
  else url = 'https://' + trimmed;
  try {
    const parsed = new URL(url);
    if (isBlockedHost(parsed.hostname)) {
      console.warn(`[安全] AICO_EVO_URL 指向内网地址 ${parsed.hostname}，已忽略`);
      return DEFAULT_ORIGIN;
    }
  } catch { return DEFAULT_ORIGIN; }
  return url;
}

function getApiBase(): string {
  return `${getOrigin()}/api/v1`;
}

// ===== System Info =====

export interface SystemInfo {
  os: string;
  version: string;
  arch: string;
  hostname: string;
}

/** 上传Payload格式（与 WinAICheck 一致） */
export interface AICOEVOPayload {
  timestamp: string;
  score: number;
  results: Array<{
    id: string;
    name: string;
    category: string;
    status: string;
    message: string;
    detail?: string;
    error_type?: string;
    suggestions?: string[];
    version?: string | null;
    path?: string | null;
    fixCommand?: string | null;
    severity?: string | null;
  }>;
  systemInfo: SystemInfo;
}

// ===== Sanitizer (脱敏，与 WinAICheck 对齐) =====

const SENSITIVE_PATTERNS = [
  { regex: /(?:sk-|api[_-]?key[_-]?)([a-zA-Z0-9_-]{20,})/gi, replacement: '<API_KEY>' },
  { regex: /Bearer\s+[a-zA-Z0-9._-]+/gi, replacement: 'Bearer <TOKEN>' },
  { regex: /\/Users\/[^\/]+?(?=\/|[\r\n]|$)/gi, replacement: '/Users/<USER>' },
  { regex: /\b(\d{1,3}\.){3}\d{1,3}\b/g, replacement: '<IP>' },
  { regex: /[\w.-]+@[\w.-]+\.\w+/g, replacement: '<EMAIL>' },
  { regex: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g, replacement: '<PRIVATE_KEY>' },
  { regex: /https?:\/\/[^@\s]+:[^@\s]+@/g, replacement: 'http://<BASIC_AUTH>@' },
  { regex: /(?:OPENAI|ANTHROPIC|OPENROUTER|OPENCLAW|DASHSCOPE|ZHIPU|MOONSHOT|GEMINI)[\w-]*(?:KEY|TOKEN)?\s*=\s*[^\s]+/gi, replacement: '<SECRET_ENV>' },
];

function sanitize(message: string): string {
  let result = String(message || '');
  for (const { regex, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result.substring(0, 500);
}

// ===== System Info Collector =====

function collectSystemInfo(): SystemInfo {
  const hostname = osHostname() || 'unknown';
  if (process.platform !== 'darwin') {
    return {
      os: process.platform,
      version: osRelease() || 'unknown',
      arch: osArch() || 'unknown',
      hostname,
    };
  }

  let version = 'unknown';
  try {
    version = execSync('sw_vers -productVersion', {
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {}

  let arch = 'unknown';
  try {
    arch = execSync('uname -m', {
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {}

  return { os: 'darwin', version, arch, hostname };
}

// ===== HTTP Helper =====

const DEFAULT_TIMEOUT_MS = 8000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Fetch with timeout and exponential-backoff retry.
 * Retries on network errors and retryable HTTP status codes.
 */
async function apiFetch<T>(url: string, options?: FetchOptions): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (response.ok) {
        return response.json() as Promise<T>;
      }
      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === maxRetries) {
        throw new Error(`API 错误: ${response.status} ${response.statusText}`);
      }
      lastError = new Error(`API 错误: ${response.status} ${response.statusText}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === 'AbortError' || attempt === maxRetries) {
        throw lastError;
      }
    } finally {
      clearTimeout(timer);
    }

    // Exponential backoff: 500ms, 1000ms, 2000ms
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
    }
  }

  throw lastError ?? new Error('API 请求失败');
}

// ===== Payload Builder =====

export function createPayload(results: ScanResult[], score: ScoreResult): AICOEVOPayload {
  return {
    timestamp: new Date().toISOString(),
    score: score.score,
    results: results.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      status: r.status,
      message: sanitize(r.message),
      detail: r.detail ? sanitize(r.detail) : undefined,
      error_type: r.error_type,
      suggestions: (r.suggestions || []).map(s => sanitize(s)),
      version: r.version ?? null,
      path: r.path ?? null,
      fixCommand: r.fixCommand ?? null,
      severity: r.severity ?? null,
    })),
    systemInfo: collectSystemInfo(),
  };
}

// ===== Local Storage =====

export function saveLocal(payload: AICOEVOPayload): string {
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const filename = `scan-${Date.now()}.json`;
  const filepath = join(REPORT_DIR, filename);
  writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf-8');
  return filepath;
}

export function loadHistory(max = 10): Array<AICOEVOPayload & { filename: string }> {
  if (!existsSync(REPORT_DIR)) return [];
  const files = readdirSync(REPORT_DIR)
    .filter(f => f.startsWith('scan-') && f.endsWith('.json'))
    .sort().reverse().slice(0, max);
  const out: Array<AICOEVOPayload & { filename: string }> = [];
  for (const f of files) {
    try {
      const raw = readFileSync(join(REPORT_DIR, f), 'utf-8');
      out.push({ ...JSON.parse(raw) as AICOEVOPayload, filename: f });
    } catch { /* skip corrupt */ }
  }
  return out;
}

// ===== Stash → Claim 流程（与 WinAICheck 一致）=====

export interface StashRequest {
  data: string;
  fingerprint: string;
}

export interface StashResponse {
  token: string;
  claim_url?: string;
  ttl_seconds?: number;
  problem_brief_id?: string;
  evidence_pack_id?: string;
}

/**
 * 上传扫描数据到 scan-intake，获取一次性 token 与结构化问题对象（无需登录）
 */
export async function stashData(payload: AICOEVOPayload): Promise<StashResponse> {
  const fingerprint = JSON.stringify({
    platform: 'Mac',
    userAgent: `MacAICheck/${getAppVersion()}`,
    system: payload.systemInfo,
    score: payload.score,
    failCount: payload.results.filter(r => r.status === 'fail').length,
    failCategories: [...new Set(payload.results.filter(r => r.status === 'fail').map(r => r.category))],
  });

  return apiFetch<StashResponse>(`${getApiBase()}/problem-briefs/scan-intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: JSON.stringify(payload),
      fingerprint,
    }),
  });
}

/**
 * 构建 claim URL（用 token 在浏览器打开）
 */
export function buildClaimUrl(token: string): string {
  return `${getOrigin()}/claim?t=${encodeURIComponent(token)}`;
}

// ===== Feedback =====

export interface FeedbackPayload {
  content: string;
  category: string;
  email?: string;
  env_summary: {
    score: number;
    failCount: number;
    warnCount: number;
    platform: string;
  };
}

/**
 * 提交反馈到 aicoevo.net（无需登录）
 */
export async function submitFeedback(payload: FeedbackPayload): Promise<{ id: string; status: string }> {
  return apiFetch<{ id: string; status: string }>(`${getApiBase()}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ===== Legacy（兼容旧接口）=====

/**
 * @deprecated 使用 stashData + buildClaimUrl 代替
 */
export async function saveFingerprint(data: AICOEVOPayload): Promise<{ id: string; saved_at: string }> {
  const token = process.env.AICO_EVO_TOKEN;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Rename systemInfo → platform for API compatibility with FingerprintSaveRequest
  const apiPayload = { ...data, platform: data.systemInfo, systemInfo: undefined };
  return apiFetch<{ id: string; saved_at: string }>(`${getApiBase()}/fingerprints`, {
    method: 'POST',
    headers,
    body: JSON.stringify(apiPayload),
  });
}
