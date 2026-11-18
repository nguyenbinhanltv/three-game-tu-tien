import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { boltY, type BoltMsg, VALLEY } from '@dtl/shared';
import { FxPool, fxMaterial } from '../materials/vfx';
import type { Particles } from './particles';
import { BOLT_FADE, BoltFx, type BoltHost, boltAge, boltAlpha, boltLook, coreColor } from './projectile';

function host(pool: FxPool) {
  const group = new THREE.Group();
  let emitted = 0;
  const bursts: THREE.Vector3[] = [];
  const h: BoltHost = {
    group,
    particles: { emit: () => void emitted++ } as unknown as Particles,
    fx: (geo, color, opacity = 0.9, kind = 'glow') => {
      const m = pool.acquire(geo, kind, color, opacity);
      group.add(m);
      return m;
    },
    drop: (m) => pool.release(m),
    burst: (pos) => void bursts.push(pos.clone()),
  };
  return { h, group, bursts, emitted: () => emitted };
}

const msg = (id: number, over: Partial<BoltMsg> = {}): BoltMsg => ({
  id,
  x: VALLEY.x,
  z: VALLEY.z,
  yaw: 0,
  v: 10,
  r: 0.5,
  life: 2,
  t: 1000,
  kind: 'fire',
  src: 'm1',
  sd: 12345,
  ...over,
});

describe('đạn đánh xa phía client (D1)', () => {
  it('tuổi ban đầu bù độ trễ, kẹp trong [0, life]', () => {
    expect(boltAge({ t: 1000, life: 2 }, 1150)).toBeCloseTo(0.15);
    expect(boltAge({ t: 1000, life: 2 }, 900)).toBe(0); // đồng hồ client lệch sớm
    expect(boltAge({ t: 1000, life: 2 }, 9000)).toBe(2);
  });

  it('độ trong: hiện nhanh, mờ cuối đời', () => {
    expect(boltAlpha(0, 2)).toBe(0);
    expect(boltAlpha(0.5, 2)).toBe(1);
    expect(boltAlpha(2 - BOLT_FADE / 2, 2)).toBeCloseTo(0.5);
    expect(boltAlpha(2, 2)).toBe(0);
  });

  it('linh khí là phi kiếm, còn lại là cầu; lõi sáng hơn màu gốc', () => {
    expect(boltLook('spirit')).toBe('blade');
    expect(boltLook('fire')).toBe('orb');
    const c = new THREE.Color(coreColor(0xff6020));
    const o = new THREE.Color(0xff6020);
    expect(c.g).toBeGreaterThan(o.g);
  });

  it('nội suy bay thẳng theo cùng công thức server, bám địa hình', () => {
    const pool = new FxPool(0);
    const { h, group } = host(pool);
    const fx = new BoltFx(h);
    fx.spawn(msg(1), 0.2, 0xffa060);
    expect(fx.count).toBe(1);
    expect(group.children).toHaveLength(4); // lõi, thân, quầng, vòng bóng
    fx.update(0.3);
    const core = group.children[0]!;
    expect(core.position.x).toBeCloseTo(VALLEY.x);
    expect(core.position.z).toBeCloseTo(VALLEY.z + 5);
    expect(Math.abs(core.position.y - boltY(VALLEY.x, VALLEY.z + 5))).toBeLessThan(0.1);
  });

  it('tin kết thúc: nổ tại chỗ server báo, trả lưới về pool; hết hạn thì tự tắt', () => {
    const pool = new FxPool(0);
    const { h, group, bursts } = host(pool);
    const fx = new BoltFx(h);
    fx.spawn(msg(1), 0, 0xffa060);
    fx.spawn(msg(2), 0, 0xffa060);
    fx.end(1, VALLEY.x + 1, VALLEY.z + 2, true);
    expect(bursts).toHaveLength(1);
    expect(bursts[0]!.x).toBeCloseTo(VALLEY.x + 1);
    expect(fx.count).toBe(1);
    fx.end(99, 0, 0, false); // id lạ: bỏ qua
    fx.update(2.5);
    expect(fx.count).toBe(0);
    expect(group.children).toHaveLength(0);
    expect(pool.freeCount).toBe(pool.created);
  });

  it('phát liên tục không tạo thêm lưới hay material sau khi ấm', () => {
    const pool = new FxPool(0);
    const { h, emitted } = host(pool);
    const fx = new BoltFx(h);
    for (let i = 0; i < 3; i++) fx.spawn(msg(i, { kind: i ? 'spirit' : 'fire' }), 0, 0xd8f0ff);
    fx.update(5);
    const warm = pool.created;
    const glow = fxMaterial('glow');
    const flat = fxMaterial('flat');
    for (let round = 0; round < 20; round++) {
      for (let i = 0; i < 3; i++) fx.spawn(msg(100 + round * 3 + i, { kind: i ? 'spirit' : 'fire' }), 0, 0xd8f0ff);
      fx.update(0.05);
      fx.end(100 + round * 3, VALLEY.x, VALLEY.z, true);
      fx.update(5);
    }
    expect(pool.created).toBe(warm);
    expect(fxMaterial('glow')).toBe(glow);
    expect(fxMaterial('flat')).toBe(flat);
    expect(emitted()).toBeGreaterThan(0); // vệt hạt
  });

  it('bỏ qua tin hỏng (tốc độ/thời gian sống không dương, đã quá hạn)', () => {
    const pool = new FxPool(0);
    const fx = new BoltFx(host(pool).h);
    fx.spawn(msg(1, { v: 0 }), 0, 0);
    fx.spawn(msg(2, { life: -1 }), 0, 0);
    fx.spawn(msg(3), 2, 0);
    expect(fx.count).toBe(0);
  });
});
