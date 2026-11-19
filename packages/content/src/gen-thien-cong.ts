// Sinh bố cục prop PROP-1 "Thiên Công Khai Vật" -> packages/shared/src/props.thiencong.ts (tất định theo seed).
// Chạy: pnpm --filter @dtl/content exec tsx src/gen-thien-cong.ts [--groups tong_mon,cho_lang,...] [--level van_lam]
// Rải có kiểm soát theo `thienCongScenes.ts`: chỉ đặt chỗ đi được, không dốc, không đè va chạm/đường đi/điểm nhấn/trạm/cổng/NPC,
// món có va chạm tránh thêm bãi quái và điểm tinh anh (không làm quái kẹt hay bị chặn lối đánh), món không va chạm (cây thấp, nấm…) được vào bãi quái.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { basePropsOf, TELE_PADS, terrainOf, WATER_Y, type HandProp } from '@dtl/shared';
import { LEVELS, NPCS } from './index';
import { SCENES, sectAxis } from './thienCongScenes';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'packages/shared/src/props.thiencong.ts');
const ITEMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/blender/prop_tc_items.json'), 'utf8')).groups as Record<
  string,
  { name: string; vi: string; collider: number | [number, number, number][] }[]
>;
const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const GROUPS = (opt('--groups') ?? Object.keys(ITEMS).join(',')).split(',');
const ONLY = opt('--level');
const SEED = 20261119;

const groupOf = new Map<string, string>();
const info = new Map<string, { collider: [number, number, number][]; foot: number }>();
const REPORT: Record<string, { size: [number, number, number] }> = {};
for (const g of Object.keys(ITEMS)) {
  const f = path.join(ROOT, `assets/build/raw/prop_tc_${g}_report.json`);
  if (fs.existsSync(f)) Object.assign(REPORT, JSON.parse(fs.readFileSync(f, 'utf8')));
}
for (const [g, list] of Object.entries(ITEMS)) {
  for (const it of list) {
    groupOf.set(it.name, g);
    const col: [number, number, number][] = typeof it.collider === 'number' ? (it.collider > 0 ? [[0, 0, it.collider]] : []) : it.collider;
    const rep = REPORT[`prop_tc_${it.name}`]?.size;
    const foot = rep ? Math.max(rep[0], rep[2]) / 2 : (col[0]?.[2] ?? 0.5);
    info.set(it.name, { collider: col, foot });
  }
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Circle {
  x: number;
  z: number;
  r: number;
}
const near = (list: Circle[], x: number, z: number, r: number) => list.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2);

export interface TcProp extends HandProp {
  /** Vòng va chạm (toạ độ thế giới); không có = đi xuyên được. */
  col?: Circle[];
}

const out: Record<string, TcProp[]> = {};
for (const levelId of Object.keys(SCENES)) {
  if (ONLY && levelId !== ONLY) continue;
  const L = LEVELS[levelId]!;
  const tr = terrainOf(L);
  const B = tr.playBounds;
  const sky = levelId === 'van_hai' || levelId === 'thien_khuyet';
  const base = basePropsOf(levelId);
  const solidBlock: Circle[] = [
    ...tr.colliders.map((c) => ({ x: c.x, z: c.z, r: c.r })),
    ...base.map((p) => ({ x: p.x, z: p.z, r: (p.r ?? 0) + 1.2 })),
  ];
  const anyBlock: Circle[] = [
    ...solidBlock,
    ...(L.pois ?? []).map((p) => ({ x: p.x, z: p.z, r: 4 })),
    ...(L.portals ?? []).map((p) => ({ x: p.x, z: p.z, r: p.r + 4 })),
    ...(L.nodes ?? []).map((n) => ({ x: n.x, z: n.z, r: 3 })),
    ...((L as { spots?: { x: number; z: number }[] }).spots ?? []).map((p) => ({ x: p.x, z: p.z, r: 5 })),
    ...TELE_PADS.filter((p) => p.level === levelId).map((p) => ({ x: p.x, z: p.z, r: 7 })),
    ...NPCS.filter((n) => (n as { level?: string }).level === levelId || (levelId === 'van_lam' && !(n as { level?: string }).level)).map(
      (n) => ({ x: (n as { x: number }).x, z: (n as { z: number }).z, r: 4 }),
    ),
    { x: L.spawn?.x ?? 0, z: L.spawn?.z ?? 0, r: 9 },
  ];
  const monBlock: Circle[] = [
    ...(L.camps ?? []).map((c) => ({ x: c.x, z: c.z, r: c.radius + 2 })),
    ...(L.spawns ?? []).map((s) => ({ x: s.x, z: s.z, r: s.radius + 3 })),
  ];
  const lvSeed = SEED + [...levelId].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  let rand = rng(lvSeed);
  const placed: TcProp[] = [];
  const spots: (Circle & { solid: boolean })[] = [];
  const list: TcProp[] = [];
  const miss: string[] = [];
  // Duyệt theo thứ tự nhóm rồi cảnh, mỗi (cảnh, món) một dòng số ngẫu nhiên riêng: bật thêm nhóm chỉ thêm prop, không xê dịch prop của nhóm trước (PR chia theo nhóm).
  const order = Object.keys(ITEMS);
  const jobs = SCENES[levelId]!.flatMap((sc, si) => Object.entries(sc.items).map(([name, n]) => ({ sc, si, name, n }))).sort(
    (a, b) => order.indexOf(groupOf.get(a.name) ?? '') - order.indexOf(groupOf.get(b.name) ?? ''),
  );
  for (const { sc, si, name, n } of jobs) {
    const h0 = tr.heightAt(sc.at[0], sc.at[1]);
    const lo = sc.rMin ?? 0;
    {
      const g = groupOf.get(name);
      if (!g) continue; // món của nhóm chưa có trong danh mục (PR chia theo nhóm)
      if (!GROUPS.includes(g)) continue;
      rand = rng(lvSeed + si * 7919 + [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 3));
      const inf = info.get(name)!;
      const solid = inf.collider.length > 0;
      for (let k = 0; k < n; k++) {
        let ok = false;
        for (let tries = 0; tries < 160 && !ok; tries++) {
          const a = rand() * Math.PI * 2;
          const d = Math.sqrt(lo * lo + rand() * (sc.r * sc.r - lo * lo));
          const x = Math.round((sc.at[0] + Math.cos(a) * d) * 10) / 10;
          const z = Math.round((sc.at[1] + Math.sin(a) * d) * 10) / 10;
          const s = Math.round(((sc.scale?.[0] ?? 0.9) + rand() * ((sc.scale?.[1] ?? 1.15) - (sc.scale?.[0] ?? 0.9))) * 100) / 100;
          const foot = inf.foot * s;
          if (x < B.x0 + 10 || x > B.x1 - 10 || z < B.z0 + 10 || z > B.z1 - 10) continue;
          const h = tr.heightAt(x, z);
          if (sky ? sc.flat === undefined || Math.abs(h - h0) > sc.flat : tr.groundAt(x, z) < WATER_Y + 1.2 || h < WATER_Y + 1.2) continue;
          if (sc.flat !== undefined && Math.abs(h - h0) > sc.flat) continue;
          if (sc.avoid?.(x, z) || (levelId === 'van_lam' && sectAxis(x, z))) continue; // không chiếm đường chính (propScatter.test kiểm)
          // độ dốc quanh chân
          const q = Math.max(0.8, foot);
          let slope = 0;
          for (const [dx, dz] of [
            [q, 0],
            [-q, 0],
            [0, q],
            [0, -q],
          ] as const)
            slope = Math.max(slope, Math.abs(tr.heightAt(x + dx, z + dz) - h));
          if (slope > 0.8 + foot * 0.3) continue;
          if (near(anyBlock, x, z, foot)) continue;
          if (solid && near(monBlock, x, z, foot)) continue;
          if (spots.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + foot + 0.5) ** 2)) continue;
          const yaw =
            sc.face === 'center'
              ? Math.atan2(sc.at[0] - x, sc.at[1] - z)
              : sc.face === 'out'
                ? Math.atan2(x - sc.at[0], z - sc.at[1])
                : rand() * Math.PI * 2;
          const v2 = rand() < 0.5;
          const prop: TcProp = {
            id: `prop_tc_${name}${v2 ? '_2' : ''}`,
            x,
            z,
            yaw: Math.round((yaw + (sc.face === 'random' ? 0 : (rand() - 0.5) * 0.3)) * 100) / 100,
            s,
          };
          if (solid) {
            const cy = Math.cos(prop.yaw);
            const sy = Math.sin(prop.yaw);
            const cols = inf.collider.map(([dx, dz, r]) => ({
              x: Math.round((x + (dx * cy + dz * sy) * s) * 10) / 10,
              z: Math.round((z + (-dx * sy + dz * cy) * s) * 10) / 10,
              r: Math.round(r * s * 100) / 100,
            }));
            if (cols.some((c) => near(monBlock, c.x, c.z, c.r) || near(anyBlock, c.x, c.z, c.r))) continue;
            prop.col = cols;
          }
          list.push(prop);
          spots.push({ x, z, r: foot, solid });
          placed.push(prop);
          ok = true;
        }
        if (!ok) miss.push(`${sc.note}: ${name}`);
      }
    }
  }
  out[levelId] = list;
  console.log(
    `[tc] ${levelId}: ${list.length} prop (${list.filter((p) => p.col).length} có va chạm, ${list.reduce((a, p) => a + (p.col?.length ?? 0), 0)} vòng)${miss.length ? `, thiếu ${miss.length}: ${[...new Set(miss)].slice(0, 6).join('; ')}` : ''}`,
  );
}

const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
const keep: Record<string, string> = {};
if (ONLY) for (const m of prev.matchAll(/^ {2}(\w+): \[\n([\s\S]*?)^ {2}\],$/gm)) keep[m[1]!] = m[2]!;
const fmt = (p: TcProp) =>
  `    { id: '${p.id}', x: ${p.x}, z: ${p.z}, yaw: ${p.yaw}, s: ${p.s}${p.col ? `, col: [${p.col.map((c) => `[${c.x}, ${c.z}, ${c.r}]`).join(', ')}]` : ''} },\n`;
let body = '';
for (const id of Object.keys(SCENES)) {
  const list = out[id];
  body += `  ${id}: [\n${list ? list.map(fmt).join('') : (keep[id] ?? '')}  ],\n`;
}
fs.writeFileSync(
  OUT,
  `// Prop "Thiên Công Khai Vật" (PROP-1) bày theo bố cục của packages/content/src/thienCongScenes.ts. SINH BẰNG packages/content/src/gen-thien-cong.ts: sửa ở đó rồi chạy lại.
// \`col\` = vòng va chạm (toạ độ thế giới, [x, z, r]); client và server cùng nạp qua \`registerTerrain\` (terrain.ts).
import type { HandProp } from './props.types';

export interface TcProp extends HandProp {
  col?: readonly (readonly [number, number, number])[];
}

export const THIEN_CONG_PROPS: Record<string, readonly TcProp[]> = {
${body}};

/** Vòng va chạm của prop PROP-1 trong level. */
export function thienCongColliders(levelId: string): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const p of THIEN_CONG_PROPS[levelId] ?? []) for (const [x, z, r] of p.col ?? []) out.push({ x, z, r });
  return out;
}
`,
);
execSync(`pnpm exec prettier --write "${OUT}"`, { cwd: ROOT, stdio: 'ignore' }); // giữ khớp `pnpm format:check`
console.log(`[tc] đã ghi ${path.relative(ROOT, OUT)}`);
