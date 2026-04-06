"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'homebrew',
    name: 'Homebrew 检测',
    category: 'brew',
    async scan() {
        const { stdout, exitCode } = (0, index_1.runCommand)('brew --version', 5000);
        if (exitCode !== 0) {
            return { id: this.id, name: this.name, category: this.category, status: 'fail',
                message: 'Homebrew 未安装，请运行: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"' };
        }
        const match = stdout.match(/Homebrew (\d+\.\d+\.\d+)/);
        const version = match?.[1] || 'unknown';
        return { id: this.id, name: this.name, category: this.category, status: 'pass',
            message: `Homebrew ${version} 已安装` };
    },
};
(0, registry_1.registerScanner)(scanner);
