export interface ScanResult {
    id: string;
    name: string;
    category: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
}
export interface Scanner {
    id: string;
    name: string;
    category: string;
    scan(): Promise<ScanResult>;
}
