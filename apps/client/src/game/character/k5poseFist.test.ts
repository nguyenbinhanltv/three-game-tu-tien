import { describe, expect, it } from 'vitest';
import { POSE } from '@dtl/content';
import { resolveKeys, samplePose } from './ikpose';

/**
 * TP-3a: pose QUYỀN riêng của Thể tu (voice `tt`, tools/poses/gen-tt.mjs). k5poses.test.ts đo bốn giọng kiếm (tầm mũi kiếm, thế thủ chung `kiem_thu`, quá đà nhỏ);
 * quyền không có lưỡi nên voice `tt` ra khỏi các phép đo đó và có bộ đo riêng ở đây: hạ gối, xoay hông, nắm đấm dẫn đường, rút tay ngay sau va chạm (bản gốc)
 * so với giữ đỉnh (bản `_tp`).
 */
const IDS = ['phi_kiem_tt', 'phi_kiem_2_tt', 'phi_kiem_3_tt', 'kiem_khi_tram_tt'];
const P = (id: string) => {
  const p = POSE.get(id);
  if (!p) throw new Error(`thiếu pose ${id}`);
  return p;
};
const len = (v: number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);
const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i]!);
/** Tay đang đấm ở thời điểm t: tay duỗi xa hông nhất về phía trước (z). */
const strikeHand = (id: string, t: number): number[] => {
  const def = P(id);
  const s = samplePose(def, resolveKeys(def), t);
  const R = s.handR ?? [0, 0, 0];
  const L = s.handL ?? [0, 0, 0];
  return R[2]! >= L[2]! ? R : L;
};

describe('K-5/TP-3a: pose quyền Thể tu', () => {
  for (const id of IDS) {
    it(`${id}: 9 khung, khung 5 trúng ở hit[0] (quartOut), khung 7 trúng ở hit[1], về thế thủ`, () => {
      const def = P(id);
      const ks = resolveKeys(def);
      expect(def.keys.length).toBe(9);
      expect(ks[4]!.t).toBeCloseTo(def.hit![0]!, 3);
      expect(def.keys[4]!.ease).toBe('quartOut');
      expect(Math.abs(ks[6]!.t - def.hit![1]!)).toBeLessThanOrEqual(0.005);
      expect(ks[8]!.t).toBeCloseTo(def.duration, 2);
      expect(ks[8]!.hipsPos).toEqual(ks[0]!.hipsPos);
      expect(ks[8]!.handR).toEqual(ks[0]!.handR);
    });
    it(`${id}: hạ gối (hông ≤ −0,15 m), xoay hông ≥ 50° giữa dồn lực và trúng, nắm đấm duỗi ≥ 0,6 m trước hông, đi ≥ 0,4 m trong ≤ 0,08 s`, () => {
      const def = P(id);
      const ks = resolveKeys(def);
      expect(ks[2]!.hipsPos[1]).toBeLessThanOrEqual(-0.15);
      expect(Math.abs(ks[2]!.hipsRot[1] - ks[4]!.hipsRot[1])).toBeGreaterThanOrEqual(50);
      const peak = strikeHand(id, ks[4]!.t);
      expect(peak[2]).toBeGreaterThanOrEqual(0.6);
      expect(ks[4]!.t - ks[3]!.t).toBeLessThanOrEqual(0.08 + 1e-6);
      const at = (t: number) => samplePose(def, resolveKeys(def), t);
      const a = at(ks[3]!.t);
      const b = at(ks[4]!.t);
      const travel = Math.max(len(sub(b.handR ?? [0, 0, 0], a.handR ?? [0, 0, 0])), len(sub(b.handL ?? [0, 0, 0], a.handL ?? [0, 0, 0])));
      expect(travel).toBeGreaterThanOrEqual(0.4);
    });
    it(`${id}: mọi khung có hướng nắm đấm (sword/edge) để tay đấm thẳng ra, không dựng như cầm kiếm`, () => {
      for (const k of P(id).keys) {
        expect((k as { sword?: number[] }).sword, `${id} t=${k.t}`).toHaveLength(3);
        expect((k as { edge?: number[] }).edge, `${id} t=${k.t}`).toHaveLength(3);
      }
      // Khung trúng đầu: nắm đấm dẫn đường thẳng ra trước hoặc quét ngang (không hướng lên trời).
      const hit = (P(id).keys[4] as { sword: number[] }).sword;
      expect(hit[1]!).toBeLessThanOrEqual(0.4);
    });
    it(`${id}: +30 ms sau va chạm bản gốc đã rút tay, bản _tp còn duỗi (khác rõ)`, () => {
      const base = P(id);
      const tp = P(`${id}_tp`);
      const h = base.hit![0]!;
      const peakZ = strikeHand(id, h)[2]!;
      const baseZ = strikeHand(id, h + 0.03)[2]!;
      const tpZ = strikeHand(`${id}_tp`, h + 0.03)[2]!;
      expect(peakZ - baseZ).toBeGreaterThanOrEqual(0.06);
      expect(peakZ - tpZ).toBeLessThanOrEqual(0.02);
      expect(tpZ - baseZ).toBeGreaterThanOrEqual(0.05);
      expect(tp.duration).toBe(base.duration);
    });
  }
});
