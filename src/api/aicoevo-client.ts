/**
 * AICO EVO 平台 API 客户端
 * 文档: https://github.com/gugug168/aicoevo-platform
 * 基础URL: https://aicoevo.net (环境变量 AICO_EVO_URL 配置)
 *
 * 与 WinAICheck 对齐的流程:
 * 1. stash: POST /api/v1/stash → 获取 token（无需登录）
 * 2. claim: 浏览器打开 https://aicoevo.net/claim?t=TOKEN
 * 3. feedback: POST /api/v1/feedback（无需登录）
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import type { ScanResult } from '../scanners/types';
import type { ScoreResult } from '../scoring/calculator';

const DEFAULT_ORIGIN = 'https://aicoevo.net';
const REPORT_DIR = join(homedir(), '.mac-aicheck', 'reports');

function getOrigin(): string {
  const env = process.env.AICO_EVO_URL || process.env.AICO_EVO_BASE_URL || '';
  if (!env) return DEFAULT_ORIGIN;
  const trimmed = env.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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
  }>;
  systemInfo: SystemInfo;
}

// ===== Sanitizer (脱敏，与 WinAICheck 一致) =====

function sanitize(message: string): string {
  return String(message)
    .replace(/[<>]/g, '')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .substring(0, 500);
}

// ===== System Info Collector =====

function collectSystemInfo(): SystemInfo {
  let hostname = 'unknown';
  try { hostname = execSync('hostname', { timeout: 2000 }).toString().trim(); } catch {}
  let version = 'unknown';
  try { version = execSync('sw_vers -productVersion', { timeout: 2000 }).toString().trim(); } catch {}
  let arch = 'unknown';
  try { arch = execSync('uname -m', { timeout: 2000 }).toString().trim(); } catch {}
  return { os: 'darwin', version, arch, hostname };
}

// ===== HTTP Helper =====

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`API 错误: ${response.status} ${response.statusText}`);
    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
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
}

/**
 * 上传扫描数据到 stash，获取一次性 token（无需登录）
 */
export async function stashData(payload: AICOEVOPayload): Promise<StashResponse> {
  const fingerprint = JSON.stringify({
    platform: 'Mac',
    userAgent: `MacAICheck/${process.version}`,
    system: payload.systemInfo,
    score: payload.score,
    failCount: payload.results.filter(r => r.status === 'fail').length,
    failCategories: [...new Set(payload.results.filter(r => r.status === 'fail').map(r => r.category))],
  });

  return apiFetch<StashResponse>(`${getApiBase()}/stash`, {
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
