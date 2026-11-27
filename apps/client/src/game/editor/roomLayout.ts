// Phép sửa bố cục phòng tập (Diễn Võ Trường V3), phần THUẦN: chọn, dời, xoay, phóng, thêm, xóa trên một bản làm việc của `DienVoLayout`.
// Không đụng three.js hay DOM (xem `roomEdit.ts`); mọi phép đều giữ bố cục hợp lệ theo `checkDienVoLayout` của `@dtl/shared`.
import { DIEN_VO_CENTER, DIEN_VO_HALF, dienVoZone, type DienVoLayout, type DienVoSpawnZone, type HandProp } from '@dtl/shared';

export type RoomSel = { kind: 'prop'; i: number } | { kind: 'spawn'; zone: DienVoSpawnZone; i: number };

/** Bước bám lưới khi kéo (m) và bước xoay (rad). */
export const SNAP = 0.25;
export const YAW_STEP = Math.PI / 12;
/** Đạo cụ cách mép sàn tối thiểu (m). */
const EDGE = 0.5;
/** Điểm gọi quái cách mép khu tối thiểu (m): cùng luật với `checkDienVoLayout`. */
const SPAWN_PAD = 1;
const LAMP = 'prop_den_da';

export const isLamp = (p: HandProp): boolean => p.id === LAMP;
export const cloneLayout = (l: DienVoLayout): DienVoLayout => JSON.parse(JSON.stringify(l)) as DienVoLayout;
export const sameLayout = (a: DienVoLayout, b: DienVoLayout): boolean => JSON.stringify(a) === JSON.stringify(b);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const snapTo = (v: number, step: number): number => (step > 0 ? Math.round(v / step) * step : v);

/** Vị trí của mục đang chọn; mục không còn thì null. */
export function selPos(l: DienVoLayout, s: RoomSel): { x: number; z: number } | null {
  return (s.kind === 'prop' ? l.props[s.i] : l.spawns[s.zone][s.i]) ?? null;
}

/** Bán kính bắt chuột của một đạo cụ (m): theo bán kính va chạm, tối thiểu 0,8 để món nhỏ vẫn bấm trúng. */
export const propPickR = (p: HandProp): number => Math.max(0.8, (p.r ?? 0) + 0.3);
const SPAWN_PICK_R = 0.8;

/** Mục gần điểm (x, z) nhất trong tầm bắt chuột; điểm gọi quái được ưu tiên khi chồng lên đạo cụ (nhỏ hơn, khó bấm hơn). */
export function pickItem(l: DienVoLayout, x: number, z: number): RoomSel | null {
  let best: RoomSel | null = null;
  let bd = Infinity;
  for (const zone of ['arena', 'boss'] as const)
    l.spawns[zone].forEach((p, i) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d <= SPAWN_PICK_R && d < bd) {
        bd = d;
        best = { kind: 'spawn', zone, i };
      }
    });
  if (best) return best;
  l.props.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d <= propPickR(p) && d < bd) {
      bd = d;
      best = { kind: 'prop', i };
    }
  });
  return best;
}

/** Kẹp một điểm vào trong sàn (đạo cụ) hoặc trong khu của nó (điểm gọi quái). */
export function clampFor(s: RoomSel, x: number, z: number): { x: number; z: number } {
  if (s.kind === 'prop') {
    const h = DIEN_VO_HALF - EDGE;
    return { x: r3(clamp(x, DIEN_VO_CENTER.x - h, DIEN_VO_CENTER.x + h)), z: r3(clamp(z, DIEN_VO_CENTER.z - h, DIEN_VO_CENTER.z + h)) };
  }
  const zone = dienVoZone(s.zone);
  const max = (zone.r ?? 0) - SPAWN_PAD - 0.01;
  const dx = x - zone.x;
  const dz = z - zone.z;
  const d = Math.hypot(dx, dz);
  const k = d > max ? max / d : 1;
  return { x: r3(zone.x + dx * k), z: r3(zone.z + dz * k) };
}

/** Dời mục đang chọn tới (x, z), có bám lưới `snap` (0 = không bám). Trả true nếu vị trí đổi. */
export function moveItem(l: DienVoLayout, s: RoomSel, x: number, z: number, snap = SNAP): boolean {
  const p = selPos(l, s);
  if (!p) return false;
  const to = clampFor(s, snapTo(x, snap), snapTo(z, snap));
  if (to.x === p.x && to.z === p.z) return false;
  p.x = to.x;
  p.z = to.z;
  return true;
}

/** Xoay đạo cụ đang chọn thêm `d` rad (điểm gọi quái không có hướng). */
export function rotateItem(l: DienVoLayout, s: RoomSel, d: number): boolean {
  const p = s.kind === 'prop' ? l.props[s.i] : undefined;
  if (!p) return false;
  let yaw = (p.yaw + d) % (Math.PI * 2);
  if (yaw > Math.PI) yaw -= Math.PI * 2;
  if (yaw < -Math.PI) yaw += Math.PI * 2;
  p.yaw = r3(yaw);
  return true;
}

/** Phóng đạo cụ đang chọn theo hệ số `k` (kẹp 0,05–5; bán kính va chạm phóng theo). */
export function scaleItem(l: DienVoLayout, s: RoomSel, k: number): boolean {
  const p = s.kind === 'prop' ? l.props[s.i] : undefined;
  if (!p) return false;
  const next = r3(clamp(p.s * k, 0.05, 5));
  if (next === p.s) return false;
  if (p.r) p.r = r3(clamp((p.r * next) / p.s, 0.1, 5));
  p.s = next;
  return true;
}

/** Bật/tắt va chạm của đạo cụ đang chọn (bật = bán kính 0,5 m × tỉ lệ, tối thiểu 0,3). */
export function toggleCollide(l: DienVoLayout, s: RoomSel): boolean {
  const p = s.kind === 'prop' ? l.props[s.i] : undefined;
  if (!p) return false;
  if (p.r) delete p.r;
  else p.r = r3(clamp(0.5 * p.s, 0.3, 5));
  return true;
}

/** Xóa mục đang chọn. */
export function removeItem(l: DienVoLayout, s: RoomSel): boolean {
  const list: unknown[] = s.kind === 'prop' ? l.props : l.spawns[s.zone];
  if (s.i < 0 || s.i >= list.length) return false;
  list.splice(s.i, 1);
  return true;
}

/** Thêm một đạo cụ `id` tại (x, z) (kẹp vào sàn, bám lưới); đèn đá có va chạm sẵn như các đèn của phòng. Trả mục vừa thêm. */
export function addProp(l: DienVoLayout, id: string, x: number, z: number, like?: HandProp): RoomSel {
  const sel: RoomSel = { kind: 'prop', i: l.props.length };
  const at = clampFor(sel, snapTo(x, SNAP), snapTo(z, SNAP));
  const p: HandProp = { id, x: at.x, z: at.z, yaw: like?.yaw ?? 0, s: like?.s ?? 1 };
  const r = like?.r ?? (id === LAMP ? 0.5 : undefined);
  if (r) p.r = r;
  l.props.push(p);
  return sel;
}

/** Thêm một điểm gọi quái vào khu `zone` tại (x, z) (kẹp vào trong khu). Trả mục vừa thêm. */
export function addSpawn(l: DienVoLayout, zone: DienVoSpawnZone, x: number, z: number): RoomSel {
  const sel: RoomSel = { kind: 'spawn', zone, i: l.spawns[zone].length };
  l.spawns[zone].push(clampFor(sel, snapTo(x, SNAP), snapTo(z, SNAP)));
  return sel;
}
