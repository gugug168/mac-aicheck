/**
 * AICO EVO 平台 API 客户端
 * 文档: https://github.com/gugug168/aicoevo-platform
 * 基础URL: https://aicoevo.com (环境变量 AICO_EVO_URL 配置)
 */

const BASE_URL = process.env.AICO_EVO_URL || 'https://aicoevo.com';

export interface ScanResult {
  id: string;
  name: string;
  category: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface AICOEVOSaveRequest {
  score: number;
  results: ScanResult[];
  platform: {
    os: 'darwin';
    version: string;
    arch: string;
    hostname?: string;
  };
  timestamp: string;
}

export interface AICOEVOSaveResponse {
  id: string;
  saved_at: string;
  score: number;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const token = process.env.AICO_EVO_TOKEN;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options?.headers as Record<string, string>,
  };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error(`AICO EVO API 错误: ${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

/** 上传扫描结果到 AICO EVO */
export async function saveFingerprint(data: AICOEVOSaveRequest): Promise<AICOEVOSaveResponse> {
  return apiFetch<AICOEVOSaveResponse>(`${BASE_URL}/api/v1/fingerprints`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 获取扫描历史 */
export async function listFingerprints(): Promise<any[]> {
  const data = await apiFetch<{ fingerprints?: any[] }>(`${BASE_URL}/api/v1/fingerprints`);
  return data.fingerprints || [];
}

/** 获取解决方案 */
export async function getSolutions(category?: string): Promise<any[]> {
  const url = category ? `${BASE_URL}/api/v1/solutions?category=${category}` : `${BASE_URL}/api/v1/solutions`;
  return apiFetch<any[]>(url);
}
