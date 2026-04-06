"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'apple-silicon',
    name: 'Apple Silicon 检测',
    category: 'apple',
    async scan() {
        const uname = (0, index_1.runCommand)('uname -m', 3000);
        const isArm = uname.stdout.trim() === 'arm64';
        if (!isArm) {
            return {
                id: this.id, name: this.name, category: this.category,
                status: 'pass',
                message: 'Intel Mac，无需 Apple Silicon 相关适配',
            };
        }
        const sysctl = (0, index_1.runCommand)('sysctl -n machdep.cpu.brand_string', 3000);
        const chip = sysctl.stdout.trim();
        const hasRosetta = (0, index_1.commandExists)('rosetta');
        return {
            id: this.id, name: this.name, category: this.category,
            status: hasRosetta ? 'pass' : 'warn',
            message: hasRosetta
                ? `Apple Silicon (${chip}) + Rosetta 2 已安装`
                : `Apple Silicon (${chip})，建议安装 Rosetta 2`,
        };
    },
};
(0, registry_1.registerScanner)(scanner);
