import type { Scanner, ScanResult } from './types';
import { registerScanner } from './registry';

const scanner: Scanner = {
  id: 'screen-permission',
  name: '屏幕录制权限',
  category: 'apple',
  affectsScore: false,
  defaultEnabled: false,

  async scan(): Promise<ScanResult> {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      status: 'unknown',
      message: 'CLI 无法可靠检测当前终端的屏幕录制权限',
      detail: '如截图、屏幕读取或录屏类工具报权限错误，请到 系统设置 → 隐私与安全性 → 屏幕录制 中授权对应终端或应用。',
      suggestions: ['系统设置 → 隐私与安全性 → 屏幕录制'],
      error_type: 'unknown',
    };
  },
};
registerScanner(scanner);
