// Phần thuần của `collscan`: phân loại vật quét được theo độ phủ va chạm (có test, không cần trình duyệt).
import type { CircleCollider, Shape } from '@dtl/shared';

export interface Item {
  path: string;
  i: number;
  x: number;
  z: number;
  y0: number;
  y1: number;
  w: number;
  d: number;
  tris: number;
  merged?: boolean;
}

/** Gộp các sub-mesh của cùng một vật (cùng nhãn, cùng chỉ số instance, hộp bao giao nhau) thành một hộp bao. */
export function mergeItems(items: readonly Item[]): Item[] {
  const byKey = new Map<string, Item[]>();
  for (const it of items) {
    const k = it.path + '|' + it.i;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(it);
  }
  const out: Item[] = [];
  for (const list of byKey.values()) {
    if (list.length === 1 || list[0]!.merged) {
      out.push(...list);
      continue;
    }
    const lo = (a: Item): number => a.x - a.w / 2;
    const hi = (a: Item): number => a.x + a.w / 2;
    const zlo = (a: Item): number => a.z - a.d / 2;
    const zhi = (a: Item): number => a.z + a.d / 2;
    const parent = list.map((_, n) => n);
    const find = (n: number): number => {
      while (parent[n] !== n) n = parent[n] = parent[parent[n]!]!;
      return n;
    };
    const order = list.map((_, n) => n).sort((a, b) => lo(list[a]!) - lo(list[b]!));
    for (let a = 0; a < order.length; a++)
      for (let b = a + 1; b < order.length; b++) {
        const p = list[order[a]!]!;
        const q = list[order[b]!]!;
        if (lo(q) > hi(p) + 0.05) break;
        if (zlo(q) <= zhi(p) + 0.05 && zhi(q) >= zlo(p) - 0.05) parent[find(order[b]!)] = find(order[a]!);
      }
    const groups = new Map<number, Item[]>();
    list.forEach((it, n) => (groups.get(find(n)) ?? groups.set(find(n), []).get(find(n))!).push(it));
    for (const g of groups.values()) {
      const x0 = Math.min(...g.map(lo));
      const x1 = Math.max(...g.map(hi));
      const z0 = Math.min(...g.map(zlo));
      const z1 = Math.max(...g.map(zhi));
      out.push({
        path: g[0]!.path,
        i: g[0]!.i,
        x: (x0 + x1) / 2,
        z: (z0 + z1) / 2,
        y0: Math.min(...g.map((a) => a.y0)),
        y1: Math.max(...g.map((a) => a.y1)),
        w: x1 - x0,
        d: z1 - z0,
        tris: g.reduce((s, a) => s + a.tris, 0),
      });
    }
  }
  return out;
}

export interface Classified extends Item {
  /** Vật cần va chạm (đủ to/cao, không phải phông xa). */
  needs: boolean;
  covered: boolean;
}

export interface GroupRow {
  group: string;
  n: number;
  missing: number;
  /** Mẫu: vật thiếu to nhất của nhóm. */
  sample: Item;
}

export interface ScanReport {
  level: string;
  total: number;
  needs: number;
  covered: number;
  missing: number;
  groups: GroupRow[];
  /** Lưới gộp khối lớn (không tách được từng vật): cần xuất collider từ hàm rải/build (C-2). */
  merged: { path: string; n: number; tris: number }[];
  /** Tối đa 300 vật thiếu to nhất. */
  top: Item[];
}

/** Ngưỡng: cao ≥ MIN_H và cạnh lớn ≥ MIN_W mới cần va chạm; > MAX_W là địa hình/phông, không tính. */
export const MIN_H = 0.6;
export const MIN_W = 0.35;
export const MAX_W = 160;

type Dist = (s: Shape, x: number, z: number) => number;

export function classify(
  items: readonly Item[],
  circles: readonly CircleCollider[],
  shapes: readonly Shape[],
  footprintDist: Dist,
  groundAt: (x: number, z: number) => number,
): Classified[] {
  return mergeItems(items).map((it) => {
    if (it.merged) return { ...it, needs: false, covered: false };
    const size = Math.max(it.w, it.d);
    const h = it.y1 - it.y0;
    const g = groundAt(it.x, it.z);
    // Quá lớn (vách/địa hình) hoặc quá nhỏ bỏ qua; vật treo cao (mái) chỉ tính nếu đáy trong tầm người đi (< 8 m so với đất).
    const needs = h >= MIN_H && size >= MIN_W && size <= MAX_W && it.y1 > g + 0.3 && it.y0 < g + 8;
    if (!needs) return { ...it, needs: false, covered: false };
    const rad = size / 2;
    let covered = false;
    for (const c of circles) {
      if (Math.hypot(c.x - it.x, c.z - it.z) <= c.r + rad * 0.6) {
        covered = true;
        break;
      }
    }
    if (!covered)
      for (const s of shapes) {
        if (s.y0 > it.y1 || s.y1 < it.y0) continue;
        if (footprintDist(s, it.x, it.z) <= rad * 0.6) {
          covered = true;
          break;
        }
      }
    return { ...it, needs: true, covered };
  });
}

/** Gốc nhóm: bỏ số cuối để gom theo loại (`prop_den_da_12` → `prop_den_da`). */
export function groupOf(path: string): string {
  return path
    .split('>')
    .map((s) => s.replace(/[_\-. ]?\d+$/g, ''))
    .join('>');
}

export function summarize(level: string, rows: readonly Classified[]): ScanReport {
  const needs = rows.filter((r) => r.needs);
  const missing = needs.filter((r) => !r.covered);
  const by = new Map<string, GroupRow>();
  for (const r of needs) {
    const k = groupOf(r.path);
    let g = by.get(k);
    if (!g) by.set(k, (g = { group: k, n: 0, missing: 0, sample: r }));
    g.n++;
    if (!r.covered) {
      g.missing++;
      if (g.missing === 1 || Math.max(r.w, r.d) > Math.max(g.sample.w, g.sample.d)) g.sample = r;
    }
  }
  const vol = (r: Item): number => r.w * r.d * (r.y1 - r.y0);
  return {
    level,
    total: rows.length,
    needs: needs.length,
    covered: needs.length - missing.length,
    missing: missing.length,
    groups: [...by.values()].sort((a, b) => b.missing - a.missing),
    merged: mergedRows(rows),
    top: [...missing].sort((a, b) => vol(b) - vol(a)).slice(0, 300),
  };
}

function mergedRows(rows: readonly Classified[]): { path: string; n: number; tris: number }[] {
  const m = new Map<string, { path: string; n: number; tris: number }>();
  for (const r of rows) {
    if (!r.merged) continue;
    const g = m.get(r.path) ?? { path: r.path, n: 0, tris: 0 };
    g.n++;
    g.tris += r.tris;
    m.set(r.path, g);
  }
  return [...m.values()].sort((a, b) => b.tris - a.tris);
}
