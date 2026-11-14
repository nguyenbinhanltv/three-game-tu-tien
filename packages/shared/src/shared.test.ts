import { describe, expect, it } from 'vitest';
import {
  computeDamage,
  FLY_MAX_ALT,
  FLY_SPEED,
  groundAt,
  heightAt,
  inHazard,
  isHeavyHit,
  IN_FLY,
  IN_JUMP,
  IN_UP,
  KIEM_TRUNG,
  type MoveState,
  playerBaseStats,
  RUN_SPEED,
  SECT,
  STEP,
  stepMove,
  validName,
  WATER_Y,
  WORLD_SIZE,
  xpNeed,
} from './index';

const ctx = { canFly: true, frozen: false, speedMul: 1 };
const start = (x: number, z: number): MoveState => ({ x, y: groundAt(x, z), z, vy: 0, grounded: true, flying: false });

describe('địa hình', () => {
  it('tất định: cùng tọa độ cho cùng độ cao', () => {
    for (let i = 0; i < 50; i++) {
      const x = (i * 83.7) % WORLD_SIZE;
      const z = (i * 191.3) % WORLD_SIZE;
      expect(heightAt(x, z)).toBe(heightAt(x, z));
    }
  });
  it('sân tông môn và Kiếm Trủng phẳng đúng độ cao', () => {
    expect(heightAt(SECT.x, SECT.z)).toBeCloseTo(SECT.y, 5);
    expect(heightAt(SECT.x + 40, SECT.z - 30)).toBeCloseTo(SECT.y, 5);
    expect(Math.abs(heightAt(KIEM_TRUNG.x + 30, KIEM_TRUNG.z) - KIEM_TRUNG.y)).toBeLessThan(1);
  });
  it('không có vùng trũng dưới mặt nước ngoài hồ', () => {
    for (let x = 64; x < WORLD_SIZE; x += 128) {
      for (let z = 64; z < WORLD_SIZE; z += 128) {
        if (Math.hypot(x - 1380, z - 2180) > 440) expect(heightAt(x, z)).toBeGreaterThan(WATER_Y);
      }
    }
  });
});

describe('di chuyển', () => {
  it('chạy bộ không vượt tốc độ tối đa dù input bị thổi phồng', () => {
    const s = start(2048, 2600);
    for (let i = 0; i < 100; i++) stepMove(s, { s: i, mx: 5, mz: 5, yaw: 0.7, f: 0 }, { ...ctx, canFly: false });
    const d = Math.hypot(s.x - 2048, s.z - 2600);
    expect(d).toBeLessThanOrEqual(RUN_SPEED * STEP * 100 + 1e-6);
    expect(d).toBeGreaterThan(RUN_SPEED * STEP * 100 * 0.95);
  });
  it('không bay được khi không đủ điều kiện', () => {
    const s = start(2048, 2600);
    for (let i = 0; i < 40; i++) stepMove(s, { s: i, mx: 0, mz: 1, yaw: 0, f: IN_FLY | IN_UP }, { ...ctx, canFly: false });
    expect(s.flying).toBe(false);
    expect(s.y).toBeCloseTo(groundAt(s.x, s.z), 5);
  });
  it('bay có trần độ cao và tốc độ', () => {
    const s = start(2048, 2600);
    for (let i = 0; i < 2000; i++) stepMove(s, { s: i, mx: 0, mz: 0, yaw: 0, f: IN_FLY | IN_UP }, ctx);
    expect(s.flying).toBe(true);
    expect(s.y).toBeLessThanOrEqual(FLY_MAX_ALT);
    const x0 = s.x;
    const z0 = s.z;
    for (let i = 0; i < 20; i++) stepMove(s, { s: i, mx: 0, mz: 1, yaw: 1.1, f: IN_FLY }, ctx);
    expect(Math.hypot(s.x - x0, s.z - z0)).toBeLessThanOrEqual(FLY_SPEED * STEP * 20 + 1e-6);
  });
  it('nhảy rồi rơi lại mặt đất', () => {
    const s = start(2048, 2600);
    stepMove(s, { s: 1, mx: 0, mz: 0, yaw: 0, f: IN_JUMP }, ctx);
    expect(s.grounded).toBe(false);
    for (let i = 0; i < 60; i++) stepMove(s, { s: i, mx: 0, mz: 0, yaw: 0, f: 0 }, ctx);
    expect(s.grounded).toBe(true);
    expect(s.y).toBeCloseTo(groundAt(s.x, s.z), 5);
  });
  it('bị khống chế thì không dịch chuyển', () => {
    const s = start(2048, 2600);
    for (let i = 0; i < 20; i++) stepMove(s, { s: i, mx: 1, mz: 1, yaw: 0, f: IN_JUMP | IN_FLY }, { ...ctx, frozen: true });
    expect(s.x).toBe(2048);
    expect(s.z).toBe(2600);
    expect(s.flying).toBe(false);
  });
  it('không ra khỏi bản đồ', () => {
    const s = start(40, 40);
    for (let i = 0; i < 400; i++) stepMove(s, { s: i, mx: -1, mz: 1, yaw: 0, f: IN_FLY }, ctx);
    expect(s.x).toBeGreaterThan(0);
    expect(s.z).toBeGreaterThan(0);
  });
});

describe('công thức', () => {
  it('tu vi cần tăng dần theo cảnh giới', () => {
    for (let l = 1; l < 15; l++) expect(xpNeed(l + 1)).toBeGreaterThan(xpNeed(l));
  });
  it('sát thương tối thiểu là 1', () => {
    expect(computeDamage(1, 1, 9999, 0.5, 0.9).dmg).toBe(1);
  });
  it('bạo kích mạnh hơn đòn thường', () => {
    const a = computeDamage(100, 1, 0, 0.5, 0.99);
    const b = computeDamage(100, 1, 0, 0.5, 0.0);
    expect(b.crit).toBe(true);
    expect(b.dmg).toBeGreaterThan(a.dmg);
  });
  it('Trúc Cơ mạnh hơn hẳn Ngưng Khí tầng 15', () => {
    expect(playerBaseStats(16).hp).toBeGreaterThan(playerBaseStats(15).hp * 1.5);
  });
  it('kiểm tra đạo hiệu', () => {
    expect(validName('Lạc Vân')).toBe(true);
    expect(validName('a')).toBe(false);
    expect(validName('<script>')).toBe(false);
    expect(validName('x'.repeat(20))).toBe(false);
    expect(validName(123)).toBe(false);
  });
});

describe('vùng báo trước và đòn nặng', () => {
  it('phân cấp đòn theo hệ số', () => {
    expect(isHeavyHit(1)).toBe(false);
    expect(isHeavyHit(1.7)).toBe(false);
    expect(isHeavyHit(2.3)).toBe(true);
  });
  it('hình tròn', () => {
    const h = { x: 10, z: 10, r: 3 };
    expect(inHazard(h, 12, 10)).toBe(true);
    expect(inHazard(h, 13.1, 10)).toBe(false);
  });
  it('hình chữ nhật theo hướng', () => {
    // Gốc (0,0) nhìn về +x (yaw = π/2), dài 10, rộng 2.
    const h = { x: 0, z: 0, r: 10, sh: 'rect' as const, yaw: Math.PI / 2, w: 2 };
    expect(inHazard(h, 5, 0.9)).toBe(true);
    expect(inHazard(h, 5, 1.1)).toBe(false);
    expect(inHazard(h, -0.5, 0)).toBe(false); // sau lưng
    expect(inHazard(h, 10.5, 0)).toBe(false); // quá chiều dài
    // Yaw 0 nhìn về +z.
    expect(inHazard({ ...h, yaw: 0 }, 0, 5)).toBe(true);
    expect(inHazard({ ...h, yaw: 0 }, 5, 0)).toBe(false);
  });
  it('hình quạt', () => {
    const h = { x: 0, z: 0, r: 8, sh: 'cone' as const, yaw: 0, w: Math.PI / 6 }; // nửa góc 30°
    expect(inHazard(h, 0, 5)).toBe(true);
    expect(inHazard(h, 2, 5)).toBe(true); // ~21.8°
    expect(inHazard(h, 4, 5)).toBe(false); // ~38.7°
    expect(inHazard(h, 0, 8.5)).toBe(false);
    expect(inHazard(h, 0, -2)).toBe(false);
  });
});
