"use strict";
/**
 * HTML 报告生成器
 * 对标 WinAICheck src/report/html.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHtmlReport = generateHtmlReport;
const render_1 = require("../web/render");
const CATEGORY_LABELS = {
    brew: 'Homebrew 生态',
    apple: 'macOS 平台特性',
    toolchain: '核心工具链',
    'ai-tools': 'AI 工具链',
    network: '网络与镜像',
    permission: '权限与安全',
    system: '系统硬件',
};
const STATUS_COLORS = {
    pass: '#22c55e',
    warn: '#eab308',
    fail: '#ef4444',
    unknown: '#94a3b8',
};
const STATUS_ICONS = {
    pass: '✓',
    warn: '⚠',
    fail: '✗',
    unknown: '?',
};
function generateHtmlReport(results, score) {
    const scoreData = (0, render_1.renderScoreWithTrend)(score);
    const grouped = new Map();
    for (const r of results) {
        const list = grouped.get(r.category) || [];
        list.push(r);
        grouped.set(r.category, list);
    }
    const categoriesHtml = [...grouped.entries()].map(([cat, items]) => {
        const label = CATEGORY_LABELS[cat] || cat;
        const passed = items.filter(r => r.status === 'pass').length;
        const total = items.filter(r => r.status !== 'unknown').length;
        const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
        const itemsHtml = items.map(r => `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td style="color:${STATUS_COLORS[r.status]}">${STATUS_ICONS[r.status]} ${r.status.toUpperCase()}</td>
        <td>${escapeHtml(r.message)}</td>
      </tr>`).join('\n');
        return `
    <div class="category">
      <h3>${label} <span class="badge">${passed}/${total} 通过</span></h3>
      <table>
        <thead><tr><th>检测项</th><th>状态</th><th>说明</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>`;
    }).join('\n');
    const gradeColor = score.score >= 90 ? '#22c55e' : score.score >= 70 ? '#3b82f6' : score.score >= 50 ? '#eab308' : '#ef4444';
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MacAICheck - AI 开发环境诊断报告</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { text-align: center; font-size: 1.8rem; margin-bottom: 0.5rem; color: #f8fafc; }
  .subtitle { text-align: center; color: #64748b; margin-bottom: 2rem; font-size: 0.9rem; }
  .score-card { text-align: center; background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #334155; border-radius: 16px; padding: 2rem; margin-bottom: 2rem; }
  .score-head { display: flex; align-items: center; justify-content: center; gap: 1.25rem; flex-wrap: wrap; }
  .score-main { min-width: 180px; }
  .score-number { font-size: 5rem; font-weight: bold; color: ${gradeColor}; line-height: 1; }
  .score-label { font-size: 1.2rem; color: #94a3b8; margin-top: 0.5rem; }
  .score-trend { min-width: 150px; text-align: left; padding: 0.9rem 1rem; border-radius: 12px; border: 1px solid #334155; background: rgba(15, 23, 42, 0.65); }
  .score-trend-title { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; }
  .score-trend-value { margin-top: 0.45rem; font-size: 1.6rem; font-weight: 700; }
  .score-trend-prev { display: inline-flex; margin-top: 0.55rem; padding: 0.2rem 0.55rem; border-radius: 999px; background: #1e293b; border: 1px solid #334155; font-size: 0.78rem; color: #cbd5e1; }
  .breakdown { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; margin-top: 1.5rem; }
  .breakdown-item { background: #1e293b; border: 1px solid #334155; padding: 0.4rem 0.9rem; border-radius: 8px; font-size: 0.85rem; }
  .category { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; }
  .category h3 { margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; color: #f8fafc; }
  .badge { background: #334155; padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.8rem; color: #94a3b8; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 0.6rem 0.8rem; border-bottom: 1px solid #334155; color: #64748b; font-size: 0.8rem; font-weight: normal; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 0.6rem 0.8rem; border-bottom: 1px solid #1e293b; font-size: 0.9rem; }
  tr:last-child td { border-bottom: none; }
  .footer { text-align: center; color: #475569; margin-top: 2rem; font-size: 0.8rem; }
  .footer a { color: #60a5fa; text-decoration: none; }
</style>
</head>
<body>
<div class="container">
  <h1>MacAICheck AI 开发环境诊断报告</h1>
  <p class="subtitle">生成时间: ${new Date().toLocaleString('zh-CN')} · 共 ${results.length} 项检测</p>

  <div class="score-card">
    <div class="score-head">
      <div class="score-main">
        <div class="score-number">${score.score}</div>
        <div class="score-label">${score.label}</div>
      </div>
      ${scoreData.trend ? `
      <div class="score-trend">
        <div class="score-trend-title">vs上次</div>
        <div class="score-trend-value" style="color:${scoreData.trend.color}">${scoreData.trend.arrow} ${scoreData.trend.deltaLabel}</div>
        <div class="score-trend-prev">上次: ${scoreData.trend.prevScore}</div>
      </div>` : ''}
    </div>
    <div class="breakdown">
      ${score.breakdown.map(b => `<div class="breakdown-item">${CATEGORY_LABELS[b.category] || b.category}: ${b.passed}/${b.total}</div>`).join('\n')}
    </div>
  </div>

  ${categoriesHtml}

  <div class="footer">
    <p>由 <a href="https://github.com/gugug168/mac-aicheck">MacAICheck</a> 生成 · macOS AI 开发环境检测工具</p>
  </div>
</div>
</body>
</html>`;
}
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
