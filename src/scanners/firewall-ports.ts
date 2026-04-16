import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'firewall-ports',
  name: '防火墙端口检测',
  category: 'permission',

  async scan(): Promise<ScanResult> {
    const firewall = runCommand('/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null', 5000);
    const pf = runCommand('pfctl -s info 2>/dev/null | head -n 1', 5000);
    const listening = runCommand("lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR==1 || /:(22|443|7860|8888|11434) /'", 8000).stdout;
    const enabled = /enabled/i.test(firewall.stdout);

    return {
      id: this.id, name: this.name, category: this.category,
      status: enabled ? 'pass' : 'warn',
      message: enabled ? 'macOS 应用防火墙已开启' : 'macOS 应用防火墙未开启或无法确认',
      details: `Application Firewall: ${firewall.stdout || '(无法读取)'}\npf: ${pf.stdout || '(无法读取)'}\n监听中的 AI 常用端口:\n${listening || '(未发现)'}`,
    };
  },
};

registerScanner(scanner);
