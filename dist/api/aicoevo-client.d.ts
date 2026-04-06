/**
 * AICO EVO 平台 API 客户端
 * 文档: https://github.com/gugug168/aicoevo-platform
 * 基础URL: https://aicoevo.com (环境变量 AICO_EVO_URL 配置)
 *
 * 数据格式与 WinAICheck 保持一致:
 * POST /api/v1/fingerprints
 * Body: { timestamp, score, results:[{id,status,message}], systemInfo:{os,version,arch,hostname} }
 */
import type { ScanResult } from '../scanners/types';
import type { ScoreResult } from '../scoring/calculator';
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
/**
 * 构建与 WinAICheck 格式一致的 Payload
 */
export declare function createPayload(results: ScanResult[], score: ScoreResult): AICOEVOPayload;
/**
 * 保存到本地（与 WinAICheck saveLocal 一致）
 */
export declare function saveLocal(payload: AICOEVOPayload): string;
/**
 * 读取历史报告（最近 max 条）
 */
export declare function loadHistory(max?: number): Array<AICOEVOPayload & {
    filename: string;
}>;
/**
 * 上传扫描结果到 AICO EVO（POST /api/v1/fingerprints）
 */
export declare function saveFingerprint(data: AICOEVOPayload): Promise<{
    id: string;
    saved_at: string;
}>;
/**
 * 获取历史指纹列表
 */
export declare function listFingerprints(): Promise<any[]>;
