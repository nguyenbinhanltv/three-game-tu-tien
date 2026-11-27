// Nạp lại dữ liệu tức thì phía server (Diễn Võ Trường V3), CHỈ ở máy phát triển: theo dõi các file dữ liệu "nóng" (cảnh mẫu phòng tập,
// bố cục phòng, chuỗi i18n, timeline fx) và vá vào dữ liệu đang chạy bằng `applyHotData` (`@dtl/content/hot`), không khởi động lại
// nên phòng tập đang mở không bị đóng.
//
// An toàn: chỉ chạy khi `config.devBypass` bật (đăng nhập thử; tự tắt ở production hoặc khi đã cấu hình Google), nguồn dữ liệu duy nhất
// là file trên đĩa của chính máy chạy server, và không tin nhắn nào của client kích được việc nạp. Dữ liệu luật chơi và phần thưởng
// (skills, monsters, items, loot…) KHÔNG thuộc danh sách nóng: muốn đổi phải khởi động lại server như trước.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyHotData, hotKind, type HotResult } from '@dtl/content/hot';
import { config } from './config';
import { log } from './log';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** Thư mục chứa file nóng (tương đối gốc repo). `hotKind` lọc tiếp từng file. */
const WATCH_DIRS = [
  'packages/content/data/fx',
  'packages/content/data/lab',
  'packages/content/data/i18n',
  'packages/shared/src',
];

/** Đọc một file nóng từ đĩa và vá vào dữ liệu đang chạy. Không ném: JSON hỏng (đang ghi dở) hoặc dữ liệu sai thì giữ bản cũ. */
export function reloadFile(rel: string, root = REPO_ROOT): HotResult {
  const kind = hotKind(rel);
  if (!kind) return { ok: false, kind: null, path: rel, note: 'không phải file nóng' };
  try {
    return applyHotData(rel, JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')));
  } catch (e) {
    return { ok: false, kind, path: rel, note: String(e) };
  }
}

/**
 * Bật theo dõi file nóng. Trả hàm dừng, hoặc null nếu không được phép (không phải máy phát triển).
 * `allowed` chỉ để test truyền vào; mã thật luôn theo `config.devBypass`.
 */
export function startDevReload(allowed = config.devBypass, root = REPO_ROOT): (() => void) | null {
  if (!allowed) return null;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const watchers: fs.FSWatcher[] = [];
  for (const dir of WATCH_DIRS) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    try {
      watchers.push(
        fs.watch(abs, (_ev, name) => {
          if (!name) return;
          const rel = `${dir}/${name.toString()}`;
          if (!hotKind(rel)) return;
          // Trình soạn thảo thường ghi nhiều nhịp: gom lại, đọc khi file đã yên.
          clearTimeout(timers.get(rel));
          timers.set(
            rel,
            setTimeout(() => {
              timers.delete(rel);
              const r = reloadFile(rel, root);
              if (r.ok) log.info(`[devReload] đã nạp lại ${rel}${r.note ? ` (${r.note})` : ''}`);
              else log.warn(`[devReload] KHÔNG nạp được ${rel}: ${r.note ?? '?'}`);
            }, 150),
          );
        }),
      );
    } catch (e) {
      log.warn(`[devReload] không theo dõi được ${dir}: ${String(e)}`);
    }
  }
  log.info(`[devReload] nạp lại dữ liệu tức thì BẬT (chỉ máy phát triển): ${WATCH_DIRS.join(', ')}`);
  return () => {
    for (const w of watchers) w.close();
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };
}
