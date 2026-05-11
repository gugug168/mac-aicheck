/**
 * hermes-error-hook.ts
 *
 * Hermes 错误分类器 — 解析 Hermes Agent 运行错误，提取信号并分类。
 *
 * 支持的 6 类信号（对齐 WinAICheck embedded-agent）：
 *   tool_missing       — 关键命令/工具缺失
 *   config_breakage    — 配置损坏或不兼容
 *   network_instability — 网络或远端连接不稳定
 *   auth_failure       — 认证或权限失败
 *   perf_bottleneck    — 性能瓶颈或资源压力
 *   capability_gap      — 能力缺口或不支持功能
 *
 * 对应 Milestone 3: Hermes 错误捕获 Hook
 */

export interface HermesSignal {
  kind: 'tool_missing' | 'config_breakage' | 'network_instability' | 'auth_failure' | 'perf_bottleneck' | 'capability_gap';
  title: string;
  confidence: number;        // 0.0 – 1.0
  keywords: Array<{ word: string; weight: number }>;
  matchedAt: string;
}

export interface HermesErrorInput {
  type?: string;
  kind?: string;
  message?: string;
  stack?: string;
  agent?: string;
  sessionId?: string;
  step?: string;
  severity?: string;
  timestamp?: string;
}

// ── Signal Profiles ─────────────────────────────────────────────────────────

const SIGNAL_PROFILES: Record<HermesSignal['kind'], {
  title: string;
  keywords: Record<string, number>;
  threshold: number;
}> = {
  tool_missing: {
    title: '关键命令或工具缺失',
    keywords: {
      'command not found': 5,
      'not found': 3,
      'enoent': 4,
      'not an executable': 3,
      'is not recognized': 5,
      'no such file': 3,
      'tool not found': 5,
      'unknown tool': 4,
      'missing tool': 3,
    },
    threshold: 5,
  },
  config_breakage: {
    title: '配置损坏或不兼容',
    keywords: {
      'config': 2,
      'json parse': 4,
      'invalid json': 4,
      'syntax error': 3,
      'mcp': 2,
      'settings': 2,
      'parse error': 4,
      'unexpected token': 3,
      'settings.json': 3,
      'yaml': 2,
      'toml': 2,
      'schema': 2,
    },
    threshold: 6,
  },
  network_instability: {
    title: '网络或远端连接不稳定',
    keywords: {
      'timeout': 4,
      'timed out': 4,
      'etimedout': 5,
      'econnrefused': 5,
      'connection refused': 4,
      'dns': 3,
      'ssl': 2,
      'certificate': 2,
      'network': 2,
      'unreachable': 3,
      'fetch failed': 4,
      'request failed': 3,
      '503': 3,
      '502': 3,
      '504': 3,
    },
    threshold: 6,
  },
  auth_failure: {
    title: '认证或权限失败',
    keywords: {
      'unauthorized': 5,
      '401': 4,
      '403': 4,
      'forbidden': 4,
      'auth': 3,
      'token': 2,
      'api key': 4,
      'bearer': 3,
      'permission denied': 4,
      'eacces': 4,
      'denied': 3,
      'invalid credentials': 4,
      'credential': 3,
      'access denied': 4,
      'invalid api key': 5,
      'api_key': 3,
    },
    threshold: 5,
  },
  perf_bottleneck: {
    title: '性能瓶颈或资源压力',
    keywords: {
      'slow': 3,
      'latency': 3,
      'bottleneck': 4,
      'oom': 5,
      'out of memory': 5,
      'throttle': 3,
      'retry': 2,
      'hanging': 3,
      'cpu': 2,
      'memory': 2,
      'heap': 3,
      'too many': 2,
      'rate limit': 4,
    },
    threshold: 6,
  },
  capability_gap: {
    title: '能力缺口或不支持功能',
    keywords: {
      'unsupported': 4,
      'not supported': 4,
      'not implemented': 4,
      'unknown flag': 4,
      'unknown option': 4,
      'invalid option': 3,
      'feature': 2,
      'capability': 3,
      'not allowed': 3,
      'disabled': 2,
      'deprecated': 2,
    },
    threshold: 6,
  },
};

const SIGNAL_KINDS = Object.keys(SIGNAL_PROFILES) as HermesSignal['kind'][];

/**
 * 对消息文本进行关键词打分。
 */
function scoreMessage(msg: string): Map<HermesSignal['kind'], number> {
  const scores = new Map<HermesSignal['kind'], number>();
  const text = msg.toLowerCase();

  for (const kind of SIGNAL_KINDS) {
    const profile = SIGNAL_PROFILES[kind];
    let score = 0;
    const matchedKeywords: Array<{ word: string; weight: number }> = [];

    for (const [keyword, weight] of Object.entries(profile.keywords)) {
      if (text.includes(keyword.toLowerCase())) {
        score += weight;
        matchedKeywords.push({ word: keyword, weight });
      }
    }

    scores.set(kind, score);
  }

  return scores;
}

/**
 * 从 Hermes 错误输入中提取信号（返回最高置信度的信号）。
 * 若所有信号都低于阈值，返回 null。
 */
export function extractHermesSignal(input: HermesErrorInput): HermesSignal | null {
  const rawText = [
    input.message || '',
    input.kind || '',
    input.stack || '',
    input.step || '',
  ].join('\n');

  const scores = scoreMessage(rawText);

  let bestKind: HermesSignal['kind'] | null = null;
  let bestScore = 0;

  for (const [kind, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestKind = kind;
    }
  }

  if (!bestKind || bestScore < SIGNAL_PROFILES[bestKind].threshold) {
    // No strong signal match — return generic capability_gap with low confidence
    return {
      kind: 'capability_gap',
      title: '未知错误类型',
      confidence: 0.3,
      keywords: [],
      matchedAt: new Date().toISOString(),
    };
  }

  const profile = SIGNAL_PROFILES[bestKind];
  const confidence = Math.min(bestScore / (profile.threshold + 5), 1.0);

  const matchedKeywords = Object.entries(profile.keywords)
    .filter(([k]) => rawText.toLowerCase().includes(k.toLowerCase()))
    .map(([word, weight]) => ({ word, weight }));

  return {
    kind: bestKind,
    title: profile.title,
    confidence: Math.round(confidence * 100) / 100,
    keywords: matchedKeywords,
    matchedAt: new Date().toISOString(),
  };
}

/**
 * 批量提取多个信号（用于复杂堆栈分析）。
 */
export function extractAllSignals(input: HermesErrorInput): HermesSignal[] {
  const rawText = [
    input.message || '',
    input.kind || '',
    input.stack || '',
    input.step || '',
  ].join('\n');

  const scores = scoreMessage(rawText);
  const results: HermesSignal[] = [];

  for (const [kind, score] of scores) {
    const profile = SIGNAL_PROFILES[kind];
    if (score >= profile.threshold) {
      const matchedKeywords = Object.entries(profile.keywords)
        .filter(([k]) => rawText.toLowerCase().includes(k.toLowerCase()))
        .map(([word, weight]) => ({ word, weight }));

      results.push({
        kind,
        title: profile.title,
        confidence: Math.min(score / (profile.threshold + 5), 1.0),
        keywords: matchedKeywords,
        matchedAt: new Date().toISOString(),
      });
    }
  }

  return results;
}
