import { describe, expect, it } from 'vitest';
import { ISO_FOV, ISO_PITCH } from './iso';
import { spotAt, VISTA, VISTA_SPOTS, VistaRig, vistaView } from './vista';

describe('vista', () => {
  it('amount 0 trả đúng camera chéo gốc', () => {
    const v = vistaView(0);
    expect(v.pitch).toBe(ISO_PITCH);
    expect(v.fov).toBe(ISO_FOV);
    expect(v.distMul).toBe(1);
    expect(v.lift).toBe(0);
  });
  it('amount 1 hạ thấp, nới góc, đẩy xa', () => {
    const v = vistaView(1);
    expect(v.pitch).toBeCloseTo(VISTA.pitch);
    expect(v.pitch).toBeLessThan(ISO_PITCH);
    expect(v.fov).toBeGreaterThan(ISO_FOV);
  });
  it('tìm điểm ngắm cảnh theo level và bán kính', () => {
    const s = VISTA_SPOTS[1]!;
    expect(spotAt(s.level, s.x, s.z)?.id).toBe(s.id);
    expect(spotAt(s.level, s.x + s.r + 1, s.z)).toBeNull();
    expect(spotAt('level_khac', s.x, s.z)).toBeNull();
  });
  it('ngự kiếm mở mượt rồi trả về 0 khi hạ cánh', () => {
    const r = new VistaRig();
    for (let i = 0; i < 120; i++) r.update(1 / 60, true, null, true);
    expect(r.amount).toBeCloseTo(1);
    r.update(1 / 60, true, null, true);
    const mid = r.update(1 / 60, false, null, true);
    expect(mid).toBeLessThan(1);
    for (let i = 0; i < 120; i++) r.update(1 / 60, false, null, true);
    expect(r.amount).toBe(0);
  });
  it('bấm thoát tắt ở điểm đó, rời khỏi rồi vào lại thì mở lại', () => {
    const r = new VistaRig();
    const s = VISTA_SPOTS[0]!;
    for (let i = 0; i < 120; i++) r.update(1 / 60, false, s, true);
    expect(r.amount).toBeCloseTo(1);
    r.dismiss(s);
    for (let i = 0; i < 120; i++) r.update(1 / 60, false, s, true);
    expect(r.amount).toBe(0);
    r.update(1 / 60, false, null, true);
    for (let i = 0; i < 120; i++) r.update(1 / 60, false, s, true);
    expect(r.amount).toBeCloseTo(1);
  });
  it('cờ tắt thì không mở', () => {
    const r = new VistaRig();
    for (let i = 0; i < 60; i++) r.update(1 / 60, true, null, false);
    expect(r.amount).toBe(0);
  });
  it('gợi ý hiện đúng một lần mỗi lần vào điểm', () => {
    const r = new VistaRig();
    const s = VISTA_SPOTS[0]!;
    expect(r.hint(s)).toBe(true);
    expect(r.hint(s)).toBe(false);
    r.hint(null);
    expect(r.hint(s)).toBe(true);
  });
});
