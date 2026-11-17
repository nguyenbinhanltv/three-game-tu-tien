// Chỗ DUY NHẤT trong tools/perf đọc tham số dòng lệnh và biến môi trường (PORT/CLIENT_PORT, BENCH_*, SHOT_*).
import path from 'node:path';

/** Tham số dòng lệnh; bỏ dấu `--` mà `pnpm run … --` chuyển nguyên xuống. */
export const args = process.argv.slice(2).filter((a) => a !== '--');

/** `--tên giá_trị`; thiếu thì lấy mặc định. */
export const opt = (name: string, def: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
export const flag = (name: string): boolean => args.includes(name);
export const list = (name: string, def: string): string[] => opt(name, def).split(',').filter(Boolean);
export const num = (name: string, def: number): number => Number(opt(name, String(def)));
/** `--size 1280x720` → [1280, 720]. */
export const size = (def: string): [number, number] => opt('--size', def).split('x').map(Number) as [number, number];

/** Biến môi trường tùy chọn của công cụ (vd. `BENCH_QUERY`, `SHOT_SETTLE`). */
export const env = (name: string, def = ''): string => process.env[name] ?? def;

/**
 * Cặp cổng server/client của lần chạy: `PORT`/`CLIENT_PORT` nếu có, không thì mặc định riêng của công cụ
 * (mỗi công cụ một cặp để không đụng `pnpm dev` hay worktree khác).
 */
export function ports(defPort: number, defClient: number): { port: number; clientPort: number } {
  return { port: Number(env('PORT', String(defPort))), clientPort: Number(env('CLIENT_PORT', String(defClient))) };
}

/** Thư mục ra: đường dẫn tương đối tính từ nơi người dùng gõ lệnh (pnpm đặt `INIT_CWD`), không phải `tools/perf`. */
export const outDir = (def: string): string => path.resolve(env('INIT_CWD', process.cwd()), opt('--out', def));

/** Môi trường cho tiến trình con (build, bot): kế thừa của tiến trình hiện tại, cộng biến thêm. */
export const childEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({ ...process.env, ...extra });
