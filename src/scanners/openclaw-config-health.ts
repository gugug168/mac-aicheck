import type { ScanResult, Scanner } from './types';
import { commandExists } from '../executor/index';
import { registerScanner } from './registry';
import { getOpenClawConfigCandidates, readJsonCandidate } from './config-utils';

const scanner: Scanner = {
  id: 'openclaw-config-health',
  name: 'OpenClaw 配置检测',
  category: 'ai-tools',

  async scan(): Promise<ScanResult> {
    const config = readJsonCandidate(getOpenClawConfigCandidates());
    const installed = commandExists('openclaw');
    if (!config) {
      return { id: this.id, name: this.name, category: this.category, status: installed ? 'warn' : 'unknown', message: installed ? 'OpenClaw 已安装，但未发现配置文件' : '未检测到 OpenClaw 配置' };
    }
    if (config.error) {
      return { id: this.id, name: this.name, category: this.category, status: 'fail', error_type: 'misconfigured', message: 'OpenClaw 配置无法解析', detail: `文件: ${config.path}\n错误: ${config.error}` };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass', message: 'OpenClaw 配置文件可解析', detail: `文件: ${config.path}` };
  },
};

registerScanner(scanner);
