"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'claude-code',
    name: 'Claude Code',
    category: 'ai-tools',
    async scan() {
        if (!(0, index_1.commandExists)('claude')) {
            return {
                id: this.id, name: this.name, category: this.category,
                status: 'fail',
                message: 'Claude Code 未安装。安装: brew install --cask claude-code 或 https://claude.com/code',
            };
        }
        const ver = (0, index_1.runCommand)('claude --version 2>/dev/null || echo "unknown"', 5000);
        return {
            id: this.id, name: this.name, category: this.category,
            status: 'pass',
            message: `Claude Code 已安装 (${ver.stdout.trim() || 'unknown'})`,
        };
    },
};
(0, registry_1.registerScanner)(scanner);
