import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';

// ==================== 类型定义 ====================

export interface Installer {
  installed?: boolean;
  id: string;
  name: string;
  description: string;
  icon: string;
  needsAdmin: boolean;
  /** 安装命令（部分 installer 如 gh-copilot/xcode-clt 为空） */
  cmd?: string;
  /** 安装类型：npm | gui | manual */
  type?: 'npm' | 'gui' | 'manual';
  run(onProgress: (event: InstallEvent) => void): Promise<InstallResult>;
}

export interface InstallEvent {
  type: 'progress' | 'log' | 'done';
  step?: string;
  pct?: number;
  line?: string;
  success?: boolean;
  message?: string;
}

export interface InstallResult {
  success: boolean;
  message: string;
}

// ==================== 工具函数 ====================

function cmdExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd} >/dev/null 2>&1`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isInstalled(id: string): boolean {
  switch (id) {
    case 'claude-code':    return cmdExists('claude');
    case 'openclaw':       return cmdExists('openclaw');
    case 'gemini-cli':     return cmdExists('gemini');
    case 'opencode':       return cmdExists('opencode');
    case 'ccswitch':       return cmdExists('ccswitch');
    case 'cute-claude-hooks': return cmdExists('cute-claude-hooks-install');
    case 'gh-copilot':     return ghCopilotDownloaded();
    case 'xcode-clt':      return existsSync('/Library/Developer/CommandLineTools');
    default:               return false;
  }
}

function ghCopilotDownloaded(): boolean {
  try {
    return existsSync(require('os').homedir() + '/.local/share/gh/copilot/copilot');
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

function npmInstall(pkg: string, onProgress: (event: InstallEvent) => void, registry = 'https://registry.npmmirror.com'): Promise<number> {
  return spawnBash(`npm install -g ${pkg} --registry=${registry}`, onProgress);
}

// ==================== Claude Code 安装器 ====================

const claudeCodeInstaller: Installer = {
  id: 'claude-code',
  name: 'Claude Code',
  description: 'Anthropic 官方 AI 编程 CLI 工具，支持 MCO 多模型编排',
  icon: '🤖',
  needsAdmin: false,
  cmd: 'npm install -g @anthropic-ai/claude-code --registry=https://registry.npmmirror.com',
  type: 'npm',
  async run(onProgress): Promise<InstallResult> {
    if (isInstalled('claude-code')) {
      const v = execSync('claude --version 2>/dev/null || echo "已安装"', { encoding: 'utf-8' }).trim();
      onProgress({ type: 'done', success: true, message: `Claude Code 已安装: ${v}` });
      return { success: true, message: `Claude Code 已安装: ${v}` };
    }
    if (!cmdExists('npm')) {
      onProgress({ type: 'done', success: false, message: '请先安装 Node.js' });
      return { success: false, message: '请先安装 Node.js' };
    }
    onProgress({ type: 'progress', step: '正在安装 Claude Code...', pct: 30 });
    onProgress({ type: 'log', line: '$ npm install -g @anthropic-ai/claude-code --registry=https://registry.npmmirror.com' });
    const code = await npmInstall('@anthropic-ai/claude-code', onProgress);
    const success = code === 0 && isInstalled('claude-code');
    onProgress({ type: 'done', success, message: success ? 'Claude Code 安装成功！运行 claude login 登录。' : '安装失败，请检查 npm 和网络' });
    return { success, message: success ? '安装成功' : `安装失败 (${code})` };
  },
};

// ==================== OpenClaw 安装器 ====================

const openclawInstaller: Installer = {
  id: 'openclaw',
  name: 'OpenClaw',
  description: '开源 AI 编程框架，支持 Claude/DeepSeek/Kimi 等多模型（内置飞书/Discord）',
  icon: '🦀',
  needsAdmin: false,
  cmd: 'npm install -g openclaw --registry=https://registry.npmmirror.com',
  type: 'npm',
  async run(onProgress): Promise<InstallResult> {
    if (isInstalled('openclaw')) {
      const v = execSync('openclaw --version 2>/dev/null || echo "已安装"', { encoding: 'utf-8' }).trim();
      onProgress({ type: 'done', success: true, message: `OpenClaw 已安装: ${v}` });
      return { success: true, message: `OpenClaw 已安装: ${v}` };
    }
    if (!cmdExists('npm')) {
      onProgress({ type: 'done', success: false, message: '请先安装 Node.js' });
      return { success: false, message: '请先安装 Node.js' };
    }
    onProgress({ type: 'progress', step: '正在安装 OpenClaw...', pct: 30 });
    onProgress({ type: 'log', line: '$ npm install -g openclaw --registry=https://registry.npmmirror.com' });
    const code = await npmInstall('openclaw', onProgress);
    const success = code === 0 && isInstalled('openclaw');
    onProgress({ type: 'done', success, message: success ? 'OpenClaw 安装成功！运行 openclaw 启动。' : '安装失败，请检查 npm 和网络' });
    return { success, message: success ? '安装成功' : `安装失败 (${code})` };
  },
};

// ==================== Gemini CLI 安装器 ====================

const geminiCliInstaller: Installer = {
  id: 'gemini-cli',
  name: 'Gemini CLI',
  description: 'Google Gemini CLI 工具，Gemini 2.5/Deep Research 支持',
  icon: '✨',
  needsAdmin: false,
  cmd: 'npm install -g @google/gemini-cli --registry=https://registry.npmmirror.com',
  type: 'npm',
  async run(onProgress): Promise<InstallResult> {
    if (isInstalled('gemini-cli')) {
      const v = execSync('gemini --version 2>/dev/null || echo "已安装"', { encoding: 'utf-8' }).trim();
      onProgress({ type: 'done', success: true, message: `Gemini CLI 已安装: ${v}` });
      return { success: true, message: `Gemini CLI 已安装: ${v}` };
    }
    if (!cmdExists('npm')) {
      onProgress({ type: 'done', success: false, message: '请先安装 Node.js' });
      return { success: false, message: '请先安装 Node.js' };
    }
    onProgress({ type: 'progress', step: '正在安装 Gemini CLI...', pct: 30 });
    onProgress({ type: 'log', line: '$ npm install -g @google/gemini-cli --registry=https://registry.npmmirror.com' });
    const code = await npmInstall('@google/gemini-cli', onProgress);
    const success = code === 0 && isInstalled('gemini-cli');
    onProgress({ type: 'done', success, message: success ? 'Gemini CLI 安装成功！运行 gemini 启动。' : '安装失败，请检查 npm 和网络' });
    return { success, message: success ? '安装成功' : `安装失败 (${code})` };
  },
};

// ==================== OpenCode 安装器 ====================

const opencodeInstaller: Installer = {
  id: 'opencode',
  name: 'OpenCode',
  description: '开源 AI 编程助手（开源版 Claude Code），支持 75+ 模型，免费跨平台',
  icon: '🔓',
  needsAdmin: false,
  cmd: 'npm install -g opencode-ai --registry=https://registry.npmjs.org',
  type: 'npm',
  async run(onProgress): Promise<InstallResult> {
    if (isInstalled('opencode')) {
      const v = execSync('opencode --version 2>/dev/null || echo "已安装"', { encoding: 'utf-8' }).trim();
      onProgress({ type: 'done', success: true, message: `OpenCode 已安装: ${v}` });
      return { success: true, message: `OpenCode 已安装: ${v}` };
    }
    if (!cmdExists('npm')) {
      onProgress({ type: 'done', success: false, message: '请先安装 Node.js' });
      return { success: false, message: '请先安装 Node.js' };
    }
    onProgress({ type: 'progress', step: '正在安装 OpenCode...', pct: 30 });
    onProgress({ type: 'log', line: '$ npm install -g opencode-ai --registry=https://registry.npmmirror.com' });
    const code = await npmInstall('opencode-ai', onProgress);
    const success = code === 0 && isInstalled('opencode');
    onProgress({ type: 'done', success, message: success ? 'OpenCode 安装成功！运行 opencode 启动。' : '安装失败，请检查 npm 和网络' });
    return { success, message: success ? '安装成功' : `安装失败 (${code})` };
  },
};

// ==================== CCSwitch 安装器 ====================
// CCSwitch 的 npm 依赖在官方源，npmmirror 缺包，改用官方源安装

const ccswitchInstaller: Installer = {
  id: 'ccswitch',
  name: 'CCSwitch',
  description: 'Claude Code 多账号/API Key 切换工具，支持 Claude/Codex/Gemini/OpenCode/OpenClaw',
  icon: '🔄',
  needsAdmin: false,
  cmd: 'npm install -g ccswitch --registry=https://registry.npmjs.org',
  type: 'npm',
  async run(onProgress): Promise<InstallResult> {
    if (isInstalled('ccswitch')) {
      const v = execSync('ccswitch --version 2>/dev/null || echo "已安装"', { encoding: 'utf-8' }).trim();
      onProgress({ type: 'done', success: true, message: `CCSwitch 已安装: ${v}` });
      return { success: true, message: `CCSwitch 已安装: ${v}` };
    }
    if (!cmdExists('npm')) {
      onProgress({ type: 'done', success: false, message: '请先安装 Node.js' });
      return { success: false, message: '请先安装 Node.js' };
    }
    onProgress({ type: 'progress', step: '正在安装 CCSwitch...', pct: 30 });
    onProgress({ type: 'log', line: '$ npm install -g ccswitch --registry=https://registry.npmjs.org' });
    // CCSwitch 依赖在官方源，用 npmjs.org
    const code = await npmInstall('ccswitch', onProgress, 'https://registry.npmjs.org');
    const success = code === 0 && isInstalled('ccswitch');
    if (success) {
      onProgress({ type: 'done', success: true, message: 'CCSwitch 安装成功！运行 ccswitch 启动。' });
    } else {
      onProgress({ type: 'log', line: 'npm 安装失败，尝试 GitHub 下载...' });
      // GitHub releases 备用下载
      const zipPath = '/tmp/ccswitch.zip';
      const extractDir = '/tmp/ccswitch';
      onProgress({ type: 'log', line: '$ curl -fsSL https://github.com/TomokiMatsubuchi/ccswitch/releases/latest/download/ccswitch-macos.zip -o /tmp/ccswitch.zip' });
      const dlCode = await spawnBash(
        `curl -fsSL https://github.com/TomokiMatsubuchi/ccswitch/releases/latest/download/ccswitch-macos.zip -o ${zipPath} && unzip -o ${zipPath} -d ${extractDir} && chmod +x ${extractDir}/ccswitch`,
        onProgress
      );
      if (dlCode === 0 && existsSync(`${extractDir}/ccswitch`)) {
        onProgress({ type: 'done', success: true, message: `CCSwitch 下载成功！请运行: export PATH="${extractDir}:$PATH" && ccswitch` });
        return { success: true, message: '安装成功，请重新加载终端' };
      }
      onProgress({ type: 'done', success: false, message: '安装失败，请手动从 GitHub 下载: https://github.com/TomokiMatsubuchi/ccswitch/releases' });
    }
    return { success, message: success ? '安装成功' : '安装失败' };
  },
};

// ==================== Cute Claude Hooks 安装器 ====================

const cuteClaudeHooksInstaller: Installer = {
  id: 'cute-claude-hooks',
  name: 'Claude Code 汉化',
  description: 'Claude Code 中文界面汉化包，让 AI 编程助手拥有完整中文体验',
  icon: '🌸',
  needsAdmin: false,
  cmd: 'npm install -g cute-claude-hooks --registry=https://registry.npmmirror.com',
  type: 'npm',
  async run(onProgress): Promise<InstallResult> {
    if (!cmdExists('npm')) {
      onProgress({ type: 'done', success: false, message: '请先安装 Node.js' });
      return { success: false, message: '请先安装 Node.js' };
    }
    onProgress({ type: 'progress', step: '正在安装 Claude Code 汉化包...', pct: 30 });
    onProgress({ type: 'log', line: '$ npm install -g cute-claude-hooks --registry=https://registry.npmmirror.com' });
    const code = await spawnBash('npm install -g cute-claude-hooks --registry=https://registry.npmmirror.com', onProgress);
    const success = code === 0;
    onProgress({ type: 'done', success, message: success ? 'Claude Code 汉化安装成功！请重启 Claude Code 生效。' : '安装失败，请检查 npm 和网络' });
    return { success, message: success ? '安装成功' : `安装失败 (${code})` };
  },
};

// ==================== GitHub Copilot CLI 安装器 ====================
// gh copilot 是 gh 内置的预览功能，执行 `gh copilot` 会自动下载 CLI 到 ~/.local/share/gh/copilot/

const ghCopilotInstaller: Installer = {
  id: 'gh-copilot',
  name: 'GitHub Copilot CLI',
  description: 'GitHub Copilot 命令行工具，代码补全和 AI 问答（需 Copilot 订阅），内置于 gh CLI',
  icon: '💜',
  needsAdmin: false,
  cmd: 'gh copilot',
  type: 'manual',
  async run(onProgress): Promise<InstallResult> {
    if (isInstalled('gh-copilot')) {
      onProgress({ type: 'done', success: true, message: 'GitHub Copilot CLI 已安装（gh 内置）' });
      return { success: true, message: 'GitHub Copilot CLI 已安装（gh 内置）' };
    }
    if (!cmdExists('gh')) {
      onProgress({ type: 'done', success: false, message: '请先安装 GitHub CLI: brew install gh' });
      return { success: false, message: '请先安装 GitHub CLI' };
    }
    onProgress({ type: 'log', line: 'GitHub Copilot CLI 是 gh 内置预览功能，需在终端执行以下命令下载:' });
    onProgress({ type: 'log', line: '$ gh copilot' });
    onProgress({ type: 'log', line: '首次运行时会自动下载 CLI（无需额外安装）。' });
    onProgress({ type: 'done', success: false, message: '请复制上述命令到终端执行，下载完成后重新点击此按钮验证。' });
    return { success: false, message: '需在终端执行 gh copilot 下载 CLI' };
  },
};

// ==================== Xcode CLT 安装器 ====================

const xcodeCltInstaller: Installer = {
  id: 'xcode-clt',
  name: 'Xcode Command Line Tools',
  description: 'macOS 开发工具链基础，git/gcc/make 等编译器依赖（无 IDE 可单独安装）',
  icon: '🔧',
  needsAdmin: false,
  cmd: 'xcode-select --install',
  type: 'gui',
  async run(onProgress): Promise<InstallResult> {
    if (isInstalled('xcode-clt')) {
      onProgress({ type: 'done', success: true, message: 'Xcode Command Line Tools 已安装' });
      return { success: true, message: 'Xcode Command Line Tools 已安装' };
    }
    onProgress({ type: 'progress', step: '正在安装 Xcode Command Line Tools...', pct: 30 });
    onProgress({ type: 'log', line: '$ xcode-select --install' });
    onProgress({ type: 'log', line: '（将弹出系统安装对话框，需手动点击"安装"）' });
    await spawnBash('xcode-select --install', onProgress);
    onProgress({ type: 'done', success: true, message: '安装已触发，请在弹出的系统对话框中点击"安装"' });
    return { success: true, message: '安装已触发，请在弹出的系统对话框中点击安装' };
  },
};

// ==================== 注册表 ====================

const ALL_INSTALLERS: Installer[] = [
  claudeCodeInstaller,
  openclawInstaller,
  geminiCliInstaller,
  opencodeInstaller,
  ccswitchInstaller,
  cuteClaudeHooksInstaller,
  ghCopilotInstaller,
  xcodeCltInstaller,
];

export function getInstallers(): Installer[] {
  return ALL_INSTALLERS.map(i => ({
    ...i,
    installed: isInstalled(i.id),
  }));
}

export function getInstallerById(id: string) {
  return ALL_INSTALLERS.find(i => i.id === id);
}

/** 从 installers 动态导出命令白名单（单数据源原则） */
export function getAllowedCommands(): Record<string, { cmd: string }> {
  return ALL_INSTALLERS.reduce((acc, i) => {
    if (i.cmd) acc[i.id] = { cmd: i.cmd };
    return acc;
  }, {} as Record<string, { cmd: string }>);
}
