import type { ScanResult, Scanner } from './types';
import { registerScanner } from './registry';
import { collectSecretLeaves, getClaudeMcpConfigCandidates, getMcpConfigCandidates, looksLikePlaceholderSecret, readJsonCandidate } from './config-utils';

const scanner: Scanner = {
  id: 'mcp-config-health',
  name: 'MCP 配置健康检测',
  category: 'ai-tools',
  affectsScore: false,
  defaultEnabled: false,

  async scan(): Promise<ScanResult> {
    const config = readJsonCandidate([...getClaudeMcpConfigCandidates(), ...getMcpConfigCandidates()]);
    if (!config) return { id: this.id, name: this.name, category: this.category, status: 'unknown', message: '未发现 MCP 配置文件' };
    if (config.error) return { id: this.id, name: this.name, category: this.category, status: 'fail', error_type: 'misconfigured', message: 'MCP 配置无法解析', detail: `文件: ${config.path}\n错误: ${config.error}` };

    const servers = config.data?.mcpServers || config.data?.servers || {};
    const serverCount = servers && typeof servers === 'object' ? Object.keys(servers).length : 0;
    const placeholders = collectSecretLeaves(config.data).filter(item => /key|token|secret|api/i.test(item.key) && looksLikePlaceholderSecret(item.value));
    return {
      id: this.id, name: this.name, category: this.category,
      status: placeholders.length ? 'warn' : 'pass',
      error_type: placeholders.length ? 'misconfigured' : undefined,
      message: placeholders.length ? 'MCP 配置中存在疑似占位密钥' : `MCP 配置可解析（${serverCount} 个 server）`,
      detail: `文件: ${config.path}${placeholders.length ? `\n占位项: ${placeholders.map(item => item.key).join(', ')}` : ''}`,
    };
  },
};

registerScanner(scanner);
