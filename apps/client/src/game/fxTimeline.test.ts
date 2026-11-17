import { describe, expect, it } from 'vitest';
import { FX_TIMELINE, SKILL } from '@dtl/content';
import { fxEventsFor, skillTiming, validateFxTimeline } from '@dtl/shared';
import { paletteOf } from '../render/vfx/palette';
import { cancelDropsCast, scheduleEvents } from './fxTimeline';

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

describe('V2: biến thức, mốc trúng, kích hoạt theo S.FX', () => {
  it('biến thức thêm sự kiện riêng', () => {
    const tl = FX_TIMELINE.get('skl_hoanh_kiem_pha_mach')!;
    const base = fxEventsFor(tl, -1).length;
    expect(fxEventsFor(tl, -1, 'long').length).toBeGreaterThan(base);
    expect(fxEventsFor(tl, -1, 'khong_co').length).toBe(base);
  });

  it('Kiếm Vũ Tam Điệp: sự kiện gắn `hit` chỉ phát ở mốc trúng của nó', () => {
    const tl = FX_TIMELINE.get('skl_kiem_vu_tam_diep')!;
    const hits = [0.2, 0.5, 0.8];
    const s = scheduleEvents(fxEventsFor(tl, -1), hits, 2);
    const cres = s.filter((x) => x.ev.type === 'mesh' && x.ev.shape === 'crescent');
    expect(cres).toHaveLength(3);
    expect(cres.map((x) => x.hit).sort()).toEqual([0, 1, 2]);
    // Gai nổ chỉ ở nhát cuối.
    expect(s.filter((x) => x.ev.type === 'mesh' && x.ev.shape === 'spike').every((x) => x.hit === 2)).toBe(true);
    // Khựng nhẹ ở nhát 1–2, nặng ở nhát cuối.
    const stops = s.filter((x) => x.ev.type === 'hitstop').map((x) => [x.hit, (x.ev as { ms: number }).ms]);
    expect(stops).toEqual(expect.arrayContaining([[0, 40], [1, 40], [2, 70]]));
  });

  it('chiêu lướt kích hoạt theo S.FX, neo tại 0', () => {
    for (const id of ['skl_kiem_anh_bo', 'skl_nghich_kiem_chuyen_phong']) {
      const tl = FX_TIMELINE.get(id)!;
      expect(tl.trigger).toBe('fx');
      expect(tl.fxKind).toBeTruthy();
      const s = scheduleEvents(fxEventsFor(tl, -1), [0], 2);
      expect(s.length).toBeGreaterThan(0);
      expect(s.every((x) => x.at >= -1e-9)).toBe(true);
    }
  });

  it('mỗi chiêu Kiếm tu có timeline và không trùng hình mẫu (khác nhau rõ)', () => {
    const ids = ['skl_phi_kiem', 'skl_kiem_khi_tram', 'skl_linh_khi_ho_the', 'skl_thien_kiem_vu', 'skl_hoi_nguyen_thuat', 'skl_loi_dinh_nhat_kiem', 'skl_kiem_anh_bo', 'skl_phi_kiem_truy_hon', 'skl_van_kiem_quy_tong', 'skl_hoanh_kiem_pha_mach', 'skl_kiem_vu_tam_diep', 'skl_kiem_dan_ban_menh', 'skl_nghich_kiem_chuyen_phong', 'skl_phan_anh_kiem_anh', 'skl_thuan_di_tram', 'skl_thien_kiem_hoa_hinh'];
    const sig = ids.map((id) => {
      expect(FX_TIMELINE.has(id), id).toBe(true);
      return JSON.stringify(fxEventsFor(FX_TIMELINE.get(id)!, -1).map((e) => [e.type, (e as { shape?: string }).shape, e.t]));
    });
    expect(new Set(sig).size).toBe(ids.length);
  });
});

describe('hủy động tác', () => {
  it('hủy trước mốc trúng thì bỏ đòn; sau mốc trúng thì giữ phần đuôi', () => {
    expect(cancelDropsCast(0.1, 0.28)).toBe(true);
    expect(cancelDropsCast(0.279, 0.28)).toBe(false);
    expect(cancelDropsCast(0.46, 0.28)).toBe(false);
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
