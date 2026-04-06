"use strict";
/**
 * AICO EVO 平台 API 客户端
 * 文档: https://github.com/gugug168/aicoevo-platform
 * 基础URL: https://aicoevo.com (环境变量 AICO_EVO_URL 配置)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveFingerprint = saveFingerprint;
exports.listFingerprints = listFingerprints;
exports.getSolutions = getSolutions;
const BASE_URL = process.env.AICO_EVO_URL || 'https://aicoevo.com';
async function apiFetch(url, options) {
    const token = process.env.AICO_EVO_TOKEN;
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options?.headers,
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok)
        throw new Error(`AICO EVO API 错误: ${response.status} ${response.statusText}`);
    return response.json();
}
/** 上传扫描结果到 AICO EVO */
async function saveFingerprint(data) {
    return apiFetch(`${BASE_URL}/api/v1/fingerprints`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
/** 获取扫描历史 */
async function listFingerprints() {
    const data = await apiFetch(`${BASE_URL}/api/v1/fingerprints`);
    return data.fingerprints || [];
}
/** 获取解决方案 */
async function getSolutions(category) {
    const url = category ? `${BASE_URL}/api/v1/solutions?category=${category}` : `${BASE_URL}/api/v1/solutions`;
    return apiFetch(url);
}
