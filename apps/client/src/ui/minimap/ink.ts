// Bản đồ thủy mặc của level đang chơi (U2-7): dựng một lần từ địa hình (game/world/terrain.ts `createInkMap`), chia lát ~4 ms mỗi khung
// của vòng vẽ minimap để không giật, rồi chỉ drawImage. Đổi level thì bỏ và dựng lại.
import { createInkMap, type InkBuilder } from '../../game/world/terrain';
import { levelTerrain } from '../../base/levelCtx';
import { logger } from '../../base/log';

const log = logger('minimap');
/** Điểm ảnh mỗi cạnh: 1024 → ~4 m/điểm ở level 4096 m; đủ cho nét loang, phóng nhiều sẽ mềm như tranh thủy mặc. */
const INK_PX = 1536;
/** Mỗi khung (60 Hz) chỉ dựng 3 ms: ~1,3 giây CPU thuần chia ra khoảng 7–10 giây, không gây giật. */
const SLICE_MS = 3;

let cur: InkBuilder | null = null;
let curTerrain: unknown = null;
let startedAt = 0;
let pumping = false;

export interface InkMap {
  canvas: HTMLCanvasElement;
  size: number;
}

function pump(): void {
  if (!cur || cur.done) {
    pumping = false;
    return;
  }
  if (!document.hidden && !cur.step(SLICE_MS)) {
    // Level đổi giữa chừng: bỏ bộ dựng; lần `inkMap()` kế tiếp dựng cho level mới.
    cur = null;
    curTerrain = null;
    pumping = false;
    return;
  }
  if (cur.done) log.info(`bản đồ thủy mặc dựng xong sau ${Math.round(performance.now() - startedAt)} ms`);
  requestAnimationFrame(pump);
}

/** Trả bản đồ đã dựng xong (null khi đang dựng, lúc đó minimap dùng nền dựng sẵn); lần đầu gọi cho một level sẽ bắt đầu dựng ngầm. */
export function inkMap(): InkMap | null {
  const t = levelTerrain();
  if (t !== curTerrain) {
    cur = null;
    curTerrain = t;
  }
  if (!cur) {
    cur = createInkMap(INK_PX);
    startedAt = performance.now();
  }
  if (!pumping && !cur.done) {
    pumping = true;
    requestAnimationFrame(pump);
  }
  return cur.done ? cur : null;
}
