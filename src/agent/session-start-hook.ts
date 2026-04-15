#!/usr/bin/env node
// mac-aicheck-hook-version: 1.0.0
// SessionStart hook: 后台检查版本更新，不阻塞 Claude Code 启动
// 参考 gsd-check-update.js 的后台执行模式

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawn, execFileSync } from 'child_process';
import crypto from 'node:crypto';

function getHome(): string { return process.env.HOME || homedir(); }
const CACHE_DIR = join(getHome(), '.cache', 'mac-aicheck');
const CACHE_FILE = join(CACHE_DIR, 'version-check.json');
const VERSION_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Ensure cache directory exists
if (!existsSync(CACHE_DIR)) {
  mkdirSync(CACHE_DIR, { recursive: true });
}

// Background version check script
const checkScript = `
  const fs = require('fs');
  const { execFileSync, execSync } = require('child_process');
  const path = require('path');
  const crypto = require('crypto');

  const CACHE_FILE = ${JSON.stringify(CACHE_FILE)};
  const VERSION_CHECK_INTERVAL_MS = ${VERSION_CHECK_INTERVAL_MS};
  const VERSION_CACHE_FILE = ${JSON.stringify(join(getHome(), '.mac-aicheck', 'version-cache.json'))};

  // Read existing cache to respect rate limiting
  let cache = { lastCheck: null, hasUpdate: false };
  try {
    if (fs.existsSync(CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (e) {}

  // Check rate limit
  if (cache.lastCheck) {
    const elapsed = Date.now() - new Date(cache.lastCheck).getTime();
    if (elapsed < VERSION_CHECK_INTERVAL_MS) {
      process.exit(0); // Silent exit if checked recently
    }
  }

  // Get current version
  function getCommandVersion(cmd) {
    try {
      const result = execFileSync(cmd, ['--version'], { encoding: 'utf8', timeout: 5000 });
      const match = result.match(/(\\d+\\.\\d+\\.\\d+)/);
      return match ? match[1] : null;
    } catch (e) { return null; }
  }

  const currentVersion = getCommandVersion('claude');

  // Check GitHub latest
  let latest = null;
  try {
    const data = execSync('curl -s https://api.github.com/repos/anthropics/claude-code/releases/latest --user-agent "mac-aicheck-hook"', { timeout: 10000 });
    const json = JSON.parse(data.toString());
    latest = json.tag_name?.replace(/^v/, '') || null;
  } catch (e) {}

  const hasUpdate = latest && currentVersion && latest !== currentVersion;

  // Write to both cache locations
  const result = {
    current: currentVersion,
    latest: latest,
    hasUpdate: !!hasUpdate,
    lastCheck: new Date().toISOString(),
  };

  fs.writeFileSync(CACHE_FILE, JSON.stringify(result, null, 2));

  // Also update the main version cache (for other tools to read)
  if (fs.existsSync(VERSION_CACHE_FILE)) {
    try {
      const mainCache = JSON.parse(fs.readFileSync(VERSION_CACHE_FILE, 'utf8'));
      mainCache.current = 'node:' + process.version.replace(/^v/, '') + '|claude:' + (currentVersion || 'unknown') + '|openclaw:unknown';
      mainCache.latest = hasUpdate ? 'claude-code: ' + currentVersion + ' → ' + latest : 'up to date';
      mainCache.hasUpdate = !!hasUpdate;
      mainCache.lastCheck = new Date().toISOString();
      fs.writeFileSync(VERSION_CACHE_FILE, JSON.stringify(mainCache, null, 2));
    } catch (e) {}
  }

  // Show notification if there's an update
  if (hasUpdate) {
    console.error('\\n🔔 mac-aicheck 版本更新通知:');
    console.error('   claude-code: ' + currentVersion + ' → ' + latest);
    console.error('   运行 \\'mac-aicheck agent upgrade\\' 一键更新');
  }
`;

// Spawn background process - detached so it doesn't block hook exit
const child = spawn(process.execPath, ['-e', checkScript], {
  stdio: 'ignore',
  windowsHide: true,
  detached: true,
});

child.unref(); // Let parent exit immediately
