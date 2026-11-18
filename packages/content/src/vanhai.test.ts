// E3-A/E3-N: Vân Hải Phù Đảo đạt bộ kiểm level, đúng số liệu thiết kế (5 vùng cấp 20–23, 12 tinh anh), địa hình đảo nổi nhất quán với dữ liệu.
import { describe, expect, it } from 'vitest';
import { polyArea, stepMove, TELE_FREE, TELE_PADS, terrainOf, type MoveState } from '@dtl/shared';
import { campCoverage, COVER_BY_LEVEL } from './coverage';
import { LEVELS } from './index';
import { checkLevel } from './levelcheck';

import { at } from '@dtl/shared';
const lv = at(LEVELS, 'van_hai');
const tr = terrainOf(lv);

describe('van_hai', () => {
  it('đạt checkLevel', () => expect(checkLevel(lv)).toEqual([]));

  it('đúng số liệu thiết kế', () => {
    const zones = lv.zones ?? [];
    const camps = lv.camps ?? [];
    expect(zones.map((z) => z.id)).toEqual(['tung_dai_dao', 'thach_quy_dao', 'kinh_ho_dao', 'loi_van_dao', 'kinh_ngu_dai']);
    expect(Math.min(...zones.map((z) => z.lvMin))).toBe(20);
    expect(Math.max(...zones.map((z) => z.lvMax))).toBe(23);
    expect(lv.spawns.filter((s) => s.mon.startsWith('elite_')).reduce((a, s) => a + s.count, 0)).toBe(12);
    const normal = camps.reduce((a, c) => a + c.count, 0);
    const km2 = zones.reduce((a, z) => a + polyArea(z.poly), 0) / 1e6;
    expect(normal / km2).toBeGreaterThanOrEqual(100);
    expect(normal / km2).toBeLessThanOrEqual(140);
  });

  it('chuẩn độ phủ của level là chuẩn bản đồ mới (p95 ≤ 65, max ≤ 85)', () => {
    expect(COVER_BY_LEVEL.van_hai).toEqual({ p95: 65, max: 85 });
    const cv = campCoverage(lv);
    expect(cv.max).toBeLessThanOrEqual(85);
    expect(cv.p95).toBeLessThanOrEqual(65);
  });

  it('địa hình đảo: mỗi vùng là một đảo, quanh đảo là sàn mây, mỗi vùng có cầu nối về hub', () => {
    const d = tr.def;
    expect(d.islands!.length).toBeGreaterThanOrEqual(9); // hub + 5 vùng + 3 đảo nhỏ
    expect(d.fakeIslands!.length).toBeGreaterThanOrEqual(3);
    expect(d.voidFloor).toBe(60);
    for (const c of lv.camps ?? []) {
      expect(tr.heightAt(c.x, c.z)).toBeGreaterThan(d.voidFloor! + 40); // quái đứng trên đảo, không trên sàn mây
    }
    // đồ thị cầu liên thông: mọi đảo vùng với tới hub
    const isl = d.islands!;
    const near = (x: number, z: number) => isl.findIndex((i) => Math.hypot(i.x - x, i.z - z) <= i.r + 1);
    const adj = new Map<number, Set<number>>();
    for (const b of d.bridges!.filter((x) => !x.id.startsWith('thang_'))) {
      const a = near(b.ax, b.az);
      const c = near(b.bx, b.bz);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(c).toBeGreaterThanOrEqual(0);
      (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(c);
      (adj.get(c) ?? adj.set(c, new Set()).get(c)!).add(a);
    }
    const seen = new Set<number>([0]);
    const q = [0];
    while (q.length) for (const n of adj.get(q.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), q.push(n));
    for (let i = 0; i <= 5; i++) expect(seen.has(i)).toBe(true); // hub + năm vùng
  });

  it('thang mây: mỗi đảo vùng và hub một thang, đáy ở sàn mây, đỉnh ở mặt đảo, đủ thoải để đi bộ', () => {
    const d = tr.def;
    const ramps = d.bridges!.filter((b) => b.id.startsWith('thang_'));
    expect(ramps).toHaveLength(6);
    for (const r of ramps) {
      expect(r.ay).toBe(d.voidFloor);
      expect(tr.heightAt(r.ax, r.az)).toBeCloseTo(d.voidFloor!, 1);
      expect(tr.heightAt(r.bx, r.bz)).toBeGreaterThan(d.voidFloor! + 40);
      const run = Math.hypot(r.bx - r.ax, r.bz - r.az);
      expect((r.by - r.ay) / run).toBeLessThan(1); // 0,35 m mỗi bước ngang: dốc < 1 thì không vướng MAX_STEP_UP
    }
  });

  it('đi bộ từ sàn mây lên đảo bằng thang mây (stepMove thật), còn vách đảo thì không leo được', () => {
    const d = tr.def;
    for (const r of d.bridges!.filter((b) => b.id.startsWith('thang_'))) {
      const len = Math.hypot(r.bx - r.ax, r.bz - r.az);
      const ux = (r.bx - r.ax) / len;
      const uz = (r.bz - r.az) / len;
      const s: MoveState = { x: r.ax, y: d.voidFloor!, z: r.az, vy: 0, grounded: true, flying: false };
      // hướng tiến = (-sin yaw, -cos yaw) khi mz = 1
      const yaw = Math.atan2(-ux, -uz);
      for (let i = 0; i < Math.ceil(len / 0.35) + 20; i++)
        stepMove(s, { s: i, mx: 0, mz: 1, yaw, f: 0 }, { canFly: false, frozen: false, speedMul: 1, terrain: tr });
      expect(s.y, r.id).toBeGreaterThan(r.by - 3);
      expect(s.grounded).toBe(true);
    }
  });

  it('đảo giả không có mặt đứng: tâm mỗi đảo giả là sàn mây', () => {
    for (const f of tr.def.fakeIslands!) {
      expect(tr.heightAt(f.x, f.z)).toBeCloseTo(tr.def.voidFloor!, 3);
      expect(f.y).toBeGreaterThan(tr.def.voidFloor! + 40);
    }
  });

  it('trận vh_: mỗi vùng một trận, hub có trận, không mở sẵn; q2_ket_dan mở trận hub', () => {
    const pads = TELE_PADS.filter((p) => p.level === 'van_hai');
    expect(pads.every((p) => p.id.startsWith('vh_tp_'))).toBe(true);
    expect(pads.some((p) => p.id === 'vh_tp_hub' && p.zone === '')).toBe(true);
    for (const z of lv.zones ?? []) expect(pads.filter((p) => p.zone === z.id)).toHaveLength(1);
    expect(TELE_FREE.some((id) => id.startsWith('vh_'))).toBe(false);
  });

  it('điểm vào là Phù Đảo Các, đứng được trên đảo', () => {
    const s = lv.spawn as { x: number; z: number };
    expect(Math.hypot(s.x - 1024, s.z - 1024)).toBeLessThan(40);
    expect(tr.heightAt(s.x, s.z)).toBeGreaterThan(tr.def.voidFloor! + 40);
  });
});

describe('van_hai: chặn leo vách đảo và thành cầu (đảo và cầu thật)', () => {
  const d = tr.def;
  const floor = d.voidFloor!;
  const yawOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);
  const OPTS = [{}, { jump: true }, { speedMul: 0.4 }, { jump: true, speedMul: 0.4 }];
  const segs = d.bridges!.map((b) => ({ id: b.id, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz }));
  const nearSeg = (x: number, z: number) =>
    Math.min(
      ...segs.map((q) => {
        const dx = q.bx - q.ax;
        const dz = q.bz - q.az;
        const t = Math.max(0, Math.min(1, ((x - q.ax) * dx + (z - q.az) * dz) / (dx * dx + dz * dz)));
        return Math.hypot(q.ax + dx * t - x, q.az + dz * t - z);
      }),
    );
  /** Đi `steps` bước theo hướng (dx, dz); trả [cao nhất, gần cầu/thang nhất]. */
  const walk = (s: MoveState, dir: [number, number], steps: number, opt: { jump?: boolean; speedMul?: number }) => {
    let maxY = s.y;
    let near = Infinity;
    for (let i = 0; i < steps; i++) {
      stepMove(
        s,
        { s: i, mx: 0, mz: 1, yaw: yawOf(dir[0], dir[1]), f: opt.jump ? 1 : 0 },
        { canFly: false, frozen: false, speedMul: opt.speedMul ?? 1, terrain: tr },
      );
      maxY = Math.max(maxY, s.y);
      near = Math.min(near, nearSeg(s.x, s.z));
    }
    return [maxY, near] as [number, number];
  };

  it('đi dọc từng cầu từ đảo này sang đảo kia: không bị chặn nhầm ở chỗ nối', () => {
    for (const b of d.bridges!.filter((x) => !x.id.startsWith('thang_'))) {
      const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
      const ux = (b.bx - b.ax) / len;
      const uz = (b.bz - b.az) / len;
      const s: MoveState = { x: b.ax - ux * 8, y: b.ay, z: b.az - uz * 8, vy: 0, grounded: true, flying: false };
      walk(s, [ux, uz], Math.ceil((len + 16) / 0.35), {});
      expect(s.y, b.id).toBeGreaterThan(b.by - 1);
      expect(s.grounded, b.id).toBe(true);
    }
  });

  it('vách từng đảo: đi chéo 10–30° so với mép, nhảy, chạy chậm: vẫn ở sàn mây', () => {
    let checked = 0;
    for (const isl of d.islands!) {
      for (let k = 0; k < 8; k++) {
        const ang = (k * Math.PI) / 4 + 0.3;
        const nx = -Math.cos(ang); // pháp tuyến vào trong
        const nz = -Math.sin(ang);
        const tx = -nz; // tiếp tuyến
        const tz = nx;
        const sx = isl.x - nx * (isl.r + isl.edge + 25);
        const sz = isl.z - nz * (isl.r + isl.edge + 25);
        if (nearSeg(sx, sz) < 120) continue;
        for (const deg of [10, 20, 30]) {
          const a = (deg * Math.PI) / 180;
          const dir: [number, number] = [nx * Math.sin(a) + tx * Math.cos(a), nz * Math.sin(a) + tz * Math.cos(a)];
          for (const opt of OPTS) {
            const s: MoveState = { x: sx, y: floor, z: sz, vy: 0, grounded: true, flying: false };
            const [maxY, near] = walk(s, dir, 400, opt);
            if (near < 8) continue; // đi ngang qua một thang/cầu: không tính
            expect(maxY, `${isl.x},${isl.z} k${k} ${deg}° ${JSON.stringify(opt)}`).toBeLessThan(floor + 3);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('thành từng cầu: đi chéo 10–30° vào dải cầu từ sàn mây, nhảy, chạy chậm: vẫn ở sàn mây', () => {
    for (const b of d.bridges!.filter((x) => !x.id.startsWith('thang_'))) {
      const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
      const ux = (b.bx - b.ax) / len;
      const uz = (b.bz - b.az) / len;
      const mx = (b.ax + b.bx) / 2;
      const mz = (b.az + b.bz) / 2;
      for (const side of [-1, 1])
        for (const deg of [10, 20, 30]) {
          const a = (deg * Math.PI) / 180;
          for (const opt of OPTS) {
            // đứng cách đường tim cầu 25 m, đi về phía cầu lệch `deg` so với đường tim
            const s: MoveState = {
              x: mx - uz * side * 25 - ux * 10,
              y: floor,
              z: mz + ux * side * 25 - uz * 10,
              vy: 0,
              grounded: true,
              flying: false,
            };
            const dir: [number, number] = [ux * Math.cos(a) + uz * side * Math.sin(a), uz * Math.cos(a) - ux * side * Math.sin(a)];
            const [maxY] = walk(s, dir, 150, { ...opt });
            expect(maxY, `${b.id} ${side} ${deg}° ${JSON.stringify(opt)}`).toBeLessThan(floor + 3);
          }
        }
    }
  });
});
