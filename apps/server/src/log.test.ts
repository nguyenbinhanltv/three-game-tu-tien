import { afterEach, describe, expect, it, vi } from 'vitest';
import { log, logLevel, parseLogLevel, setLogLevel } from './log';

describe('log', () => {
  afterEach(() => {
    setLogLevel('info');
    vi.restoreAllMocks();
  });

  it('parseLogLevel: giá trị lạ hoặc rỗng về info', () => {
    expect(parseLogLevel('WARN')).toBe('warn');
    expect(parseLogLevel(' debug ')).toBe('debug');
    expect(parseLogLevel('lạ')).toBe('info');
    expect(parseLogLevel(undefined)).toBe('info');
  });

  it('setLogLevel lọc theo mức', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogLevel('warn');
    log.info('x');
    log.warn('y');
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('y');
    expect(logLevel()).toBe('warn');
    setLogLevel('silent');
    log.warn('z');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
