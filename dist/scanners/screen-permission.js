"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../executor/index");
const registry_1 = require("./registry");
const scanner = {
    id: 'screen-permission',
    name: '屏幕录制权限',
    category: 'apple',
    async scan() {
        const tcc = (0, index_1.runCommand)('tccutil check ScreenCapture 2>/dev/null || echo "unknown"', 3000);
        const output = tcc.stdout.trim();
        if (output.includes('ScreenCapture')) {
            return { id: this.id, name: this.name, category: this.category, status: 'pass',
                message: '屏幕录制权限已授权' };
        }
        return { id: this.id, name: this.name, category: this.category, status: 'fail',
            message: '屏幕录制权限未授权，请到 系统设置 → 隐私与安全性 → 屏幕录制 添加对应应用' };
    },
};
(0, registry_1.registerScanner)(scanner);
