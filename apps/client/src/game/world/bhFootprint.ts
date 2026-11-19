import { LEVELS } from '@dtl/content';
import { terrainOf } from '@dtl/shared';
import type { BhSpot } from './bhWonders';

/** Hình chữ nhật chiếm chỗ của một xác thú trong hệ thế giới (xoay theo yaw), cộng lề. Dài −40…+28 m, rộng ±12 m theo hệ cục bộ, nhân tỉ lệ `s`. */
export function inBeastFootprint(b: BhSpot, x: number, z: number, margin: number): boolean {
  const dx = x - b.x;
  const dz = z - b.z;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return lx > -40 * b.s - margin && lx < 28 * b.s + margin && Math.abs(lz) < 12 * b.s + margin;
}

/** Mọi điểm có quái hoặc người đứng/đi của Bắc Hoang: bãi quái, tinh anh/boss, điểm đặt, điểm đáng chú ý, đường hộ tống, kèm bán kính. */
export function bacHoangOccupied(): { id: string; x: number; z: number; r: number }[] {
  const lv = LEVELS['bac_hoang']!;
  const out: { id: string; x: number; z: number; r: number }[] = [];
  for (const c of lv.camps ?? []) out.push({ id: c.id, x: c.x, z: c.z, r: c.radius });
  for (const [i, s] of (lv.spawns ?? []).entries()) out.push({ id: `spawn_${i}_${s.mon}`, x: s.x, z: s.z, r: s.radius });
  for (const s of lv.spots ?? []) out.push({ id: s.id, x: s.x, z: s.z, r: 8 });
  for (const p of lv.pois ?? []) out.push({ id: p.id, x: p.x, z: p.z, r: 10 });
  for (const e of lv.escorts ?? []) for (const [i, p] of e.path.entries()) out.push({ id: `${e.id}_${i}`, x: p[0], z: p[1], r: 6 });
  // Đấu trường boss (sân phẳng flatR 44 m): thêm lề 12 m cho camera/chiêu lớn, không để xương nằm trong sân
  for (const f of terrainOf('bac_hoang').def.features)
    if (f.id.startsWith('boss')) out.push({ id: `arena_${f.id}`, x: f.x, z: f.z, r: f.flatR + 12 });
  return out;
}
