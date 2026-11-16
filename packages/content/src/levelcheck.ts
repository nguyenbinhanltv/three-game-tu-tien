// Kiểm bố cục MỘT level (E1-G): hàm thuần trả danh sách lỗi, dùng cho `content:check` (mọi level) và test.
// Vân Lam giữ nguyên ngưỡng M-1 (300–380 quái thường); level mới chuẩn theo mật độ 100–140 quái/km² vùng săn.
// Mọi level: camp trong đa giác vùng đúng cấp, không đè collider/prop/nước, tinh anh hợp vùng, spawn/node trong vùng chơi,
// trận truyền tống đứng được, id quái/prop tồn tại (level mới còn cần asset nguồn của quái).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inPoly, levelSpawns, MAX_LEVEL, polyArea, propsOf, TELE_FREE, TELE_PADS, terrainOf, WATER_Y, type HandProp, type LevelDef, type TelePad, type ZoneDef } from '@dtl/shared';
import { campCoverage, COVER_BY_LEVEL, DEFAULT_COVER } from './coverage';
import { GLOSSARY, hasString, ITEM, MONSTER, t } from './index';

/** Level giữ bố cục M-1 (ngưỡng số quái tuyệt đối). Level khác dùng mật độ. */
export const LEGACY_LEVELS: readonly string[] = ['van_lam', 'kiem_trung'];
/** Mật độ quái thường/km² vùng săn cho level mới (bản đồ mở rộng). */
export const DENSITY_MIN = 100;
export const DENSITY_MAX = 140;
export const MUSIC_ZONES = ['sect', 'wild', 'forest', 'lake', 'dungeon'];

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export interface LevelCheckOpts {
  /** Kiểm chuỗi i18n/glossary (tên vùng, điểm, trận). Fixture tắt. Mặc định true. */
  strings?: boolean;
  /** Kiểm asset nguồn của quái (assets/source/mon/<id>). Mặc định bật cho level không thuộc LEGACY_LEVELS. Prop luôn kiểm. */
  assets?: boolean;
  /** Prop bày của level; mặc định `propsOf(level.id)`. */
  props?: readonly HandProp[];
  /** Trận truyền tống của level (đã lọc); mặc định lọc `TELE_PADS` theo trường `level`. */
  pads?: readonly TelePad[];
  /** Id trận mở sẵn; mặc định `TELE_FREE`. */
  free?: readonly string[];
  /** Kiểm chuẩn độ phủ cụm (coverage.ts). Mặc định true; level thử nhỏ tắt. */
  coverage?: boolean;
}

const assetExists = (kind: 'mon' | 'prop', id: string) => fs.existsSync(path.join(ROOT, 'assets/source', kind, id));

export function checkLevel(lv: LevelDef, opts: LevelCheckOpts = {}): string[] {
  const errors: string[] = [];
  const where = `level ${lv.id}`;
  const err = (m: string) => errors.push(m);
  const strings = opts.strings ?? true;
  const legacy = LEGACY_LEVELS.includes(lv.id);
  const checkAssets = opts.assets ?? !legacy;
  const tr = terrainOf(lv);
  const B = tr.playBounds;
  const inPlay = (x: number, z: number) => x >= B.x0 && x <= B.x1 && z >= B.z0 && z <= B.z1;
  const props = opts.props ?? propsOf(lv.id);
  const pads = opts.pads ?? TELE_PADS.filter((p) => p.level === lv.id);
  const free = opts.free ?? TELE_FREE;
  const zones = lv.zones ?? [];
  const camps = lv.camps ?? [];

  const needStr = (key: string) => {
    if (strings && !hasString(key)) err(`thiếu chuỗi i18n: ${key}`);
  };
  const dupIds = (kind: string, list: { id: string }[]) => {
    const seen = new Set<string>();
    for (const e of list) {
      if (seen.has(e.id)) err(`${where}: ${kind} id trùng ${e.id}`);
      seen.add(e.id);
      if (!/^[a-z0-9_]+$/.test(e.id)) err(`${where}: ${kind} id không hợp lệ ${e.id}`);
    }
  };
  const colliderHit = (x: number, z: number, margin: number) => tr.colliders.find((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + margin) ** 2);
  const propHit = (x: number, z: number, margin: number) => props.find((p) => Math.hypot(p.x - x, p.z - z) < (p.r ?? 0.8) + margin);
  const monAsset = (id: string, ctx: string) => {
    if (!MONSTER.has(id)) return err(`${where}: ${ctx} quái không tồn tại ${id}`);
    if (checkAssets && !assetExists('mon', id)) err(`${where}: ${ctx} quái ${id} chưa có asset nguồn assets/source/mon/${id}`);
  };

  // Điểm đáng chú ý (M-5): mỗi vùng đúng một điểm, nằm khe giữa các bãi, đủ prop, tên theo glossary.
  const checkPois = (zoneById: Map<string, ZoneDef>) => {
    const pois = lv.pois ?? [];
    if (!pois.length) return;
    dupIds('poi', pois);
    const perZone = new Map<string, number>();
    const glossPois = GLOSSARY.pois as Record<string, string>;
    const clearOfCamps = (x: number, z: number, margin: number) => camps.every((c) => Math.hypot(c.x - x, c.z - z) >= c.radius + margin);
    for (const p of pois) {
      const w = `${where}: poi ${p.id}`;
      needStr(`poi.${p.id}.name`);
      needStr(`poi.${p.id}.desc`);
      if (strings && t(`poi.${p.id}.name`) !== glossPois[p.id]) err(`${w}: tên lệch glossary.pois`);
      const zn = zoneById.get(p.zone);
      if (!zn) {
        err(`${w}: vùng không có ${p.zone}`);
        continue;
      }
      perZone.set(p.zone, (perZone.get(p.zone) ?? 0) + 1);
      if (!inPoly(zn.poly, p.x, p.z)) err(`${w}: nằm ngoài vùng ${p.zone}`);
      if (tr.def.water && tr.groundAt(p.x, p.z) < WATER_Y + 1.5) err(`${w}: nằm sát nước`);
      if (!clearOfCamps(p.x, p.z, 6)) err(`${w}: chồng bãi quái (cần cách mép bãi ≥ 6 m)`);
      const near = props.filter((h) => Math.hypot(h.x - p.x, h.z - p.z) <= 14);
      if (near.length < 5) err(`${w}: chỉ ${near.length} prop quanh điểm (cần ≥ 5)`);
      for (const h of near) {
        if (!clearOfCamps(h.x, h.z, 2)) err(`${w}: prop ${h.id} (${h.x}, ${h.z}) đè bãi quái`);
        for (const pad of pads) if (Math.hypot(h.x - pad.x, h.z - pad.z) < 4) err(`${w}: prop ${h.id} (${h.x}, ${h.z}) đè Truyền Tống Trận ${pad.id}`);
        if ((h.r ?? 0) > (legacy ? 1.5 : 4.5)) err(`${w}: prop ${h.id} va chạm r=${h.r} quá lớn (> ${legacy ? 1.5 : 4.5} m, không được chặn đường)`);
      }
      if (p.beamH !== undefined && !(p.beamH >= 30 && p.beamH <= 120)) err(`${w}: beamH ${p.beamH} ngoài 30–120 m`);
    }
    for (const z of zoneById.keys()) if ((perZone.get(z) ?? 0) !== 1) err(`${where}: vùng ${z} cần đúng một poi (có ${perZone.get(z) ?? 0})`);
  };

  // ---- quái lẻ (tinh anh/boss) và điểm tài nguyên ----
  for (const s of lv.spawns) {
    monAsset(s.mon, 'spawn');
    const m = MONSTER.get(s.mon);
    if (!Number.isFinite(tr.groundAt(s.x, s.z))) err(`${where}: spawn ${s.mon} ngoài bản đồ`);
    if (!m?.boss && tr.heightAt(s.x, s.z) < WATER_Y && tr.def.water) err(`${where}: spawn ${s.mon} nằm dưới nước`);
    if (!legacy && !inPlay(s.x, s.z)) err(`${where}: spawn ${s.mon} (${s.x}, ${s.z}) ngoài vùng chơi`);
    if (!legacy && !(s.levelMin >= 1 && s.levelMin <= s.levelMax && s.levelMax <= MAX_LEVEL)) err(`${where}: spawn ${s.mon} cấp ${s.levelMin}–${s.levelMax} không hợp lệ (1–${MAX_LEVEL})`);
    if (!legacy && !(s.respawn > 0)) err(`${where}: spawn ${s.mon} thiếu respawn`);
    if (colliderHit(s.x, s.z, 0)) err(`${where}: spawn ${s.mon} (${s.x}, ${s.z}) đè collider`);
  }
  for (const n of lv.nodes) {
    if (!ITEM.has(n.item)) err(`${where}: node vật phẩm không tồn tại ${n.item}`);
    if (!legacy && !inPlay(n.x, n.z)) err(`${where}: node ${n.item} ngoài vùng chơi`);
    if (!legacy && colliderHit(n.x, n.z, 0)) err(`${where}: node ${n.item} đè collider`);
  }

  // ---- prop bày: asset tồn tại, nằm trong vùng chơi ----
  for (const p of props) {
    if (!assetExists('prop', p.id)) err(`${where}: prop ${p.id} chưa có asset nguồn assets/source/prop/${p.id}`);
    if (!legacy && !inPlay(p.x, p.z)) err(`${where}: prop ${p.id} (${p.x}, ${p.z}) ngoài vùng chơi`);
  }

  // ---- vùng và camp ----
  if (zones.length || camps.length) {
    dupIds('zone', zones);
    dupIds('camp', camps);
    const zoneById = new Map<string, ZoneDef>(zones.map((z) => [z.id, z]));
    for (const z of zones) {
      needStr(`zone.${z.id}`);
      if (!/^#[0-9a-fA-F]{6}$/.test(z.color)) err(`zone ${z.id}: color phải dạng #rrggbb`);
      if (!MUSIC_ZONES.includes(z.music)) err(`zone ${z.id}: music ${z.music} không có (${MUSIC_ZONES.join(', ')})`);
      if (!(z.lvMin >= 1 && z.lvMin <= z.lvMax && z.lvMax <= MAX_LEVEL)) err(`zone ${z.id}: khoảng cấp ${z.lvMin}–${z.lvMax} không hợp lệ (1–${MAX_LEVEL})`);
      if (z.poly.length < 3 || polyArea(z.poly) < 1000) err(`zone ${z.id}: đa giác ranh phải ≥ 3 đỉnh, diện tích ≥ 1000 m²`);
      for (const [x, zz] of z.poly) if (!inPlay(x, zz)) err(`zone ${z.id}: đỉnh (${x}, ${zz}) ngoài vùng chơi chính`);
    }
    for (const c of camps) {
      const m = MONSTER.get(c.mon);
      const zn = zoneById.get(c.zone);
      monAsset(c.mon, `camp ${c.id}`);
      if (m && (m.boss || m.elite)) err(`${where}: camp ${c.id} chỉ dành cho quái thường (tinh anh/boss khai ở spawns)`);
      if (!zn) {
        err(`${where}: camp ${c.id} thuộc vùng không có ${c.zone}`);
        continue;
      }
      if (!inPoly(zn.poly, c.x, c.z)) err(`${where}: camp ${c.id} nằm ngoài đa giác vùng ${c.zone}`);
      if (c.levelMin < zn.lvMin || c.levelMax > zn.lvMax || c.levelMin > c.levelMax) err(`${where}: camp ${c.id} cấp ${c.levelMin}–${c.levelMax} lệch khoảng cấp vùng ${c.zone} (${zn.lvMin}–${zn.lvMax})`);
      if (!(c.count >= 3 && c.count <= 4)) err(`${where}: camp ${c.id} count ${c.count} phải 3–4`);
      if (!(c.radius >= 18 && c.radius <= 30)) err(`${where}: camp ${c.id} radius ${c.radius} phải 18–30 m`);
      if (!(c.respawn > 0)) err(`${where}: camp ${c.id} thiếu respawn`);
      if (c.ranged) {
        monAsset(c.ranged, `camp ${c.id} ranged`);
        if (!MONSTER.get(c.ranged)?.ai?.caster) err(`${where}: camp ${c.id} ranged ${c.ranged} phải là quái có ai.caster`);
      }
      if (tr.def.water && tr.heightAt(c.x, c.z) < WATER_Y + 0.5) err(`${where}: camp ${c.id} nằm dưới nước`);
      const col = colliderHit(c.x, c.z, 1);
      if (col) err(`${where}: camp ${c.id} đè collider (${col.x}, ${col.z})`);
      const pr = propHit(c.x, c.z, 1);
      if (pr) err(`${where}: camp ${c.id} đè prop ${pr.id} (${pr.x}, ${pr.z})`);
    }
    // Tinh anh: ở trong vùng hợp cấp, mỗi vùng 2–3 con.
    const elitePerZone = new Map<string, number>();
    for (const s of levelSpawns(lv)) {
      if (!MONSTER.get(s.mon)?.elite) continue;
      const zn = zones.find((z) => inPoly(z.poly, s.x, s.z));
      if (!zn) {
        err(`${where}: tinh anh ${s.mon} ở (${s.x}, ${s.z}) không thuộc vùng nào`);
        continue;
      }
      if (s.levelMin < zn.lvMin || s.levelMax > zn.lvMax) err(`${where}: tinh anh ${s.mon} cấp ${s.levelMin}–${s.levelMax} lệch vùng ${zn.id} (${zn.lvMin}–${zn.lvMax})`);
      elitePerZone.set(zn.id, (elitePerZone.get(zn.id) ?? 0) + s.count);
    }
    for (const z of zones) {
      const n = elitePerZone.get(z.id) ?? 0;
      if (n < 2 || n > 3) err(`zone ${z.id}: ${n} tinh anh (cần 2–3)`);
    }
    const normal = camps.reduce((a, c) => a + c.count + (c.ranged ? 1 : 0), 0);
    if (legacy) {
      if (normal < 300 || normal > 380) err(`${where}: ${normal} quái thường theo camps, mục tiêu ~300–360`);
    } else {
      const km2 = zones.reduce((a, z) => a + polyArea(z.poly), 0) / 1e6;
      const density = km2 > 0 ? normal / km2 : 0;
      if (!(density >= DENSITY_MIN && density <= DENSITY_MAX)) err(`${where}: mật độ ${density.toFixed(0)} quái/km² (${normal} quái / ${km2.toFixed(3)} km² vùng săn), cần ${DENSITY_MIN}–${DENSITY_MAX}`);
    }
    if (!legacy && camps.length && (opts.coverage ?? true)) {
      // Chuẩn độ phủ của bản đồ mở rộng (coverage.ts): p95 và điểm xa nhất tới mép cụm gần nhất. Vân Lam giữ chuẩn riêng ở mapreport.
      const cv = campCoverage(lv);
      const std = COVER_BY_LEVEL[lv.id] ?? DEFAULT_COVER;
      if (cv.max > std.max) err(`${where}: độ phủ cụm: điểm (${cv.worst.x}, ${cv.worst.z}) cách mép cụm gần nhất ${cv.max.toFixed(0)} m, cần ≤ ${std.max} m`);
      if (cv.p95 > std.p95) err(`${where}: độ phủ cụm: p95 ${cv.p95.toFixed(0)} m, cần ≤ ${std.p95} m`);
    }
    checkPois(zoneById);
  }

  // ---- Truyền Tống Trận ----
  if (pads.length) {
    dupIds('trận', [...pads]);
    for (const z of zones) if (pads.filter((p) => p.zone === z.id).length !== 1) err(`${where}: vùng ${z.id} cần đúng một Truyền Tống Trận`);
    // Trận mở sẵn: bắt buộc ở bản đồ gốc (Vân Lam) và khi truyền `free`; level mở rộng mở khóa bằng cách chạm trận.
    if ((legacy || opts.free) && !pads.some((p) => free.includes(p.id))) err(`${where}: cần ít nhất một trận mở sẵn`);
    for (const pad of pads) {
      const w = `${where}: trận ${pad.id}`;
      needStr(`tele.${pad.id}`);
      if (pad.zone) {
        const zn = zones.find((z) => z.id === pad.zone);
        if (!zn) err(`${w}: vùng ${pad.zone} không tồn tại`);
        else if (!inPoly(zn.poly, pad.x, pad.z)) err(`${w}: không nằm trong vùng ${pad.zone}`);
      }
      if (!inPlay(pad.x, pad.z)) err(`${w}: ngoài vùng chơi`);
      const col = colliderHit(pad.x, pad.z, 4);
      if (col) err(`${w}: đè collider (${col.x}, ${col.z})`);
      const pr = propHit(pad.x, pad.z, 2);
      if (pr) err(`${w}: đè prop ${pr.id} (${pr.x}, ${pr.z})`);
      const h = tr.heightAt;
      if (tr.def.water && h(pad.x, pad.z) < WATER_Y + 1) err(`${w}: dưới nước`);
      const slope = Math.max(Math.abs(h(pad.x + 4, pad.z) - h(pad.x, pad.z)), Math.abs(h(pad.x, pad.z + 4) - h(pad.x, pad.z)));
      if (slope > 2.6) err(`${w}: dốc ${slope.toFixed(1)} m/4 m, cần chỗ bằng`);
      for (const c of camps) if (Math.hypot(pad.x - c.x, pad.z - c.z) < c.radius + 4) err(`${w}: nằm trong bãi quái ${c.id}`);
      for (const s of lv.spawns) if (Math.hypot(pad.x - s.x, pad.z - s.z) < s.radius + 20) err(`${w}: quá gần điểm sinh ${s.mon}`);
    }
  }
  return errors;
}
