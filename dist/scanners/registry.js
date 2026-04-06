"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCANNER_CATEGORIES = void 0;
exports.registerScanner = registerScanner;
exports.getScanners = getScanners;
exports.getScannerByCategory = getScannerByCategory;
exports.clearScanners = clearScanners;
const _scanners = [];
exports.SCANNER_CATEGORIES = ['brew', 'apple', 'toolchain', 'ai-tools', 'network'];
function registerScanner(scanner) {
    _scanners.push(scanner);
}
function getScanners() {
    return [..._scanners];
}
function getScannerByCategory(category) {
    return _scanners.filter(s => s.category === category);
}
function clearScanners() {
    _scanners.length = 0;
}
