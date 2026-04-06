#!/usr/bin/env node

import { Command } from 'commander';
import { scanAll, calculateScore } from './scanners';
import { saveFingerprint, type AICOEVOSaveRequest } from './api/aicoevo-client';
import * as dotenv from 'dotenv';

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
  .option('--upload', '扫描后上传到 AICO EVO')
  .action(async (opts: { json?: boolean; upload?: boolean }) => {
    console.log('🔍 MacAICheck 扫描中...\n');
    const results = await scanAll();
    const score = calculateScore(results);

    if (opts.json) {
      console.log(JSON.stringify({ score, results }, null, 2));
    } else {
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
    const results = await scanAll();
    const score = calculateScore(results);
    await doUpload(score, results);
  });

async function doUpload(score: number, results: any[]) {
  try {
    const version = require('child_process').execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim();
    const arch = require('os').arch();
    const platform: AICOEVOSaveRequest['platform'] = { os: 'darwin', version, arch };
    await saveFingerprint({ score, results, platform, timestamp: new Date().toISOString() });
    console.log('\n✅ 已上传到 AICO EVO');
  } catch (err: any) {
    console.error('\n❌ 上传失败:', err.message);
  }
}

function printReport(results: any[], score: number) {
  console.log(`总分: ${score}/100\n`);
  const cats = ['brew', 'apple', 'toolchain', 'ai-tools', 'network'];
  for (const cat of cats) {
    const items = results.filter((r: any) => r.category === cat);
    if (items.length === 0) continue;
    console.log(`[${cat}]`);
    for (const r of items) {
      const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
      console.log(`  ${icon} ${r.name}: ${r.message}`);
    }
    console.log('');
  }
}

program.parse();
