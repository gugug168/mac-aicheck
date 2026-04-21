import type { ScanResult, Scanner } from './types';
import { commandExists } from '../executor/index';
import { registerScanner } from './registry';
import { getClaudeMcpConfigCandidates, readJsonCandidate } from './config-utils';

const scanner: Scanner = {
  id: 'claude-config-health',
  name: 'Claude Code 配置检测',
  category: 'ai-tools',

  async scan(): Promise<ScanResult> {
    const config = readJsonCandidate(getClaudeMcpConfigCandidates());
    const installed = commandExists('claude');

    if (!config) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: installed ? 'warn' : 'unknown',
        error_type: installed ? 'misconfigured' : undefined,
        message: installed ? 'Claude Code 已安装，但未发现本地配置文件' : '未检测到 Claude Code 配置',
        detail: '检查项目 .claude/、~/.claude/ 与 ~/.claude.json。',
      };
    }

    if (config.error) {
      return {
        id: this.id, name: this.name, category: this.category,
        status: 'fail',
        error_type: 'misconfigured',
        message: 'Claude Code 配置无法解析',
        detail: `文件: ${config.path}\n错误: ${config.error}`,
      };
    }

    return {
      id: this.id, name: this.name, category: this.category,
      status: 'pass',
      message: 'Claude Code 配置文件可解析',
      detail: `文件: ${config.path}`,
    };
  },
};

registerScanner(scanner);
