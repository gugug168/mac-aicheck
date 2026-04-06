"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'git-identity',
    name: 'Git 身份配置',
    category: 'toolchain',
    async scan() {
        const name = (0, index_1.runCommand)('git config --global user.name 2>/dev/null || echo ""', 3000).stdout.trim();
        const email = (0, index_1.runCommand)('git config --global user.email 2>/dev/null || echo ""', 3000).stdout.trim();
        if (!name || !email) {
            return { id: this.id, name: this.name, category: this.category, status: 'warn',
                message: 'Git 全局身份未配置（git config --global user.name/email）' };
        }
        return { id: this.id, name: this.name, category: this.category, status: 'pass',
            message: `Git 身份: ${name} <${email}>` };
    },
};
(0, registry_1.registerScanner)(scanner);
