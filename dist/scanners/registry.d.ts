import type { Scanner } from './types';
export declare const SCANNER_CATEGORIES: string[];
export declare function registerScanner(scanner: Scanner): void;
export declare function getScanners(): Scanner[];
export declare function getScannerByCategory(category: string): Scanner[];
export declare function clearScanners(): void;
