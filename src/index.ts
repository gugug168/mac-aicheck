#!/usr/bin/env node

import { scanAll } from './scanners/index';
import { fixAll, getFixerById, getFixerForScanResult } from './fixers/index';
import { getFixRiskPresentation, sortIssuesByPriority } from './fixers/presentation';
import { calculateScore } from './scoring/calculator';
import { createPayload, saveLocal, stashData, buildClaimUrl, submitFeedback } from './api/aicoevo-client';
import { getInstallers, getAllowedCommands } from './installers/index';
import { getAgentLocalStatus, enableAgentExperience, pauseAgentUploads, syncAgentEvents } from './agent/local-state';
import { shouldUploadScan } from './cli/options';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { spawn } from 'child_process';

const MAX_BODY = 1024 * 1024;
const WEB_DIR = path.join(__dirname, '../dist/web');
const DATA_FILE = path.join(WEB_DIR, 'scan-data.json');

function resolvePort(): number {
  const raw = Number(process.env.PORT || '7890');
  return Number.isInteger(raw) && raw > 0 && raw <= 65535 ? raw : 7890;
}

function resolveVersion(): string {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
    ) as { version?: string };
    return packageJson.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

const PORT = resolvePort();
const VERSION = resolveVersion();

function gc(s: number) { return s>=90?'#22c55e':s>=70?'#3b82f6':s>=50?'#eab308':'#ef4444'; }

// Security: whitelisted installer commands only (NEVER trust frontend with arbitrary cmd)
// 单数据源：命令定义统一存储在 installers/index.ts 的 getAllowedCommands()
const ALLOWED_COMMANDS: Record<string, { cmd: string }> = getAllowedCommands();

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function persistServeData(score: unknown, results: unknown, payload: unknown): void {
  if (!fs.existsSync(WEB_DIR)) fs.mkdirSync(WEB_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ score, results, payload }, null, 2), 'utf-8');
}

function loadServeData(): { score: { score: number; label: string }; results: Array<any> } | null {
  if (!fs.existsSync(DATA_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as { score: { score: number; label: string }; results: Array<any> };
  } catch {
    return null;
  }
}

function renderServePage(): string {
  const data = loadServeData();
  if (!data) {
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>MacAICheck</title><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;background:#0f172a;color:#e2e8f0"><h1>MacAICheck</h1><p>暂无扫描结果。先运行 <code>mac-aicheck --serve</code> 或 <code>mac-aicheck scan --serve</code>。</p></body></html>`;
  }

  const score = data.score?.score ?? 0;
  const label = data.score?.label ?? '';
  const issues = sortIssuesByPriority(
    data.results.filter(item => item.status === 'fail' || item.status === 'warn'),
    item => getFixerForScanResult(item),
  );
  const failCount = data.results.filter(item => item.status === 'fail').length;
  const warnCount = data.results.filter(item => item.status === 'warn').length;
  const actionableCount = issues.filter(item => getFixerForScanResult(item)).length;
  const cards = issues.map((item) => {
    const fixer = getFixerForScanResult(item);
    const presentation = fixer ? getFixRiskPresentation(fixer) : null;
    const sectionId = `issue-${escapeHtml(item.id)}`;
    const detail = item.detail ? `<pre style="white-space:pre-wrap;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px;overflow:auto">${escapeHtml(item.detail)}</pre>` : '';
    const riskChip = presentation
      ? `<span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:700;background:${presentation.background};color:${presentation.text};border:1px solid ${presentation.border}">${escapeHtml(presentation.title)}</span>`
      : `<span style="display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:700;background:rgba(148,163,184,.12);color:#cbd5e1;border:1px solid rgba(148,163,184,.25)">仅检测</span>`;
    const fixButton = presentation
      ? `<button onclick="runFix('${escapeHtml(item.id)}', this)" style="margin-top:12px;padding:10px 14px;border-radius:8px;border:0;background:${presentation.accent};color:#04130a;font-weight:700;cursor:pointer">${escapeHtml(presentation.buttonLabel)}</button>`
      : `<div style="margin-top:12px;color:#94a3b8;font-size:13px">当前没有自动修复器</div>`;
    const actionHint = presentation
      ? `<div style="margin-top:8px;font-size:13px;color:#94a3b8">${presentation.risk === 'green' ? '点击后会先弹出确认，再执行修复。' : presentation.risk === 'yellow' ? '点击后会先看说明，再确认执行。' : '先看指引，再手动处理。'}</div>`
      : '';
    return `<section id="${sectionId}" style="border:1px solid #334155;border-radius:12px;padding:16px;background:#111827;scroll-margin-top:110px">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
        <div>
          <div style="font-size:18px;font-weight:700">${escapeHtml(item.name)}</div>
          <div style="font-size:13px;color:#94a3b8">${escapeHtml(item.id)} · ${escapeHtml(item.category)} · ${escapeHtml(item.status)}</div>
        </div>
        ${riskChip}
      </div>
      <p style="margin:12px 0;color:#e5e7eb">${escapeHtml(item.message)}</p>
      ${detail}
      ${actionHint}
      ${fixButton}
    </section>`;
  }).join('\n');

  const topIssueCards = issues.slice(0, 4).map((item, index) => {
    const fixer = getFixerForScanResult(item);
    const presentation = fixer ? getFixRiskPresentation(fixer) : null;
    const statusColor = item.status === 'fail' ? '#ef4444' : '#eab308';
    return `<button onclick="scrollToSection('issue-${escapeHtml(item.id)}')" style="width:100%;text-align:left;border:1px solid #334155;border-radius:12px;padding:14px;background:#111827;color:#e2e8f0;cursor:pointer">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:start">
        <div style="font-size:16px;font-weight:700">${index + 1}. ${escapeHtml(item.name)}</div>
        <span style="font-size:12px;color:${statusColor}">${escapeHtml(item.status.toUpperCase())}</span>
      </div>
      <div style="margin-top:8px;font-size:13px;color:#cbd5e1">${escapeHtml(item.message)}</div>
      <div style="margin-top:8px;font-size:12px;color:#94a3b8">${presentation ? '点击定位到对应修复项' : '点击定位到对应检测项'}</div>
    </button>`;
  }).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MacAICheck</title>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#020617;color:#e2e8f0}
    .wrap{max-width:980px;margin:0 auto;padding:28px 20px 48px}
    .hero{display:grid;gap:16px;margin-bottom:24px}
    .score{display:inline-block;padding:16px 18px;border-radius:14px;background:#111827;border:1px solid #334155}
    .muted{color:#94a3b8}
    .grid{display:grid;gap:16px}
    .grid.two{grid-template-columns:1.1fr .9fr}
    .toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:18px 0 24px}
    button.secondary{padding:10px 14px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;cursor:pointer}
    .sticky-nav{position:sticky;top:12px;z-index:20;display:flex;flex-wrap:wrap;gap:8px;padding:12px;border:1px solid #334155;border-radius:14px;background:rgba(15,23,42,.92);backdrop-filter:blur(12px);margin-bottom:18px}
    .sticky-nav button{padding:8px 12px;border-radius:999px;border:1px solid #334155;background:#111827;color:#cbd5e1;cursor:pointer}
    .route-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .route-card{width:100%;text-align:left;padding:16px;border-radius:14px;border:1px solid #334155;background:#111827;color:#e2e8f0;cursor:pointer}
    .route-card strong{display:block;margin:8px 0 6px;font-size:15px}
    .route-card small{display:inline-flex;padding:4px 8px;border-radius:999px;background:#0f172a;border:1px solid #334155;color:#93c5fd}
    .section-card{border:1px solid #334155;border-radius:14px;padding:16px;background:#111827}
    .section-title{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:12px}
    .section-title h2{margin:0;font-size:18px}
    .section-title span{font-size:13px;color:#94a3b8}
    .summary-stats{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
    .summary-stats span{padding:6px 10px;border-radius:999px;background:#0f172a;border:1px solid #334155;font-size:13px;color:#cbd5e1}
    .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(120px);padding:12px 18px;border-radius:12px;background:rgba(15,23,42,.96);border:1px solid #334155;color:#e2e8f0;font-size:14px;transition:transform .25s ease;z-index:40}
    .toast.show{transform:translateX(-50%) translateY(0)}
    .highlight{box-shadow:0 0 0 2px rgba(96,165,250,.35),0 0 24px rgba(96,165,250,.12)}
    @media (max-width: 840px){ .grid.two, .route-grid { grid-template-columns:1fr; } .sticky-nav{top:8px} }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1 style="margin:0">MacAICheck</h1>
      <div class="score">
        <div class="muted">环境评分</div>
        <div style="font-size:42px;font-weight:800;color:${gc(score)}">${score}</div>
        <div class="muted">${escapeHtml(label)}</div>
      </div>
      <div class="toolbar">
        <button class="secondary" onclick="location.reload()">刷新页面</button>
        <button class="secondary" onclick="alert('重新运行命令: mac-aicheck --serve')">重新扫描</button>
        <span class="muted">当前显示 fail/warn 项，共 ${issues.length} 项</span>
      </div>
    </div>

    <div class="sticky-nav">
      <button onclick="scrollToSection('summary')">结论</button>
      <button onclick="scrollToSection('route')">路线</button>
      <button onclick="scrollToSection('issues')">修复</button>
      <button onclick="scrollToSection('feedback')">反馈</button>
    </div>

    <section id="summary" class="grid two" style="margin-bottom:16px">
      <div class="section-card">
        <div class="section-title">
          <h2>环境结论</h2>
          <span>${label}</span>
        </div>
        <div style="font-size:15px;line-height:1.7;color:#cbd5e1">
          ${failCount > 0 ? `当前还有 ${failCount} 个失败项，建议先处理直接阻塞，再继续安装或接入 AI 工具链。` : warnCount > 0 ? `阻塞项已经不多，当前主要是 ${warnCount} 个警告项，适合集中清理后再进入长期使用。` : '主要链路已通过，可以直接开始使用。'}
        </div>
        <div class="summary-stats">
          <span>${failCount} 个失败</span>
          <span>${warnCount} 个警告</span>
          <span>${actionableCount} 项可行动作</span>
        </div>
      </div>
      <div class="section-card">
        <div class="section-title">
          <h2>当前最该处理</h2>
          <span>点击可定位</span>
        </div>
        <div class="grid">
          ${topIssueCards || '<div class="muted">当前没有需要处理的 fail/warn 项。</div>'}
        </div>
      </div>
    </section>

    <section id="route" class="section-card" style="margin-bottom:16px">
      <div class="section-title">
        <h2>后续路线</h2>
        <span>一步一步来</span>
      </div>
      <div class="route-grid">
        <button class="route-card" onclick="scrollToSection('issues')"><small>Step 1</small><strong>先处理可执行项</strong><div class="muted">优先把 fail 项和高收益 warn 项清掉，避免后面装了工具还不能用。</div></button>
        <button class="route-card" onclick="alert('下一步建议：先处理这里的 fail/warn，再继续安装 Claude Code、OpenClaw、Gemini CLI 等工具。')"><small>Step 2</small><strong>再决定装哪些工具</strong><div class="muted">诊断先明确问题，再做安装，避免边装边猜。</div></button>
        <button class="route-card" onclick="alert('aicoevo 接入建议：环境稳定后，再接入持续优化或经验回传能力，避免把噪声配置同步出去。')"><small>Step 3</small><strong>接入 aicoevo 持续优化</strong><div class="muted">先把机器跑顺，再接持续优化、社区经验和后续回传。</div></button>
        <button class="route-card" onclick="scrollToSection('feedback')"><small>Need Help</small><strong>卡住就直接反馈</strong><div class="muted">如果你不确定先改哪一项，就把当前现象发出来，别自己硬猜。</div></button>
      </div>
    </section>

    <section id="feedback" class="section-card" style="margin-bottom:16px">
      <div class="section-title">
        <h2>反馈入口</h2>
        <span>当前页快速说明</span>
      </div>
      <div class="muted" style="line-height:1.7">
        现在这个 Mac 版轻量页面还没有内嵌反馈表单。如果你卡住了，建议先记录当前检测项、报错和终端输出，再走 CLI 或社区反馈链路。
      </div>
    </section>

    <div id="issues" class="grid">
      ${cards || '<div class="muted">当前没有 fail/warn 项。</div>'}
    </div>
  </div>
  <div id="toast" class="toast"></div>
  <script>
    let toastTimer = null;

    function scrollToSection(id) {
      const el = document.getElementById(id);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function showToast(message) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
    }

    function highlightIssue(id) {
      const el = document.getElementById(id);
      if (!el) return;
      document.querySelectorAll('.highlight').forEach(node => node.classList.remove('highlight'));
      el.classList.add('highlight');
      scrollToSection(id);
      setTimeout(() => el.classList.remove('highlight'), 2200);
    }

    async function runFix(scannerId, button) {
      const cardId = 'issue-' + scannerId;
      highlightIssue(cardId);
      const proceed = window.confirm('将先执行该修复命令。确认继续？');
      if (!proceed) {
        showToast('已取消执行。');
        return;
      }
      showToast('已确认，开始执行修复。');
      const original = button.textContent;
      button.disabled = true;
      button.textContent = '修复中...';
      try {
        const res = await fetch('/api/fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scannerId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || '修复失败');
        alert((data.fixResult && data.fixResult.message) || '修复完成');
        location.reload();
      } catch (err) {
        alert(err.message || String(err));
        button.disabled = false;
        button.textContent = original;
      }
    }
  </script>
</body>
</html>`;
}

function openUrl(url: string): void {
  const opener = process.platform === 'darwin'
    ? { command: 'open', args: [url] }
    : process.platform === 'win32'
      ? { command: 'cmd', args: ['/c', 'start', '', url] }
      : { command: 'xdg-open', args: [url] };

  try {
    const child = spawn(opener.command, opener.args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch {}
}

function serveHttp() {
  function isLocalRequest(req: http.IncomingMessage): boolean {
    const host = (req.headers.host || '').toLowerCase();
    return host.startsWith('127.0.0.1:') || host.startsWith('localhost:');
  }

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;

    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderServePage());
      return;
    }

    // Scan data
    if (pathname === '/scan-data.json') {
      if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:7890' });
        res.end(data);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Run: mac-aicheck scan --serve' }));
      }
      return;
    }

    // Installer list
    if (pathname === '/api/installers') {
      const all = getInstallers();
      const payload = all.map(i => {
        return {
          id: i.id,
          name: i.name,
          description: i.description,
          icon: i.icon,
          needsAdmin: i.needsAdmin,
          installed: i.installed === undefined ? false : i.installed,
          cmd: i.cmd || '',
          type: i.type || 'manual',
        };
      });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:7890' });
      res.end(JSON.stringify(payload));
      return;
    }

    // Run install command (streaming SSE) - ID-only, no cmd from frontend
    if (pathname === '/api/run' && req.method === 'POST') {
      let body = '';
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY) { res.writeHead(413); res.end('Payload Too Large'); return; }
        body += chunk;
      });
      req.on('end', () => {
        let payload: { id: string; type: string };
        try { payload = JSON.parse(body); } catch { payload = {} as any; }
        const { id, type } = payload;

        // Security: validate ID against whitelist (prevents command injection)
        const entry = ALLOWED_COMMANDS[id || ''];
        if (!entry) {
          res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:7890' });
          res.end(JSON.stringify({ error: 'Unknown installer ID' }));
          return;
        }
        const cmd = entry.cmd;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': 'http://localhost:7890',
          'X-Accel-Buffering': 'no',
        });

        function send(data: object) {
          try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
        }

        send({ type: 'log', text: `> ${cmd}`, color: '#00f0ff' });

        if (type === 'manual') {
          send({ type: 'done', text: 'Please run the command above in your terminal.', ok: true });
          res.end();
          return;
        }

        const proc = spawn('bash', ['-c', `${cmd} 2>&1`], { stdio: ['pipe', 'pipe', 'pipe'] });

        proc.stdout?.on('data', (d: Buffer) => {
          for (const line of d.toString('utf-8').split('\n')) {
            const t = line.trim(); if (t) send({ type: 'out', text: t });
          }
        });
        proc.stderr?.on('data', (d: Buffer) => {
          for (const line of d.toString('utf-8').split('\n')) {
            const t = line.trim();
            if (t && !t.startsWith('npm warn')) send({ type: 'err', text: t });
          }
        });
        proc.on('close', (code) => {
          const ok = code === 0;
          send({ type: 'done', text: ok ? 'SUCCESS' : `FAILED (exit ${code})`, ok });
          res.end();
        });
        proc.on('error', (err) => {
          send({ type: 'err', text: `Error: ${err.message}` });
          send({ type: 'done', text: 'FAILED', ok: false });
          res.end();
        });
      });
      return;
    }

    if (pathname === '/api/fix' && req.method === 'POST') {
      let body = '';
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY) { res.writeHead(413); res.end('Payload Too Large'); return; }
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}') as { scannerId?: string; dryRun?: boolean };
          const scannerId = String(payload.scannerId || '').trim();
          if (!scannerId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'scannerId required' }));
            return;
          }

          const result = await fixAll({ dryRun: Boolean(payload.dryRun), scannerIds: [scannerId] });
          const fixEntry = result.results[0];
          if (!fixEntry) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `No fixer available for ${scannerId}` }));
            return;
          }

          const refreshedResults = await scanAll();
          const refreshedScore = calculateScore(refreshedResults);
          const refreshedPayload = createPayload(refreshedResults, refreshedScore);
          persistServeData(refreshedScore, refreshedResults, refreshedPayload);

          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:7890' });
          res.end(JSON.stringify({
            ok: true,
            fixResult: fixEntry.fixResult || null,
            error: fixEntry.error || null,
            score: refreshedScore,
            results: refreshedResults,
          }));
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e?.message || '修复失败' }));
        }
      });
      return;
    }

    // Block all unknown /api/ routes (except stash, feedback, version-check, agent)
    if (pathname.startsWith('/api/') &&
        pathname !== '/api/fix' &&
        pathname !== '/api/stash' &&
        pathname !== '/api/feedback' &&
        pathname !== '/api/version-check' &&
        !pathname.startsWith('/api/agent')) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    // Security: agent routes only accessible from localhost (#38)
    if (pathname.startsWith('/api/agent') && !isLocalRequest(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Agent API only accessible from localhost' }));
      return;
    }

    // Agent Lite: 本地状态
    if (pathname === '/api/agent/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:7890' });
      res.end(JSON.stringify(getAgentLocalStatus()));
      return;
    }

    // Agent Lite: 安装本地 runner + hook
    if (pathname === '/api/agent/enable' && req.method === 'POST') {
      let body = '';
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY) { res.writeHead(413); res.end('Payload Too Large'); return; }
        body += chunk;
      });
      req.on('end', () => {
        let payload: { target?: string } = {};
        try { payload = JSON.parse(body); } catch { payload = { target: 'all' }; }
        const VALID_TARGETS = ['all', 'claude-code', 'openclaw'];
        const target = VALID_TARGETS.includes(payload.target || '') ? payload.target : 'all';
        const result = enableAgentExperience(target);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:7890' });
        res.end(JSON.stringify(result));
      });
      return;
    }

    // Agent Lite: 暂停上传
    if (pathname === '/api/agent/pause' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:7890' });
      res.end(JSON.stringify(pauseAgentUploads(true)));
      return;
    }

    // Agent Lite: 恢复上传
    if (pathname === '/api/agent/resume' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:7890' });
      res.end(JSON.stringify(pauseAgentUploads(false)));
      return;
    }

    // Agent Lite: 手动同步一次
    if (pathname === '/api/agent/sync' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:7890' });
      res.end(JSON.stringify(syncAgentEvents()));
      return;
    }

    // Version check endpoint
    if (pathname === '/api/version-check' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:7890' });
      res.end(JSON.stringify({ current: VERSION, latest: VERSION }));
      return;
    }

    // Stash proxy: MacAICheck → aicoevo.net
    if (pathname === '/api/stash' && req.method === 'POST') {
      let body = '';
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY) { res.writeHead(413); res.end('Payload Too Large'); return; }
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const result = await stashData(payload);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:7890' });
          res.end(JSON.stringify(result));
        } catch (e: any) {
          let detail = e.message || '未知错误';
          if (e.message && e.message.includes('API 错误:')) {
            detail = e.message.replace('API 错误: ', '');
          }
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: '无法连接 aicoevo.net: ' + detail }));
        }
      });
      return;
    }

    // Feedback proxy: MacAICheck → aicoevo.net
    if (pathname === '/api/feedback' && req.method === 'POST') {
      let body = '';
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BODY) { res.writeHead(413); res.end('Payload Too Large'); return; }
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const result = await submitFeedback(payload);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:7890' });
          res.end(JSON.stringify(result));
        } catch (e: any) {
          let detail = e.message || '未知错误';
          if (e.message && e.message.includes('API 错误:')) {
            detail = e.message.replace('API 错误: ', '');
          }
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: '无法提交反馈: ' + detail }));
        }
      });
      return;
    }

    // Static files with path traversal protection
    let filePath = path.join(WEB_DIR, pathname === '/' ? 'index.html' : pathname);
    // Resolve to absolute path before checking boundary (prevents symlink bypass)
    filePath = path.resolve(filePath);
    if (!filePath.startsWith(path.resolve(WEB_DIR))) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    const mime: Record<string, string> = {
      '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
      '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
    };
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(fs.readFileSync(filePath));
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n[*] MacAICheck v${VERSION} Web UI: http://localhost:${PORT}`);
    console.log(`    Ctrl+C to stop\n`);
    openUrl(`http://localhost:${PORT}`);
  });
}

async function runScan(serve: boolean, upload: boolean) {
  console.log(`[*] MacAICheck v${VERSION} scanning...\n`);
  const results = await scanAll();
  const score = calculateScore(results);
  // 保存本地 + 上报 aicoevo.net 获取认领 token
  const payload = createPayload(results, score);
  try {
    const localPath = saveLocal(payload);
    if (localPath) {
      console.log(`[+] 扫描结果已保存到本地: ${localPath}`);
    }

    if (upload) {
      stashData(payload)
        .then(({ token, claim_url }) => {
          const claimUrl = claim_url || buildClaimUrl(token);
          console.log('\n[+] 扫描结果已上传，请在浏览器打开认领你的环境报告:');
          console.log(`    ${claimUrl}\n`);
        })
        .catch((err) => {
          console.error('\n[-] 上传失败:', err instanceof Error ? err.message : String(err));
          console.error('    扫描结果已保存在本地，请检查网络后重新运行上传\n');
        });
    } else {
      console.log('[i] 默认不上传扫描结果。使用 --upload 或 mac-aicheck upload 获取认领链接。\n');
    }
  } catch (e) { console.error('[MacAICheck] 保存本地报告失败:', e instanceof Error ? e.message : String(e)); }
  const passed = results.filter(r => r.status === 'pass').length;
  const warn = results.filter(r => r.status === 'warn').length;
  const fail = results.filter(r => r.status === 'fail').length;

  console.log(`Score: ${score.score}/100 ${score.label}`);
  console.log(`Pass: ${passed}  Warn: ${warn}  Fail: ${fail}\n`);

  if (serve) {
    // 保存完整数据供 Web UI 和社区功能使用
    persistServeData(score, results, payload);
    serveHttp();
    return;
  }
  return { score, results };
}

const args = process.argv.slice(2);
const upload = shouldUploadScan(args);
if (args.includes('--serve') || args.includes('--web')) {
  runScan(true, upload).catch(console.error);
} else if (args.includes('--json')) {
  runScan(false, upload).then(r => { if (r) console.log(JSON.stringify(r, null, 2)); }).catch(console.error);
} else if (args.includes('--help')) {
  console.log('MacAICheck - AI Dev Environment Checker\nUsage:\n  mac-aicheck           Run diagnosis (local only)\n  mac-aicheck --upload  Run diagnosis and upload for claim link\n  mac-aicheck upload    Upload-enabled diagnosis shortcut\n  mac-aicheck --serve   Start Web UI\n  mac-aicheck --json    JSON output\n  mac-aicheck agent     Agent Lite commands (enable/install-hook/sync, etc.)');
} else if (args.includes('agent')) {
  // Agent Lite CLI 子命令
  const agentArgs = args.slice(args.indexOf('agent') + 1);
  const { spawn: spawnAsync } = require('child_process');
  const agentCmd = path.join(__dirname, '../bin/mac-aicheck-agent');
  const proc = spawnAsync('bash', [agentCmd, ...agentArgs], { stdio: 'inherit' });
  proc.on('close', (code: number | null) => { process.exitCode = code ?? 0; });
} else if (args.includes('upload')) {
  runScan(false, true).catch(console.error);
} else if (args.includes('fix')) {
  const dryRun = args.includes('--dry-run');
  const riskLevel = args.includes('--green') ? 'green' :
                    args.includes('--yellow') ? 'yellow' :
                    args.includes('--red') ? 'red' : undefined;

  console.log('[*] MacAICheck fixing...\n');
  if (dryRun) console.log('[DRY RUN] No changes will be made.\n');

  fixAll({ dryRun, riskLevel }).then(result => {
    console.log(`Total: ${result.total}  Attempted: ${result.attempted}  Succeeded: ${result.succeeded}  Failed: ${result.failed}\n`);

    for (const r of result.results) {
      if (r.fixResult) {
        const icon = r.fixResult.success ? '[+]' : '[-]';
        const fixer = r.fixerId ? getFixerById(r.fixerId) : undefined;
        const riskTag = fixer ? `[${fixer.risk.toUpperCase()}] ` : '';
        const fixerName = fixer ? ` (${fixer.name})` : '';
        console.log(`${icon} ${riskTag}${r.scannerId}${fixerName}: ${r.fixResult.message}`);

        if (fixer) {
          const verificationCmd = fixer?.getVerificationCommand?.();
          if (verificationCmd) {
            const cmds = Array.isArray(verificationCmd) ? verificationCmd : [verificationCmd];
            console.log('    验证命令:');
            cmds.forEach(cmd => console.log(`      ${cmd}`));
          }
        }

        if (r.fixResult.nextSteps?.length) {
          for (const step of r.fixResult.nextSteps) {
            console.log(`    -> ${step}`);
          }
        }
      } else if (r.error) {
        console.log(`[-] ${r.scannerId}: ERROR - ${r.error}`);
      }
    }
  }).catch(console.error);
} else {
  runScan(false, false).catch(console.error);
}
