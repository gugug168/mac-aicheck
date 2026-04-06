import { Buffer } from 'buffer';
/** 测试钩子：注入 mock 函数，避免 mock.module 的跨文件冲突 */
export declare const _test: {
    mockExecSync: ((cmd: string, opts: any) => Buffer) | null;
    mockExistsSync: ((path: string) => boolean) | null;
};
/**
 * 执行系统命令，带超时保护
 */
export declare function runCommand(cmd: string, timeout?: number): {
    stdout: string;
    stderr: string;
    exitCode: number;
};
/** 检查命令是否可用（跨平台） */
export declare function commandExists(cmd: string): boolean;
/** 检查当前是否以管理员权限运行（跨平台） */
export declare function isAdmin(): boolean;
/** 跨平台 PATH 解析 */
export declare function parsePath(pathVar: string): string[];
