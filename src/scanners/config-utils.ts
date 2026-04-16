import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { commandExists } from '../executor/index';

export interface ParsedConfigResult<T = any> {
  path: string;
  data?: T;
  error?: string;
}

export function getHomeDir(): string {
  return process.env.HOME || process.cwd();
}

export function getProjectDir(): string {
  return process.cwd();
}

export function getClaudeMcpConfigCandidates(): string[] {
  const home = getHomeDir();
  const project = getProjectDir();
  return [
    join(project, '.claude', 'mcp_settings.json'),
    join(project, '.claude.json'),
    join(home, '.claude', 'mcp_settings.json'),
    join(home, '.claude.json'),
  ];
}

export function getMcpConfigCandidates(): string[] {
  const home = getHomeDir();
  const project = getProjectDir();
  return [
    join(project, '.mcp.json'),
    join(project, 'mcp.json'),
    join(home, '.mcp.json'),
    join(home, '.config', 'mcp', 'config.json'),
  ];
}

export function getOpenClawConfigCandidates(): string[] {
  const home = getHomeDir();
  const project = getProjectDir();
  return [
    join(project, '.openclaw.json'),
    join(project, '.openclaw', 'config.json'),
    join(home, '.openclaw', 'config.json'),
    join(home, '.config', 'openclaw', 'config.json'),
  ];
}

export function getTerminalSettingsCandidates(): string[] {
  const home = getHomeDir();
  return [
    join(home, '.zshrc'),
    join(home, '.zprofile'),
    join(home, '.bashrc'),
    join(home, '.bash_profile'),
    join(home, '.config', 'fish', 'config.fish'),
  ];
}

export function findFirstExisting(paths: string[]): string | undefined {
  return paths.find(p => existsSync(p));
}

export function parseJsonLoose(text: string): any {
  const withoutBom = text.replace(/^\uFEFF/, '');
  const withoutComments = withoutBom
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const withoutTrailingCommas = withoutComments.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(withoutTrailingCommas);
}

export function readJsonCandidate(paths: string[]): ParsedConfigResult | null {
  const found = findFirstExisting(paths);
  if (!found) return null;
  try {
    return { path: found, data: parseJsonLoose(readFileSync(found, 'utf-8')) };
  } catch (error) {
    return { path: found, error: error instanceof Error ? error.message : String(error) };
  }
}

export function hasProjectMarker(markers: string[]): boolean {
  return markers.some(marker => existsSync(join(getProjectDir(), marker)));
}

export function findProjectDir(nameCandidates: string[]): string | undefined {
  return nameCandidates.map(name => join(getProjectDir(), name)).find(candidate => existsSync(candidate));
}

export function stripQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

export function canResolveCommand(command: string): boolean {
  const executable = stripQuotes(command).split(/\s+/)[0];
  if (!executable) return false;
  if (executable.includes('/')) return existsSync(executable);
  return commandExists(executable);
}

export function looksLikePlaceholderSecret(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return ['your-api-key', 'your_api_key', '<api_key>', '<token>', 'replace_me', 'changeme', 'dummy', 'example', 'test-key', 'sk-xxxx']
    .some(token => normalized.includes(token));
}

export function collectSecretLeaves(input: unknown, path = ''): { key: string; value: string }[] {
  if (typeof input === 'string') return path ? [{ key: path, value: input }] : [];
  if (!input || typeof input !== 'object') return [];
  if (Array.isArray(input)) {
    return input.flatMap((item, idx) => collectSecretLeaves(item, `${path}[${idx}]`));
  }
  return Object.entries(input).flatMap(([key, value]) => collectSecretLeaves(value, path ? `${path}.${key}` : key));
}
