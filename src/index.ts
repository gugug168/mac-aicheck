#!/usr/bin/env node

import { Command } from 'commander';
import { scanAll } from './scanners';
import { calculateScore } from './scoring/calculator';
import { generateHtmlReport } from './report/html';
import { saveFingerprint } from './api/aicoevo-client';
import type { AICOEVOSaveRequest } from './api/aicoevo-client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const program = new Command();

program
  .name('mac-aicheck')
  .description('macOS AI 开发环境检测工具')
  .version('1.0.0');

program
  .command('scan')
  .description('执行全量扫描')
  .option('--json', '输出 JSON 格式')
  .option('--html [path]', '生成 HTML 报告，可指定输出路径')
  .option('--upload', '扫描后上传到 AICO EVO')
  .action(async (opts: { json?: boolean; html?: string | boolean; upload?: boolean }) => {
    console.log('🔍 MacAICheck 扫描中...\n');
    const results = await scanAll();
    const score = calculateScore(results);

    if (opts.json) {
      console.log(JSON.stringify({ score, results }, null, 2));
    } else {
      printReport(results, score);
    }

    if (opts.html !== undefined) {
      const html = generateHtmlReport(results, score);
      const outPath = typeof opts.html === 'string' ? opts.html : 'mac-aicheck-report.html';
      fs.writeFileSync(outPath, html, 'utf-8');
      console.log(`\n📄 HTML 报告已生成: ${outPath}`);
    }

    if (opts.upload) {
      await doUpload(score, results);
    }
  });

program
  .command('upload')
  .description('上传扫描结果到 AICO EVO')
  .action(async () => {
    const results = await scanAll();
    const score = calculateScore(results);
    await doUpload(score, results);
  });

async function doUpload(score: any, results: any[]) {
  try {
    const version = require('child_process').execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim();
    const arch = require('os').arch();
    const platform: AICOEVOSaveRequest['platform'] = { os: 'darwin', version, arch };
    await saveFingerprint({ score: score.score ?? score, results, platform, timestamp: new Date().toISOString() });
    console.log('\n✅ 已上传到 AICO EVO');
  } catch (err: any) {
    console.error('\n❌ 上传失败:', err.message);
  }
}

function printReport(results: any[], score: any) {
  const icon: Record<string, string> = { pass: '✅', warn: '⚠️', fail: '❌', unknown: '❓' };
  const label = score.label ?? '未知';
  console.log(`总分: ${score.score}/100 (${label})\n`);
  const cats = ['brew', 'apple', 'toolchain', 'ai-tools', 'network', 'permission'];
  for (const cat of cats) {
    const items = results.filter((r: any) => r.category === cat);
    if (items.length === 0) continue;
    const passed = items.filter((r: any) => r.status === 'pass').length;
    console.log(`[${cat}] ${passed}/${items.length} 通过`);
    for (const r of items) {
      console.log(`  ${icon[r.status] ?? '❓'} ${r.name}: ${r.message}`);
    }
    console.log('');
  }
}

program.parse();
