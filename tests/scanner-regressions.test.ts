import { afterEach, describe, expect, it } from 'vitest';
import '../src/scanners/index';
import { getScannerById, getScanners } from '../src/scanners/registry';
import { _test } from '../src/executor/index';

function commandError(status = 1, stdout = '', stderr = ''): Error & {
  status: number;
  stdout: Buffer;
  stderr: Buffer;
} {
  const error = new Error('command failed') as Error & {
    status: number;
    stdout: Buffer;
    stderr: Buffer;
  };
  error.status = status;
  error.stdout = Buffer.from(stdout);
  error.stderr = Buffer.from(stderr);
  return error;
}

afterEach(() => {
  _test.mockExecSync = null;
});

describe('scanner regressions', () => {
  it('npm-mirror accepts the official registry without a trailing slash', async () => {
    _test.mockExecSync = (cmd: string) => {
      if (cmd === 'npm config get registry') {
        return Buffer.from('https://registry.npmjs.org\n');
      }
      throw commandError();
    };

    const scanner = getScannerById('npm-mirror');
    expect(scanner).toBeDefined();

    const result = await scanner!.scan();
    expect(result.status).toBe('pass');
    expect(result.message).toContain('官方源');
  });

  it('rosetta warns on Apple Silicon when pkgutil reports it is not installed', async () => {
    _test.mockExecSync = (cmd: string) => {
      if (cmd === 'uname -m') return Buffer.from('arm64\n');
      if (cmd === 'sysctl -n machdep.cpu.brand_string 2>/dev/null') return Buffer.from('Apple M4\n');
      if (cmd === 'pkgutil --pkg-info=com.apple.pkg.RosettaUpdateLegacy 2>/dev/null') {
        throw commandError(1);
      }
      throw commandError();
    };

    const scanner = getScannerById('rosetta');
    expect(scanner).toBeDefined();

    const result = await scanner!.scan();
    expect(result.status).toBe('warn');
    expect(result.message).toContain('未安装');
  });

  it('apple-silicon is informational and does not warn when Rosetta is missing', async () => {
    _test.mockExecSync = (cmd: string) => {
      if (cmd === 'uname -m') return Buffer.from('arm64\n');
      if (cmd === 'sysctl -n machdep.cpu.brand_string 2>/dev/null') return Buffer.from('Apple M4\n');
      if (cmd === 'pkgutil --pkg-info=com.apple.pkg.RosettaUpdateLegacy 2>/dev/null') {
        throw commandError(1);
      }
      throw commandError();
    };

    const scanner = getScannerById('apple-silicon');
    expect(scanner).toBeDefined();

    const result = await scanner!.scan();
    expect(result.status).toBe('pass');
    expect(result.message).toContain('Apple Silicon');
    expect(result.detail).toContain('Rosetta 2 未安装');
  });

  it('screen-permission is hidden by default and reports unknown instead of fail', async () => {
    const visibleIds = getScanners().map(scanner => scanner.id);
    const allIds = getScanners({ includeDefaultDisabled: true }).map(scanner => scanner.id);

    expect(visibleIds).not.toContain('screen-permission');
    expect(allIds).toContain('screen-permission');

    const scanner = getScannerById('screen-permission');
    expect(scanner).toBeDefined();

    const result = await scanner!.scan();
    expect(result.status).toBe('unknown');
    expect(result.message).toContain('无法可靠检测');
  });

  it('proxy-config treats a valid proxy as pass instead of a warning', async () => {
    _test.mockExecSync = (cmd: string) => {
      if (cmd.includes('echo $HTTP_PROXY $HTTPS_PROXY')) {
        return Buffer.from('http://127.0.0.1:7890\n');
      }
      throw commandError();
    };

    const scanner = getScannerById('proxy-config');
    expect(scanner).toBeDefined();

    const result = await scanner!.scan();
    expect(result.status).toBe('pass');
    expect(result.message).toContain('检测到代理配置');
  });

  it('dns-resolution no longer relies on google.com and downgrades partial failures to warn', async () => {
    _test.mockExecSync = (cmd: string) => {
      if (cmd.includes('nslookup github.com')) return Buffer.from('ok');
      if (cmd.includes('nslookup registry.npmjs.org')) return Buffer.from('ok');
      if (cmd.includes('nslookup pypi.org')) throw commandError(1);
      throw commandError();
    };

    const scanner = getScannerById('dns-resolution');
    expect(scanner).toBeDefined();

    const result = await scanner!.scan();
    expect(result.status).toBe('warn');
    expect(result.message).toContain('DNS 解析异常');
    expect(result.detail).toContain('pypi.org:FAIL');
  });

  it('ssl-certs downgrades partial HTTPS failures to warn', async () => {
    _test.mockExecSync = (cmd: string) => {
      if (cmd.includes('https://github.com')) return Buffer.from('200');
      if (cmd.includes('https://registry.npmjs.org')) return Buffer.from('FAIL');
      throw commandError();
    };

    const scanner = getScannerById('ssl-certs');
    expect(scanner).toBeDefined();

    const result = await scanner!.scan();
    expect(result.status).toBe('warn');
    expect(result.message).toContain('握手异常');
    expect(result.detail).toContain('github.com: 200');
  });
});
