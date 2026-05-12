/**
 * 语义错误信号提取器（共享模块）
 * mac-aicheck Hook 和 Agent 共用
 */

export type ErrorSignal =
  | 'network_connection_refused'  // ECONNREFUSED
  | 'network_timeout'             // ETIMEDOUT / TIMEOUT
  | 'process_terminated'          // SIGKILL / SIGTERM
  | 'context_overflow'            // MAX_TOKEN / context window exceeded
  | 'rate_limited'                // 429 / RATE_LIMIT
  | 'permission_denied'          // EACCES / permission denied
  | 'command_not_found'          // ENOENT / command not found
  | 'mcp_server_error'           // MCP server errors
  | 'git_error'                   // git fatal errors
  | 'python_error'                // Python traceback / import error
  | 'npm_error'                   // npm err / node_modules
  | 'unknown_error';              // generic error

/**
 * 从错误消息中提取语义信号标签数组
 */
export function extractErrorSignals(msg: string): ErrorSignal[] {
  const t = String(msg || '').toLowerCase();
  const signals: ErrorSignal[] = [];
  if (/econnrefused|connection refused/i.test(t)) signals.push('network_connection_refused');
  if (/etimedout|timed?\s*out|timeout/i.test(t)) signals.push('network_timeout');
  if (/sigkill|sigterm|killed|terminated/i.test(t)) signals.push('process_terminated');
  if (/max.?token|context.?overflow|context.?window|token.?limit/i.test(t)) signals.push('context_overflow');
  if (/rate.?limit|429|too many requests/i.test(t)) signals.push('rate_limited');
  if (/eacces|permission denied|operation not permitted/i.test(t)) signals.push('permission_denied');
  if (/command not found|enoent|not found/i.test(t)) signals.push('command_not_found');
  if (/mcp.?server|mcp.?error/i.test(t)) signals.push('mcp_server_error');
  if (/fatal:|git\s+(clone|pull|push|merge|rebase|checkout)/i.test(msg) && /fatal|error|conflict/i.test(t)) signals.push('git_error');
  if (/traceback|python|syntaxerror|typeerror|importerror|modulenotfound/i.test(t)) signals.push('python_error');
  if (/npm\s+err|node_modules|package\.json/i.test(t)) signals.push('npm_error');
  if (signals.length === 0 && (t.includes('error') || t.includes('fail') || t.includes('fatal'))) signals.push('unknown_error');
  return [...new Set(signals)];
}
