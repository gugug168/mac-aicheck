import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand, commandExists, isAdmin, parsePath, _test } from '../src/executor/index';

describe('runCommand', () => {
  it('returns stdout for successful command', () => {
    const result = runCommand('echo hello');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hello');
  });

  it('returns non-zero exit code for failed command', () => {
    const result = runCommand('exit 1');
    expect(result.exitCode).toBe(1);
  });

  it('respects timeout and returns exit code 1', () => {
    // Use a very short timeout to ensure it triggers
    const result = runCommand('sleep 5', 100);
    expect(result.exitCode).toBe(1);
  });

  it('uses mock when _test.mockExecSync is set', () => {
    const buf = Buffer.from('mocked output');
    _test.mockExecSync = () => buf;
    try {
      const result = runCommand('anything');
      expect(result.stdout).toBe('mocked output');
      expect(result.exitCode).toBe(0);
    } finally {
      _test.mockExecSync = null;
    }
  });
});

describe('commandExists', () => {
  it('returns true for existing commands', () => {
    expect(commandExists('sh')).toBe(true);
  });

  it('returns false for non-existent commands', () => {
    expect(commandExists('this_command_does_not_exist_xyz')).toBe(false);
  });
});

describe('parsePath', () => {
  it('splits PATH by colons on unix', () => {
    const result = parsePath('/usr/bin:/usr/local/bin:/home/user/bin');
    expect(result).toEqual(['/usr/bin', '/usr/local/bin', '/home/user/bin']);
  });

  it('filters empty entries', () => {
    const result = parsePath('/usr/bin::/usr/local/bin::');
    expect(result).toEqual(['/usr/bin', '/usr/local/bin']);
  });
});
