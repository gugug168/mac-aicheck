import type { ScanResult, Scanner } from './types';
import { registerScanner } from './registry';
import { canResolveCommand, getClaudeMcpConfigCandidates, getMcpConfigCandidates, readJsonCandidate } from './config-utils';

function collectCommands(config: any): string[] {
  const servers = config?.mcpServers || config?.servers || {};
  return Object.values(servers)
    .map((server: any) => typeof server?.command === 'string' ? [server.command, ...(Array.isArray(server.args) ? server.args : [])].join(' ') : '')
    .filter(Boolean);
}

const scanner: Scanner = {
  id: 'mcp-command-availability',
  name: 'MCP 命令可用性检测',
  category: 'ai-tools',

  async scan(): Promise<ScanResult> {
    const config = readJsonCandidate([...getClaudeMcpConfigCandidates(), ...getMcpConfigCandidates()]);
    if (!config || config.error || !config.data) {
      return { id: this.id, name: this.name, category: this.category, status: 'unknown', message: '未找到可解析的 MCP 配置' };
    }

    const commands = collectCommands(config.data);
    const missing = commands.filter(command => !canResolveCommand(command));
    if (commands.length === 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'unknown', message: 'MCP 配置中未发现 command 字段', details: `文件: ${config.path}` };
    }
    return {
      id: this.id, name: this.name, category: this.category,
      status: missing.length ? 'warn' : 'pass',
      message: missing.length ? `部分 MCP command 不可解析 (${missing.length}/${commands.length})` : 'MCP command 均可解析',
      details: `文件: ${config.path}\n${missing.length ? `不可解析:\n${missing.join('\n')}` : commands.join('\n')}`,
    };
  },
};

registerScanner(scanner);
