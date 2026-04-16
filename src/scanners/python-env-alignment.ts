import type { ScanResult, Scanner } from './types';
import { runCommand } from '../executor/index';
import { registerScanner } from './registry';
import { hasProjectMarker } from './config-utils';

const PYTHON_PROJECT_MARKERS = ['pyproject.toml', 'requirements.txt', 'requirements-dev.txt', 'setup.py', 'Pipfile', 'poetry.lock', 'uv.lock'];

function normalizeRoot(value: string): string {
  return value.replace(/\/bin\/python[0-9.]*$/i, '').replace(/\/lib\/python[^/]+\/site-packages\/pip.*$/i, '').trim();
}

const scanner: Scanner = {
  id: 'python-env-alignment',
  name: 'Python 环境一致性检测',
  category: 'toolchain',

  async scan(): Promise<ScanResult> {
    if (!hasProjectMarker(PYTHON_PROJECT_MARKERS)) return { id: this.id, name: this.name, category: this.category, status: 'unknown', message: '当前目录未检测到 Python 项目，跳过环境一致性检查' };
    const python = runCommand('python3 -c "import sys; print(sys.executable)"', 8000);
    const pip = runCommand('python3 -m pip --version', 8000);
    if (python.exitCode !== 0) return { id: this.id, name: this.name, category: this.category, status: 'fail', message: 'python3 不可用，无法校验项目环境' };
    if (pip.exitCode !== 0) return { id: this.id, name: this.name, category: this.category, status: 'warn', message: 'pip 不可用，Python 依赖安装可能失败', details: `python: ${python.stdout.trim()}` };

    const pythonPath = python.stdout.split(/\r?\n/)[0].trim();
    const pipPath = pip.stdout.match(/from\s+(.+?)\s+\(python/i)?.[1]?.trim() || '';
    const aligned = pipPath ? normalizeRoot(pythonPath) === normalizeRoot(pipPath) || pipPath.includes(normalizeRoot(pythonPath)) : true;
    return {
      id: this.id, name: this.name, category: this.category,
      status: aligned ? 'pass' : 'warn',
      message: aligned ? 'python3 与 pip 环境一致' : 'python3 与 pip 可能来自不同环境',
      details: `python3: ${pythonPath}\npip: ${pipPath || pip.stdout.trim()}`,
    };
  },
};

registerScanner(scanner);
