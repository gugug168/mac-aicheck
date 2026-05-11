/**
 * sanitizer.ts
 *
 * 敏感信息脱敏 — 基于 WinAICheck 的 26 个 SENSITIVE_PATTERNS，
 * 针对 macOS/Hermes 环境调整（`/Users/` 路径而非 `C:\Users\`）。
 *
 * 所有通过 mac-aicheck 上报的数据（Hermes 错误、事件、Bounty 描述等）
 * 在写入 outbox 或发送到 AICO EVO 之前必须经过本模块脱敏。
 *
 * 对应 Milestone 3: Hermes 错误捕获 Hook
 */

const SENSITIVE_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // API keys
  { regex: /(?:sk[-_]?api[-_]?key[-_]?)([a-zA-Z0-9_-]{8,})/gi, replacement: '<API_KEY>' },
  { regex: /sk[-_]proj[-_][A-Za-z0-9\\-_]{20,}/g, replacement: '<API_KEY>' },
  { regex: /sk[-_]ant[-_][A-Za-z0-9\\-_]{20,}/g, replacement: '<API_KEY>' },
  { regex: /Bearer\s+[a-zA-Z0-9._-]+/gi, replacement: 'Bearer <TOKEN>' },
  // GitHub tokens
  { regex: /gh[pous]_[A-Za-z0-9]{30,}/g, replacement: '<GITHUB_TOKEN>' },
  { regex: /github_pat_[A-Za-z0-9_]{22,}/g, replacement: '<GITHUB_TOKEN>' },
  // NPM token
  { regex: /npm_[A-Za-z0-9]{30,}/g, replacement: '<NPM_TOKEN>' },
  // AWS keys
  { regex: /AKIA[0-9A-Z]{16}/g, replacement: '<AWS_ACCESS_KEY>' },
  // Private keys
  { regex: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g, replacement: '<PRIVATE_KEY>' },
  // Basic auth in URLs
  { regex: /https?:\/\/[^@\s]+:[^@\s]+@/g, replacement: 'http://<BASIC_AUTH>@' },
  // Database URLs
  { regex: /(?:mongodb|postgres|postgresql|mysql|redis|amqp):\/\/[^\s"',;)}\]]{10,}/gi, replacement: '<DATABASE_URL>' },
  // File paths (macOS)
  { regex: /\/Users\/[^\/\\]+?(?=\/|[\\\r\n]|$)/g, replacement: '/Users/<USER>' },
  // IP addresses
  { regex: /\b(\d{1,3}\.){3}\d{1,3}\b/g, replacement: '<IP>' },
  // Emails
  { regex: /[\w.-]+@[\w.-]+\.\w+/g, replacement: '<EMAIL>' },
  // Environment variables with secret values
  { regex: /(?:OPENAI|ANTHROPIC|OPENROUTER|OPENCLAW|DASHSCOPE|ZHIPU|MOONSHOT|GEMINI)[_\w-]*(?:KEY|TOKEN|SECRET)?\s*=\s*[^\s]+/gi, replacement: '<SECRET_ENV>' },
  // MiniMax / other AI API keys
  { regex: /(?:MINIMAX|MINIMAXI|AI[_\s]?API)[_\w-]*KEY\s*=\s*[^\s]+/gi, replacement: '<MINIMAX_KEY>' },
  // Slack/Discord tokens
  { regex: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g, replacement: '<SLACK_TOKEN>' },
  // Generic bearer/auth tokens in headers
  { regex: /(?:Authorization|Bearer|Auth)[_\s]*(?:Token)?\s*[:=]\s*["']?[A-Za-z0-9._-]{20,}["']?/gi, replacement: 'Authorization: <TOKEN>' },
  // macOS keychain references (don't capture real passwords)
  { regex: /(?:keychain|security)\s+(?:find|-s)\s+[^\s]+/g, replacement: 'security <REDACTED>' },
  // Hermes specific (API keys stored in config)
  { regex: /(?:hermes|HERMES)[_\s-]*?(?:api[_\s-]?key|token|secret)[_\s]*[:=]\s*["']?[A-Za-z0-9_-]{10,}["']?/gi, replacement: 'hermes_api_key=<REDACTED>' },
  // Anthropic/Claude keys
  { regex: /sk[-_]ant[-_]api[-_]?[a-zA-Z0-9]{40,}/gi, replacement: '<ANTHROPIC_KEY>' },
  // OpenAI keys
  { regex: /sk[-_][A-Za-z0-9]{48,}/g, replacement: '<OPENAI_KEY>' },
];

const MAX_CAPTURE_CHARS = 8000;

/**
 * 脱敏核心：对输入文本中的敏感模式进行替换。
 */
export function sanitizeText(text: string): string {
  let result = String(text || '');
  for (const { regex, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

/**
 * 脱敏 + 长度截断（用于事件 capture）。
 */
export function trimForCapture(text: string): string {
  const sanitized = sanitizeText(text);
  if (sanitized.length <= MAX_CAPTURE_CHARS) return sanitized;
  return `${sanitized.slice(0, MAX_CAPTURE_CHARS)}\n<TRUNCATED>`;
}

/**
 * 检测输入文本中是否包含敏感信息（用于验证脱敏效果）。
 */
export function containsSensitive(text: string): boolean {
  const patterns = [
    /sk[-_]/i,
    /gh[pous]_/i,
    /AKIA/i,
    /-----BEGIN.*PRIVATE KEY-----/,
    /\b[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/,
    /https?:\/\/[^@\s]+:[^@\s]+@/,
  ];
  return patterns.some(p => p.test(text));
}
