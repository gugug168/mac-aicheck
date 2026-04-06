"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'npm-mirror',
    name: 'npm 镜像源',
    category: 'network',
    async scan() {
        const { stdout } = (0, index_1.runCommand)('npm config get registry', 5000);
        const registry = stdout.trim();
        const isChina = registry.includes('npmmirror.com') ||
            registry.includes('taobao.org') ||
            registry.includes('cnpm');
        const isOffical = registry === 'https://registry.npmjs.org/';
        if (isOffical) {
            return { id: this.id, name: this.name, category: this.category, status: 'pass',
                message: 'npm 使用官方源 (registry.npmjs.org)' };
        }
        if (isChina) {
            return { id: this.id, name: this.name, category: this.category, status: 'pass',
                message: `npm 使用国内镜像: ${registry}` };
        }
        return { id: this.id, name: this.name, category: this.category, status: 'warn',
            message: `npm 使用非标准源: ${registry}` };
    },
};
(0, registry_1.registerScanner)(scanner);
