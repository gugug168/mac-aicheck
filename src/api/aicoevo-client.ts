/**
 * AICO EVO 平台 API 客户端
 * 文档: https://github.com/gugug168/aicoevo-platform
 * 基础URL: https://aicoevo.com (环境变量 AICO_EVO_URL 配置)
 *
 * 数据格式与 WinAICheck 保持一致:
 * POST /api/v1/fingerprints
 * Body: { timestamp, score, results:[{id,status,message}], systemInfo:{os,version,arch,hostname} }
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import type { ScanResult } from '../scanners/types';
import type { ScoreResult } from '../scoring/calculator';

const BASE_URL = process.env.AICO_EVO_URL || 'https://aicoevo.com';
const REPORT_DIR = join(homedir(), '.mac-aicheck', 'reports');

// ===== System Info =====

export interface SystemInfo {
  os: string;
  version: string;
  arch: string;
  hostname: string;
}

/** AICO EVO 上传Payload格式（与 WinAICheck 一致） */
export interface AICOEVOPayload {
  timestamp: string;
  score: number;
  results: Array<{
    id: string;
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

// ===== API Client =====

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = process.env.AICO_EVO_TOKEN;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options?.headers as Record<string, string>),
  };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error(`AICO EVO API 错误: ${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

/**
 * 构建与 WinAICheck 格式一致的 Payload
 */
export function createPayload(results: ScanResult[], score: ScoreResult): AICOEVOPayload {
  return {
    timestamp: new Date().toISOString(),
    score: score.score,
    results: results.map(r => ({
      id: r.id,
      status: r.status,
      message: sanitize(r.message),
    })),
    systemInfo: collectSystemInfo(),
  };
}

/**
 * 保存到本地（与 WinAICheck saveLocal 一致）
 */
export function saveLocal(payload: AICOEVOPayload): string {
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const filename = `scan-${Date.now()}.json`;
  const filepath = join(REPORT_DIR, filename);
  writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf-8');
  return filepath;
}

/**
 * 读取历史报告（最近 max 条）
 */
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

/**
 * 上传扫描结果到 AICO EVO（POST /api/v1/fingerprints）
 */
export async function saveFingerprint(data: AICOEVOPayload): Promise<{ id: string; saved_at: string }> {
  return apiFetch<{ id: string; saved_at: string }>(`${BASE_URL}/api/v1/fingerprints`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * 获取历史指纹列表
 */
export async function listFingerprints(): Promise<any[]> {
  const data = await apiFetch<{ fingerprints?: any[] }>(`${BASE_URL}/api/v1/fingerprints`);
  return data.fingerprints || [];
}
