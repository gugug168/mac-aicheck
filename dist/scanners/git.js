"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'git',
    name: 'Git',
    category: 'toolchain',
    async scan() {
        const { stdout, exitCode } = (0, index_1.runCommand)('git --version', 5000);
        if (exitCode !== 0) {
            return { id: this.id, name: this.name, category: this.category, status: 'fail',
                message: 'Git 未安装' };
        }
        const match = stdout.match(/git version (\d+\.\d+\.\d+)/);
        const version = match?.[1] || 'unknown';
        const [major, minor] = version.split('.').map(Number);
        if (major < 2 || (major === 2 && minor < 30)) {
            return { id: this.id, name: this.name, category: this.category, status: 'warn',
                message: `Git ${version} 过旧，建议升级到 2.30+` };
        }
        return { id: this.id, name: this.name, category: this.category, status: 'pass',
            message: `Git ${version}` };
    },
};
(0, registry_1.registerScanner)(scanner);
