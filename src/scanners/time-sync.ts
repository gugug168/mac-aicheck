import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'time-sync',
  name: '时间同步检测',
  category: 'permission',

  async scan(): Promise<ScanResult> {
    const setup = runCommand('systemsetup -getusingnetworktime 2>/dev/null', 5000);
    const server = runCommand('systemsetup -getnetworktimeserver 2>/dev/null', 5000);
    const sntp = runCommand('sntp -sS time.apple.com 2>/dev/null | head -n 3', 8000);
    const enabled = /on/i.test(setup.stdout);
    const offsetMatch = sntp.stdout.match(/([+-]?\d+(?:\.\d+)?)\s*\+\/-/);
    const offset = offsetMatch ? Math.abs(Number(offsetMatch[1])) : null;
    const highOffset = offset !== null && offset > 5;

    if (setup.exitCode !== 0 && sntp.exitCode !== 0) {
      return { id: this.id, name: this.name, category: this.category, status: 'unknown', message: '无法查询时间同步状态' };
    }

    return {
      id: this.id, name: this.name, category: this.category,
      status: enabled && !highOffset ? 'pass' : 'warn',
      message: enabled && !highOffset ? '系统时间同步正常' : '时间同步未开启或偏移可能过大',
      details: `网络时间: ${setup.stdout || '(无法读取)'}\n时间服务器: ${server.stdout || '(无法读取)'}\nsntp:\n${sntp.stdout || '(无法读取)'}`,
      suggestions: enabled ? undefined : ['sudo systemsetup -setusingnetworktime on'],
    };
  },
};

registerScanner(scanner);
