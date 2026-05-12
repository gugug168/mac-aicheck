/**
 * AICO EVO Agent API 客户端
 * 
 * 提供 agent 相关的 API 调用函数，供 bind、status、bounty-* 等命令使用。
 * 基础URL: https://aicoevo.net (环境变量 AICOEVO_API_BASE 或 AICOEVO_BASE_URL 配置)
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import * as crypto from 'node:crypto';

const DEFAULT_ORIGIN = 'https://aicoevo.net';
const CONFIG_DIR = join(homedir(), '.mac-aicheck');
const CONFIG_PATH = join(CONFIG_DIR, 'agent-config.json');

// ===== Config Types =====

export interface AgentConfig {
  clientId: string;
  deviceId: string;
  shareData: boolean;
  autoSync: boolean;
  paused: boolean;
  workerEnabled: boolean;
  authToken: string | null;
  profileId: string | null;
  agentType: string | null;
  confirmedAt: string | null;
}

// ===== Config Helpers =====

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadAgentConfig(): AgentConfig {
  ensureConfigDir();
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      const cfg = JSON.parse(raw) as Partial<AgentConfig>;
      // Ensure required fields
      if (!cfg.clientId) cfg.clientId = `client_${crypto.randomUUID()}`;
      if (!cfg.deviceId) cfg.deviceId = `device_${crypto.randomUUID()}`;
      if (cfg.shareData === undefined) cfg.shareData = false;
      if (cfg.autoSync === undefined) cfg.autoSync = false;
      if (cfg.paused === undefined) cfg.paused = false;
      if (cfg.workerEnabled === undefined) cfg.workerEnabled = false;
      return cfg as AgentConfig;
    }
  } catch {
    // Fall through to create default
  }
  return {
    clientId: `client_${crypto.randomUUID()}`,
    deviceId: `device_${crypto.randomUUID()}`,
    shareData: false,
    autoSync: false,
    paused: false,
    workerEnabled: false,
    authToken: null,
    profileId: null,
    agentType: null,
    confirmedAt: null,
  };
}

export function saveAgentConfig(cfg: AgentConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

// ===== API Base =====

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  const blocked = ['169.254.169.254', 'metadata.google.internal', '100.100.100.200',
    '127.0.0.1', '0.0.0.0', '::1', 'localhost'];
  if (blocked.includes(h)) return true;
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(h)) return true;
  return false;
}

function allowPrivateApiBase(): boolean {
  const raw = String(process.env.MACAICHECK_ALLOW_PRIVATE_API || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function getOrigin(): string {
  const configuredBase = [process.env.AICOEVO_API_BASE, process.env.AICOEVO_BASE_URL]
    .find(value => value && !['undefined', 'null'].includes(value.trim().toLowerCase()));
  const raw = (configuredBase || DEFAULT_ORIGIN).replace(/\/+$/, '');
  try {
    const withScheme = raw.startsWith('http') ? raw : `https://${raw}`;
    const parsed = new URL(withScheme);
    if (isBlockedHost(parsed.hostname) && !allowPrivateApiBase()) {
      return DEFAULT_ORIGIN;
    }
  } catch {
    return DEFAULT_ORIGIN;
  }
  if (!raw.startsWith('https://') && process.env.NODE_ENV !== 'development' && !allowPrivateApiBase()) {
    return raw.replace(/^http:\/\//, 'https://').endsWith('/api/v1') 
      ? raw.replace(/^http:\/\//, 'https://') 
      : `${raw.replace(/^http:\/\//, 'https://')}/api/v1`;
  }
  return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
}

export function getApiBase(version = 'v1'): string {
  return `${getOrigin()}/api/${version}`;
}

export function agentApiBase(version = 'v1'): string {
  return `${getApiBase(version)}/agent`;
}

// ===== Auth Headers =====

export function apiKeyHeaders(config: AgentConfig): Record<string, string> | null {
  if (!config.authToken) return null;
  if (config.authToken.startsWith('ak_')) {
    return { 'X-API-Key': config.authToken };
  }
  return { Authorization: `Bearer ${config.authToken}` };
}

// ===== HTTP Fetch =====

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface RequestResult {
  status: number;
  data: Record<string, unknown>;
}

export async function requestJson(
  url: string,
  init: FetchOptions = {},
): Promise<RequestResult> {
  const timeoutMs = init.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const resp = await fetch(url, {
      method: init.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers as Record<string, string> || {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    
    const text = await resp.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text.slice(0, 200) };
    }
    return { status: resp.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// ===== Heartbeat =====

export interface HeartbeatBody {
  clientId: string;
  deviceId: string;
  agentType?: string;
  shareData?: boolean;
}

export interface HeartbeatResponse {
  recommended_bounties?: Array<{
    id: string;
    title: string;
    reward: string;
    difficulty: string;
  }>;
  pending_owner_verifications?: Array<{
    id: string;
    bounty_id: string;
    title: string;
  }>;
  advice?: Record<string, unknown>;
}

export async function heartbeatAgentV2(
  headers: Record<string, string>,
  body: HeartbeatBody,
): Promise<HeartbeatResponse> {
  const result = await requestJson(`${agentApiBase('v2')}/heartbeat`, {
    method: 'POST',
    headers,
    body,
    timeoutMs: 10000,
  });
  return result.data as HeartbeatResponse;
}

// ===== Device Info =====

export function getDeviceId(): string {
  const cfg = loadAgentConfig();
  return cfg.deviceId;
}

export function getOrCreateDeviceId(): string {
  const cfg = loadAgentConfig();
  if (!cfg.deviceId) {
    cfg.deviceId = `device_${crypto.randomUUID()}`;
    saveAgentConfig(cfg);
  }
  return cfg.deviceId;
}

export function detectMacDeviceInfo(): string {
  try {
    const result = execFileSync('sw_vers', ['-productVersion'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const version = String(result).trim();
    if (version) return `macOS ${version}`;
  } catch {
    // fall through
  }
  const darwinMajor = Number(process.versions?.darwin?.split('.')[0] || 0);
  const fallbackMap: Record<number, string> = {
    24: 'macOS 15',
    23: 'macOS 14',
    22: 'macOS 13',
    21: 'macOS 12',
  };
  return fallbackMap[darwinMajor] || 'macOS';
}
