/**
 * 加权评分系统（对齐 WinAICheck）
 * 按 Scanner 类别分配权重，模拟真实环境重要性
 */
import type { ScanResult } from '../scanners/types';
export type ScoreGrade = 'excellent' | 'good' | 'fair' | 'poor';
export type ScannerCategory = 'brew' | 'apple' | 'toolchain' | 'ai-tools' | 'network' | 'permission' | 'system';
export interface ScoreResult {
    score: number;
    prevScore?: number;
    grade: ScoreGrade;
    label: string;
    breakdown: {
        category: ScannerCategory;
        passed: number;
        total: number;
        weight: number;
        weightedScore: number;
    }[];
}
/** 类别权重（与 WinAICheck 对齐） */
export declare const CATEGORY_WEIGHTS: Record<ScannerCategory, number>;
export declare function calculateScore(results: ScanResult[], prevScore?: number): ScoreResult;
