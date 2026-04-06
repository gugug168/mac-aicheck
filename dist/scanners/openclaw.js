"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'openclaw',
    name: 'OpenClaw',
    category: 'ai-tools',
    async scan() {
        if (!(0, index_1.commandExists)('openclaw')) {
            return {
                id: this.id, name: this.name, category: this.category,
                status: 'fail',
                message: 'OpenClaw 未安装。安装: npm install -g openclaw',
            };
        }
        const ver = (0, index_1.runCommand)('openclaw --version 2>/dev/null || echo "unknown"', 5000);
        return {
            id: this.id, name: this.name, category: this.category,
            status: 'pass',
            message: `OpenClaw 已安装 (${ver.stdout.trim() || 'unknown'})`,
        };
    },
};
(0, registry_1.registerScanner)(scanner);
