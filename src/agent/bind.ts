/**
 * OAuth Device Flow Bind Command
 * 
 * 实现与 WinAICheck 对齐的 OAuth 设备流:
 * 1. POST /bind/request → 获取 request_token + confirm_url
 * 2. 打开浏览器 (macOS: open 命令)
 * 3. 轮询 GET /bind/poll 每 3 秒直到 confirmed 或 expired
 * 4. 保存 api_key → authToken, profile_id → profileId 到配置
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import * as crypto from 'node:crypto';
import {
  getApiBase,
  agentApiBase,
  apiKeyHeaders,
  requestJson,
  loadAgentConfig,
  saveAgentConfig,
  getOrCreateDeviceId,
  detectMacDeviceInfo,
  type AgentConfig,
} from '../api/agent-client';

const CONFIG_DIR = join(homedir(), '.mac-aicheck');
const CONFIG_PATH = join(CONFIG_DIR, 'agent-config.json');

// ===== Config Helpers =====

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

// ===== Device ID =====

export function getDeviceId(): string {
  return getOrCreateDeviceId();
}

// ===== Bind Flow =====

interface BindRequestResult {
  status: number;
  data: {
    request_token?: string;
    confirm_url?: string;
    expires_in?: number;
    detail?: string;
  };
}

interface BindPollResult {
  status: number;
  data: {
    status?: 'pending' | 'confirmed' | 'expired';
    api_key?: string;
    profile_id?: string;
    detail?: string;
  };
}

/**
 * Run the OAuth device flow bind command
 * @returns exit code (0 = success, 1 = failure)
 */
export async function runBindCommand(): Promise<number> {
  const config = loadAgentConfig();

  // Check if already bound
  if (config.authToken && config.profileId) {
    console.log('设备已经绑定过 AICO EVO。');
    console.log(`  profileId: ${config.profileId}`);
    console.log('如需重新绑定，请先运行: mac-aicheck agent bind --force');
    console.log('或手动删除配置文件: ~/.mac-aicheck/agent-config.json');
    return 0;
  }

  const agentName = 'mac-aicheck';
  const deviceInfo = detectMacDeviceInfo();
  const deviceId = getOrCreateDeviceId();

  console.log('正在发起设备绑定...');
  console.log(`  设备ID: ${deviceId}`);
  console.log(`  设备信息: ${deviceInfo}`);

  // Step 1: Create bind request
  let bindResult: BindRequestResult;
  try {
    bindResult = await requestJson(
      `${getApiBase()}/bind/request?agent_type=${encodeURIComponent(agentName)}&device_info=${encodeURIComponent(deviceInfo)}&device_id=${encodeURIComponent(deviceId)}`,
      { method: 'POST' },
    ) as BindRequestResult;
  } catch (err) {
    console.error(`绑定请求失败: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  if (bindResult.status !== 200) {
    const detail = bindResult.data?.detail || '未知错误';
    console.error(`绑定请求失败 (${bindResult.status}): ${detail}`);
    return 1;
  }

  const { request_token, confirm_url, expires_in } = bindResult.data;
  if (!request_token || !confirm_url) {
    console.error('绑定响应缺少必要字段: request_token 或 confirm_url');
    return 1;
  }

  console.log(`\n绑定确认URL:\n  ${confirm_url}\n`);

  // Step 2: Open browser
  const openTimeout = expires_in ? Math.min(Math.floor(expires_in / 3), 200) : 200;
  console.log(`绑定有效期: ${expires_in ? `${expires_in} 秒` : '未知'}\n`);

  try {
    // macOS: use 'open' command
    execFileSync('open', [confirm_url], { timeout: 5000 });
    console.log('已自动打开浏览器，请在网页中确认绑定。\n');
  } catch {
    console.log('请手动复制上方链接到浏览器中打开，并在网页中确认绑定。\n');
  }

  // Step 3: Poll for confirmation
  console.log('等待绑定确认中...');
  
  for (let i = 0; i < openTimeout; i++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('.');

    let pollResult: BindPollResult;
    try {
      pollResult = await requestJson(
        `${getApiBase()}/bind/poll?request_token=${encodeURIComponent(request_token)}`,
        { method: 'GET' },
      ) as BindPollResult;
    } catch (err) {
      console.error(`\n轮询请求失败: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }

    if (pollResult.status !== 200) {
      console.error(`\n轮询失败 (${pollResult.status}): ${pollResult.data?.detail || '未知错误'}`);
      return 1;
    }

    const pollData = pollResult.data;
    if (pollData.status === 'confirmed') {
      console.log('\n\n✅ 绑定成功!\n');
      
      config.authToken = pollData.api_key || null;
      config.profileId = pollData.profile_id || null;
      config.shareData = true;
      config.autoSync = true;
      config.paused = false;
      config.confirmedAt = new Date().toISOString();
      saveAgentConfig(config);

      console.log(`  profileId: ${config.profileId}`);
      console.log('  自动同步: 已启用\n');
      console.log('现在可以使用 mac-aicheck agent 指令了。\n');
      return 0;
    }

    if (pollData.status === 'expired') {
      console.error('\n\n绑定请求已过期，请重新运行 bind 命令。\n');
      return 1;
    }

    // status === 'pending' or unknown, continue polling
  }

  console.error('\n\n绑定超时，请重新运行 bind 命令。\n');
  return 1;
}

// ===== Status Command =====

export interface AgentStatus {
  connected: boolean;
  profileId: string | null;
  deviceId: string | null;
  agentType: string | null;
  shareData: boolean;
  autoSync: boolean;
  paused: boolean;
  workerEnabled: boolean;
  draftOrganizerEnabled: boolean;
  lastConfirmedAt: string | null;
  hasAuthToken: boolean;
  authTokenPrefix: string | null;
}

function maskAuthToken(token: string | null): { hasAuthToken: boolean; authTokenPrefix: string | null } {
  if (!token) return { hasAuthToken: false, authTokenPrefix: null };
  return { hasAuthToken: true, authTokenPrefix: token.slice(0, 4) };
}

export function runStatusCommand(): AgentStatus {
  const config = loadAgentConfig();
  const headers = apiKeyHeaders(config);
  const connected = headers !== null;
  const masked = maskAuthToken(config.authToken);

  return {
    connected,
    profileId: config.profileId || null,
    deviceId: config.deviceId || null,
    agentType: config.agentType || null,
    shareData: config.shareData || false,
    autoSync: config.autoSync || false,
    paused: config.paused || false,
    workerEnabled: config.workerEnabled || false,
    draftOrganizerEnabled: (config as unknown as Record<string, unknown>).draftOrganizerEnabled as boolean || false,
    lastConfirmedAt: config.confirmedAt || null,
    hasAuthToken: masked.hasAuthToken,
    authTokenPrefix: masked.authTokenPrefix,
  };
}
