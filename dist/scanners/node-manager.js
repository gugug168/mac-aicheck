"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'node-manager-conflict',
    name: 'Node 版本管理器冲突',
    category: 'toolchain',
    async scan() {
        const hasNvm = (0, index_1.commandExists)('nvm') || (0, index_1.runCommand)('ls ~/.nvm 2>/dev/null && echo exists', 3000).stdout.includes('exists');
        const hasFnm = (0, index_1.commandExists)('fnm') || (0, index_1.runCommand)('ls ~/.fnm 2>/dev/null && echo exists', 3000).stdout.includes('exists');
        const conflicts = [];
        if (hasNvm)
            conflicts.push('nvm');
        if (hasFnm)
            conflicts.push('fnm');
        if (conflicts.length === 0) {
            return { id: this.id, name: this.name, category: this.category, status: 'pass',
                message: '未检测到 Node 版本管理器冲突' };
        }
        if (conflicts.length === 1) {
            return { id: this.id, name: this.name, category: this.category, status: 'pass',
                message: `${conflicts[0]} 单一版本管理器，无冲突` };
        }
        return { id: this.id, name: this.name, category: this.category, status: 'warn',
            message: `检测到多个 Node 版本管理器: ${conflicts.join(', ')}，可能导致 node/npm 路径混乱，建议保留一个` };
    },
};
(0, registry_1.registerScanner)(scanner);
