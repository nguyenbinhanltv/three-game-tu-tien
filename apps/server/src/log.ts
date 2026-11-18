/**
 * Logger nhỏ của server (R-9b): có mức, một chỗ duy nhất được gọi `console`. Mức lấy từ `LOG_LEVEL`
 * (`debug|info|warn|error|silent`, mặc định `info`); đổi lúc chạy bằng `setLogLevel`. Giữ nguyên chữ thẻ `[tag]` ở đầu
 * mỗi dòng (các công cụ và người đọc log dựa vào đó), không thêm dấu thời gian: nơi chạy (systemd, pm2) đã gắn.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export function parseLogLevel(v: string | undefined): LogLevel {
  const s = (v ?? '').trim().toLowerCase();
  return s in ORDER ? (s as LogLevel) : 'info';
}

/** Đọc lười ở lần log đầu: `config.ts` nạp `.env.local`/`.env` sau khi module này chạy, nên không đọc `LOG_LEVEL` lúc nạp module. */
let threshold: number | null = null;
function cur(): number {
  return (threshold ??= ORDER[parseLogLevel(process.env.LOG_LEVEL)]);
}

export function setLogLevel(level: LogLevel): void {
  threshold = ORDER[level];
}

export function logLevel(): LogLevel {
  return (Object.keys(ORDER) as LogLevel[]).find((k) => ORDER[k] === cur()) ?? 'info';
}

export const log = {
  debug: (...args: unknown[]): void => {
    if (cur() <= ORDER.debug) console.debug(...args);
  },
  info: (...args: unknown[]): void => {
    if (cur() <= ORDER.info) console.log(...args);
  },
  warn: (...args: unknown[]): void => {
    if (cur() <= ORDER.warn) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    if (cur() <= ORDER.error) console.error(...args);
  },
};
