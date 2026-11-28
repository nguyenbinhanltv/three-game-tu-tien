import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MannequinCharacter, type MannequinTemplate } from './mannequin';
import type { AnimState } from './view';

// Tổng trọng số của mọi action đang góp tư thế phải luôn ≥ 1 trên cả hai nửa thân: thiếu bao nhiêu thì three trộn bấy nhiêu tư thế gốc (A-pose),
// mắt thấy tay/chân giật một khung (đo 28/11: bắp tay 4200–9400°/s ở khung cuối của clip dừng, tổng chỉ còn ~0,5).
function fake(): MannequinCharacter {
  const scene = new THREE.Group();
  for (const n of ['pelvis', 'spine_01', 'spine_02']) {
    const b = new THREE.Bone();
    b.name = n;
    scene.add(b);
  }
  const track = (n: string) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0.1, 0.995]);
  const clip = (name: string, dur: number, ...bones: string[]) => {
    const c = new THREE.AnimationClip(name, dur, bones.map(track));
    c.duration = dur;
    return c;
  };
  const names = ['Idle_Loop', 'Sword_Idle', 'Jog_Fwd_Loop', 'Walk_Loop', 'Sprint_Loop'];
  for (const band of ['Walk', 'Jog', 'Sprint']) for (const d of ['Bwd', 'StrafeL', 'StrafeR']) names.push(`${band}_${d}_Loop`);
  const clips = new Map(names.map((n) => [n, clip(n, 1, 'pelvis', 'spine_02')]));
  clips.set('Shot', clip('Shot', 0.5, 'pelvis', 'spine_02'));
  clips.set('Shot2', clip('Shot2', 0.5, 'pelvis', 'spine_02'));
  clips.set('Sword_Regular_A', clip('Sword_Regular_A', 0.8, 'pelvis', 'spine_02'));
  clips.set('Sword_Regular_B', clip('Sword_Regular_B', 0.8, 'pelvis', 'spine_02'));
  clips.set('Sword_Regular_C', clip('Sword_Regular_C', 0.8, 'pelvis', 'spine_02'));
  const pose = (id: string) => ({
    def: { id, duration: 1, hit: [0.4] } as never,
    full: clip(`${id}_full`, 1, 'spine_01'),
    upper: clip(`${id}_upper`, 1, 'spine_01'),
    lower: clip(`${id}_lower`, 1, 'pelvis'),
  });
  const poses: Record<string, ReturnType<typeof pose>> = { p: pose('p'), q: pose('q') };
  const tpl = {
    bank: { get: (id: string) => poses[id], baseClip: () => undefined },
    height: 1.8,
    clips,
    handle: { scene },
  } as unknown as MannequinTemplate;
  return new MannequinCharacter(tpl);
}
const anim = (o: Partial<AnimState> = {}): AnimState => ({
  speed: 0,
  flying: false,
  meditating: false,
  dead: false,
  casting: false,
  airborne: false,
  ...o,
});
type Priv = {
  mixer: THREE.AnimationMixer & { _actions: THREE.AnimationAction[] };
  oneShot(name: string, rate?: number, upper?: boolean, fadeIn?: number): boolean;
  fadeShot(a: THREE.AnimationAction, dur: number): void;
  shot: THREE.AnimationAction | null;
  shots: Map<THREE.AnimationAction, { w: number }>;
};
const priv = (m: MannequinCharacter) => m as unknown as Priv;
/** Tổng trọng số hiệu dụng lên nửa trên / nửa dưới sau lần cập nhật vừa rồi (clip tách nửa thân mang hậu tố upper / lower). */
function sums(m: MannequinCharacter): { u: number; l: number } {
  let u = 0;
  let l = 0;
  for (const a of priv(m).mixer._actions) {
    if (!a.isScheduled() || !a.enabled) continue;
    const w = a.getEffectiveWeight();
    const n = a.getClip().name;
    if (!/[|_]lower$/.test(n)) u += w;
    if (!/[|_]upper$/.test(n)) l += w;
  }
  return { u, l };
}
/** Chạy `sec` giây, trả tổng trọng số nhỏ nhất và lớn nhất gặp phải. */
function run(m: MannequinCharacter, a: AnimState, sec: number, acc = { min: 9, max: 0 }): { min: number; max: number } {
  for (let i = 0; i < Math.round(sec * 60); i++) {
    m.update(1 / 60, a);
    const s = sums(m);
    acc.min = Math.min(acc.min, s.u, s.l);
    acc.max = Math.max(acc.max, s.u, s.l);
  }
  return acc;
}
/** Trọng số clip nền đứng yên: `Sword_Idle` khi đang trong chiến đấu (sau đòn/chiêu), `Idle_Loop` còn lại. */
const idleW = (m: MannequinCharacter): number => weightOf(m, 'Idle_Loop') + weightOf(m, 'Sword_Idle');
const weightOf = (m: MannequinCharacter, name: string): number => {
  for (const a of priv(m).mixer._actions) if (a.getClip().name === name && a.isScheduled() && a.enabled) return a.getEffectiveWeight();
  return 0;
};

describe('MannequinCharacter: tổng trọng số không bao giờ tụt dưới 1', () => {
  it('đứng → chạy → đứng: mờ chéo giữa hai clip nền bù nhau đúng', () => {
    const m = fake();
    const acc = run(m, anim(), 0.3);
    run(m, anim({ speed: 6 }), 1, acc);
    run(m, anim(), 1, acc);
    run(m, anim({ speed: 2 }), 0.05, acc);
    run(m, anim(), 0.05, acc);
    run(m, anim({ speed: 7, moveAngle: 2 }), 0.5, acc);
    expect(acc.min).toBeGreaterThan(0.999);
    expect(acc.max).toBeLessThan(1.001);
  });

  it('đòn một lần chạy tới hết clip: đuôi clip mờ ra, clip nền lên thay, không có khung nào thiếu trọng số', () => {
    const m = fake();
    const acc = run(m, anim(), 0.2);
    expect(priv(m).oneShot('Shot')).toBe(true);
    // Giữa clip: đòn chiếm trọn, nền về 0.
    run(m, anim(), 0.25, acc);
    expect(weightOf(m, 'Shot')).toBeCloseTo(1, 3);
    expect(weightOf(m, 'Idle_Loop')).toBeLessThan(1e-3);
    // 0,06 s trước khi hết: đang trong đuôi, đòn đã nhường khoảng một nửa cho nền.
    run(m, anim(), 0.19, acc);
    expect(weightOf(m, 'Shot')).toBeGreaterThan(0.2);
    expect(weightOf(m, 'Shot')).toBeLessThan(0.8);
    expect(weightOf(m, 'Idle_Loop')).toBeGreaterThan(0.2);
    run(m, anim(), 0.3, acc);
    expect(priv(m).shot).toBeNull();
    expect(priv(m).shots.size).toBe(0);
    expect(weightOf(m, 'Idle_Loop')).toBeCloseTo(1, 3);
    expect(acc.min).toBeGreaterThan(0.999);
    expect(acc.max).toBeLessThan(1.001);
  });

  it('đòn một lần bị cho mờ ra khi còn đang mờ vào: trọng số chỉ giảm, không nhảy về 1 (lỗi của fadeOut three)', () => {
    const m = fake();
    const acc = run(m, anim(), 0.2);
    priv(m).oneShot('Shot', 1, false, 0.12);
    run(m, anim(), 0.05, acc);
    const w0 = weightOf(m, 'Shot');
    expect(w0).toBeGreaterThan(0.2);
    expect(w0).toBeLessThan(0.6);
    priv(m).fadeShot(priv(m).shot!, 0.12);
    let last = w0;
    for (let i = 0; i < 12; i++) {
      run(m, anim(), 1 / 60, acc);
      const w = weightOf(m, 'Shot');
      expect(w).toBeLessThanOrEqual(last + 1e-6);
      last = w;
    }
    expect(last).toBeLessThan(1e-3);
    expect(acc.min).toBeGreaterThan(0.999);
  });

  it('đòn mới đè đòn cũ, và phát lại đúng đòn đang phát: không thiếu trọng số', () => {
    const m = fake();
    const acc = run(m, anim(), 0.2);
    priv(m).oneShot('Shot');
    run(m, anim(), 0.2, acc);
    priv(m).oneShot('Shot2');
    run(m, anim(), 0.03, acc);
    expect(weightOf(m, 'Shot')).toBeGreaterThan(0.3);
    run(m, anim(), 0.15, acc);
    expect(weightOf(m, 'Shot')).toBeLessThan(1e-3);
    priv(m).oneShot('Shot2');
    run(m, anim(), 1 / 60, acc);
    // Cùng một action được phát lại: giữ trọng số đang có.
    expect(weightOf(m, 'Shot2')).toBeGreaterThan(0.9);
    run(m, anim(), 0.8, acc);
    expect(acc.min).toBeGreaterThan(0.999);
  });

  it('chiêu K-5 nối chiêu khác, và diễn lại đúng chiêu đang diễn: chiêu cũ mờ ra cùng nhịp chiêu mới mờ vào', () => {
    for (const next of ['q', 'p']) {
      const m = fake();
      const acc = run(m, anim(), 0.2);
      m.perform('p', {});
      run(m, anim(), 0.3, acc);
      m.perform(next, {});
      run(m, anim(), 0.03, acc);
      // Giữa lúc nhường chỗ: clip nền KHÔNG chen vào (tổng do hai chiêu giữ).
      expect(idleW(m)).toBeLessThan(0.05);
      run(m, anim(), 1.3, acc);
      expect(idleW(m)).toBeCloseTo(1, 3);
      expect(priv(m).shots.size).toBe(0);
      expect(acc.min, `p → ${next}`).toBeGreaterThan(0.999);
    }
  });

  it('vừa chạy vừa diễn chiêu, rồi đổi chiêu khi đang chạy: nửa dưới do chân chạy giữ, không thiếu trọng số', () => {
    const m = fake();
    const acc = run(m, anim({ speed: 6 }), 0.5);
    m.perform('p', {});
    run(m, anim({ speed: 6 }), 0.3, acc);
    m.perform('q', {});
    run(m, anim({ speed: 6, moveAngle: 2.4 }), 0.4, acc);
    run(m, anim(), 0.2, acc);
    run(m, anim({ speed: 6 }), 0.9, acc);
    expect(acc.min).toBeGreaterThan(0.999);
    expect(acc.max).toBeLessThan(1.001);
  });

  it('đòn UAL nửa trên khi đang chạy (attack) tới hết clip, và ra chiêu K-5 giữa đòn', () => {
    const m = fake();
    const acc = run(m, anim({ speed: 6 }), 0.5);
    m.attack();
    run(m, anim({ speed: 6 }), 1.2, acc);
    expect(priv(m).shot).toBeNull();
    m.attack();
    run(m, anim({ speed: 6 }), 0.2, acc);
    m.perform('p', {});
    run(m, anim({ speed: 6 }), 1.4, acc);
    // Khung đòn UAL hết clip ngay trong `mixer.update` (three tắt action) nên bước đo sau đó thiếu phần đuôi vừa tắt (đo 0,987); lúc vẽ tổng vẫn 1.
    expect(acc.min).toBeGreaterThan(0.98);
    expect(weightOf(m, 'Jog_Fwd_Loop') + weightOf(m, 'Sprint_Loop') + weightOf(m, 'Walk_Loop')).toBeCloseTo(1, 2);
  });

  it('chết giữa đòn: mọi đòn một lần dừng ngay', () => {
    const m = fake();
    run(m, anim(), 0.2);
    priv(m).oneShot('Shot');
    run(m, anim(), 0.1);
    run(m, anim({ dead: true }), 0.1);
    expect(priv(m).shots.size).toBe(0);
    expect(weightOf(m, 'Shot')).toBe(0);
  });
});
