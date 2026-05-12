/**
 * hermes.ts — Hermes Agent Installer for mac-aicheck
 *
 * Supports multiple installation methods:
 *   1. npm: @nousresearch/hermes-agent
 *   2. pip: hermes-agent
 *   3. git clone: ~/hermes-agent
 */

import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';

import { Installer, InstallEvent, InstallResult } from './index.js';

// ==================== Helpers ====================

function cmdExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd} >/dev/null 2>&1`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function spawnBash(cmd: string, onProgress: (event: InstallEvent) => void): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('bash', ['-c', cmd], { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdout?.on('data', (data: Buffer) => {
      for (const line of data.toString('utf-8').split('\n')) {
        const t = line.trim();
        if (t) onProgress({ type: 'log', line: t });
      }
    });
    proc.stderr?.on('data', (data: Buffer) => {
      for (const line of data.toString('utf-8').split('\n')) {
        const t = line.trim();
        if (t && !t.startsWith('npm warn')) onProgress({ type: 'log', line: `[stderr] ${t}` });
      }
    });
    proc.on('close', (code) => resolve(code ?? 1));
    proc.on('error', () => resolve(1));
  });
}

function npmInstall(pkg: string, onProgress: (event: InstallEvent) => void, registry = 'https://registry.npmjs.org'): Promise<number> {
  return spawnBash(`npm install -g ${pkg} --registry=${registry}`, onProgress);
}

// ==================== Detection ====================

export function isInstalled(): boolean {
  // Priority: which hermes > ~/hermes-agent > ~/.local/bin/hermes
  if (cmdExists('hermes')) return true;
  if (existsSync(path.join(os.homedir(), 'hermes-agent'))) return true;
  if (existsSync(path.join(os.homedir(), '.local', 'bin', 'hermes'))) return true;
  return false;
}

export function getInstalledVersion(): string | null {
  if (!isInstalled()) return null;
  try {
    const v = execSync('hermes --version 2>/dev/null || hermes agent --version 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim();
    return v || null;
  } catch {
    return null;
  }
}

// ==================== Installer ====================

async function installViaNpm(onProgress: (event: InstallEvent) => void): Promise<boolean> {
  if (!cmdExists('npm')) {
    onProgress({ type: 'done', success: false, message: '请先安装 Node.js' });
    return false;
  }
  onProgress({ type: 'progress', step: '正在安装 Hermes Agent (npm)...', pct: 30 });
  onProgress({ type: 'log', line: '$ npm install -g @nousresearch/hermes-agent --registry=https://registry.npmjs.org' });
  const code = await npmInstall('@nousresearch/hermes-agent', onProgress);
  return code === 0 && isInstalled();
}

async function installViaGit(onProgress: (event: InstallEvent) => void): Promise<boolean> {
  const destDir = path.join(os.homedir(), 'hermes-agent');
  if (!existsSync(destDir)) {
    onProgress({ type: 'progress', step: '正在克隆 Hermes Agent 仓库...', pct: 20 });
    onProgress({ type: 'log', line: `$ git clone https://github.com/NousResearch/hermes-agent.git ${destDir}` });
    const code = await spawnBash(`git clone https://github.com/NousResearch/hermes-agent.git "${destDir}"`, onProgress);
    if (code !== 0) {
      onProgress({ type: 'done', success: false, message: 'Git clone 失败，请检查网络和 Git 配置' });
      return false;
    }
  }
  onProgress({ type: 'progress', step: '正在安装 Hermes Agent (本地源码)...', pct: 60 });
  onProgress({ type: 'log', line: `$ cd "${destDir}" && npm install && npm link` });
  const installCode = await spawnBash(`cd "${destDir}" && npm install`, onProgress);
  if (installCode !== 0) {
    onProgress({ type: 'done', success: false, message: 'npm install 失败' });
    return false;
  }
  const linkCode = await spawnBash(`cd "${destDir}" && npm link`, onProgress);
  return linkCode === 0 && isInstalled();
}

async function installViaPip(onProgress: (event: InstallEvent) => void): Promise<boolean> {
  if (!cmdExists('pip')) {
    onProgress({ type: 'done', success: false, message: 'pip 未找到，请先安装 Python' });
    return false;
  }
  onProgress({ type: 'progress', step: '正在安装 Hermes Agent (pip)...', pct: 30 });
  onProgress({ type: 'log', line: '$ pip install hermes-agent' });
  const code = await spawnBash('pip install hermes-agent', onProgress);
  return code === 0 && isInstalled();
}

export async function install(options: { method?: 'npm' | 'git' | 'pip' } = {}, onProgress: (event: InstallEvent) => void): Promise<InstallResult> {
  if (isInstalled()) {
    const v = getInstalledVersion() || '已安装';
    onProgress({ type: 'done', success: true, message: `Hermes Agent 已安装: ${v}` });
    return { success: true, message: `Hermes Agent 已安装: ${v}` };
  }

  const method = options.method ?? 'npm';
  let success = false;

  if (method === 'npm') {
    success = await installViaNpm(onProgress);
  } else if (method === 'git') {
    success = await installViaGit(onProgress);
  } else if (method === 'pip') {
    success = await installViaPip(onProgress);
  }

  if (success) {
    onProgress({ type: 'done', success: true, message: 'Hermes Agent 安装成功！运行 hermes 命令启动。' });
    return { success: true, message: 'Hermes Agent 安装成功！运行 hermes 命令启动。' };
  }

  // Fallback to other methods
  if (method === 'npm') {
    onProgress({ type: 'log', line: 'npm 安装失败，尝试 pip...' });
    success = await installViaPip(onProgress);
    if (success) {
      onProgress({ type: 'done', success: true, message: 'Hermes Agent (pip) 安装成功！' });
      return { success: true, message: 'Hermes Agent (pip) 安装成功！' };
    }
  }

  onProgress({ type: 'done', success: false, message: '安装失败，请尝试: git clone ~/hermes-agent 后手动安装' });
  return { success: false, message: '安装失败' };
}

export async function upgrade(onProgress: (event: InstallEvent) => void): Promise<InstallResult> {
  if (!isInstalled()) {
    onProgress({ type: 'done', success: false, message: 'Hermes Agent 未安装，请先安装' });
    return { success: false, message: 'Hermes Agent 未安装' };
  }

  const hermesSrc = path.join(os.homedir(), 'hermes-agent');
  if (existsSync(hermesSrc) && cmdExists('hermes')) {
    // If installed via git, try git pull
    onProgress({ type: 'progress', step: '正在更新 Hermes Agent (git pull)...', pct: 30 });
    onProgress({ type: 'log', line: `$ cd "${hermesSrc}" && git pull` });
    const code = await spawnBash(`cd "${hermesSrc}" && git pull`, onProgress);
    if (code === 0) {
      const installCode = await spawnBash(`cd "${hermesSrc}" && npm install`, onProgress);
      if (installCode === 0) {
        onProgress({ type: 'done', success: true, message: 'Hermes Agent 更新成功！' });
        return { success: true, message: 'Hermes Agent 更新成功！' };
      }
    }
  }

  // Fallback: npm upgrade
  if (cmdExists('npm')) {
    onProgress({ type: 'progress', step: '正在更新 Hermes Agent (npm)...', pct: 30 });
    onProgress({ type: 'log', line: '$ npm install -g @nousresearch/hermes-agent --registry=https://registry.npmjs.org' });
    const code = await npmInstall('@nousresearch/hermes-agent', onProgress);
    if (code === 0) {
      onProgress({ type: 'done', success: true, message: 'Hermes Agent 更新成功！' });
      return { success: true, message: 'Hermes Agent 更新成功！' };
    }
  }

  onProgress({ type: 'done', success: false, message: '更新失败' });
  return { success: false, message: '更新失败' };
}

export async function uninstall(onProgress: (event: InstallEvent) => void): Promise<InstallResult> {
  let success = false;

  // Try npm uninstall
  if (cmdExists('npm')) {
    onProgress({ type: 'progress', step: '正在卸载 Hermes Agent (npm)...', pct: 30 });
    onProgress({ type: 'log', line: '$ npm uninstall -g @nousresearch/hermes-agent' });
    const npmCode = await spawnBash('npm uninstall -g @nousresearch/hermes-agent', onProgress);
    if (npmCode === 0) success = true;
  }

  // Try pip uninstall
  if (cmdExists('pip')) {
    onProgress({ type: 'progress', step: '正在卸载 Hermes Agent (pip)...', pct: 50 });
    onProgress({ type: 'log', line: '$ pip uninstall -y hermes-agent' });
    const pipCode = await spawnBash('pip uninstall -y hermes-agent', onProgress);
    if (pipCode === 0) success = true;
  }

  if (!isInstalled()) {
    onProgress({ type: 'done', success: true, message: 'Hermes Agent 已卸载' });
    return { success: true, message: 'Hermes Agent 已卸载' };
  }

  onProgress({ type: 'done', success: false, message: '卸载可能不完整，请手动检查 npm/pip 和 ~/hermes-agent' });
  return { success: false, message: '卸载可能不完整' };
}

// ==================== Installer Object (compatible with index.ts) ====================

export const hermesInstaller: Installer = {
  id: 'hermes-agent',
  name: 'Hermes Agent',
  description: 'NousResearch 开源 AI Agent 框架，支持多模型编排、工作流自动化、MCP 协议集成',
  icon: '🧠',
  needsAdmin: false,
  cmd: 'npm install -g @nousresearch/hermes-agent --registry=https://registry.npmjs.org',
  type: 'npm',
  async run(onProgress): Promise<InstallResult> {
    return install({}, onProgress);
  },
};
