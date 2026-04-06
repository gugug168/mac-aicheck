/**
 * AICO EVO 平台 API 客户端
 * 文档: https://github.com/gugug168/aicoevo-platform
 * 基础URL: https://aicoevo.com (环境变量 AICO_EVO_URL 配置)
 */
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
/** 上传扫描结果到 AICO EVO */
export declare function saveFingerprint(data: AICOEVOSaveRequest): Promise<AICOEVOSaveResponse>;
/** 获取扫描历史 */
export declare function listFingerprints(): Promise<any[]>;
/** 获取解决方案 */
export declare function getSolutions(category?: string): Promise<any[]>;
