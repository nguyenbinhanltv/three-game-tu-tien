import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MannequinCharacter, type MannequinTemplate } from './mannequin';
import type { AnimState } from './view';

// Mẫu giả: clip đi/chạy đủ bốn hướng + một pose chiêu; kênh hông (nửa dưới) và sống lưng (nửa trên).
function fake(): MannequinCharacter {
  const scene = new THREE.Group();
  for (const n of ['pelvis', 'spine_01', 'spine_02']) {
    const b = new THREE.Bone();
    b.name = n;
    scene.add(b);
  }
  const track = (n: string) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0.1, 0.995]);
  const clip = (name: string, ...bones: string[]) => new THREE.AnimationClip(name, 1, bones.map(track));
  const names = ['Idle_Loop', 'Jog_Fwd_Loop', 'Walk_Loop', 'Sprint_Loop'];
  for (const band of ['Walk', 'Jog', 'Sprint']) for (const d of ['Bwd', 'StrafeL', 'StrafeR']) names.push(`${band}_${d}_Loop`);
  const def = { id: 'p', duration: 1, hit: [0.4] } as never;
  const pose = { def, full: clip('f', 'spine_01'), upper: clip('u', 'spine_01'), lower: clip('l', 'pelvis') };
  const tpl = {
    bank: { get: (id: string) => (id === 'p' ? pose : undefined), baseClip: () => undefined },
    height: 1.8,
    clips: new Map(names.map((n) => [n, clip(n, 'pelvis', 'spine_02')])),
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
const run = (m: MannequinCharacter, a: AnimState, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) m.update(1 / 60, a);
};
/** Action nửa dưới đang góp trọng số: tên clip → trọng số. */
const legsOf = (m: MannequinCharacter): Map<string, number> => {
  const legs = (m as unknown as { legs: Map<THREE.AnimationAction, THREE.AnimationAction> }).legs;
  const out = new Map<string, number>();
  for (const lb of legs.values()) if (lb.getEffectiveWeight() > 1e-3) out.set(lb.getClip().name, lb.getEffectiveWeight());
  return out;
};
const sum = (w: Map<string, number>) => [...w.values()].reduce((a, b) => a + b, 0);

describe('MannequinCharacter: chân chạy dưới chiêu nửa trên theo đúng hướng đi', () => {
  it('đang chạy tới mà ra chiêu: chân là clip chạy tới, tổng trọng số nửa dưới = đường bao chiêu', () => {
    const m = fake();
    run(m, anim({ speed: 6, moveAngle: 0 }), 0.6);
    m.perform('p', {});
    run(m, anim({ speed: 6, moveAngle: 0 }), 0.3);
    const w = legsOf(m);
    expect(sum(w)).toBeCloseTo(1, 2);
    expect([...w.keys()].every((n) => /^(Jog_Fwd|Sprint|Walk)_Loop\|lower$/.test(n))).toBe(true);
  });

  it('chiêu xoay mặt về mục tiêu (thân đi lùi so với mặt): chân chuyển sang clip chạy lùi, không giữ clip chạy tới', () => {
    const m = fake();
    run(m, anim({ speed: 6, moveAngle: 0 }), 0.6);
    m.perform('p', {});
    run(m, anim({ speed: 6, moveAngle: 0 }), 0.1);
    run(m, anim({ speed: 6, moveAngle: Math.PI }), 0.4);
    const w = legsOf(m);
    expect(sum(w)).toBeCloseTo(1, 2);
    let back = 0;
    for (const [n, v] of w) if (/_Bwd_Loop\|lower$/.test(n)) back += v;
    expect(back).toBeGreaterThan(0.9);
  });

  it('đi chéo 45°: chân trộn clip tới và clip ngang, mỗi bên một nửa', () => {
    const m = fake();
    run(m, anim({ speed: 6, moveAngle: Math.PI / 4 }), 0.8);
    m.perform('p', {});
    run(m, anim({ speed: 6, moveAngle: Math.PI / 4 }), 0.3);
    const w = legsOf(m);
    let side = 0;
    for (const [n, v] of w) if (/_StrafeL_Loop\|lower$/.test(n)) side += v;
    expect(side).toBeGreaterThan(0.4);
    expect(side).toBeLessThan(0.6);
    expect(sum(w)).toBeCloseTo(1, 2);
  });

  it('chéo-lùi (lùi + sang trái): chân trộn clip lùi với clip ngang PHẢI đọc ngược, không dùng clip ngang trái đọc xuôi', () => {
    const m = fake();
    run(m, anim({ speed: 6, moveAngle: (3 * Math.PI) / 4 }), 0.8);
    m.perform('p', {});
    run(m, anim({ speed: 6, moveAngle: (3 * Math.PI) / 4 }), 0.3);
    const w = legsOf(m);
    let back = 0;
    let rev = 0;
    let plain = 0;
    for (const [n, v] of w) {
      if (/_Bwd_Loop\|lower$/.test(n)) back += v;
      else if (/_StrafeR_Loop\|rev\|lower$/.test(n)) rev += v;
      else if (/_Strafe[LR]_Loop\|lower$/.test(n)) plain += v;
    }
    expect(back).toBeGreaterThan(0.4);
    expect(rev).toBeGreaterThan(0.4);
    expect(plain).toBeLessThan(0.02);
    expect(sum(w)).toBeCloseTo(1, 2);
  });

  it('đi ngang hẳn sang trái từ hướng tới: vẫn là clip ngang trái đọc xuôi (chưa vào góc phần tư lùi)', () => {
    const m = fake();
    run(m, anim({ speed: 6, moveAngle: Math.PI / 2 }), 0.8);
    m.perform('p', {});
    run(m, anim({ speed: 6, moveAngle: Math.PI / 2 }), 0.3);
    const w = legsOf(m);
    let plain = 0;
    for (const [n, v] of w) if (/_StrafeL_Loop\|lower$/.test(n)) plain += v;
    expect(plain).toBeGreaterThan(0.95);
  });

  it('hết chiêu hoặc đứng lại: không còn action chân nào sống', () => {
    const m = fake();
    run(m, anim({ speed: 6, moveAngle: 0 }), 0.6);
    m.perform('p', {});
    run(m, anim({ speed: 6, moveAngle: 0 }), 0.3);
    run(m, anim({ speed: 0 }), 0.1);
    expect(legsOf(m).size).toBe(0);
    run(m, anim({ speed: 6, moveAngle: 0 }), 1.2);
    expect((m as unknown as { legs: Map<unknown, unknown> }).legs.size).toBe(0);
  });
});
