import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MannequinCharacter, type MannequinTemplate } from './mannequin';
import type { AnimState, SkillEvent } from './view';

// Mẫu giả: cây xương tối thiểu, clip nền + pose chiêu một kênh; không cần tải GLB.
function fake(): { m: MannequinCharacter; ev: SkillEvent[] } {
  const scene = new THREE.Group();
  for (const n of ['pelvis', 'spine_01', 'spine_02']) {
    const b = new THREE.Bone();
    b.name = n;
    scene.add(b);
  }
  const track = (n: string) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0.1, 0.995]);
  const clip = (name: string, n: string) => new THREE.AnimationClip(name, 1, [track(n)]);
  const def = { id: 'p', duration: 1, hit: [0.4] } as never;
  const pose = { def, full: clip('f', 'spine_01'), upper: clip('u', 'spine_01'), lower: clip('l', 'pelvis') };
  const bank = { get: (id: string) => (id === 'p' || id === 'q' ? pose : undefined), baseClip: () => undefined };
  const tpl = {
    bank,
    height: 1.8,
    clips: new Map([['Idle_Loop', clip('Idle_Loop', 'spine_02')]]),
    handle: { scene },
  } as unknown as MannequinTemplate;
  const m = new MannequinCharacter(tpl);
  const ev: SkillEvent[] = [];
  m.onSkillEvent = (e) => ev.push(e);
  return { m, ev };
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
const opts = () => ({
  skill: 'skl',
  combo: -1,
  timing: { windup: 0.3, hitAt: [0.4], end: 1, cancelMove: 0.6, cancelDash: 0.45, kb: false },
});
const run = (m: MannequinCharacter, a: AnimState, sec: number) => {
  for (let i = 0; i < Math.round(sec * 60); i++) m.update(1 / 60, a);
};

describe('MannequinCharacter: sự kiện chiêu và hủy chiêu (K-4)', () => {
  it('chạy hết: windup → hit → recovery → end', () => {
    const { m, ev } = fake();
    expect(m.perform('p', opts())).toBe(true);
    run(m, anim(), 1.3);
    expect(ev.map((e) => e.kind)).toEqual(['windup', 'hit', 'recovery', 'end']);
    expect(m.performing('p')).toBe(false);
  });
  it('di chuyển hủy thu về chỉ sau mốc hủy, phát cancel, không phát end', () => {
    const { m, ev } = fake();
    m.perform('p', opts());
    run(m, anim({ speed: 5 }), 0.5);
    expect(m.cancelRecovery('move')).toBe(false); // chưa tới cancelMove 0,6
    run(m, anim({ speed: 5 }), 0.15);
    expect(m.cancelRecovery('move')).toBe(true);
    expect(ev.filter((e) => e.kind === 'cancel')).toHaveLength(1);
    expect(m.cancelRecovery('move')).toBe(false); // đã hủy rồi
    run(m, anim({ speed: 5 }), 0.4);
    expect(ev.some((e) => e.kind === 'end')).toBe(false);
    expect(m.performing('p')).toBe(false);
  });
  it('phá niệm (cancelPerform) trước đòn đầu phát cancel; sau đòn đầu thì để chạy hết', () => {
    const a = fake();
    a.m.perform('p', opts());
    run(a.m, anim(), 0.2);
    a.m.cancelPerform();
    expect(a.ev.at(-1)).toMatchObject({ kind: 'cancel', index: 0 });
    run(a.m, anim(), 0.5);
    expect(a.ev.some((e) => e.kind === 'hit')).toBe(false); // đòn bị hủy không ra
    const b = fake();
    b.m.perform('p', opts());
    run(b.m, anim(), 0.5);
    b.m.cancelPerform();
    expect(b.ev.some((e) => e.kind === 'cancel')).toBe(false);
    run(b.m, anim(), 0.8);
    expect(b.ev.at(-1)?.kind).toBe('end');
  });
  it('chiêu mới đè chiêu cũ: chiêu cũ chưa ra đòn thì báo cancel trước khi windup chiêu mới', () => {
    const { m, ev } = fake();
    m.perform('p', opts());
    run(m, anim(), 0.2);
    m.perform('q', opts());
    expect(ev.map((e) => e.kind)).toEqual(['windup', 'cancel', 'windup']);
  });
  it('chết hoặc bay giữa chiêu: báo cancel (chưa ra đòn) hoặc end (đã ra hết) rồi dừng', () => {
    const a = fake();
    a.m.perform('p', opts());
    run(a.m, anim(), 0.2);
    run(a.m, anim({ dead: true }), 0.05);
    expect(a.ev.at(-1)?.kind).toBe('cancel');
    expect(a.m.performing('p')).toBe(false);
    const b = fake();
    b.m.perform('p', opts());
    run(b.m, anim(), 0.5);
    run(b.m, anim({ flying: true }), 0.05);
    expect(b.ev.at(-1)?.kind).toBe('end');
  });
});
