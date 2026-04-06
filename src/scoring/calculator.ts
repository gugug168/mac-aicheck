/**
 * 加权评分系统（对齐 WinAICheck）
 * 按 Scanner 类别分配权重，模拟真实环境重要性
 */

import type { ScanResult } from '../scanners/types';

export type ScoreGrade = 'excellent' | 'good' | 'fair' | 'poor';
export type ScannerCategory = 'brew' | 'apple' | 'toolchain' | 'ai-tools' | 'network' | 'permission';

export interface ScoreResult {
  score: number;         // 0-100
  grade: ScoreGrade;
  label: string;         // 优秀/良好/一般/需改善
  breakdown: {
    category: ScannerCategory;
    passed: number;
    total: number;
    weight: number;
    weightedScore: number;
  }[];
}

/** 类别权重（与 WinAICheck 对齐） */
export const CATEGORY_WEIGHTS: Record<ScannerCategory, number> = {
  toolchain: 1.0,   // 核心工具链 ×1.0
  'ai-tools': 1.0,  // AI 工具 ×1.0
  permission: 1.2,  // 权限安全 ×1.2
  apple: 0.9,       // macOS 平台特性 ×0.9
  brew: 0.8,        // Homebrew 生态 ×0.8
  network: 1.0,     // 网络连通性 ×1.0
};

const GRADE_LABELS: Record<ScoreGrade, string> = {
  excellent: '优秀',
  good: '良好',
  fair: '一般',
  poor: '需改善',
};

function getGrade(score: number): { grade: ScoreGrade; label: string } {
  if (score >= 90) return { grade: 'excellent', label: GRADE_LABELS.excellent };
  if (score >= 70) return { grade: 'good', label: GRADE_LABELS.good };
  if (score >= 50) return { grade: 'fair', label: GRADE_LABELS.fair };
  return { grade: 'poor', label: GRADE_LABELS.poor };
}

function groupByCategory(results: ScanResult[]): Map<ScannerCategory, ScanResult[]> {
  const map = new Map<ScannerCategory, ScanResult[]>();
  for (const r of results) {
    const cat = r.category as ScannerCategory;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(r);
  }
  return map;
}

export function calculateScore(results: ScanResult[]): ScoreResult {
  const grouped = groupByCategory(results);

  let totalWeightedPass = 0;
  let totalWeightedAll = 0;

  const breakdown: ScoreResult['breakdown'] = [];

  for (const [category, items] of grouped) {
    const weight = CATEGORY_WEIGHTS[category] ?? 1.0;
    // unknown 不计入分母
    const scorable = items.filter(r => r.status !== 'unknown');
    const passed = scorable.filter(r => r.status === 'pass').length;
    const total = scorable.length;

    if (total > 0) {
      const weightedScore = (passed / total) * weight;
      totalWeightedPass += weightedScore;
      totalWeightedAll += weight;
      breakdown.push({ category, passed, total, weight, weightedScore: Math.round(weightedScore * 100) / 100 });
    } else {
      breakdown.push({ category, passed: 0, total: 0, weight, weightedScore: 0 });
    }
  }

  const score = totalWeightedAll > 0
    ? Math.round((totalWeightedPass / totalWeightedAll) * 100)
    : 0;

  const { grade, label } = getGrade(score);
  return { score, grade, label, breakdown };
}
