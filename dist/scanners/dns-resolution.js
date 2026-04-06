"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'dns-resolution',
    name: 'DNS 解析',
    category: 'network',
    async scan() {
        // 测试常用域名解析速度
        const sites = ['github.com', 'google.com', 'npmjs.org'];
        const results = [];
        const checks = sites.map(async (site) => {
            const t0 = Date.now();
            const { exitCode } = (0, index_1.runCommand)(`nslookup ${site} 2>/dev/null | head -5`, 5000);
            const ms = Date.now() - t0;
            return `${site}:${exitCode === 0 ? ms + 'ms' : 'FAIL'}`;
        });
        const resolved = await Promise.all(checks);
        results.push(...resolved);
        const failures = results.filter(r => r.includes('FAIL'));
        if (failures.length > 0) {
            return { id: this.id, name: this.name, category: this.category, status: 'fail',
                message: `DNS 解析失败: ${failures.join(', ')}` };
        }
        const avg = results.filter(r => !r.includes('FAIL')).map(r => parseInt(r.split(':')[1])).reduce((a, b) => a + b, 0) / results.filter(r => !r.includes('FAIL')).length;
        return { id: this.id, name: this.name, category: this.category, status: 'pass',
            message: `DNS 解析正常 (avg ${Math.round(avg)}ms)` };
    },
};
(0, registry_1.registerScanner)(scanner);
