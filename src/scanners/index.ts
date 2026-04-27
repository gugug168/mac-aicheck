import { getScanners, getScannerByCategory, getScannerById, SCANNER_CATEGORIES } from './registry';
import type { ScanResult } from './types';

import './git';
import './node-version';
import './node-manager';
import './python-versions';
import './npm-mirror';
import './proxy-config';
import './apple-silicon';
import './homebrew';
import './developer-mode';
import './screen-permission';
import './claude-code';
import './gemini-cli';
import './openclaw';
import './xcode';
import './rosetta';
import './ssl-certs';
import './dns-resolution';
import './git-identity-config';
import './admin-perms';
import './gpu-monitor';
import './ccswitch';
import './claude-cli';
import './claude-config-health';
import './cpp-compiler';
import './cuda-version';
import './env-path-length';
import './firewall-ports';
import './git-credential-health';
import './git-path';
import './gpu-driver';
import './long-paths';
import './mcp-command-availability';
import './mcp-config-health';
import './mirror-sources';
import './node-global-bin-path';
import './node-manager-conflict';
import './openclaw-config-health';
import './package-managers';
import './path-chinese';
import './path-spaces';
import './powershell-policy';
import './powershell-version';
import './python-env-alignment';
import './python-project-venv';
import './shell-encoding-health';
import './site-reachability';
import './temp-space';
import './terminal-profile-health';
import './time-sync';
import './unix-commands';
import './uv-package-manager';
import './virtualization';
import './vram-usage';
import './wsl-version';

export { getScanners, getScannerByCategory, getScannerById, SCANNER_CATEGORIES } from './registry';
export { checkGpu } from './gpu-monitor';
export type { ScanResult, Scanner, ScannerResult } from './types';

export async function scanAll(): Promise<ScanResult[]> {
  const scanners = getScanners();
  const settled = await Promise.allSettled(
    scanners.map(s => scanWithTimeout(s, 30_000))
  );
  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      id: scanners[i].id,
      name: scanners[i].name,
      category: scanners[i].category,
      status: 'unknown' as const,
      message: `扫描异常: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
    };
  });
}

async function scanWithTimeout(scanner: ReturnType<typeof getScanners>[number], ms: number): Promise<ScanResult> {
  return Promise.race([
    scanner.scan(),
    new Promise<ScanResult>(resolve =>
      setTimeout(() => resolve({
        id: scanner.id,
        name: scanner.name,
        category: scanner.category,
        status: 'unknown' as const,
        message: `扫描超时（${ms / 1000}s），跳过`,
      }), ms)
    ),
  ]);
}

export async function scanCategory(category: string): Promise<ScanResult[]> {
  const scanners = getScannerByCategory(category);
  const settled = await Promise.allSettled(scanners.map(s => s.scan()));
  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      id: scanners[i].id,
      name: scanners[i].name,
      category: scanners[i].category,
      status: 'unknown' as const,
      message: `扫描异常: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
    };
  });
}

export function calculateScore(results: ScanResult[]): number {
  if (results.length === 0) return 0;
  let total = 0;
  for (const r of results) {
    if (r.status === 'pass') total += 100;
    else if (r.status === 'warn') total += 60;
  }
  return Math.round(total / results.length);
}
