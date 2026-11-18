import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';

const store = new Map<string, string>();
beforeAll(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
});

describe('CameraShake', async () => {
  const { CameraShake, SHAKE } = await import('./shake');
  const p = new THREE.Vector3();
  const l = new THREE.Vector3();

  it('lấy max chứ không cộng dồn', () => {
    const s = new CameraShake();
    s.kick(SHAKE.crit);
    s.kick(SHAKE.heavy);
    s.kick(SHAKE.crit);
    s.kick(SHAKE.heavy);
    expect(s.level).toBe(SHAKE.heavy);
  });

  it('giảm tuyến tính 2,2/giây rồi về 0, không lệch camera', () => {
    const s = new CameraShake();
    s.kick(1.1);
    s.update(0.25, p, l);
    expect(s.level).toBeCloseTo(1.1 - 0.55, 5);
    expect(p.length()).toBeGreaterThan(0);
    expect(p.length()).toBeLessThan(0.3);
    s.update(1, p, l);
    expect(s.level).toBe(0);
    expect(p.length()).toBe(0);
    expect(l.length()).toBe(0);
  });

  it('tắt rung thì không rung và nhớ lựa chọn', () => {
    const s = new CameraShake();
    s.kick(1);
    s.setEnabled(false);
    expect(s.level).toBe(0);
    s.kick(1);
    expect(s.level).toBe(0);
    expect(store.get('dtl.camShake')).toBe('0');
    expect(new CameraShake().enabled).toBe(false);
  });
});
