import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  accelLean,
  bobOf,
  CUTIN_SETS,
  cutinArt,
  EXAG_GAIN,
  exagBlend,
  exagGain,
  glideDip,
  glideLean,
  idleDue,
  leanBoost,
  LocoImpulse,
} from './animFx';
import { closeCam, keyMoments } from '../debug/animLabMath';

describe('Thân Pháp T1 (cường điệu)', () => {
  it('đứng yên giữ nguyên clip, chạy thì đủ hệ số', () => {
    expect(exagBlend(0)).toBe(0);
    expect(exagGain('upperarm_l', 0)).toBe(1);
    expect(exagBlend(3)).toBe(1);
    expect(exagGain('upperarm_l', 5.4)).toBeCloseTo(EXAG_GAIN.upperarm_l!, 6);
  });
  it('hệ số tay/vai/hông nằm trong 15–30%', () => {
    for (const g of Object.values(EXAG_GAIN)) {
      expect(g).toBeGreaterThanOrEqual(1.15);
      expect(g).toBeLessThanOrEqual(1.3);
    }
  });
  it('xương lạ không bị đụng', () => {
    expect(exagGain('head', 5)).toBe(1);
  });
  it('nảy bước: không nảy khi đứng, thấp nhất lúc chân chạm, hai lần mỗi chu kỳ', () => {
    expect(bobOf(0.3, 0)).toBe(0);
    expect(bobOf(0, 5.4)).toBeCloseTo(0, 9);
    expect(bobOf(0.25, 5.4)).toBeGreaterThan(0.03);
    expect(bobOf(0.5, 5.4)).toBeCloseTo(0, 9);
    expect(bobOf(0.25, 5.4)).toBeCloseTo(bobOf(0.75, 5.4), 9);
  });
  it('nghiêng khi rẽ mạnh hơn gốc nhưng có trần', () => {
    expect(leanBoost(0.1)).toBeCloseTo(0.15, 9);
    expect(leanBoost(5)).toBe(0.2);
    expect(leanBoost(-5)).toBe(-0.2);
  });
});

describe('animlab', () => {
  it('mốc tự chụp tăng dần, +30 ms ngay sau đỉnh đòn', () => {
    const m = keyMoments(0.28, 0.9);
    expect(m.map((x) => x.name)).toEqual(['dolu', 'dinh', 'p30', 'thu']);
    expect(m[1]!.at).toBe(0.28);
    expect(m[2]!.at).toBeCloseTo(0.31, 9);
    for (let i = 1; i < m.length; i++) expect(m[i]!.at).toBeGreaterThan(m[i - 1]!.at);
    expect(m[3]!.at).toBeLessThan(0.9);
  });
  it('camera cận nhìn vào người, cách đúng khoảng', () => {
    const c = closeCam(10, 2, 20, 1.7, Math.PI / 2, 3.6);
    expect(c.tx).toBe(10);
    expect(Math.hypot(c.x - 10, c.z - 20)).toBeCloseTo(3.6, 9);
    expect(c.y).toBeGreaterThan(2 + 1.2);
    expect(c.fov).toBe(28);
  });
});

describe('Thân Pháp T2/T3 (di chuyển, idle)', () => {
  it('tăng tốc chúi tới, phanh ngả sau, có trần', () => {
    expect(accelLean(8)).toBeGreaterThan(0);
    expect(accelLean(-8)).toBeLessThan(0);
    expect(accelLean(1000)).toBe(0.16);
    expect(accelLean(-1000)).toBe(-0.16);
  });
  it('lướt thấp chỉ khi chạy', () => {
    expect(glideLean(0)).toBe(0);
    expect(glideLean(1)).toBeLessThan(glideLean(5.4));
    expect(glideDip(5.4)).toBeCloseTo(0.04, 9);
    expect(glideDip(0)).toBe(0);
  });
  it('idle: tới lượt sau 7 s đứng yên', () => {
    expect(idleDue(6.9)).toBe(false);
    expect(idleDue(7)).toBe(true);
  });
});

describe('Thân Pháp T2: xung bắt đầu/dừng/pivot', () => {
  const run = (li: LocoImpulse, sec: number, speed: number, yaw = 0) => {
    let ev: string | null = null;
    for (let i = 0; i < Math.round(sec * 60); i++) ev = li.update(1 / 60, speed, yaw) ?? ev;
    return ev;
  };
  it('bắt đầu chạy: nhận sự kiện start, chúi tới rồi tắt về 0', () => {
    const li = new LocoImpulse();
    run(li, 0.5, 0);
    expect(li.update(1 / 60, 3, 0)).toBe('start');
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      li.update(1 / 60, 3, 0);
      peak = Math.max(peak, li.pitch);
    }
    expect(peak).toBeGreaterThan(0.02);
    run(li, 2, 3);
    expect(Math.abs(li.pitch)).toBeLessThan(1e-3);
  });
  it('dừng từ tốc độ cao: ngả ra sau, mạnh hơn khi chạy nhanh', () => {
    const lo = new LocoImpulse();
    run(lo, 1, 2.6);
    expect(lo.update(1 / 60, 0, 0)).toBe('stop');
    let lo_min = 0;
    for (let i = 0; i < 40; i++) {
      lo.update(1 / 60, 0, 0);
      lo_min = Math.min(lo_min, lo.pitch);
    }
    const hi = new LocoImpulse();
    run(hi, 1, 5.4);
    hi.update(1 / 60, 0, 0);
    let hi_min = 0;
    for (let i = 0; i < 40; i++) {
      hi.update(1 / 60, 0, 0);
      hi_min = Math.min(hi_min, hi.pitch);
    }
    expect(lo_min).toBeLessThan(0);
    expect(hi_min).toBeLessThan(lo_min);
  });
  it('đi bộ chậm dừng lại không có sự kiện dừng', () => {
    const li = new LocoImpulse();
    run(li, 1, 1.2);
    expect(li.update(1 / 60, 0, 0)).toBeNull();
  });
  it('pivot: xoay mạnh khi chạy nghiêng ngược chiều, có hồi 0,35 s', () => {
    const li = new LocoImpulse();
    run(li, 0.5, 5);
    expect(li.update(1 / 60, 5, 7)).toBe('pivot');
    expect(li.update(1 / 60, 5, 7)).toBeNull();
    let r = 0;
    for (let i = 0; i < 20; i++) {
      li.update(1 / 60, 5, 0);
      r = Math.min(r, li.roll);
    }
    expect(r).toBeLessThan(-0.01);
    run(li, 2, 5);
    expect(Math.abs(li.roll)).toBeLessThan(1e-3);
  });
  it('dt lớn (0,1 s, ~10 fps) vẫn ổn định: hữu hạn và về gần 0', () => {
    const li = new LocoImpulse();
    li.kick('stop', 1);
    li.kick('start', 1);
    li.kick('pivot', 1, 1);
    for (let i = 0; i < 200; i++) {
      li.update(0.1, 0, 0);
      expect(Number.isFinite(li.pitch + li.roll + li.dip)).toBe(true);
    }
    expect(Math.abs(li.pitch) + Math.abs(li.roll) + Math.abs(li.dip)).toBeLessThan(1e-3);
  });
  it('reset về nghỉ', () => {
    const li = new LocoImpulse();
    li.kick('stop', 1);
    li.update(1 / 60, 0, 0);
    li.reset();
    expect([li.pitch, li.roll, li.dip]).toEqual([0, 0, 0]);
  });
});

describe('cut-in theo bộ (TP-3)', () => {
  it('chỉ bộ có tranh mới có tên tranh, giới m/f', () => {
    expect(cutinArt('tinh_khuyet', 'f')).toBe('tinh_khuyet_f');
    expect(cutinArt('tinh_khuyet', 'm')).toBe('tinh_khuyet_m');
    expect(cutinArt('bo_chua_ve', 'f')).toBeNull();
  });
  it('mọi bộ trong CUTIN_SETS có đủ tranh nam + nữ trong sổ khóa asset', () => {
    const lock = JSON.parse(
      readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../assets/asset-lock.json'), 'utf8'),
    ) as { files?: Record<string, unknown> } | Record<string, unknown>;
    const files = ((lock as { files?: Record<string, unknown> }).files ?? lock) as Record<string, unknown>;
    for (const k of CUTIN_SETS) for (const g of ['m', 'f']) expect(Object.keys(files)).toContain(`assets/cutin/${k}_${g}.webp`);
  });
});
