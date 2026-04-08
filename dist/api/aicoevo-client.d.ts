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
import type { ScanResult } from '../scanners/types';
import type { ScoreResult } from '../scoring/calculator';
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
export declare function createPayload(results: ScanResult[], score: ScoreResult): AICOEVOPayload;
export declare function saveLocal(payload: AICOEVOPayload): string;
export declare function loadHistory(max?: number): Array<AICOEVOPayload & {
    filename: string;
}>;
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
export declare function stashData(payload: AICOEVOPayload): Promise<StashResponse>;
/**
 * 构建 claim URL（用 token 在浏览器打开）
 */
export declare function buildClaimUrl(token: string): string;
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
export declare function submitFeedback(payload: FeedbackPayload): Promise<{
    id: string;
    status: string;
}>;
/**
 * @deprecated 使用 stashData + buildClaimUrl 代替
 */
export declare function saveFingerprint(data: AICOEVOPayload): Promise<{
    id: string;
    saved_at: string;
}>;
