// Sinh bố cục prop PROP-1 "Thiên Công Khai Vật" -> packages/shared/src/props.thiencong.ts (tất định theo seed).
// Chạy: pnpm --filter @dtl/content exec tsx src/gen-thien-cong.ts [--groups tong_mon,cho_lang,...] [--level van_lam]
// Rải có kiểm soát theo `thienCongScenes.ts`: chỉ đặt chỗ đi được, không dốc, không đè va chạm/đường đi/điểm nhấn/trạm/cổng/NPC,
// món có va chạm tránh thêm bãi quái và điểm tinh anh (không làm quái kẹt hay bị chặn lối đánh), món không va chạm (cây thấp, nấm…) được vào bãi quái.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLIDERS_LAYOUT, TRAILS, basePropsOf, TELE_PADS, thienCongColliders, terrainOf, WATER_Y, type HandProp } from '@dtl/shared';
import { LEVELS, NPCS } from './index';
import { SCENES, sectAxis, type Scene } from './thienCongScenes';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const REAL_OUT = path.join(ROOT, 'packages/shared/src/props.thiencong.ts');
/** `--check`: sinh ra file tạm rồi so với file thật (chạy lại phải ra y hệt; thoát 1 nếu lệch). */
const CHECK = process.argv.includes('--check');
const OUT = CHECK ? path.join(ROOT, 'packages/shared/src/props.thiencong.check.ts') : REAL_OUT;
const ITEMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/blender/prop_tc_items.json'), 'utf8')).groups as Record<
  string,
  { name: string; vi: string; collider: number | [number, number, number][]; foot?: number; ext?: string }[]
>;
const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const GROUPS = (opt('--groups') ?? Object.keys(ITEMS).join(',')).split(',');
const ONLY = opt('--level');
const SEED = 20261119;
/** Điểm cần thoáng theo level: [x, z, bán kính]. Đoạn Mạch (584, 926): đống củi + mộ cổ + đỉnh lư khép kín quanh điểm (cổng mộ). */
const KEEP_CLEAR: Record<string, [number, number, number][]> = { doan_mach: [[584, 926, 6.5]] };
/** Hệ số mật độ cho số lượng rải ngẫu nhiên của `thienCongScenes.ts` (duyệt ảnh: bản đầu quá thưa, trước/sau không phân biệt được). */
const DENSITY = 2.2;
/** Món nhỏ/rẻ chỉ bày một biến thể: mỗi id × LOD × vật liệu là một InstancedMesh, nên bớt id để cảnh đông (chợ) không vượt 300 draw call. */
const SINGLE = new Set([
  'linh_thao',
  'nam_phat_sang',
  'kho_go',
  'vo_ruou',
  'gio_thuoc',
  'thung_go',
  'lu_nuoc',
  'long_den_giay',
  'hang_rao_tre',
]);

const groupOf = new Map<string, string>();
const extOf = new Map<string, string>();
/** id asset của một món: món `ext` dùng asset có sẵn (không có biến thể), còn lại prop_tc_<tên>[_2]. */
const idOf = (name: string, v2: boolean) => extOf.get(name) ?? `prop_tc_${name}${v2 ? '_2' : ''}`;
const info = new Map<string, { collider: [number, number, number][]; foot: number }>();
for (const [g, list] of Object.entries(ITEMS)) {
  for (const it of list) {
    groupOf.set(it.name, g);
    if (it.ext) extOf.set(it.name, it.ext);
    const col: [number, number, number][] = typeof it.collider === 'number' ? (it.collider > 0 ? [[0, 0, it.collider]] : []) : it.collider;
    const foot = it.foot ?? col[0]?.[2] ?? 0.5; // nửa cạnh lớn nhất của hộp bao (m), lưu trong danh mục JSON để bộ sinh tất định, không phụ thuộc file build
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
  const prevTc = new Set(thienCongColliders(levelId).map((c) => `${c.x},${c.z},${c.r}`));
  const solidBlock: Circle[] = [
    ...tr.colliders.filter((c) => !prevTc.has(`${c.x},${c.z},${c.r}`)).map((c) => ({ x: c.x, z: c.z, r: c.r })), // bỏ vòng va chạm của lần sinh trước (đã nằm trong địa hình)
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
  /** Hành lang đường mòn (chỉ Vân Lam có `TRAILS` vẽ tay): các nhóm sinh từ PR4 trở đi (tran_phap, di_vuc) chừa 4 m mỗi bên trục đường; nhóm cũ giữ nguyên toạ độ đã duyệt. */
  const trailBlock: Circle[] = [];
  if (levelId === 'van_lam')
    for (const tr2 of TRAILS)
      for (let i = 0; i + 1 < tr2.length; i++) {
        const [ax, az] = tr2[i]!;
        const [bx, bz] = tr2[i + 1]!;
        const n2 = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
        for (let k = 0; k <= n2; k++) trailBlock.push({ x: ax + ((bx - ax) * k) / n2, z: az + ((bz - az) * k) / n2, r: 4 });
      }
  const NEW_GROUPS = new Set(['tran_phap', 'di_vuc']);
  const campCentres: Circle[] = (L.camps ?? []).map((c) => ({ x: c.x, z: c.z, r: 1.9 }));
  const campDiscs: Circle[] = (L.camps ?? []).map((c) => ({ x: c.x, z: c.z, r: c.radius + 2 }));
  const poiSpots = L.pois ?? [];
  const monBlock: Circle[] = [
    ...(L.camps ?? []).map((c) => ({ x: c.x, z: c.z, r: c.radius + 2 })),
    ...(L.spawns ?? []).map((s) => ({ x: s.x, z: s.z, r: s.radius + 3 })),
  ];
  const lvSeed = SEED + [...levelId].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  let rand = rng(lvSeed);
  const placed: TcProp[] = [];
  /** Mọi vòng va chạm đã đặt (mọi nhóm): nhóm hoang dã giữ khe ≥ 3 m giữa các vòng để cụm dày không tạo túi kín nhốt người chơi (`map:report` quét chỗ kẹt). */
  const allCols: Circle[] = [];
  const spots: (Circle & { solid: boolean; g: string })[] = [];
  const list: TcProp[] = [];
  const miss: string[] = [];
  // Duyệt theo thứ tự nhóm rồi cảnh, mỗi (cảnh, món) một dòng số ngẫu nhiên riêng: bật thêm nhóm chỉ thêm prop, không xê dịch prop của nhóm trước (PR chia theo nhóm).
  const order = Object.keys(ITEMS);
  const jobs = SCENES[levelId]!.flatMap((sc, si) => Object.entries(sc.items).map(([name, n]) => ({ sc, si, name, n }))).sort(
    (a, b) => order.indexOf(groupOf.get(a.name) ?? '') - order.indexOf(groupOf.get(b.name) ?? ''),
  );
  // Bày tay (dx, dz tính từ tâm cảnh): cụm điểm nhấn dọc đường chính, quanh kiếm đài, trước điện… Không rải ngẫu nhiên, chỉ kiểm bản đồ.
  const clusterCache = new Map<number, [number, number][]>();
  const clusterCentres = (si: number, sc: Scene): [number, number][] => {
    let c = clusterCache.get(si);
    if (!c) {
      const r2 = rng(lvSeed + si * 104729 + 17);
      c = [];
      for (let i = 0; i < sc.clusters!; i++) {
        const a = r2() * Math.PI * 2;
        const d = Math.sqrt((sc.rMin ?? 0) ** 2 + r2() * (sc.r ** 2 - (sc.rMin ?? 0) ** 2));
        c.push([sc.at[0] + Math.cos(a) * d, sc.at[1] + Math.sin(a) * d]);
      }
      clusterCache.set(si, c);
    }
    return c;
  };
  const placeFixed = (group: string) => {
    for (const { sc, f } of SCENES[levelId]!.flatMap((sc) => (sc.fixed ?? []).map((f) => ({ sc, f })))) {
      const g = groupOf.get(f.name);
      if (!g || g !== group || !GROUPS.includes(g)) continue;
      const inf = info.get(f.name)!;
      const x = Math.round((sc.at[0] + f.dx) * 10) / 10;
      const z = Math.round((sc.at[1] + f.dz) * 10) / 10;
      const sc2 = f.s ?? 1;
      const prop: TcProp = { id: idOf(f.name, !!f.v2 && !SINGLE.has(f.name)), x, z, yaw: f.yaw ?? 0, s: sc2 };
      if (inf.collider.length) {
        const cy = Math.cos(prop.yaw);
        const sy = Math.sin(prop.yaw);
        prop.col = inf.collider.map(([dx, dz, r]) => ({
          x: Math.round((x + (dx * cy + dz * sy) * sc2) * 10) / 10,
          z: Math.round((z + (-dx * sy + dz * cy) * sc2) * 10) / 10,
          r: Math.round(r * sc2 * 100) / 100,
        }));
      }
      if (
        NEW_GROUPS.has(group) &&
        ((prop.col ?? [{ x, z, r: 0.5 }]).some((c) => near(trailBlock, c.x, c.z, c.r)) || near(trailBlock, x, z, 0.5))
      ) {
        miss.push(`bày tay ${f.name} (${x}, ${z}) chắn đường mòn`);
        continue;
      }
      if (near(anyBlock, x, z, inf.foot * sc2 * 0.6) || (prop.col ?? []).some((c) => near(anyBlock, c.x, c.z, c.r))) {
        miss.push(`bày tay ${f.name} (${x}, ${z}) đè trận truyền tống/cổng/điểm đặc biệt`);
        continue;
      }
      if ((prop.col ?? []).some((c) => near(monBlock, c.x, c.z, c.r)) || near(campCentres, x, z, 0)) {
        miss.push(`bày tay ${f.name} (${x}, ${z}) nằm trong bãi quái/tâm bãi`);
        continue;
      }
      const hit = (prop.col ?? [{ x, z, r: 0.5 }]).find((c) => near(solidBlock, c.x, c.z, c.r));
      if (hit) {
        miss.push(`bày tay ${f.name} (${x}, ${z}) đè vật cản`);
        continue;
      }
      const footF = inf.foot * sc2;
      const clash = spots.find((p) => p.g !== group && (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + footF + 0.5) ** 2); // như nhánh rải: không xuyên prop của NHÓM TRƯỚC (prop cùng nhóm đã duyệt từ PR trước nên giữ nguyên)
      if (clash) {
        miss.push(`bày tay ${f.name} (${x}, ${z}) xuyên prop đã đặt ở (${clash.x}, ${clash.z})`);
        continue;
      }
      list.push(prop);
      allCols.push(...(prop.col ?? []));
      spots.push({ x, z, r: inf.foot * sc2, solid: !!prop.col, g: group });
      placed.push(prop);
    }
  };
  for (const group of order) {
    placeFixed(group);
    for (const { sc, si, name, n } of jobs.filter((j) => groupOf.get(j.name) === group)) {
      const h0 = tr.heightAt(sc.at[0], sc.at[1]);
      const lo = sc.rMin ?? 0;
      {
        const g = groupOf.get(name);
        if (!g) continue; // món của nhóm chưa có trong danh mục (PR chia theo nhóm)
        if (!GROUPS.includes(g)) continue;
        rand = rng(lvSeed + si * 7919 + [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 3));
        const inf = info.get(name)!;
        const solid = inf.collider.length > 0;
        for (let k = 0; k < Math.round(n * DENSITY); k++) {
          let ok = false;
          for (let tries = 0; tries < 160 && !ok; tries++) {
            let x: number;
            let z: number;
            if (sc.nearBase) {
              const cs = basePropsOf(levelId).filter(
                (q) => sc.nearBase!.includes(q.id) && Math.hypot(q.x - sc.at[0], q.z - sc.at[1]) <= sc.r,
              );
              if (!cs.length) break;
              const c = cs[(k * 7 + tries) % cs.length]!;
              const ca = rand() * Math.PI * 2;
              const [r0, r1] = sc.nearR ?? [3, 8];
              const cd = r0 + rand() * (r1 - r0);
              x = Math.round((c.x + Math.cos(ca) * cd) * 10) / 10;
              z = Math.round((c.z + Math.sin(ca) * cd) * 10) / 10;
            } else if (sc.clusters && (!sc.clusterGroups || sc.clusterGroups.includes(g))) {
              // Rải theo cụm (lùm cây, bãi đá...): tâm cụm cố định theo cảnh, mỗi món chọn một cụm; cảnh đông ở từng chỗ thay vì loãng khắp vùng.
              const cc = clusterCentres(si, sc);
              const c = cc[(k + tries) % cc.length]!;
              const ca = rand() * Math.PI * 2;
              const cd = Math.sqrt(rand()) * (sc.clusterR ?? 22);
              x = Math.round((c[0] + Math.cos(ca) * cd) * 10) / 10;
              z = Math.round((c[1] + Math.sin(ca) * cd) * 10) / 10;
            } else {
              const a = rand() * Math.PI * 2;
              const d = Math.sqrt(lo * lo + rand() * (sc.r * sc.r - lo * lo));
              x = Math.round((sc.at[0] + Math.cos(a) * d) * 10) / 10;
              z = Math.round((sc.at[1] + Math.sin(a) * d) * 10) / 10;
            }
            const s = Math.round(((sc.scale?.[0] ?? 0.9) + rand() * ((sc.scale?.[1] ?? 1.15) - (sc.scale?.[0] ?? 0.9))) * 100) / 100;
            const foot = inf.foot * s;
            if (x < B.x0 + 10 || x > B.x1 - 10 || z < B.z0 + 10 || z > B.z1 - 10) continue;
            const h = tr.heightAt(x, z);
            if (sky ? sc.flat === undefined || Math.abs(h - h0) > sc.flat : tr.groundAt(x, z) < WATER_Y + 1.2 || h < WATER_Y + 1.2)
              continue;
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
            if (NEW_GROUPS.has(g) && near(trailBlock, x, z, foot)) continue;
            if (near(campCentres, x, z, 0)) continue; // levelcheck: tâm bãi quái không được đè prop (cả prop không va chạm)
            if (poiSpots.some((q) => (x - q.x) ** 2 + (z - q.z) ** 2 <= 15 ** 2) && near(campDiscs, x, z, 0)) continue; // prop quanh điểm đáng chú ý phải cách mép bãi ≥ 2 m
            if (spots.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + foot + 0.5) ** 2)) continue;
            const yaw =
              sc.face === 'center'
                ? Math.atan2(sc.at[0] - x, sc.at[1] - z)
                : sc.face === 'out'
                  ? Math.atan2(x - sc.at[0], z - sc.at[1])
                  : rand() * Math.PI * 2;
            const v2 = rand() < 0.5 && !SINGLE.has(name);
            const prop: TcProp = {
              id: idOf(name, v2),
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
              if (g === 'hoang_da' && cols.some((c) => allCols.some((o) => (c.x - o.x) ** 2 + (c.z - o.z) ** 2 < (c.r + o.r + 3) ** 2)))
                continue;
              prop.col = cols;
              allCols.push(...cols);
            }
            list.push(prop);
            spots.push({ x, z, r: foot, solid, g });
            placed.push(prop);
            ok = true;
          }
          if (!ok) miss.push(`${sc.note}: ${name}`);
        }
      }
    }
  }
  // Điểm cần trống (map:report báo kẹt khi prop rắn khép kín quanh điểm, COL-1): bỏ prop trong bán kính, KHÔNG dựng lại để không xê dịch prop khác.
  // Vân Lam: vòng tránh của kiến trúc tông môn (`COLLIDERS_LAYOUT`) — prop PROP-1 không được chạm (test propScatter) nên bỏ khi bộ sinh đặt chồng.
  const clear = [
    ...(KEEP_CLEAR[levelId] ?? []),
    ...(levelId === 'van_lam' ? COLLIDERS_LAYOUT.map((c) => [c.x, c.z, c.r + 2] as [number, number, number]) : []),
  ];
  for (let i = list.length - 1; i >= 0; i--)
    if (clear.some(([cx, cz, cr]) => Math.hypot(list[i]!.x - cx, list[i]!.z - cz) < cr)) list.splice(i, 1);
  out[levelId] = list;
  console.log(
    `[tc] ${levelId}: ${list.length} prop (${list.filter((p) => p.col).length} có va chạm, ${list.reduce((a, p) => a + (p.col?.length ?? 0), 0)} vòng)${miss.length ? `, thiếu ${miss.length}: ${[...new Set(miss)].slice(0, 40).join('; ')}` : ''}`,
  );
}

const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
const keep: Record<string, string> = {};
if (ONLY) for (const m of prev.matchAll(/^ {2}(\w+): \[\n([\s\S]*?)^ {2}\],$/gm)) keep[m[1]!] = m[2]!;
// Mỗi prop một hàng gọn: [id, x, z, yaw, s] hoặc thêm cột thứ sáu `col`: số = một vòng va chạm bán kính đó đặt đúng tại (x, z); mảng = các vòng [x, z, r] tự khai.
const fmt = (p: TcProp) => {
  const c = p.col;
  const own = c?.length === 1 && c[0]!.x === p.x && c[0]!.z === p.z;
  const col = !c ? '' : own ? `, ${c[0]!.r}` : `, [${c.map((q) => `[${q.x}, ${q.z}, ${q.r}]`).join(', ')}]`;
  return `    ['${p.id}', ${p.x}, ${p.z}, ${p.yaw}, ${p.s}${col}],\n`;
};
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

/** Hàng dữ liệu gọn: [id, x, z, yaw, s, col?]; col = bán kính một vòng tại (x, z), hoặc danh sách [x, z, r]. */
type TcRow = readonly [string, number, number, number, number, (number | readonly (readonly [number, number, number])[])?];

const expand = ([id, x, z, yaw, s, c]: TcRow): TcProp =>
  c === undefined ? { id, x, z, yaw, s } : { id, x, z, yaw, s, col: typeof c === 'number' ? [[x, z, c]] : c };

const ROWS: Record<string, readonly TcRow[]> = {
${body}};

export const THIEN_CONG_PROPS: Record<string, readonly TcProp[]> = Object.fromEntries(
  Object.entries(ROWS).map(([level, rows]) => [level, rows.map(expand)]),
);

/** Vòng va chạm của prop PROP-1 trong level. */
export function thienCongColliders(levelId: string): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const p of THIEN_CONG_PROPS[levelId] ?? []) for (const [x, z, r] of p.col ?? []) out.push({ x, z, r });
  return out;
}
`,
);
execSync(`pnpm exec prettier --write "${OUT}"`, { cwd: ROOT, stdio: 'ignore' }); // giữ khớp `pnpm format:check`
if (CHECK) {
  const norm = (f: string) => fs.readFileSync(f, 'utf8').replaceAll(String.fromCharCode(13), '');
  const same = norm(OUT) === norm(REAL_OUT);
  fs.rmSync(OUT);
  console.log(same ? '[tc] --check: khớp, bộ sinh tất định' : '[tc] --check: LỆCH so với props.thiencong.ts, chạy lại bộ sinh');
  process.exit(same ? 0 : 1);
}
console.log(`[tc] đã ghi ${path.relative(ROOT, OUT)}`);
