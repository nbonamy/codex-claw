import { describe, expect, it } from 'vitest';
import { parseDaemonVersion, product } from '../product';

describe('daemon version identity', () => {
  it.each([
    [`${product.daemonName} 0.26.0\n`, '0.26.0'],
    ['daemon 0.25.2\n', '0.25.2'],
    ['', null],
    [product.daemonName, null],
    ['node v22.19.0', null],
  ])('parses recognized daemon output %j', (output, version) => {
    expect(parseDaemonVersion(output)).toBe(version);
  });
});
