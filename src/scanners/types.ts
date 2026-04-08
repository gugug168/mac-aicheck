export type ScannerCategory = 'brew' | 'apple' | 'toolchain' | 'ai-tools' | 'network' | 'permission' | 'system';

export interface ScanResult {
  id: string;
  name: string;
  category: ScannerCategory;
  status: 'pass' | 'warn' | 'fail' | 'unknown';
  message: string;
  details?: string;
  suggestions?: string[];
}

export type ScannerResult = ScanResult;

export interface Scanner {
  id: string;
  name: string;
  category: ScannerCategory;
  scan(): Promise<ScannerResult>;
}
