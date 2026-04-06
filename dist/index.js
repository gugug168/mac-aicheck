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
const commander_1 = require("commander");
const scanners_1 = require("./scanners");
const aicoevo_client_1 = require("./api/aicoevo-client");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const program = new commander_1.Command();
program
    .name('mac-aicheck')
    .description('macOS AI 开发环境检测工具')
    .version('1.0.0');
program
    .command('scan')
    .description('执行全量扫描')
    .option('--json', '输出 JSON 格式')
    .option('--upload', '扫描后上传到 AICO EVO')
    .action(async (opts) => {
    console.log('🔍 MacAICheck 扫描中...\n');
    const results = await (0, scanners_1.scanAll)();
    const score = (0, scanners_1.calculateScore)(results);
    if (opts.json) {
        console.log(JSON.stringify({ score, results }, null, 2));
    }
    else {
        printReport(results, score);
    }
    if (opts.upload) {
        await doUpload(score, results);
    }
});
program
    .command('upload')
    .description('上传扫描结果到 AICO EVO')
    .action(async () => {
    const results = await (0, scanners_1.scanAll)();
    const score = (0, scanners_1.calculateScore)(results);
    await doUpload(score, results);
});
async function doUpload(score, results) {
    try {
        const version = require('child_process').execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim();
        const arch = require('os').arch();
        const platform = { os: 'darwin', version, arch };
        await (0, aicoevo_client_1.saveFingerprint)({ score, results, platform, timestamp: new Date().toISOString() });
        console.log('\n✅ 已上传到 AICO EVO');
    }
    catch (err) {
        console.error('\n❌ 上传失败:', err.message);
    }
}
function printReport(results, score) {
    console.log(`总分: ${score}/100\n`);
    const cats = ['brew', 'apple', 'toolchain', 'ai-tools', 'network'];
    for (const cat of cats) {
        const items = results.filter((r) => r.category === cat);
        if (items.length === 0)
            continue;
        console.log(`[${cat}]`);
        for (const r of items) {
            const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
            console.log(`  ${icon} ${r.name}: ${r.message}`);
        }
        console.log('');
    }
}
program.parse();
