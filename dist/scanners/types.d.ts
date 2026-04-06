export type ScannerCategory = 'brew' | 'apple' | 'toolchain' | 'ai-tools' | 'network' | 'permission';
export interface ScanResult {
    id: string;
    name: string;
    category: ScannerCategory;
    status: 'pass' | 'warn' | 'fail' | 'unknown';
    message: string;
}
export interface Scanner {
    id: string;
    name: string;
    category: ScannerCategory;
    scan(): Promise<ScanResult>;
}
