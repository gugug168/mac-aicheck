"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'ssl-certs',
    name: 'SSL 证书',
    category: 'network',
    async scan() {
        // Mac: 通过 curl 测试 SSL 握手，检测系统 CA 证书是否正常
        const result = (0, index_1.runCommand)('curl -s --connect-timeout 5 -o /dev/null -w "%{http_code}" https://github.com 2>/dev/null || echo "FAIL"', 10000);
        const httpCode = result.stdout.trim();
        if (httpCode === '200' || httpCode === '301' || httpCode === '302') {
            return { id: this.id, name: this.name, category: this.category, status: 'pass',
                message: `SSL 证书正常（github.com HTTPS 正常, HTTP ${httpCode}）` };
        }
        return { id: this.id, name: this.name, category: this.category, status: 'fail',
            message: `SSL 证书异常（github.com 返回 ${httpCode}）` };
    },
};
(0, registry_1.registerScanner)(scanner);
