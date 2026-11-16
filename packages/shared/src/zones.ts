import type { CampDef, LevelDef, SpawnDef, ZoneDef } from './types';

/** Điểm (x, z) có nằm trong đa giác không (ray casting). */
export function inPoly(poly: readonly (readonly [number, number])[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Diện tích đa giác (m²). */
export function polyArea(poly: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a) / 2;
}

/** Vùng chứa điểm (đầu tiên khớp), hoặc undefined nếu ở ngoài mọi vùng. */
export function zoneAt(zones: readonly ZoneDef[] | undefined, x: number, z: number): ZoneDef | undefined {
  return zones?.find((zn) => inPoly(zn.poly, x, z));
}

/** Vùng của level chứa điểm (E1-A: tra theo LevelDef thay vì hằng Vân Lam). */
export function zoneAtLevel(level: Pick<LevelDef, 'zones'>, x: number, z: number): ZoneDef | undefined {
  return zoneAt(level.zones, x, z);
}

/** Một bãi thành các SpawnDef: `count` con thường quanh tâm, cộng một con đánh xa nếu có. */
export function campSpawns(c: CampDef): SpawnDef[] {
  const base = { x: c.x, z: c.z, radius: c.radius, levelMin: c.levelMin, levelMax: c.levelMax, respawn: c.respawn };
  const out: SpawnDef[] = [{ mon: c.mon, count: c.count, ...base }];
  if (c.ranged) out.push({ mon: c.ranged, count: 1, ...base });
  return out;
}

/** Mọi điểm sinh quái của level: quái đứng lẻ (tinh anh, boss) và các bãi. Server, sim và công cụ dùng chung. */
export function levelSpawns(level: LevelDef): SpawnDef[] {
  return [...level.spawns, ...(level.camps ?? []).flatMap(campSpawns)];
}
