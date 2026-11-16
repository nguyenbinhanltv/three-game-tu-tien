import { describe, expect, it } from 'vitest';
import { FX_TIMELINE, SKILL } from '@dtl/content';
import { fxEventsFor, skillTiming, validateFxTimeline } from '@dtl/shared';
import { paletteOf } from '../render/vfx/palette';
import { scheduleEvents } from './fxTimeline';

describe('FxRunner.scheduleEvents', () => {
  const evs = fxEventsFor(FX_TIMELINE.get('skl_kiem_khi_tram')!, -1);

  it('neo vào hitAt: sự kiện t=0 rơi đúng mốc trúng, t âm đứng trước', () => {
    const tm = skillTiming(SKILL.get('skl_kiem_khi_tram')!, undefined);
    const s = scheduleEvents(evs, tm.hitAt, 2);
    const burst = s.find((x) => x.ev.type === 'mesh' && x.ev.shape === 'burst')!;
    expect(burst.at).toBeCloseTo(tm.hitAt[0] + burst.ev.t, 6);
    // Lưỡi liềm bắt đầu trước hitAt.
    const cres = s.find((x) => x.ev.type === 'mesh' && x.ev.shape === 'crescent')!;
    expect(cres.at).toBeLessThan(tm.hitAt[0]);
    // Đã sắp theo thời gian.
    for (let i = 1; i < s.length; i++) expect(s[i].at).toBeGreaterThanOrEqual(s[i - 1].at);
  });

  it('bậc chất lượng: Thấp bỏ hạt phụ, decal, gai; Cao đủ', () => {
    const hit = [0.28];
    const low = scheduleEvents(evs, hit, 0);
    const high = scheduleEvents(evs, hit, 2);
    expect(low.length).toBeLessThan(high.length);
    expect(low.some((x) => x.ev.type === 'decal')).toBe(false);
    expect(low.some((x) => x.ev.type === 'mesh' && x.ev.shape === 'crescent')).toBe(true);
    expect(low.some((x) => x.ev.type === 'hitstop')).toBe(true);
  });

  it('chuỗi liên hoàn Phi Kiếm: mỗi đòn có timeline riêng, đòn cuối nhiều hơn', () => {
    const tl = FX_TIMELINE.get('skl_phi_kiem')!;
    const n = (c: number) => scheduleEvents(fxEventsFor(tl, c), [0.26], 2).length;
    expect(n(2)).toBeGreaterThan(n(0));
  });
});

describe('dữ liệu timeline chiêu mẫu', () => {
  for (const tl of FX_TIMELINE.values()) {
    it(`${tl.skill}: hợp lệ, hitstop 40–80 ms, không phát vượt lõi chớp 120 ms`, () => {
      expect(validateFxTimeline(tl, (id) => SKILL.has(id))).toEqual([]);
      const all = [...tl.events, ...Object.values(tl.combo ?? {}).flat()];
      for (const e of all) if (e.type === 'mesh' && e.shape === 'burst') expect(e.dur).toBeLessThanOrEqual(0.12);
    });
  }

  it('mỗi nhánh một bảng màu riêng; công pháp lạ rơi về kiếm tu', () => {
    const k = paletteOf('lac_kiem_quyet');
    expect(paletteOf('bat_dong_kim_than')).not.toEqual(k);
    expect(paletteOf('thanh_moc_dan_kinh')).not.toEqual(k);
    expect(paletteOf(undefined)).toEqual(k);
    expect(paletteOf('khong_co')).toEqual(k);
  });
});
