import { describe, expect, it } from 'vitest';
import { FX_TIMELINE, SKILL } from '@dtl/content';
import { fxEventsFor, skillTiming, validateFxTimeline } from '@dtl/shared';
import { paletteOf } from '../render/vfx/palette';
import { cancelDropsCast, scheduleEvents, variantFor } from './fxTimeline';

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

describe('biến thức theo chiêu', () => {
  const vars = { a: { fx: 'long' }, b: { fx: 'twin' } };
  it('của mình: lấy theo lựa chọn cục bộ của chiêu, không phụ thuộc S.FX của chiêu trước', () => {
    // Vừa đánh thường (S.FX không có biến thức, hoặc `twin` của chiêu khác), rồi ra Hoành Kiếm đã chọn biến thức a.
    expect(variantFor({ mine: true, skillId: 'skl_hoanh_kiem_pha_mach', chosen: 'a', variants: vars, lastFx: 'twin' })).toBe('long');
    expect(variantFor({ mine: true, skillId: 'skl_hoanh_kiem_pha_mach', chosen: undefined, variants: vars, lastFx: 'twin' })).toBeUndefined();
  });
  it('của người khác: dùng biến thức S.FX cùng loại hiệu ứng', () => {
    expect(variantFor({ mine: false, skillId: 'x', lastFx: 'long' })).toBe('long');
    expect(variantFor({ mine: false, skillId: 'x' })).toBeUndefined();
  });
});

describe('V3: Hộ pháp + Đan sư', () => {
  const HP = ['skl_tran_son_an', 'skl_kim_cuong_bat_hoai', 'skl_thiet_quyen_chan_dia', 'skl_kim_chung_tran', 'skl_son_nhac_hoa_than', 'skl_anh_thiet_than', 'skl_thuan_di_ho_the', 'skl_thien_kim_phap_tuong', 'skl_thiet_bich_xung', 'skl_dich_son_xung'];
  const DS = ['skl_hoi_xuan_quyet', 'skl_hoi_thien_dan_lo', 'skl_moc_linh_tran', 'skl_duoc_vu', 'skl_ngung_dan_ho_the', 'skl_dan_hoa_phong_tran', 'skl_anh_duoc_hoa_than', 'skl_thuan_di_cuu_vien', 'skl_thien_dan_phap_gioi', 'skl_luu_huong_bo'];
  it('đủ 20 chiêu có timeline, chiêu khác nhau rõ', () => {
    const sig = [...HP, ...DS].map((id) => {
      expect(FX_TIMELINE.has(id), id).toBe(true);
      return JSON.stringify(fxEventsFor(FX_TIMELINE.get(id)!, -1).map((e) => [e.type, (e as { shape?: string }).shape, e.t]));
    });
    expect(new Set(sig).size).toBe(sig.length);
  });
  it('bảng màu theo nhánh: hổ phách (Hộ pháp), ngọc lục (Đan sư)', () => {
    expect(paletteOf(SKILL.get('skl_tran_son_an')!.method)).toEqual(paletteOf('bat_dong_kim_than'));
    expect(paletteOf(SKILL.get('skl_hoi_xuan_quyet')!.method)).toEqual(paletteOf('thanh_moc_dan_kinh'));
    expect(paletteOf('bat_dong_kim_than').body).not.toBe(paletteOf('thanh_moc_dan_kinh').body);
  });
  it('chiêu lướt: hai công pháp cùng `dash` nhưng không giẫm nhau', () => {
    const keys = ['skl_kiem_anh_bo', 'skl_thiet_bich_xung', 'skl_luu_huong_bo'].map((id) => FX_TIMELINE.get(id)!).map((tl) => `${tl.fxKind}:${tl.method}`);
    expect(new Set(keys).size).toBe(3);
  });
  it('chớp va chạm (burst) < 120 ms và hitstop 40–80 ms ở mọi chiêu', () => {
    for (const id of [...HP, ...DS]) {
      const tl = FX_TIMELINE.get(id)!;
      for (const e of [...tl.events, ...Object.values(tl.variants ?? {}).flat()]) {
        if (e.type === 'mesh' && e.shape === 'burst') expect(e.dur, id).toBeLessThanOrEqual(0.12);
        if (e.type === 'hitstop') expect(e.ms, id).toBeLessThanOrEqual(80);
      }
    }
  });
});

describe('V4: pháp tướng', () => {
  it('3 chiêu tối thượng có pháp tướng + kéo camera (≤ 0,4), đúng hình theo nhánh', () => {
    const want: Record<string, string> = { skl_van_kiem_quy_tong: 'dragon', skl_kim_cuong_bat_hoai: 'card', skl_hoi_thien_dan_lo: 'card' };
    for (const [id, shape] of Object.entries(want)) {
      const ev = fxEventsFor(FX_TIMELINE.get(id)!, -1);
      expect(ev.some((e) => e.type === 'mesh' && e.shape === shape), id).toBe(true);
      const cam = ev.find((e) => e.type === 'camera');
      expect(cam, id).toBeTruthy();
      expect((cam as { pull: number }).pull).toBeLessThanOrEqual(0.4);
    }
  });
  it('thẻ La Hán / Phượng đúng tranh theo nhánh', () => {
    const card = (id: string) => (fxEventsFor(FX_TIMELINE.get(id)!, -1).find((e) => e.type === 'mesh' && e.shape === 'card') as { card?: string }).card;
    expect(card('skl_kim_cuong_bat_hoai')).toBe('arhat');
    expect(card('skl_hoi_thien_dan_lo')).toBe('phoenix');
  });
  it('pháp tướng mọc (sweep) rồi tan (erodeFrom < 1): có dissolve', () => {
    for (const id of ['skl_van_kiem_quy_tong', 'skl_kim_cuong_bat_hoai', 'skl_hoi_thien_dan_lo']) {
      const big = fxEventsFor(FX_TIMELINE.get(id)!, -1).filter((e) => e.type === 'mesh' && (e.shape === 'dragon' || e.shape === 'card'));
      expect(big.length).toBeGreaterThan(0);
      for (const e of big) if (e.type === 'mesh') expect(e.erodeFrom ?? 0.5).toBeLessThan(0.9);
    }
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
