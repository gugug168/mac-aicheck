#!/usr/bin/env node
// mac-aicheck-hook-version: 2.0.0
// SessionStart hook: 后台检查 mac-aicheck 自身版本更新
// gstack 风格: 检查远程 VERSION 文件（几百字节），有更新时提醒

const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');
const { spawn } = require('child_process');

function getHome() { return process.env.HOME || homedir(); }
const STATE_DIR = join(getHome(), '.mac-aicheck', 'state');
const CACHE_FILE = join(STATE_DIR, 'last-update-check');
const SNOOZE_FILE = join(STATE_DIR, 'update-snoozed');
const MARKER_FILE = join(STATE_DIR, 'just-upgraded-from');

const UP_TO_DATE_TTL = 60 * 60 * 1000;     // 60 min
const UPGRADE_TTL = 12 * 60 * 60 * 1000;    // 12 hours
const SNOOZE_LEVELS = [24, 48, 168];         // hours: 1d, 2d, 1w

const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/gugug168/mac-aicheck/main/VERSION';

// Read local version from package.json next to agent-lite.js
let LOCAL_VERSION = '0.0.0';
try {
  const pkgPath = join(getHome(), '.mac-aicheck', 'agent', 'package.json');
  if (existsSync(pkgPath)) {
    LOCAL_VERSION = JSON.parse(readFileSync(pkgPath, 'utf8')).version || '0.0.0';
  }
} catch {}

// Background check script (detached, non-blocking)
const checkScript = `
  const fs = require('fs');
  const { execSync } = require('child_process');
  const path = require('path');
  const http = require('https');

  const STATE_DIR = ${JSON.stringify(STATE_DIR)};
  const CACHE_FILE = ${JSON.stringify(CACHE_FILE)};
  const SNOOZE_FILE = ${JSON.stringify(SNOOZE_FILE)};
  const MARKER_FILE = ${JSON.stringify(MARKER_FILE)};
  const LOCAL_VERSION = ${JSON.stringify(LOCAL_VERSION)};
  const REMOTE_URL = ${JSON.stringify(REMOTE_VERSION_URL)};
  const UP_TO_DATE_TTL = ${UP_TO_DATE_TTL};
  const UPGRADE_TTL = ${UPGRADE_TTL};
  const SNOOZE_LEVELS = ${JSON.stringify(SNOOZE_LEVELS)};

  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });

  // Check just-upgraded marker
  if (fs.existsSync(MARKER_FILE)) {
    const old = fs.readFileSync(MARKER_FILE, 'utf8').trim();
    fs.unlinkSync(MARKER_FILE);
    try { fs.unlinkSync(SNOOZE_FILE); } catch {}
    process.stderr.write('JUST_UPGRADED ' + old + ' ' + LOCAL_VERSION + '\\n');
  }

  // Check cache TTL
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      const age = Date.now() - (cache.ts || 0);
      const ttl = cache.result === 'UP_TO_DATE' ? UP_TO_DATE_TTL : UPGRADE_TTL;
      if (age < ttl) {
        if (cache.result === 'UPGRADE_AVAILABLE') {
          // Check snooze
          if (fs.existsSync(SNOOZE_FILE)) {
            const parts = fs.readFileSync(SNOOZE_FILE, 'utf8').trim().split(' ');
            const snoozeVersion = parts[0];
            const snoozeLevel = parseInt(parts[1] || '0');
            const snoozeEpoch = parseInt(parts[2] || '0');
            const snoozeHours = SNOOZE_LEVELS[Math.min(snoozeLevel, SNOOZE_LEVELS.length - 1)];
            if (snoozeVersion === cache.remote && Date.now() - snoozeEpoch < snoozeHours * 3600000) {
              process.exit(0); // snoozed
            }
          }
          process.stderr.write('UPGRADE_AVAILABLE ' + LOCAL_VERSION + ' ' + cache.remote + '\\n');
        }
        process.exit(0);
      }
    } catch {}
  }

  // Fetch remote VERSION (tiny file, ~10 bytes)
  try {
    const req = http.request(REMOTE_URL, { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        const remote = body.trim();
        if (!/^\\d+\\.\\d+/.test(remote)) {
          // Invalid response, cache as up-to-date
          fs.writeFileSync(CACHE_FILE, JSON.stringify({ result: 'UP_TO_DATE', ts: Date.now() }));
          process.exit(0);
        }
        if (remote !== LOCAL_VERSION) {
          fs.writeFileSync(CACHE_FILE, JSON.stringify({ result: 'UPGRADE_AVAILABLE', remote, ts: Date.now() }));
          // Check snooze
          if (fs.existsSync(SNOOZE_FILE)) {
            const parts = fs.readFileSync(SNOOZE_FILE, 'utf8').trim().split(' ');
            if (parts[0] === remote) {
              const level = parseInt(parts[1] || '0');
              const epoch = parseInt(parts[2] || '0');
              const hours = SNOOZE_LEVELS[Math.min(level, SNOOZE_LEVELS.length - 1)];
              if (Date.now() - epoch < hours * 3600000) process.exit(0);
            }
          }
          process.stderr.write('UPGRADE_AVAILABLE ' + LOCAL_VERSION + ' ' + remote + '\\n');
        } else {
          fs.writeFileSync(CACHE_FILE, JSON.stringify({ result: 'UP_TO_DATE', ts: Date.now() }));
        }
        process.exit(0);
      });
    });
    req.on('error', () => {
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ result: 'UP_TO_DATE', ts: Date.now() }));
      process.exit(0);
    });
    req.on('timeout', () => { req.destroy(); process.exit(0); });
    req.end();
  } catch {
    process.exit(0);
  }
`;

// Ensure state dir exists
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

// Spawn background check
const child = spawn(process.execPath, ['-e', checkScript], {
  stdio: ['ignore', 'ignore', 'pipe'],
  windowsHide: true,
  detached: true,
});

// Capture stderr output for UPGRADE_AVAILABLE / JUST_UPGRADED signals
let stderrOutput = '';
child.stderr.on('data', (data) => {
  stderrOutput += data.toString();
});

child.on('close', () => {
  if (stderrOutput.includes('UPGRADE_AVAILABLE') || stderrOutput.includes('JUST_UPGRADED')) {
    process.stderr.write(stderrOutput);
  }
});

child.unref();
