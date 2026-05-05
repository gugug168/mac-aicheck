import type { Fixer, FixerRisk } from './types';
import type { ScanResult } from '../scanners/types';

export interface FixRiskPresentation {
  risk: FixerRisk;
  title: string;
  buttonLabel: string;
  accent: string;
  background: string;
  text: string;
  border: string;
  weight: number;
}

const PRESENTATION_BY_RISK: Record<FixerRisk, FixRiskPresentation> = {
  green: {
    risk: 'green',
    title: '立即处理',
    buttonLabel: '查看并执行',
    accent: '#22c55e',
    background: 'rgba(34,197,94,.10)',
    text: '#dcfce7',
    border: 'rgba(34,197,94,.25)',
    weight: 0,
  },
  yellow: {
    risk: 'yellow',
    title: '建议处理',
    buttonLabel: '查看后确认',
    accent: '#eab308',
    background: 'rgba(234,179,8,.10)',
    text: '#fef3c7',
    border: 'rgba(234,179,8,.28)',
    weight: 1,
  },
  red: {
    risk: 'red',
    title: '手动处理',
    buttonLabel: '查看指引',
    accent: '#f97316',
    background: 'rgba(249,115,22,.10)',
    text: '#ffedd5',
    border: 'rgba(249,115,22,.28)',
    weight: 2,
  },
};

export function getFixRiskPresentation(fixer: Fixer): FixRiskPresentation {
  return PRESENTATION_BY_RISK[fixer.risk];
}

export function rankIssue(scanResult: ScanResult, fixer?: Fixer): number {
  const statusWeight = scanResult.status === 'fail' ? 0 : scanResult.status === 'warn' ? 10 : 20;
  const fixerWeight = fixer ? getFixRiskPresentation(fixer).weight : 9;
  return statusWeight + fixerWeight;
}

export function sortIssuesByPriority(results: ScanResult[], resolveFixer: (result: ScanResult) => Fixer | undefined): ScanResult[] {
  return [...results].sort((left, right) => {
    const leftFixer = resolveFixer(left);
    const rightFixer = resolveFixer(right);

    const rankDiff = rankIssue(left, leftFixer) - rankIssue(right, rightFixer);
    if (rankDiff !== 0) return rankDiff;

    return left.name.localeCompare(right.name, 'zh-CN');
  });
}
