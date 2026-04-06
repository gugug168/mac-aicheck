"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'proxy-config',
    name: '代理配置',
    category: 'network',
    async scan() {
        const httpProxy = (0, index_1.runCommand)('echo $HTTP_PROXY $HTTPS_PROXY $http_proxy $https_proxy | tr " " "\\n" | grep -v "^$" | head -5', 3000).stdout.trim();
        if (!httpProxy) {
            return { id: this.id, name: this.name, category: this.category, status: 'pass',
                message: '未检测到代理配置' };
        }
        const lines = httpProxy.split('\n').filter(Boolean);
        return { id: this.id, name: this.name, category: this.category, status: 'warn',
            message: `检测到代理: ${lines.join(', ')}` };
    },
};
(0, registry_1.registerScanner)(scanner);
