/**
 * Web UI 数据渲染模块 — 只负责 JS 数据注入
 */
import type { ScanResult } from '../scanners/types';
import type { ScoreResult } from '../scoring/calculator';

export function renderScoreData(score: ScoreResult) {
  const passed = score.breakdown.reduce((s, b) => s + b.passed, 0);
  const total = score.breakdown.reduce((s, b) => s + b.total, 0);
  return { score, passed, total };
}

export function groupByCategory(results: ScanResult[]) {
  const cats = ['toolchain', 'ai-tools', 'brew', 'network', 'apple', 'permission'];
  return cats.map(cat => ({ cat, items: results.filter(r => r.category === cat) })).filter(g => g.items.length > 0);
}

export const FIX_DEFS = [
  { id:'fix-git-identity', scanner:'git-identity-config', tier:'yellow', name:'配置 Git 全局身份', desc:'设置 user.name 和 user.email', cmd:'git config --global user.name "Your Name" && git config --global user.email "you@example.com"' },
  { id:'fix-rosetta', scanner:'apple-silicon', tier:'green', name:'安装 Rosetta 2', desc:'让 x86 软件在 Apple Silicon 上运行', cmd:'softwareupdate --install-rosetta --agree-to-license' },
  { id:'fix-npm-mirror', scanner:'npm-mirror', tier:'green', name:'配置 npm 国内镜像', desc:'切换到 npmmirror.com 加速', cmd:'npm config set registry https://registry.npmmirror.com' },
  { id:'fix-dev-mode', scanner:'developer-mode', tier:'yellow', name:'开启开发者模式', desc:'重启 Mac，在恢复模式操作', cmd:'' },
  { id:'fix-screen-perm', scanner:'screen-permission', tier:'red', name:'授予屏幕录制权限', desc:'系统设置 → 隐私与安全性 → 屏幕录制', cmd:'' },
];

export const TIER_CFG: Record<string, {title:string;color:string;bg:string;border:string;btnLabel:string}> = {
  green:  { title:'立即处理', color:'#22c55e', bg:'rgba(34,197,94,.06)', border:'rgba(34,197,94,.2)', btnLabel:'立即执行' },
  yellow: { title:'建议处理', color:'#eab308', bg:'rgba(234,179,8,.06)', border:'rgba(234,179,8,.2)', btnLabel:'确认执行' },
  red:    { title:'手动处理', color:'#f97316', bg:'rgba(249,115,22,.06)', border:'rgba(249,115,22,.2)', btnLabel:'查看指引' },
  black:  { title:'可选优化', color:'#94a3b8', bg:'rgba(148,163,184,.06)', border:'rgba(148,163,184,.15)', btnLabel:'查看建议' },
};
