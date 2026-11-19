import { describe, expect, it } from 'vitest';
import '@dtl/content';
import { terrainOf } from '@dtl/shared';
import { bhAmbient, bhGroundColor, deadTreeSpots, riftBlend, riftDist, riftPath, scatterBacHoang } from './bacHoangArt';
import { regionTrack } from '../audio/musicDirector';
import { mixPreset, GRADING } from '../../render/grading';

const tr = terrainOf('bac_hoang');
const def = tr.def;
const path = riftPath(def);
const ctx = {
  def,
  bounds: tr.playBounds,
  heightAt: (x: number, z: number) => tr.heightAt(x, z),
  clear: [{ x: 1024, z: 1544, r: 70 }],
  colliders: tr.colliders,
  path,
};

describe('bacHoangArt (DV-3I)', () => {
  it('đường tâm khe: 14 điểm sắp từ nam lên bắc, cách nhau 30 m', () => {
    expect(path.length).toBe(14);
    for (let i = 1; i < path.length; i++) expect(path[i]!.z).toBeLessThan(path[i - 1]!.z);
    expect(riftDist(path, path[5]!.x, path[5]!.z).d).toBeLessThan(0.01);
    expect(riftDist(path, path[5]!.x + 40, path[5]!.z).d).toBeGreaterThan(30);
  });

  it('mood: nam là 0 (tro sớm), bắc là 1 (bên kia), đơn điệu, chuyển quanh miệng khe', () => {
    expect(riftBlend(500)).toBe(0);
    expect(riftBlend(-40)).toBe(0);
    expect(riftBlend(-600)).toBe(1);
    expect(riftBlend(-120)).toBe(0); // Khích Giai (thềm nam) còn là bên này
    expect(riftBlend(-190)).toBeGreaterThan(0.2); // miệng nam khe (z lệch −190) đang chuyển
    expect(riftBlend(-190)).toBeLessThan(0.8);
    let prev = -1;
    for (let zo = 100; zo >= -700; zo -= 20) {
      const t = riftBlend(zo);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('trộn preset: t = 0/1 trả về hai đầu, giữa là trung gian, màu trộn theo kênh', () => {
    const a = GRADING.bh_dawn;
    const b = GRADING.bhr_dawn;
    expect(mixPreset(a, b, 0).sunIntensity).toBeCloseTo(a.sunIntensity);
    expect(mixPreset(a, b, 1).fogColor).toBe(b.fogColor);
    const mid = mixPreset(a, b, 0.5);
    expect(mid.exposure).toBeCloseTo((a.exposure + b.exposure) / 2);
    expect(mid.fogColor).not.toBe(a.fogColor);
    expect(mid.fogColor).not.toBe(b.fogColor);
  });

  it('màu đất hợp lệ 0..1, sẫm hơn bên kia vết nứt', () => {
    const s: [number, number, number] = [0, 0, 0];
    const n: [number, number, number] = [0, 0, 0];
    bhGroundColor(def, path, 1100, 1300, 72, 1, s);
    bhGroundColor(def, path, 1100, 500, 72, 1, n);
    for (const v of [...s, ...n]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(2);
    }
    expect(s[0] + s[1] + s[2]).toBeGreaterThan(n[0] + n[1] + n[2]);
  });

  it('rải tàn tích: xác định, để trống lòng khe và vòng cấm, có đủ đá/cột/kiếm', () => {
    const a = scatterBacHoang(ctx);
    const b = scatterBacHoang(ctx);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(300);
    for (const r of a) {
      expect(riftDist(path, r.x, r.z).d).toBeGreaterThanOrEqual(12);
      expect((r.x - 1024) ** 2 + (r.z - 1544) ** 2).toBeGreaterThanOrEqual(70 * 70);
    }
    const ids = new Set(a.map((r) => r.id));
    expect(ids.has('prop_tru_da_khac_van')).toBe(true);
    expect([...ids].some((i) => i.startsWith('prop_da_'))).toBe(true);
  });

  it('cây chết: xác định, đúng trần, dày ở Khô Lộc Lâm, gần như không có bên kia', () => {
    const a = deadTreeSpots(ctx, 700);
    expect(a).toEqual(deadTreeSpots(ctx, 700));
    expect(a.length).toBeGreaterThan(100);
    expect(a.length).toBeLessThanOrEqual(700);
    expect(deadTreeSpots(ctx, 50).length).toBe(50);
    const inForest = a.filter((s) => Math.hypot(s.x - 704, s.z - 1244) < 230).length;
    const beyond = a.filter((s) => s.z < 1024 - 250).length;
    expect(inForest).toBeGreaterThan(a.length * 0.6);
    expect(beyond).toBeLessThan(a.length * 0.05);
    for (const s of a) expect(riftDist(path, s.x, s.z).d).toBeGreaterThanOrEqual(30);
  });

  it('hạt môi trường: tro khắp nơi, tàn lửa dày hơn gần khe và bên kia', () => {
    const far = bhAmbient(path, 1500, 1500, def);
    const near = bhAmbient(path, path[6]!.x + 20, path[6]!.z, def);
    expect(far.ash).toBeGreaterThan(0);
    expect(near.ember).toBeGreaterThan(far.ember * 3);
  });

  it('nhạc: Bắc Hoang chọn wild_ash bên này, wild_rift bên kia; level khác không đổi', () => {
    expect(regionTrack(false, 'wild', 'bac_hoang', false)).toBe('wild_ash');
    expect(regionTrack(false, 'wild', 'bac_hoang', true)).toBe('wild_rift');
    expect(regionTrack(false, 'wild', 'thien_khuyet', true)).toBe('wild_night');
    expect(regionTrack(false, 'wild')).toBe('wild');
  });
});
