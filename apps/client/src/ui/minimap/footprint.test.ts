import { describe, expect, it } from 'vitest';
import { groundFootprint } from './footprint';
import { isoCameraPos } from '../../game/camera/iso';

describe('vùng mặt đất camera thấy', () => {
  it('camera chéo: hình thang quanh người, rộng hơn ở phía xa, hai góc xa cùng phía với hướng nhìn', () => {
    const yaw = (30 * Math.PI) / 180;
    const pitch = (52 * Math.PI) / 180;
    const t = { x: 100, y: 0, z: 200 };
    const c = isoCameraPos(t.x, t.y, t.z, 20, yaw, pitch);
    const fwd = { x: t.x - c.x, y: t.y - c.y, z: t.z - c.z };
    const f = groundFootprint(c, fwd, 32, 16 / 9, 0);
    expect(f).toHaveLength(4);
    // Tâm hình thang gần người chơi (người ở giữa màn hình).
    const cx = f.reduce((a, p) => a + p.x, 0) / 4;
    const cz = f.reduce((a, p) => a + p.z, 0) / 4;
    expect(Math.hypot(cx - t.x, cz - t.z)).toBeLessThan(8);
    // Cạnh xa (hai góc trên) dài hơn cạnh gần (hai góc dưới).
    const far = Math.hypot(f[0]!.x - f[1]!.x, f[0]!.z - f[1]!.z);
    const near = Math.hypot(f[2]!.x - f[3]!.x, f[2]!.z - f[3]!.z);
    expect(far).toBeGreaterThan(near);
    // Phía xa nằm theo hướng camera nhìn (−sin yaw, −cos yaw).
    const dx = (f[0]!.x + f[1]!.x) / 2 - t.x;
    const dz = (f[0]!.z + f[1]!.z) / 2 - t.z;
    expect(dx * -Math.sin(yaw) + dz * -Math.cos(yaw)).toBeGreaterThan(0);
  });
  it('tia hướng lên trời bị kéo về maxDist, không ra vô cực', () => {
    const f = groundFootprint({ x: 0, y: 5, z: 0 }, { x: 0, y: 0.2, z: -1 }, 60, 1.5, 0, 50);
    for (const p of f) expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(50.001);
  });
});
