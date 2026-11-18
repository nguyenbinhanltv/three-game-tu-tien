// Mục tiêu nhiệm vụ do server chấm (E2-H): chạm điểm (`touch`), thần thức (`scan`), hộ tống (`escort`). Hằng số và hàm thuần dùng chung.

import { at } from './arr';
import type { EscortDef, LevelDef } from './types';

/** Đứng trong bán kính này (m) của điểm đáng chú ý thì `touch` được tính. */
export const TOUCH_R = 5;
/** Người đồng hành chỉ đi khi người nhận cách không quá chừng này (m); xa hơn thì đứng đợi. */
export const ESCORT_FOLLOW_R = 14;
/** Tới đích khi còn cách điểm cuối chừng này (m). */
export const ESCORT_ARRIVE_R = 3;
/** Người nhận bỏ xa quá chừng này (m) thì người đồng hành quay về điểm đầu (tuyến hộ tống làm lại). */
export const ESCORT_LOST_R = 90;

/** Tin S.ESCORT: vị trí người đồng hành của mình. `st` 0 = hết (xong hoặc hủy), 1 = đang đi, 2 = đứng đợi. */
export interface EscortMsg {
  id: string;
  npc: string;
  x: number;
  z: number;
  /** Hướng đi (rad, quanh trục Y). */
  yaw: number;
  st: 0 | 1 | 2;
}

export interface EscortWalk {
  /** Đoạn đường hiện tại (chỉ số điểm đã qua). */
  seg: number;
  x: number;
  z: number;
  yaw: number;
  done: boolean;
}

export function escortStart(def: EscortDef): EscortWalk {
  const [x, z] = def.path[0] ?? [0, 0];
  const [nx, nz] = def.path[1] ?? [x, z];
  return { seg: 0, x, z, yaw: Math.atan2(nx - x, nz - z), done: false };
}

/** Tiến `dist` mét dọc đường; trả bản mới (hàm thuần). Tới điểm cuối thì `done`. */
export function escortAdvance(def: EscortDef, w: EscortWalk, dist: number): EscortWalk {
  let { seg, x, z, yaw } = w;
  let left = dist;
  while (left > 0 && seg + 1 < def.path.length) {
    const next = def.path[seg + 1];
    if (!next) break;
    const [tx, tz] = next;
    const d = Math.hypot(tx - x, tz - z);
    yaw = d > 1e-6 ? Math.atan2(tx - x, tz - z) : yaw;
    if (d <= left) {
      x = tx;
      z = tz;
      left -= d;
      seg++;
    } else {
      x += ((tx - x) / d) * left;
      z += ((tz - z) / d) * left;
      left = 0;
    }
  }
  const [ex, ez] = at(def.path, def.path.length - 1, 'path');
  return { seg, x, z, yaw, done: seg + 1 >= def.path.length || Math.hypot(ex - x, ez - z) <= ESCORT_ARRIVE_R };
}

/** Điểm của mục tiêu `touch`/`scan`: tìm theo id trong `pois` rồi `spots` của level. Kèm khóa i18n tên. */
export function questSpot(lv: LevelDef, id: string | undefined): { id: string; x: number; z: number; nameKey: string } | undefined {
  if (!id) return undefined;
  const poi = lv.pois?.find((p) => p.id === id);
  if (poi) return { id, x: poi.x, z: poi.z, nameKey: `poi.${id}.name` };
  const sp = lv.spots?.find((p) => p.id === id);
  return sp ? { id, x: sp.x, z: sp.z, nameKey: `spot.${id}.name` } : undefined;
}
