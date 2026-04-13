#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./scanners/index");
const index_2 = require("./fixers/index");
const calculator_1 = require("./scoring/calculator");
const aicoevo_client_1 = require("./api/aicoevo-client");
const index_3 = require("./installers/index");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const child_process_1 = require("child_process");
const MAX_BODY = 1024 * 1024;
const PORT = 7890;
const WEB_DIR = path.join(__dirname, '../dist/web');
const DATA_FILE = path.join(WEB_DIR, 'scan-data.json');
function gc(s) { return s >= 90 ? '#22c55e' : s >= 70 ? '#3b82f6' : s >= 50 ? '#eab308' : '#ef4444'; }
// Security: whitelisted installer commands only (NEVER trust frontend with arbitrary cmd)
const ALLOWED_COMMANDS = {
    'claude-code': { cmd: 'npm install -g @anthropic-ai/claude-code --registry=https://registry.npmmirror.com' },
    'openclaw': { cmd: 'npm install -g openclaw --registry=https://registry.npmmirror.com' },
    'gemini-cli': { cmd: 'npm install -g @google/gemini-cli --registry=https://registry.npmmirror.com' },
    'opencode': { cmd: 'npm install -g opencode-ai --registry=https://registry.npmjs.org' },
    'ccswitch': { cmd: 'npm install -g ccswitch --registry=https://registry.npmjs.org' },
    'cute-claude-hooks': { cmd: 'npm install -g cute-claude-hooks --registry=https://registry.npmmirror.com' },
    'xcode-clt': { cmd: 'xcode-select --install' },
    'gh-copilot': { cmd: 'gh copilot' },
};
function serveHttp() {
    const server = http.createServer((req, res) => {
        const pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
        // Scan data
        if (pathname === '/scan-data.json') {
            if (fs.existsSync(DATA_FILE)) {
                const data = fs.readFileSync(DATA_FILE, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'null' });
                res.end(data);
            }
            else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Run: mac-aicheck scan --serve' }));
            }
            return;
        }
        // Installer list
        if (pathname === '/api/installers') {
            const all = (0, index_3.getInstallers)();
            const payload = all.map(i => {
                const allowed = ALLOWED_COMMANDS[i.id];
                return {
                    id: i.id,
                    name: i.name,
                    description: i.description,
                    icon: i.icon,
                    needsAdmin: i.needsAdmin,
                    installed: i.installed === undefined ? false : i.installed,
                    cmd: allowed ? allowed.cmd : '',
                    type: allowed ? (i.id === 'gh-copilot' ? 'manual' : i.id === 'xcode-clt' ? 'gui' : 'npm') : 'manual',
                };
            });
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'null' });
            res.end(JSON.stringify(payload));
            return;
        }
        // Run install command (streaming SSE) - ID-only, no cmd from frontend
        if (pathname === '/api/run' && req.method === 'POST') {
            let body = '';
            let size = 0;
            req.on('data', chunk => {
                size += chunk.length;
                if (size > MAX_BODY) {
                    res.writeHead(413);
                    res.end('Payload Too Large');
                    return;
                }
                body += chunk;
            });
            req.on('end', () => {
                let payload;
                try {
                    payload = JSON.parse(body);
                }
                catch {
                    payload = {};
                }
                const { id, type } = payload;
                // Security: validate ID against whitelist (prevents command injection)
                const entry = ALLOWED_COMMANDS[id || ''];
                if (!entry) {
                    res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'null' });
                    res.end(JSON.stringify({ error: 'Unknown installer ID' }));
                    return;
                }
                const cmd = entry.cmd;
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': 'null',
                    'X-Accel-Buffering': 'no',
                });
                function send(data) {
                    try {
                        res.write(`data: ${JSON.stringify(data)}\n\n`);
                    }
                    catch { }
                }
                send({ type: 'log', text: `> ${cmd}`, color: '#00f0ff' });
                if (type === 'manual') {
                    send({ type: 'done', text: 'Please run the command above in your terminal.', ok: true });
                    res.end();
                    return;
                }
                const proc = (0, child_process_1.spawn)('bash', ['-c', `${cmd} 2>&1`], { stdio: ['pipe', 'pipe', 'pipe'] });
                proc.stdout?.on('data', (d) => {
                    for (const line of d.toString('utf-8').split('\n')) {
                        const t = line.trim();
                        if (t)
                            send({ type: 'out', text: t });
                    }
                });
                proc.stderr?.on('data', (d) => {
                    for (const line of d.toString('utf-8').split('\n')) {
                        const t = line.trim();
                        if (t && !t.startsWith('npm warn'))
                            send({ type: 'err', text: t });
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
        // Block all unknown /api/ routes (except stash and feedback)
        if (pathname.startsWith('/api/') && pathname !== '/api/stash' && pathname !== '/api/feedback') {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        // Stash proxy: MacAICheck → aicoevo.net
        if (pathname === '/api/stash' && req.method === 'POST') {
            let body = '';
            let size = 0;
            req.on('data', chunk => {
                size += chunk.length;
                if (size > MAX_BODY) {
                    res.writeHead(413);
                    res.end('Payload Too Large');
                    return;
                }
                body += chunk;
            });
            req.on('end', async () => {
                try {
                    const payload = JSON.parse(body);
                    const result = await (0, aicoevo_client_1.stashData)(payload);
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'null' });
                    res.end(JSON.stringify(result));
                }
                catch (e) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '无法连接 aicoevo.net: ' + e.message }));
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
                if (size > MAX_BODY) {
                    res.writeHead(413);
                    res.end('Payload Too Large');
                    return;
                }
                body += chunk;
            });
            req.on('end', async () => {
                try {
                    const payload = JSON.parse(body);
                    const result = await (0, aicoevo_client_1.submitFeedback)(payload);
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'null' });
                    res.end(JSON.stringify(result));
                }
                catch (e) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: '无法提交反馈: ' + e.message }));
                }
            });
            return;
        }
        // Static files with path traversal protection
        let filePath = path.join(WEB_DIR, pathname === '/' ? 'index.html' : pathname);
        if (!filePath.startsWith(WEB_DIR)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        if (!fs.existsSync(filePath))
            filePath = path.join(WEB_DIR, 'index.html');
        const ext = path.extname(filePath);
        const mime = {
            '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
            '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
        };
        res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
        res.end(fs.readFileSync(filePath));
    });
    server.listen(PORT, '127.0.0.1', () => {
        console.log(`\n[*] Web UI: http://localhost:${PORT}`);
        console.log(`    Ctrl+C to stop\n`);
        require('child_process').spawn('open', [`http://localhost:${PORT}`], { detached: true, stdio: 'ignore' }).unref();
    });
}
async function runScan(serve) {
    console.log('[*] MacAICheck scanning...\n');
    const results = await (0, index_1.scanAll)();
    const score = (0, calculator_1.calculateScore)(results);
    // 保存本地 + 上报 AICO EVO
    const payload = (0, aicoevo_client_1.createPayload)(results, score);
    try {
        (0, aicoevo_client_1.saveLocal)(payload);
        (0, aicoevo_client_1.saveFingerprint)(payload).catch(() => { }); // non-blocking
    }
    catch (e) { /* ignore */ }
    const passed = results.filter(r => r.status === 'pass').length;
    const warn = results.filter(r => r.status === 'warn').length;
    const fail = results.filter(r => r.status === 'fail').length;
    console.log(`Score: ${score.score}/100 ${score.label}`);
    console.log(`Pass: ${passed}  Warn: ${warn}  Fail: ${fail}\n`);
    if (serve) {
        // 保存完整数据供 Web UI 和社区功能使用
        const data = JSON.stringify({ score, results, payload }, null, 2);
        if (!fs.existsSync(WEB_DIR))
            fs.mkdirSync(WEB_DIR, { recursive: true });
        fs.writeFileSync(DATA_FILE, data, 'utf-8');
        serveHttp();
        return;
    }
    return { score, results };
}
const args = process.argv.slice(2);
if (args.includes('--serve') || args.includes('--web')) {
    runScan(true).catch(console.error);
}
else if (args.includes('--json')) {
    runScan(false).then(r => { if (r)
        console.log(JSON.stringify(r, null, 2)); }).catch(console.error);
}
else if (args.includes('--help') || args.length === 0) {
    console.log('MacAICheck - AI Dev Environment Checker\nUsage:\n  mac-aicheck          Run diagnosis\n  mac-aicheck fix      Auto-fix detected issues\n  mac-aicheck fix --dry-run   Show what would be fixed\n  mac-aicheck --serve   Start Web UI\n  mac-aicheck --json    JSON output');
}
else if (args.includes('fix')) {
    const dryRun = args.includes('--dry-run');
    const riskLevel = args.includes('--green') ? 'green' :
        args.includes('--yellow') ? 'yellow' :
            args.includes('--red') ? 'red' : undefined;
    console.log('[*] MacAICheck fixing...\n');
    if (dryRun)
        console.log('[DRY RUN] No changes will be made.\n');
    (0, index_2.fixAll)({ dryRun, riskLevel }).then(result => {
        console.log(`Total: ${result.total}  Attempted: ${result.attempted}  Succeeded: ${result.succeeded}  Failed: ${result.failed}\n`);
        for (const r of result.results) {
            if (r.fixResult) {
                const icon = r.fixResult.success ? '[+]' : '[-]';
                console.log(`${icon} ${r.scannerId}: ${r.fixResult.message}`);
                // Display verification command if fixer provides one (D-21, PST-04)
                if (r.fixerId) {
                    const fixer = (0, index_2.getFixerById)(r.fixerId);
                    const verificationCmd = fixer?.getVerificationCommand?.();
                    if (verificationCmd) {
                        const cmds = Array.isArray(verificationCmd) ? verificationCmd : [verificationCmd];
                        console.log('    验证命令:');
                        cmds.forEach(cmd => console.log(`      ${cmd}`));
                    }
                }
                // Display nextSteps (now includes guidance from getGuidance) (D-14)
                if (r.fixResult.nextSteps?.length) {
                    for (const step of r.fixResult.nextSteps) {
                        console.log(`    -> ${step}`);
                    }
                }
            }
            else if (r.error) {
                console.log(`[-] ${r.scannerId}: ERROR - ${r.error}`);
            }
        }
    }).catch(console.error);
}
else {
    runScan(false).catch(console.error);
}
