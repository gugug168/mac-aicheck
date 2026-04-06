"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'xcode',
    name: 'Xcode Command Line Tools',
    category: 'toolchain',
    async scan() {
        const { exitCode } = (0, index_1.runCommand)('xcode-select -p 2>/dev/null && devtoolsctl -v 2>/dev/null || echo "not found"', 5000);
        if (exitCode !== 0) {
            return {
                id: this.id, name: this.name, category: this.category, status: 'fail',
                message: 'Xcode Command Line Tools 未安装。安装命令: xcode-select --install',
            };
        }
        const { stdout } = (0, index_1.runCommand)('xcode-select -p', 3000);
        return {
            id: this.id, name: this.name, category: this.category, status: 'pass',
            message: `Xcode CLT 已安装: ${stdout.trim()}`,
        };
    },
};
(0, registry_1.registerScanner)(scanner);
