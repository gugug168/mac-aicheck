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

export const INSTALLERS = [
  { id:'claude-code', icon:'🤖', name:'Claude Code', desc:'Anthropic AI 编程工具，Mac 开发首选', cmd:'npm install -g @anthropic-ai/claude-code --registry=https://registry.npmmirror.com' },
  { id:'gemini-cli', icon:'✨', name:'Gemini CLI', desc:'Google AI CLI，支持 Gemini 2.0 全模态', cmd:'npm install -g @google/gemini-cli --registry=https://registry.npmmirror.com' },
  { id:'homebrew', icon:'🍺', name:'Homebrew', desc:'macOS 必备包管理器', cmd:"/bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"" },
  { id:'openclaw', icon:'🦀', name:'OpenClaw', desc:'开源 AI 助手，支持飞书/Discord 多平台', cmd:'npm install -g openclaw --registry=https://registry.npmmirror.com' },
  { id:'xcode-clt', icon:'🔧', name:'Xcode CLT', desc:'Xcode Command Line Tools', cmd:'xcode-select --install' },
];

export const CODING_PLANS = [
  { icon:'🧠', name:'智谱 GLM Coding Plan', url:'https://www.bigmodel.cn/glm-coding', desc:'GLM-5.1，¥20起/月，按次数计费' },
  { icon:'☁️', name:'阿里云百炼 Coding Plan', url:'https://www.aliyun.com/benefit/scene/codingplan', desc:'通义+Kimi+GLM，首月¥7.9' },
  { icon:'🌋', name:'火山方舟 Coding Plan', url:'https://www.volcengine.com/docs/82379/1925114', desc:'豆包+GLM+DeepSeek+Kimi，¥9.9起/月' },
  { icon:'🌙', name:'Kimi Coding Plan', url:'https://www.kimi.com/code', desc:'Kimi K2.5 编程模型，会员权益含编程额度' },
  { icon:'🎯', name:'MiniMax Token Plan', url:'https://platform.minimaxi.com/docs/token-plan/promotion', desc:'M2.5 全模态订阅，编程+生图+语音' },
  { icon:'🌤️', name:'腾讯云 Coding Plan', url:'https://cloud.tencent.com/act/pro/codingplan', desc:'混元+GLM-5+Kimi，首月¥7.9' },
  { icon:'🚀', name:'无问芯穹 Infini', url:'https://cloud.infini-ai.com/', desc:'聚合多家顶尖编程模型，¥40起/月' },
  { icon:'🐉', name:'百度千帆 Coding Plan', url:'https://cloud.baidu.com/product/codingplan.html', desc:'文心+多模型编程，首月¥40' },
];

export const API_PLANS = [
  { icon:'🧠', name:'智谱 BigModel', url:'https://open.bigmodel.cn/', desc:'GLM 系列 API' },
  { icon:'💬', name:'DeepSeek', url:'https://platform.deepseek.com/', desc:'R1/V3 API，夜间半价' },
  { icon:'🌙', name:'Kimi', url:'https://platform.kimi.com/', desc:'K2 系列 API' },
  { icon:'🎯', name:'MiniMax', url:'https://platform.minimaxi.com/', desc:'M2.5 全模态 API' },
];
