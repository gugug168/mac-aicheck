// Agent Lite 类型定义

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
