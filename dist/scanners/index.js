"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCANNER_CATEGORIES = exports.getScannerByCategory = exports.getScanners = void 0;
exports.scanAll = scanAll;
exports.scanCategory = scanCategory;
exports.calculateScore = calculateScore;
const registry_1 = require("./registry");
// 动态导入所有 scanner 文件，触发 registerScanner
// 不要删除任何 import 行，删了 scanner 就不会被注册
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
var registry_2 = require("./registry");
Object.defineProperty(exports, "getScanners", { enumerable: true, get: function () { return registry_2.getScanners; } });
Object.defineProperty(exports, "getScannerByCategory", { enumerable: true, get: function () { return registry_2.getScannerByCategory; } });
Object.defineProperty(exports, "SCANNER_CATEGORIES", { enumerable: true, get: function () { return registry_2.SCANNER_CATEGORIES; } });
/** 并行扫描所有注册的 scanner */
async function scanAll() {
    const scanners = (0, registry_1.getScanners)();
    const results = await Promise.all(scanners.map(s => s.scan()));
    return results;
}
/** 按分类扫描 */
async function scanCategory(category) {
    const scanners = (0, registry_1.getScannerByCategory)(category);
    return Promise.all(scanners.map(s => s.scan()));
}
/** 计算综合评分 0-100 */
function calculateScore(results) {
    if (results.length === 0)
        return 0;
    let total = 0;
    for (const r of results) {
        if (r.status === 'pass')
            total += 100;
        else if (r.status === 'warn')
            total += 60;
        // fail = 0
    }
    return Math.round(total / results.length);
}
