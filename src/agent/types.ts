// Agent Lite 类型定义

/** 语义化错误信号标签 */
export type ErrorSignal =
  | 'network_connection_refused'  // ECONNREFUSED
  | 'network_timeout'             // ETIMEDOUT / TIMEOUT
  | 'process_terminated'          // SIGKILL / SIGTERM
  | 'context_overflow'            // MAX_TOKEN / context window exceeded
  | 'rate_limited'                // 429 / RATE_LIMIT
  | 'permission_denied'           // EACCES / permission denied
  | 'command_not_found'           // ENOENT / command not found
  | 'mcp_server_error'            // MCP server errors
  | 'git_error'                   // git fatal errors
  | 'python_error'                // Python tracebacks
  | 'npm_error'                   // npm/node errors
  | 'unknown_error';

/** 命令分类类型 */
export type CommandCategory = 'git' | 'npm' | 'node' | 'python' | 'shell' | 'brew' | 'docker' | 'unknown';

/** 命令执行结果 */
export type CommandExitStatus = 'success' | 'failure' | 'timeout';

/** 命令审计记录 */
export interface CommandAudit {
  command: string;
  category: CommandCategory;
  exitStatus: CommandExitStatus;
  exitCode?: number;
  durationMs?: number;
}

/** 环境指纹快照 */
export interface EnvFingerprint {
  os: string;
  arch: string;
  totalMemoryGB: number;
  nodeVersion: string;
  pythonVersion: string | null;
  gitVersion: string | null;
  npmRegistry: string | null;
  shellProxy: string | null;
  httpProxy: string | null;
  httpsProxy: string | null;
  claudeVersion: string | null;
  cwdHash: string;
}

export interface AgentEvent {
  schemaVersion: number;
  eventId: string;
  clientId: string;
  deviceId: string;
  source: 'mac-aicheck-lite';
  agent: string; // 'claude-code' | 'openclaw' | 'custom'
  eventType: string;
  occurredAt: string;
  fingerprint: string;
  sanitizedMessage: string;
  severity: 'error' | 'warn' | 'info';
  localContext: {
    os: string;
    shell: string | undefined;
    node: string;
    cwdHash: string;
  };
  /** 语义化错误信号标签 */
  error_signals?: ErrorSignal[];
  /** 命令审计记录（来自 PostTool Hook） */
  command_audit?: CommandAudit;
  /** 环境指纹快照 */
  env_fingerprint?: EnvFingerprint;
  syncStatus: 'pending' | 'synced';
  syncedAt?: string;
}

export interface AgentConfig {
  clientId: string;
  deviceId: string;
  shareData: boolean;
  autoSync: boolean;
  paused: boolean;
  email: string | null;
  authToken: string | null;
  profileId: string | null;
  agentType: string | null;
  confirmedAt: string | null;
}

export interface AgentHooks {
  installedAt: string | null;
  agents: Array<{
    target: string;
    command: string;
    functionName: string;
  }>;
  profiles: string[];
  uninstalledAt?: string;
  target?: string;
}

export interface DailyPack {
  date: string;
  totalEvents: number;
  uniqueFingerprints: number;
  repeatedEvents: number;
  fixedEvents: number;
  consecutiveFailures: number;      // 连续失败计数（用于检测 failure loop）
  lastFailureFingerprint: string | null;  // 上次失败的 fingerprint
  lastEventAt: string | null;        // 上次事件时间（用于检测静默）
  topProblems: Array<{
    fingerprint: string;
    title: string;
    count: number;
    status: 'new' | 'repeated' | 'fixed';
  }>;
}

export interface LedgerEntry {
  uploadedAt: string;
  eventId: string;
  fingerprint: string;
  status: 'synced' | 'failed';
  remoteStatus: number;
}

export interface AgentStatus {
  enabled: boolean;
  localRunnerInstalled: boolean;
  paused: boolean;
  shareData: boolean;
  autoSync: boolean;
  email: string | null;
  agentCmd: string;
  hooks: AgentHooks;
  totals: {
    events: number;
    pending: number;
    synced: number;
    uploads: number;
  };
  today: DailyPack;
  latestEvents: AgentEvent[];
  latestUploads: LedgerEntry[];
  advice: Record<string, unknown>;
}

export interface SyncResult {
  ok: boolean;
  uploaded?: number;
  skipped?: boolean;
  reason?: string;
  status?: number;
  data?: unknown;
  error?: string;
}

export interface EnableResult {
  ok: boolean;
  localAgent: {
    agentDir: string;
    agentJs: string;
    agentCmd: string;
  };
  hook: string;
  status: AgentStatus;
}

export interface CaptureInput {
  agent: string;
  message?: string;
  log?: string;
  severity?: 'error' | 'warn' | 'info';
  eventType?: string;
  occurredAt?: string;
  fingerprint?: string;
  eventId?: string;
}
