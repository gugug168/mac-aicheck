import { execSync } from 'child_process';
import { Buffer } from 'buffer';

const DEFAULT_TIMEOUT = 15_000;

/** 测试钩子：注入 mock 函数，避免 mock.module 的跨文件冲突 */
export const _test = {
  mockExecSync: null as ((cmd: string, opts: any) => Buffer) | null,
  mockExistsSync: null as ((path: string) => boolean) | null,
};

/**
 * 尝试将 Buffer 解码为 UTF-8 文本
 * 某些 Windows 命令（如 wsl）输出 UTF-16LE
 */
function decodeOutput(buf: Buffer | string): string {
  if (typeof buf === 'string') return buf;
  if (buf.length >= 2) {
    const hasBom = buf[0] === 0xff && buf[1] === 0xfe;
    const looksLikeUtf16 = buf.length > 10 && buf.reduce((acc, b, i) => acc + (i % 2 === 1 && b === 0 ? 1 : 0), 0) > buf.length * 0.3;
    if (hasBom || looksLikeUtf16) {
      return buf.toString('utf16le');
    }
  }
  return buf.toString('utf-8');
}

/**
 * 执行系统命令，带超时保护
 */
export function runCommand(
  cmd: string,
  timeout = DEFAULT_TIMEOUT,
): { stdout: string; stderr: string; exitCode: number } {
  if (_test.mockExecSync) {
    try {
      const buf = _test.mockExecSync(cmd, { timeout });
      return { stdout: decodeOutput(buf).trim(), stderr: '', exitCode: 0 };
    } catch (err: any) {
      return {
        stdout: err.stdout ? decodeOutput(err.stdout).trim() : '',
        stderr: err.stderr ? String(err.stderr).trim() : '',
        exitCode: err.status ?? 1,
      };
    }
  }
  try {
    const buf = execSync(cmd, {
      timeout,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'buffer',
    }) as Buffer;
    const stdout = decodeOutput(buf).trim();
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ? decodeOutput(err.stdout as Buffer).trim() : '',
      stderr: err.stderr ? (err.stderr as Buffer).toString('utf-8').trim() : '',
      exitCode: err.status ?? 1,
    };
  }
}

/** 检查命令是否可用（跨平台） */
export function commandExists(cmd: string): boolean {
  const { exitCode } = runCommand(
    process.platform === 'win32' ? `where.exe ${cmd}` : `which ${cmd} || command -v ${cmd}`,
    5_000
  );
  return exitCode === 0;
}

/** 检查当前是否以管理员权限运行（跨平台） */
export function isAdmin(): boolean {
  if (process.platform === 'win32') {
    return runCommand('net session', 5_000).exitCode === 0;
  }
  return process.getuid?.() === 0 || runCommand('id -u', 5_000).stdout.trim() === '0';
}

/** 跨平台 PATH 解析 */
export function parsePath(pathVar: string): string[] {
  const separator = pathVar.includes(';') ? ';' : ':';
  return pathVar.split(separator).filter(Boolean);
}
