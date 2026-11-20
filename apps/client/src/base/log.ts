/**
 * Logger nhỏ của client (CLEAN-2): có mức, prefix theo module, một chỗ duy nhất được gọi `console` (luật `no-console`).
 * `debug` chỉ in khi chạy dev (`import.meta.env.DEV`); production chỉ giữ info/warn/error. Đổi lúc chạy bằng `setLogLevel`.
 * Dòng log giữ dạng `[module] nội dung` như trước để người đọc console và `tools/perf` (bắt `[gpu]`, `[load]`…) không đổi.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

const DEV = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
let threshold = DEV ? ORDER.debug : ORDER.info;

export function setLogLevel(level: LogLevel): void {
  threshold = ORDER[level];
}

export function logLevel(): LogLevel {
  return (Object.keys(ORDER) as LogLevel[]).find((k) => ORDER[k] === threshold) ?? 'info';
}

interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** Logger của một module: `const log = logger('audio'); log.warn('không phát được', url)` in `[audio] không phát được …`. */
export function logger(module: string): Logger {
  const tag = `[${module}]`;
  return {
    debug: (...a) => {
      if (threshold <= ORDER.debug) console.debug(tag, ...a);
    },
    info: (...a) => {
      if (threshold <= ORDER.info) console.info(tag, ...a);
    },
    warn: (...a) => {
      if (threshold <= ORDER.warn) console.warn(tag, ...a);
    },
    error: (...a) => {
      if (threshold <= ORDER.error) console.error(tag, ...a);
    },
  };
}
