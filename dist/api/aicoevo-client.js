"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPayload = createPayload;
exports.saveLocal = saveLocal;
exports.loadHistory = loadHistory;
exports.stashData = stashData;
exports.buildClaimUrl = buildClaimUrl;
exports.submitFeedback = submitFeedback;
exports.saveFingerprint = saveFingerprint;
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const child_process_1 = require("child_process");
const DEFAULT_ORIGIN = 'https://aicoevo.net';
const REPORT_DIR = (0, path_1.join)((0, os_1.homedir)(), '.mac-aicheck', 'reports');
function getOrigin() {
    const env = process.env.AICO_EVO_URL || process.env.AICO_EVO_BASE_URL || '';
    if (!env)
        return DEFAULT_ORIGIN;
    const trimmed = env.trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(trimmed))
        return trimmed;
    return `https://${trimmed}`;
}
function getApiBase() {
    return `${getOrigin()}/api/v1`;
}
// ===== Sanitizer (脱敏，与 WinAICheck 一致) =====
function sanitize(message) {
    return String(message)
        .replace(/[<>]/g, '')
        .replace(/\n/g, ' ')
        .replace(/\r/g, '')
        .substring(0, 500);
}
// ===== System Info Collector =====
function collectSystemInfo() {
    let hostname = 'unknown';
    try {
        hostname = (0, child_process_1.execSync)('hostname', { timeout: 2000 }).toString().trim();
    }
    catch { }
    let version = 'unknown';
    try {
        version = (0, child_process_1.execSync)('sw_vers -productVersion', { timeout: 2000 }).toString().trim();
    }
    catch { }
    let arch = 'unknown';
    try {
        arch = (0, child_process_1.execSync)('uname -m', { timeout: 2000 }).toString().trim();
    }
    catch { }
    return { os: 'darwin', version, arch, hostname };
}
// ===== HTTP Helper =====
const DEFAULT_TIMEOUT_MS = 8000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
/**
 * Fetch with timeout and exponential-backoff retry.
 * Retries on network errors and retryable HTTP status codes.
 */
async function apiFetch(url, options) {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = 3;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            if (response.ok) {
                return response.json();
            }
            if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === maxRetries) {
                throw new Error(`API 错误: ${response.status} ${response.statusText}`);
            }
            lastError = new Error(`API 错误: ${response.status} ${response.statusText}`);
        }
        catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (lastError.name === 'AbortError' || attempt === maxRetries) {
                throw lastError;
            }
        }
        finally {
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
function createPayload(results, score) {
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
function saveLocal(payload) {
    if (!(0, fs_1.existsSync)(REPORT_DIR))
        (0, fs_1.mkdirSync)(REPORT_DIR, { recursive: true });
    const filename = `scan-${Date.now()}.json`;
    const filepath = (0, path_1.join)(REPORT_DIR, filename);
    (0, fs_1.writeFileSync)(filepath, JSON.stringify(payload, null, 2), 'utf-8');
    return filepath;
}
function loadHistory(max = 10) {
    if (!(0, fs_1.existsSync)(REPORT_DIR))
        return [];
    const files = (0, fs_1.readdirSync)(REPORT_DIR)
        .filter(f => f.startsWith('scan-') && f.endsWith('.json'))
        .sort().reverse().slice(0, max);
    const out = [];
    for (const f of files) {
        try {
            const raw = (0, fs_1.readFileSync)((0, path_1.join)(REPORT_DIR, f), 'utf-8');
            out.push({ ...JSON.parse(raw), filename: f });
        }
        catch { /* skip corrupt */ }
    }
    return out;
}
/**
 * 上传扫描数据到 scan-intake，获取一次性 token 与结构化问题对象（无需登录）
 */
async function stashData(payload) {
    const fingerprint = JSON.stringify({
        platform: 'Mac',
        userAgent: `MacAICheck/${process.version}`,
        system: payload.systemInfo,
        score: payload.score,
        failCount: payload.results.filter(r => r.status === 'fail').length,
        failCategories: [...new Set(payload.results.filter(r => r.status === 'fail').map(r => r.category))],
    });
    return apiFetch(`${getApiBase()}/problem-briefs/scan-intake`, {
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
function buildClaimUrl(token) {
    return `${getOrigin()}/claim?t=${encodeURIComponent(token)}`;
}
/**
 * 提交反馈到 aicoevo.net（无需登录）
 */
async function submitFeedback(payload) {
    return apiFetch(`${getApiBase()}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}
// ===== Legacy（兼容旧接口）=====
/**
 * @deprecated 使用 stashData + buildClaimUrl 代替
 */
async function saveFingerprint(data) {
    const token = process.env.AICO_EVO_TOKEN;
    const headers = { 'Content-Type': 'application/json' };
    if (token)
        headers['Authorization'] = `Bearer ${token}`;
    // Rename systemInfo → platform for API compatibility with FingerprintSaveRequest
    const apiPayload = { ...data, platform: data.systemInfo, systemInfo: undefined };
    return apiFetch(`${getApiBase()}/fingerprints`, {
        method: 'POST',
        headers,
        body: JSON.stringify(apiPayload),
    });
}
