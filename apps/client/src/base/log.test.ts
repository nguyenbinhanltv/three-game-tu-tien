import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger, logLevel, setLogLevel } from './log';

describe('client logger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gắn prefix [module] và giữ nguyên đối số', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setLogLevel('info');
    logger('audio').warn('lỗi', 42);
    expect(warn).toHaveBeenCalledWith('[audio]', 'lỗi', 42);
  });

  it('tôn trọng mức: debug bị tắt ở info, tất cả im ở silent', () => {
    const dbg = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = logger('x');
    setLogLevel('info');
    log.debug('a');
    expect(dbg).not.toHaveBeenCalled();
    setLogLevel('debug');
    log.debug('a');
    expect(dbg).toHaveBeenCalledTimes(1);
    setLogLevel('silent');
    log.error('b');
    expect(err).not.toHaveBeenCalled();
    expect(logLevel()).toBe('silent');
  });
});
