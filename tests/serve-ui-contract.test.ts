import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('serve ui contract', () => {
  it('includes quick navigation and clearer next-step guidance', () => {
    const source = readFileSync(path.join(__dirname, '../src/index.ts'), 'utf8');

    expect(source).toContain('后续路线');
    expect(source).toContain("scrollToSection('summary')");
    expect(source).toContain("scrollToSection('route')");
    expect(source).toContain("scrollToSection('issues')");
    expect(source).toContain("scrollToSection('feedback')");
    expect(source).toContain('点击定位到对应修复项');
    expect(source).toContain('接入 aicoevo 持续优化');
    expect(source).toContain('点击后会先弹出确认，再执行修复。');
    expect(source).toContain('点击后会先看说明，再确认执行。');
    expect(source).toContain('将先执行该修复命令。确认继续？');
    expect(source).toContain('已确认，开始执行修复。');
  });
});
