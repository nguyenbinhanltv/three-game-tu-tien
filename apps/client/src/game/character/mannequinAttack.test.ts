import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MannequinCharacter, type MannequinTemplate } from './mannequin';
import { swingRate, swingSeconds } from './mannequinAnim';
import UAL_HIT from './ualHit.json';
import type { AnimState, SkillEvent } from './view';

const anim = (o: Partial<AnimState> = {}): AnimState => ({
  speed: 0,
  flying: false,
  meditating: false,
  dead: false,
  casting: false,
  airborne: false,
  ...o,
});

function fake(): { m: MannequinCharacter; ev: SkillEvent[] } {
  const scene = new THREE.Group();
  for (const n of ['pelvis', 'spine_01', 'spine_02']) {
    const b = new THREE.Bone();
    b.name = n;
    scene.add(b);
  }
  const clip = (name: string, dur: number) =>
    new THREE.AnimationClip(name, dur, [
      new THREE.QuaternionKeyframeTrack('spine_02.quaternion', [0, dur], [0, 0, 0, 1, 0, 0, 0.1, 0.995]),
    ]);
  const clips = new Map<string, THREE.AnimationClip>();
  for (const n of ['Idle_Loop', 'Jog_Fwd_Loop', 'Walk_Loop', 'Sprint_Loop', 'Hit_Chest', 'Roll']) clips.set(n, clip(n, 1));
  for (const [n, h] of Object.entries(UAL_HIT)) clips.set(n, clip(n, h.dur));
  const tpl = { bank: null, height: 1.8, clips, handle: { scene } } as unknown as MannequinTemplate;
  const m = new MannequinCharacter(tpl);
  const ev: SkillEvent[] = [];
  m.onSkillEvent = (e) => ev.push(e);
  return { m, ev };
}

const run = (m: MannequinCharacter, sec: number, a: Partial<AnimState> = {}) => {
  for (let i = 0; i < Math.round(sec * 60); i++) m.update(1 / 60, anim(a));
};

describe('đòn UAL dự phòng phát sự kiện chiêu (A3)', () => {
  it('windup (kèm hitIn) → hit đúng mốc chém → recovery → end, theo thứ tự', () => {
    const { m, ev } = fake();
    run(m, 0.3);
    m.attack({ skill: 'skl_test', combo: 1 });
    expect(ev.map((e) => e.kind)).toEqual(['windup']);
    expect(ev[0]!.skill).toBe('skl_test');
    expect(ev[0]!.combo).toBe(1);
    expect(ev[0]!.hitIn).toBeGreaterThan(0.05);
    run(m, 1.2);
    expect(ev.map((e) => e.kind)).toEqual(['windup', 'hit', 'recovery', 'end']);
    expect(ev[1]!.index).toBe(0);
  });
  it('hit tới sau khoảng hitIn của windup (đồng hồ animation)', () => {
    const { m, ev } = fake();
    run(m, 0.3);
    m.attack();
    const hitIn = ev[0]!.hitIn!;
    let t = 0;
    while (!ev.some((e) => e.kind === 'hit') && t < 2) {
      m.update(1 / 60, anim());
      t += 1 / 60;
    }
    expect(Math.abs(t - hitIn)).toBeLessThan(0.12);
  });
  it('chết trước khung chém → cancel, không có hit', () => {
    const { m, ev } = fake();
    run(m, 0.3);
    m.attack();
    run(m, 0.02);
    run(m, 0.5, { dead: true });
    expect(ev.some((e) => e.kind === 'hit')).toBe(false);
    expect(ev.map((e) => e.kind)).toContain('cancel');
  });
  it('đánh liên tiếp: đòn cũ đóng (cancel/end) trước windup của đòn mới', () => {
    const { m, ev } = fake();
    run(m, 0.3);
    m.attack();
    run(m, 0.05);
    m.attack();
    expect(ev.map((e) => e.kind)).toEqual(['windup', 'cancel', 'windup']);
  });
});

describe('swingSeconds / ualHit.json', () => {
  it('swingSeconds khớp tích phân của swingRate và là 0 khi vô lý', () => {
    expect(swingSeconds(0, 0.4, 1, 1.6, 200)).toBeCloseTo(0.2 / (1.6 * 0.55) + 0.2 / (1.6 * 1.7), 2);
    expect(swingSeconds(0.3, 0.1, 1, 1.6)).toBe(0);
    expect(swingRate(0, 1)).toBeLessThan(swingRate(0.3, 1));
  });
  it('mốc chém nằm trong clip, và clip có trong thư viện đã build', () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as {
      assets: Record<string, { url?: string; file?: string }>;
    };
    const a = manifest.assets.anim_ual_native!;
    const buf = fs.readFileSync(path.join(dir, a.url ?? a.file!));
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as { animations: { name: string }[] };
    const names = new Set(json.animations.map((x) => x.name));
    for (const [n, h] of Object.entries(UAL_HIT)) {
      expect(names.has(n), n).toBe(true);
      expect(h.hit).toBeGreaterThan(0);
      expect(h.hit).toBeLessThan(h.dur);
    }
  });
});

describe('lướt hiển thị (A4)', () => {
  it('dashFrom: hình xuất phát ở chỗ cũ rồi trượt về chỗ thật, phát clip Roll, hết thì về 0', () => {
    const { m } = fake();
    run(m, 0.3);
    m.root.position.set(5, 0, 0);
    m.dashFrom(0, 0, 0.3); // chỗ thật cách chỗ xuất phát 5 m theo +X, nhân vật nhìn +Z (yaw 0): lệch ngang = −5 m (bên phải)
    m.update(1 / 60, anim());
    expect(Math.abs((m as unknown as { inner: THREE.Object3D }).inner.position.x)).toBeGreaterThan(3);
    run(m, 0.2);
    expect(Math.abs((m as unknown as { inner: THREE.Object3D }).inner.position.x)).toBeLessThan(2);
    run(m, 0.3);
    expect((m as unknown as { inner: THREE.Object3D }).inner.position.x).toBeCloseTo(0, 5);
    expect((m as unknown as { inner: THREE.Object3D }).inner.position.z).toBeCloseTo(0, 5);
  });
});
