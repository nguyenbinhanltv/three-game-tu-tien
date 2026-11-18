/**
 * Logger nhỏ của server (R-9b): có mức, một chỗ duy nhất được gọi `console`. Mức lấy từ `LOG_LEVEL`
 * (`debug|info|warn|error|silent`, mặc định `info`); đổi lúc chạy bằng `setLogLevel`. Giữ nguyên chữ thẻ `[tag]` ở đầu
 * mỗi dòng (các công cụ và người đọc log dựa vào đó), không thêm dấu thời gian: nơi chạy (systemd, pm2) đã gắn.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

function parse(v: string | undefined): LogLevel {
  const s = (v ?? '').trim().toLowerCase();
  return s in ORDER ? (s as LogLevel) : 'info';
}

let threshold = ORDER[parse(process.env.LOG_LEVEL)];

export function setLogLevel(level: LogLevel): void {
  threshold = ORDER[level];
}

export function logLevel(): LogLevel {
  return (Object.keys(ORDER) as LogLevel[]).find((k) => ORDER[k] === threshold) ?? 'info';
}

export const log = {
  debug: (...args: unknown[]): void => {
    if (threshold <= ORDER.debug) console.debug(...args);
  },
  info: (...args: unknown[]): void => {
    if (threshold <= ORDER.info) console.log(...args);
  },
  warn: (...args: unknown[]): void => {
    if (threshold <= ORDER.warn) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    if (threshold <= ORDER.error) console.error(...args);
  },
};
