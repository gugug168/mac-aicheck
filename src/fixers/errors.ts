// Six error categories (D-07)
export type ErrorCategory =
  | 'timeout'
  | 'command-not-found'
  | 'permission-denied'
  | 'network-error'
  | 'disk-full'
  | 'generic';

// Error classification result
export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  recoverable: boolean;  // true if fixer should retry
}

/**
 * Classify a command execution failure into an ErrorCategory.
 * Examines exit code, stderr content, and error message patterns.
 */
export function classifyError(
  exitCode: number,
  stderr: string,
  errorMessage?: string
): ClassifiedError {
  const combined = `${stderr} ${errorMessage || ''}`.toLowerCase();

  // command-not-found: exit 127, "command not found", "not found"
  if (exitCode === 127 || combined.includes('command not found') || combined.includes('not found')) {
    return { category: 'command-not-found', message: `Command not found: ${stderr}`, recoverable: false };
  }

  // permission-denied: exit 126, "permission denied", "eacces"
  if (exitCode === 126 || combined.includes('permission denied') || combined.includes('eacces')) {
    return { category: 'permission-denied', message: `Permission denied: ${stderr}`, recoverable: false };
  }

  // disk-full: "no space left", "disk full", "enospc"
  if (combined.includes('no space left') || combined.includes('disk full') || combined.includes('enospc')) {
    return { category: 'disk-full', message: `Disk full: ${stderr}`, recoverable: false };
  }

  // network-error: "connection refused", "network", "ename resolution", "http error", "eai_again"
  if (
    combined.includes('connection refused') ||
    combined.includes('network') ||
    combined.includes('ename resolution') ||
    combined.includes('http error') ||
    combined.includes('eai_again')
  ) {
    return { category: 'network-error', message: `Network error: ${stderr}`, recoverable: true };
  }

  // timeout: exit 124 (timeout command), "timed out"
  if (exitCode === 124 || combined.includes('timeout') || combined.includes('timed out')) {
    return { category: 'timeout', message: `Command timed out: ${stderr}`, recoverable: true };
  }

  // generic: everything else
  return { category: 'generic', message: errorMessage || `Command failed: ${stderr}`, recoverable: false };
}

/**
 * Human-readable Chinese messages for each error category (DIA-01 foundation).
 */
export const ERROR_MESSAGES: Record<ErrorCategory, { title: string; suggestion: string }> = {
  'timeout': {
    title: '命令执行超时',
    suggestion: '网络连接不稳定或目标服务器响应慢，请检查网络后重试',
  },
  'command-not-found': {
    title: '命令未找到',
    suggestion: '请先安装对应工具，或检查 PATH 环境变量配置',
  },
  'permission-denied': {
    title: '权限不足',
    suggestion: '需要管理员权限，请使用 sudo 或联系系统管理员',
  },
  'network-error': {
    title: '网络错误',
    suggestion: '网络连接异常，请检查网络设置或代理配置',
  },
  'disk-full': {
    title: '磁盘空间不足',
    suggestion: '请清理磁盘空间后重试，使用 df -h 查看磁盘状态',
  },
  'generic': {
    title: '执行失败',
    suggestion: '命令执行失败，请查看详细错误信息',
  },
};
