import type { Scanner, ScanResult } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'admin-perms',
  name: '管理员权限',
  category: 'permission',

  async scan(): Promise<ScanResult> {
    // Mac: 检查当前用户是否在 admin 组
    const { exitCode } = runCommand('groups | grep -w admin 2>/dev/null || echo "not admin"', 3000);
    const isAdmin = exitCode === 0;
    if (!isAdmin) {
      // 也检查 sudo 能力
      const sudoTest = runCommand('sudo -n true 2>/dev/null && echo "sudo_ok" || echo "sudo_limited"', 3000);
      if (sudoTest.stdout.includes('sudo_ok')) {
        return { id: this.id, name: this.name, category: this.category, status: 'pass',
          message: 'sudo 无密码可用' };
      }
      return { id: this.id, name: this.name, category: this.category, status: 'warn',
        error_type: 'permission',
        message: '非 admin 组用户，部分系统操作可能受限' };
    }
    return { id: this.id, name: this.name, category: this.category, status: 'pass',
      message: '具有管理员权限' };
  },
};
registerScanner(scanner);
