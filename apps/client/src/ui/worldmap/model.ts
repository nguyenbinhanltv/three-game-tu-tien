// Bản đồ lớn (M-4): dữ liệu vùng, bộ lọc lớp, phép chiếu kéo/zoom. Phần thuần, không đụng DOM để test được.
import { inPoly, levelSpawns, type LevelDef, type ZoneDef } from '@dtl/shared';
import { levelTerrain } from '../../game/core/levelCtx';
import { MONSTER } from '@dtl/content';

export type Layer = 'npc' | 'quest' | 'mon' | 'gather' | 'tele';
export const LAYERS: readonly Layer[] = ['npc', 'quest', 'mon', 'gather', 'tele'];
const DEFAULT_LAYERS: Record<Layer, boolean> = { npc: true, quest: true, mon: true, gather: true, tele: true };

/** Đọc bộ lọc đã lưu; thiếu/hỏng thì mặc định bật hết. */
export function parseLayers(raw: string | null): Record<Layer, boolean> {
  const out = { ...DEFAULT_LAYERS };
  try {
    const o = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    for (const k of LAYERS) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  } catch {
    /* dùng mặc định */
  }
  return out;
}

interface MonsterRow {
  id: string;
  lvMin: number;
  lvMax: number;
  /** Số bãi (thường) hoặc số điểm sinh (tinh anh/boss). */
  spots: number;
}

interface ZoneInfo {
  zone: ZoneDef;
  /** Tâm đa giác (để đặt nhãn và căn bản đồ). */
  cx: number;
  cz: number;
  monsters: MonsterRow[];
  elites: MonsterRow[];
  /** id vật phẩm thu thập ở trong vùng. */
  resources: string[];
}

function centroid(poly: readonly (readonly [number, number])[]): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p[0];
    z += p[1];
  }
  return { x: x / poly.length, z: z / poly.length };
}

function addRow(rows: Map<string, MonsterRow>, id: string, lvMin: number, lvMax: number): void {
  const r = rows.get(id);
  if (r) {
    r.lvMin = Math.min(r.lvMin, lvMin);
    r.lvMax = Math.max(r.lvMax, lvMax);
    r.spots++;
  } else rows.set(id, { id, lvMin, lvMax, spots: 1 });
}

/**
 * Thông tin từng vùng cho danh sách bên phải: quái thường theo bãi (`camps`), tinh anh/boss là điểm sinh lẻ (`spawns`) nằm
 * trong đa giác, tài nguyên là điểm hái có tâm trong đa giác. Sắp theo cấp thấp trước.
 */
export function zoneInfos(level: LevelDef): ZoneInfo[] {
  const out: ZoneInfo[] = [];
  for (const zone of level.zones ?? []) {
    const mon = new Map<string, MonsterRow>();
    for (const c of level.camps ?? []) {
      if (c.zone !== zone.id) continue;
      addRow(mon, c.mon, c.levelMin, c.levelMax);
      if (c.ranged) addRow(mon, c.ranged, c.levelMin, c.levelMax);
    }
    const eli = new Map<string, MonsterRow>();
    for (const s of level.spawns) if (inPoly(zone.poly, s.x, s.z)) addRow(eli, s.mon, s.levelMin, s.levelMax);
    const res = new Set<string>();
    for (const n of level.nodes) if (inPoly(zone.poly, n.x, n.z)) res.add(n.item);
    const c = centroid(zone.poly);
    const byLv = (a: MonsterRow, b: MonsterRow) => a.lvMin - b.lvMin || a.id.localeCompare(b.id);
    out.push({ zone, cx: c.x, cz: c.z, monsters: [...mon.values()].sort(byLv), elites: [...eli.values()].sort(byLv), resources: [...res] });
  }
  return out.sort((a, b) => a.zone.lvMin - b.zone.lvMin || a.zone.id.localeCompare(b.zone.id));
}

/** Các điểm sinh lẻ (tinh anh, boss) kèm loại, cho lớp quái trên bản đồ. */
export function soloSpawns(level: LevelDef): { id: string; x: number; z: number; boss: boolean; lvMax: number }[] {
  return level.spawns.map((s) => ({ id: s.mon, x: s.x, z: s.z, boss: !!MONSTER.get(s.mon)?.boss, lvMax: s.levelMax }));
}

/** Các bãi quái thường (tâm + khoảng cấp) — một biểu tượng mỗi bãi thay vì từng con. */
export function campSpots(level: LevelDef): { id: string; mon: string; x: number; z: number; lvMin: number; lvMax: number }[] {
  return (level.camps ?? []).map((c) => ({ id: c.id, mon: c.mon, x: c.x, z: c.z, lvMin: c.levelMin, lvMax: c.levelMax }));
}

export { levelSpawns };

// ---- Kéo và zoom ----

export interface MapView {
  /** Tâm bản đồ (thế giới). */
  cx: number;
  cz: number;
  /** px màn hình trên một mét. */
  scale: number;
}

/** Toàn vùng chơi (levelTerrain().playBounds) vừa khung; thu nhỏ tối thiểu là mức này, phóng to tối đa ~2,2 px/m. */
export function fitScale(size: { w: number; h: number }): number {
  const spanX = levelTerrain().playBounds.x1 - levelTerrain().playBounds.x0;
  const spanZ = levelTerrain().playBounds.z1 - levelTerrain().playBounds.z0;
  return Math.min(size.w / spanX, size.h / spanZ);
}
export const MAX_SCALE = 2.2;

export function fitView(size: { w: number; h: number }): MapView {
  return { cx: (levelTerrain().playBounds.x0 + levelTerrain().playBounds.x1) / 2, cz: (levelTerrain().playBounds.z0 + levelTerrain().playBounds.z1) / 2, scale: fitScale(size) };
}

/** Kẹp tỉ lệ và tâm để không kéo ra khỏi vùng chơi quá nửa khung. */
export function clampView(v: MapView, size: { w: number; h: number }): MapView {
  const scale = Math.min(MAX_SCALE, Math.max(fitScale(size), v.scale));
  const halfW = size.w / scale / 2;
  const halfH = size.h / scale / 2;
  const clampAxis = (c: number, lo: number, hi: number, half: number) => (hi - lo <= half * 2 ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, c)));
  return { scale, cx: clampAxis(v.cx, levelTerrain().playBounds.x0, levelTerrain().playBounds.x1, halfW), cz: clampAxis(v.cz, levelTerrain().playBounds.z0, levelTerrain().playBounds.z1, halfH) };
}

export function worldToScreen(v: MapView, size: { w: number; h: number }, x: number, z: number): { x: number; y: number } {
  return { x: size.w / 2 + (x - v.cx) * v.scale, y: size.h / 2 + (z - v.cz) * v.scale };
}

export function screenToWorld(v: MapView, size: { w: number; h: number }, sx: number, sy: number): { x: number; z: number } {
  return { x: v.cx + (sx - size.w / 2) / v.scale, z: v.cz + (sy - size.h / 2) / v.scale };
}

/** Zoom quanh con trỏ: điểm thế giới dưới con trỏ đứng yên. */
export function zoomAt(v: MapView, size: { w: number; h: number }, factor: number, sx: number, sy: number): MapView {
  const before = screenToWorld(v, size, sx, sy);
  const scale = Math.min(MAX_SCALE, Math.max(fitScale(size), v.scale * factor));
  const next = { cx: before.x - (sx - size.w / 2) / scale, cz: before.z - (sy - size.h / 2) / scale, scale };
  return clampView(next, size);
}

/** Kéo bản đồ `dx, dy` px. */
export function panBy(v: MapView, size: { w: number; h: number }, dx: number, dy: number): MapView {
  return clampView({ ...v, cx: v.cx - dx / v.scale, cz: v.cz - dy / v.scale }, size);
}

/** Biểu tượng gần con trỏ nhất trong `maxD` px (ưu tiên số nhỏ hơn khi bằng nhau); `pts` có toạ độ màn hình. */
export function pick<T extends { x: number; y: number; r: number }>(pts: readonly T[], mx: number, my: number, maxD = 8): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const p of pts) {
    const d = Math.hypot(p.x - mx, p.y - my) - p.r;
    if (d < maxD && d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

export interface LabelBox {
  /** Tâm ngang và mép dưới mong muốn (px màn hình). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Xếp nhãn không chồng nhau: nhãn nào đè lên nhãn đã đặt thì đẩy lên trên (mép dưới = mép trên của nhãn bị đè), lặp tới khi
 * hết đè. Thứ tự đầu vào là thứ tự ưu tiên (nhãn trước giữ chỗ). Sửa trực tiếp `y`.
 */
export function placeLabels(items: LabelBox[], gap = 2): void {
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    for (let guard = 0; guard < items.length + 1; guard++) {
      const hit = items.slice(0, i).find((b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && a.y > b.y - b.h - gap && a.y - a.h < b.y + gap);
      if (!hit) break;
      a.y = hit.y - hit.h - gap;
    }
  }
}
