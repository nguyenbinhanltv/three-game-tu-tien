import { describe, expect, it } from 'vitest';
import { METHOD_SKILLS, POSE, SKILLS } from '@dtl/content';
import { poseIdFor, poseIdsFor, POSE_VOICES, type PoseDef, type PoseVoice, type SkillDef } from '@dtl/shared';
import { resolveKeys, samplePose, type PoseSample } from './ikpose';

/** K-5 (docs/AUDIT_AND_ROADMAP.md 7.1): cấu trúc 9/7 khung và số đo ba giọng, đo bằng chính bộ nội suy của client. */

const ALL = [...SKILLS, ...METHOD_SKILLS];
const SK = new Map(ALL.map((s) => [s.id, s]));
const P = (id: string): PoseDef => {
  const p = POSE.get(id);
  if (!p) throw new Error(`thiếu pose ${id}`);
  return p;
};
/** Chiều dài kiếm từ cổ tay tới mũi dùng cho đầu dò (m): thấp hơn kiếm thật, nên phép đo "đi ≥ 1,2 m" chặt hơn thực tế. */
const BLADE = 0.9;
const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
const norm = (v: number[]) => v.map((x) => x / (len(v) || 1));
const tipOf = (s: PoseSample): number[] => {
  const d = norm(s.sword ?? [0, 0, 1]);
  return (s.handR ?? [0, 0, 0]).map((x, i) => x + d[i] * BLADE);
};

interface Row {
  id: string;
  skill: string;
  voice: PoseVoice;
  nine: boolean;
  hitAt: number;
  /** Đòn tấn công vung kiếm (đo tầm tay, đường mũi kiếm) hay cử chỉ hộ thể/hồi phục. */
  swing: boolean;
}

const ROWS: Row[] = [];
const basic = SK.get('skl_phi_kiem') as SkillDef;
for (const voice of POSE_VOICES) {
  const method = { kt: 'lac_kiem_quyet', hp: 'bat_dong_kim_than', ds: 'thanh_moc_dan_kinh' }[voice];
  basic.combo!.hits.forEach((h, i) =>
    ROWS.push({ id: poseIdFor('phi_kiem', { combo: i, method }), skill: basic.id, voice, nine: true, hitAt: h.hitAt, swing: true }),
  );
  ROWS.push({
    id: poseIdFor('kiem_khi_tram', { method }),
    skill: 'skl_kiem_khi_tram',
    voice,
    nine: true,
    hitAt: SK.get('skl_kiem_khi_tram')!.hitAt![0],
    swing: true,
  });
}
for (const [id, skill] of [
  ['thien_kiem_vu', 'skl_thien_kiem_vu'],
  ['kiem_anh', 'skl_phi_kiem_truy_hon'],
  ['van_kiem', 'skl_van_kiem_quy_tong'],
] as const)
  ROWS.push({ id, skill, voice: 'kt', nine: true, hitAt: SK.get(skill)!.hitAt![0], swing: true });
for (const [id, skill, voice] of [
  ['loi_dinh', 'skl_loi_dinh_nhat_kiem', 'kt'],
  ['ho_the', 'skl_linh_khi_ho_the', 'kt'],
  ['hoi_nguyen', 'skl_hoi_nguyen_thuat', 'kt'],
  ['tran_son', 'skl_tran_son_an', 'hp'],
  ['kim_cuong', 'skl_kim_cuong_bat_hoai', 'hp'],
  ['xuan_phong', 'skl_hoi_xuan_quyet', 'ds'],
  ['hoi_thien', 'skl_hoi_thien_dan_lo', 'ds'],
] as const)
  ROWS.push({ id, skill, voice, nine: false, hitAt: SK.get(skill)!.hitAt![0], swing: false });

const RANGE: Record<
  PoseVoice,
  { drop: [number, number]; twist: [number, number]; reachZ: [number, number]; hold: number; over: [number, number] }
> = {
  kt: { drop: [0.06, 0.1], twist: [35, 45], reachZ: [0.75, 2], hold: 0.05, over: [0.14, 0.16] },
  hp: { drop: [0.16, 0.22], twist: [20, 25], reachZ: [0.45, 0.6], hold: 0.08, over: [0.04, 0.06] },
  ds: { drop: [0.02, 0.05], twist: [20, 30], reachZ: [0.5, 0.65], hold: 0.06, over: [0.09, 0.11] },
};

/** Mô tả số đo một pose (cũng dùng để in bảng trong docs/k5-poses). */
export function measure(row: Row) {
  const def = P(row.id);
  const ks = resolveKeys(def);
  const at = (i: number) => ks[i];
  // Chỉ số khung: 9 khung = 0..8, 7 khung = 0..4 rồi 5 (hãm), 6 (về thủ thế).
  const [f1, f2, f3, f4, f5] = [at(0), at(1), at(2), at(3), at(4)];
  const f6 = row.nine ? at(5) : undefined;
  const guard = resolveKeys(P('kiem_thu'))[0];
  const drop = guard.hipsPos[1] - f3.hipsPos[1];
  const twist = Math.abs(f3.hipsRot[1] - f5.hipsRot[1]);
  const hold = f4.t - f3.t;
  const travel = f5.t - f4.t;
  const tipTravel = len(sub(tipOf(f5), tipOf(f4)));
  const over = f6 ? Math.abs(f6.hipsRot[1] - f5.hipsRot[1]) / Math.max(1e-6, Math.abs(f5.hipsRot[1] - f4.hipsRot[1])) : 0;
  const stance = (f5.footL?.[0] ?? 0) - (f5.footR?.[0] ?? 0);
  return {
    def,
    ks,
    f1,
    f2,
    f3,
    f4,
    f5,
    f6,
    guard,
    drop,
    twist,
    hold,
    travel,
    tipTravel,
    over,
    reachZ: f5.handR?.[2] ?? 0,
    reachY: f5.handR?.[1] ?? 0,
    step: (f5.footR?.[2] ?? 0) - (guard.footR?.[2] ?? 0),
    back: (f5.footL?.[2] ?? 0) - (guard.footL?.[2] ?? 0),
    stance,
  };
}

describe('K-5: cấu trúc khung khóa', () => {
  for (const row of ROWS) {
    it(`${row.id}: ${row.nine ? 9 : 7} khung, mốc theo dữ liệu chiêu`, () => {
      const m = measure(row);
      const skill = SK.get(row.skill)!;
      expect(m.def.keys.length).toBe(row.nine ? 9 : 7);
      // Khung 1 trùng thủ thế chờ để liên chiêu không giật; khung cuối trùng khung 1.
      expect(m.f1.hipsPos).toEqual(m.guard.hipsPos);
      expect(m.f1.handR).toEqual(m.guard.handR);
      expect(m.f1.sword).toEqual(m.guard.sword);
      const last = m.ks[m.ks.length - 1];
      expect(last.hipsPos).toEqual(m.f1.hipsPos);
      expect(last.handR).toEqual(m.f1.handR);
      expect(last.t).toBeCloseTo(m.def.duration, 2);
      // Khung trúng ở hitAt[0]; hitAt + recovery = độ dài clip.
      expect(m.f5.t).toBeCloseTo(row.hitAt, 3);
      expect(Math.abs(m.def.hit![0] - row.hitAt)).toBeLessThanOrEqual(0.03);
      expect(m.def.duration).toBeCloseTo(row.hitAt + skill.recovery!, 2);
      // Khung 2 trước khung 3 trước khung 4; khung 2 nông hơn khung 3 (hạ hông, dồn về sau).
      expect(m.f2.t).toBeCloseTo(0.35 * m.f4.t, 2);
      expect(m.f2.hipsPos[1]).toBeGreaterThan(m.f3.hipsPos[1]);
      expect(m.f3.t).toBeLessThan(m.f4.t);
      // Giữ (khung 3 → 4) đứng hình: hông gần như không dời.
      expect(Math.abs(m.f4.hipsPos[1] - m.f3.hipsPos[1])).toBeLessThan(0.02);
      expect(len(sub(m.f4.handR ?? [0, 0, 0], m.f3.handR ?? [0, 0, 0]))).toBeLessThan(0.03);
      expect(m.hold).toBeGreaterThanOrEqual(0.05 - 1e-3);
      expect(m.hold).toBeLessThanOrEqual(0.08 + 1e-3);
      expect(m.hold).toBeCloseTo(RANGE[row.voice].hold, 2);
      // Trúng: ease-out bậc 4 từ khung 4 sang 5.
      expect(m.def.keys[4].ease).toBe('quartOut');
      if (row.nine) {
        // Thu kiếm (khung 8) nằm sau mốc cancel.move của chiêu.
        const f8 = m.ks[7];
        if (skill.cancel) expect(f8.t).toBeGreaterThanOrEqual(skill.cancel.move - 1e-6);
        expect(m.ks[5].t).toBeCloseTo(row.hitAt + 0.06, 2);
        expect(m.ks[6].t).toBeCloseTo(row.hitAt + 0.35 * skill.recovery!, 2);
        expect(f8.t).toBeCloseTo(row.hitAt + 0.75 * skill.recovery!, 2);
      }
    });
  }
});

describe('K-5: ba giọng đo được', () => {
  for (const row of ROWS) {
    it(`${row.id} (${row.voice}): hạ hông, xoay hông, giữ`, () => {
      const m = measure(row);
      const R = RANGE[row.voice];
      if (row.swing || row.voice !== 'kt') {
        expect(m.drop).toBeGreaterThanOrEqual(R.drop[0] - 1e-3);
        expect(m.drop).toBeLessThanOrEqual(R.drop[1] + 1e-3);
      }
      if (row.swing) {
        expect(m.twist).toBeGreaterThanOrEqual(R.twist[0] - 0.5);
        expect(m.twist).toBeLessThanOrEqual(R.twist[1] + 0.5);
        // Hông xoay ngược hướng vung ≥ 20° ở khung tụ lực.
        expect(m.twist).toBeGreaterThanOrEqual(20);
      }
    });
  }
  for (const row of ROWS.filter((r) => r.swing)) {
    it(`${row.id} (${row.voice}): tầm tay, mũi kiếm, quá đà, chân, tay trái`, () => {
      const m = measure(row);
      const R = RANGE[row.voice];
      expect(m.reachZ).toBeGreaterThanOrEqual(R.reachZ[0] - 1e-3);
      expect(m.reachZ).toBeLessThanOrEqual(R.reachZ[1] + 1e-3);
      if (row.voice === 'hp') expect(m.reachY).toBeLessThanOrEqual(0.15);
      if (row.voice === 'hp') expect(m.reachY).toBeGreaterThanOrEqual(-0.12);
      // Mũi kiếm đi ≥ 1,2 m trong ≤ 0,08 s, từ khung 4 sang khung 5.
      expect(m.travel).toBeLessThanOrEqual(0.08 + 1e-6);
      expect(m.tipTravel).toBeGreaterThanOrEqual(1.2);
      // Quá đà.
      expect(m.over).toBeGreaterThanOrEqual(R.over[0]);
      expect(m.over).toBeLessThanOrEqual(R.over[1]);
      if (row.voice === 'kt') {
        expect(m.step).toBeGreaterThanOrEqual(0.3 - 1e-3);
        expect(m.step).toBeLessThanOrEqual(0.45 + 1e-3);
        // Kiếm chỉ đối trọng sau lưng.
        expect(m.f5.handL![2]).toBeLessThan(0);
      }
      if (row.voice === 'hp') {
        // Hai chân bám đất, rộng hơn vai 0,15 m (vai rộng 0,36 m); nắm quyền che ngực.
        expect(m.f5.footR![1]).toBe(0);
        expect(m.f5.footL![1]).toBe(0);
        expect(m.stance - 0.36).toBeGreaterThanOrEqual(0.15 - 0.03);
        expect(m.stance - 0.36).toBeLessThanOrEqual(0.15 + 0.03);
        expect(m.f5.handL![2]).toBeGreaterThan(0.2);
        expect(m.f5.handL![1]).toBeGreaterThan(0.25);
      }
      if (row.voice === 'ds') {
        // Cao ngang vai (vai ở 0,45 + độ dời hông), chân sau lùi 0,2 m, ấn quyết trước ngực.
        const shoulderY = 0.45 + m.f5.hipsPos[1];
        expect(Math.abs(m.reachY - shoulderY)).toBeLessThanOrEqual(0.1);
        expect(m.back).toBeLessThanOrEqual(-0.2 + 0.03);
        expect(m.back).toBeGreaterThanOrEqual(-0.2 - 0.03);
        expect(m.f5.handL![2]).toBeGreaterThan(0.2);
      }
    });
  }
  it('ba giọng khác nhau rõ rệt ở cùng một đòn', () => {
    const [kt, hp, ds] = (['kt', 'hp', 'ds'] as const).map((v) =>
      measure(ROWS.find((r) => r.skill === 'skl_kiem_khi_tram' && r.voice === v)!),
    );
    expect(hp.drop).toBeGreaterThan(kt.drop * 1.8);
    expect(kt.drop).toBeGreaterThan(ds.drop * 1.8);
    expect(kt.twist).toBeGreaterThan(ds.twist);
    expect(ds.twist).toBeGreaterThan(hp.twist);
    expect(kt.reachZ).toBeGreaterThan(ds.reachZ);
    expect(ds.reachZ).toBeGreaterThan(hp.reachZ);
    expect(hp.hold).toBeGreaterThan(ds.hold);
    expect(ds.hold).toBeGreaterThan(kt.hold);
  });
});

describe('K-5: kiếm không xuyên thân', () => {
  // Thân là một ống từ hông tới ngực, nghiêng theo độ cúi của hông + cột sống; kiếm từ 0,15 m sau cổ tay tới mũi.
  const RADIUS = 0.1;
  for (const id of new Set(ROWS.map((r) => r.id))) {
    it(`${id}: đoạn kiếm cách trục thân ≥ ${RADIUS} m ở mọi khung`, () => {
      const def = P(id);
      const ks = resolveKeys(def);
      let worst = Infinity;
      let worstT = 0;
      for (let t = 0; t <= def.duration; t += 1 / 60) {
        const s = samplePose(def, ks, t);
        if (!s.handR || !s.sword) continue;
        const a = ((s.hipsRot[0] + s.spine[0]) * Math.PI) / 180;
        const axis = [0, Math.cos(a), Math.sin(a)];
        const base = s.hipsPos;
        const sd = norm(s.sword);
        for (let u = 0.15; u <= BLADE + 1e-6; u += 0.05) {
          const p = s.handR.map((x, i) => x + sd[i] * u);
          const rel = sub(p, base);
          const along = Math.min(0.62, Math.max(0, rel[0] * axis[0] + rel[1] * axis[1] + rel[2] * axis[2]));
          const q = axis.map((x, i) => base[i] + x * along);
          // Khoảng cách ngang (bỏ trục dọc không có ý nghĩa khi điểm nằm dưới hông: chân, không phải thân).
          if (p[1] < base[1] - 0.05) continue;
          const d = len(sub(p, q));
          if (d < worst) {
            worst = d;
            worstT = t;
          }
        }
      }
      expect(worst, `${id}: gần thân nhất ${worst.toFixed(3)} m ở ${worstT.toFixed(2)} s`).toBeGreaterThanOrEqual(RADIUS);
    });
  }
});

describe('K-5: dữ liệu đủ bộ pose', () => {
  it('mọi pose có thể chọn đều tồn tại và khớp thời gian đòn', () => {
    for (const s of ALL) {
      if (!s.pose) continue;
      const hits = s.combo?.hits.length ?? 1;
      for (const id of poseIdsFor(s.pose, hits)) expect(POSE.has(id), `${s.id}: thiếu pose ${id}`).toBe(true);
    }
    // Đòn thường: mỗi đòn một pose riêng (hình học khác nhau).
    const tips = ['phi_kiem', 'phi_kiem_2', 'phi_kiem_3'].map((id) => measure(ROWS.find((r) => r.id === id)!).f5.sword!.join(','));
    expect(new Set(tips).size).toBe(3);
  });
});
