import * as THREE from 'three/webgpu';
import { beforeEach, describe, expect, it } from 'vitest';
import { SHAKE_AMP_M } from '../combat/hitjuice';
import { CameraShake, TRAUMA_AMP, TRAUMA_DECAY, TRAUMA_GAIN, TRAUMA_MAX } from './shake';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
});

const make = () => {
  const s = new CameraShake();
  s.trauma = true;
  return s;
};

describe('rung trauma (Dạ Cảnh)', () => {
  it('một cú lẻ có biên độ đúng bằng chế độ cũ (mức × SHAKE_AMP_M)', () => {
    const s = make();
    s.kick(0.3);
    expect(s.level).toBeCloseTo(TRAUMA_GAIN * Math.sqrt(0.3));
    expect(s.level * s.level * TRAUMA_AMP).toBeCloseTo(0.3 * SHAKE_AMP_M);
  });

  it('đòn dồn dập cộng dồn (mạnh dần) nhưng có trần', () => {
    const s = make();
    s.kick(0.12);
    const one = s.level;
    s.kick(0.12);
    expect(s.level).toBeGreaterThan(one * 1.9);
    for (let i = 0; i < 50; i++) s.kick(1);
    expect(s.level).toBe(TRAUMA_MAX);
  });

  it('tắt dần theo TRAUMA_DECAY; hết thì lệch và lăn về 0', () => {
    const s = make();
    const p = new THREE.Vector3();
    const l = new THREE.Vector3();
    s.kick(0.6);
    const t0 = s.level;
    s.update(0.1, p, l);
    expect(s.level).toBeCloseTo(t0 - TRAUMA_DECAY * 0.1);
    expect(p.length()).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) s.update(1 / 60, p, l);
    expect(s.level).toBe(0);
    expect(p.length()).toBe(0);
    expect(s.roll).toBe(0);
  });

  it('chế độ cũ không đổi: lấy max, không cộng dồn, không lăn', () => {
    const s = new CameraShake();
    const p = new THREE.Vector3();
    const l = new THREE.Vector3();
    s.kick(0.3);
    s.kick(0.3);
    expect(s.level).toBeCloseTo(0.3);
    s.update(0.01, p, l);
    expect(s.roll).toBe(0);
  });

  it('tắt rung trong Cài đặt (0%) thì trauma cũng không rung', () => {
    const s = make();
    s.setPct(0);
    s.kick(1);
    expect(s.level).toBe(0);
  });
});
