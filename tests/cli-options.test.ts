import { describe, expect, it } from 'vitest';
import { shouldUploadScan } from '../src/cli/options';

describe('cli upload options', () => {
  it('keeps plain diagnosis local by default', () => {
    expect(shouldUploadScan([])).toBe(false);
    expect(shouldUploadScan(['--json'])).toBe(false);
    expect(shouldUploadScan(['--serve'])).toBe(false);
  });

  it('enables upload only when explicitly requested', () => {
    expect(shouldUploadScan(['--upload'])).toBe(true);
    expect(shouldUploadScan(['upload'])).toBe(true);
    expect(shouldUploadScan(['--serve', '--upload'])).toBe(true);
  });
});
