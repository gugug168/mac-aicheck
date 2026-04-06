"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'node-version',
    name: 'Node.js',
    category: 'toolchain',
    async scan() {
        const { stdout, exitCode } = (0, index_1.runCommand)('node --version', 5000);
        if (exitCode !== 0) {
            return { id: this.id, name: this.name, category: this.category, status: 'fail',
                message: 'Node.js 未安装。建议用 nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash' };
        }
        const version = stdout.trim();
        const major = parseInt(version.replace('v', '').split('.')[0]);
        if (major < 18) {
            return { id: this.id, name: this.name, category: this.category, status: 'warn',
                message: `Node.js ${version} 过旧（建议 18+）` };
        }
        return { id: this.id, name: this.name, category: this.category, status: 'pass',
            message: `Node.js ${version}` };
    },
};
(0, registry_1.registerScanner)(scanner);
