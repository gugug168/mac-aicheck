"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'python-versions',
    name: 'Python',
    category: 'toolchain',
    async scan() {
        if (!(0, index_1.commandExists)('python3')) {
            return { id: this.id, name: this.name, category: this.category, status: 'fail',
                message: 'Python3 未安装。建议: brew install python@3.12' };
        }
        const { stdout } = (0, index_1.runCommand)('python3 --version', 5000);
        const version = stdout.trim();
        const major = parseInt(version.replace('Python ', '').split('.')[0]);
        if (major < 3 || (major === 3 && parseInt(version.split('.')[1]) < 10)) {
            return { id: this.id, name: this.name, category: this.category, status: 'warn',
                message: `Python ${version} 过旧（建议 3.10+）` };
        }
        return { id: this.id, name: this.name, category: this.category, status: 'pass',
            message: `Python ${version}` };
    },
};
(0, registry_1.registerScanner)(scanner);
