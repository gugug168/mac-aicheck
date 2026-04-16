"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkGpu = exports.SCANNER_CATEGORIES = exports.getScannerByCategory = exports.getScanners = void 0;
exports.scanAll = scanAll;
exports.scanCategory = scanCategory;
exports.calculateScore = calculateScore;
const registry_1 = require("./registry");
require("./git");
require("./node-version");
require("./node-manager");
require("./python-versions");
require("./npm-mirror");
require("./proxy-config");
require("./apple-silicon");
require("./homebrew");
require("./developer-mode");
require("./screen-permission");
require("./claude-code");
require("./gemini-cli");
require("./openclaw");
require("./xcode");
require("./rosetta");
require("./ssl-certs");
require("./dns-resolution");
require("./git-identity-config");
require("./admin-perms");
require("./gpu-monitor");
require("./ccswitch");
require("./claude-cli");
require("./claude-config-health");
require("./cpp-compiler");
require("./cuda-version");
require("./env-path-length");
require("./firewall-ports");
require("./git-credential-health");
require("./git-path");
require("./gpu-driver");
require("./long-paths");
require("./mcp-command-availability");
require("./mcp-config-health");
require("./mirror-sources");
require("./node-global-bin-path");
require("./node-manager-conflict");
require("./openclaw-config-health");
require("./package-managers");
require("./path-chinese");
require("./path-spaces");
require("./powershell-policy");
require("./powershell-version");
require("./python-env-alignment");
require("./python-project-venv");
require("./shell-encoding-health");
require("./site-reachability");
require("./temp-space");
require("./terminal-profile-health");
require("./time-sync");
require("./unix-commands");
require("./uv-package-manager");
require("./virtualization");
require("./vram-usage");
require("./wsl-version");
var registry_2 = require("./registry");
Object.defineProperty(exports, "getScanners", { enumerable: true, get: function () { return registry_2.getScanners; } });
Object.defineProperty(exports, "getScannerByCategory", { enumerable: true, get: function () { return registry_2.getScannerByCategory; } });
Object.defineProperty(exports, "SCANNER_CATEGORIES", { enumerable: true, get: function () { return registry_2.SCANNER_CATEGORIES; } });
var gpu_monitor_1 = require("./gpu-monitor");
Object.defineProperty(exports, "checkGpu", { enumerable: true, get: function () { return gpu_monitor_1.checkGpu; } });
async function scanAll() {
    const scanners = (0, registry_1.getScanners)();
    const results = await Promise.all(scanners.map(s => scanWithTimeout(s, 30_000)));
    return results;
}
async function scanWithTimeout(scanner, ms) {
    return Promise.race([
        scanner.scan(),
        new Promise(resolve => setTimeout(() => resolve({
            id: scanner.id,
            name: scanner.name,
            category: scanner.category,
            status: 'unknown',
            message: `扫描超时（${ms / 1000}s），跳过`,
        }), ms)),
    ]);
}
async function scanCategory(category) {
    const scanners = (0, registry_1.getScannerByCategory)(category);
    return Promise.all(scanners.map(s => s.scan()));
}
function calculateScore(results) {
    if (results.length === 0)
        return 0;
    let total = 0;
    for (const r of results) {
        if (r.status === 'pass')
            total += 100;
        else if (r.status === 'warn')
            total += 60;
    }
    return Math.round(total / results.length);
}
