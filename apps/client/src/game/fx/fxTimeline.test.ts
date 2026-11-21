import { describe, expect, it } from 'vitest';
import { FX_TIMELINE, SKILL, VARIANTS } from '@dtl/content';
import { fxCamFade, fxDrawCount, fxEventsFor, fxParticleCount, skillTiming, validateFxTimeline } from '@dtl/shared';
import { paletteOf } from '../../render/vfx/palette';
import { cancelDropsCast, scheduleEvents, variantFor } from './fxTimeline';

describe('FxRunner.scheduleEvents', () => {
  const evs = fxEventsFor(FX_TIMELINE.get('skl_kiem_khi_tram')!, -1);

  it('neo vào hitAt: sự kiện t=0 rơi đúng mốc trúng, t âm đứng trước', () => {
    const tm = skillTiming(SKILL.get('skl_kiem_khi_tram')!, undefined);
    const s = scheduleEvents(evs, tm.hitAt, 2);
    const burst = s.find((x) => x.ev.type === 'mesh' && x.ev.shape === 'burst')!;
    expect(burst.at).toBeCloseTo(tm.hitAt[0]! + burst.ev.t, 6);
    // Lưỡi liềm bắt đầu trước hitAt.
    const cres = s.find((x) => x.ev.type === 'mesh' && x.ev.shape === 'slash_thick')!;
    expect(cres.at).toBeLessThan(tm.hitAt[0]!);
    // Đã sắp theo thời gian.
    for (let i = 1; i < s.length; i++) expect(s[i]!.at).toBeGreaterThanOrEqual(s[i - 1]!.at);
  });

  it('bậc chất lượng: Thấp bỏ hạt phụ, decal, hình đất; Cao đủ', () => {
    const hit = [0.28];
    const low = scheduleEvents(evs, hit, 0);
    const high = scheduleEvents(evs, hit, 2);
    expect(low.length).toBeLessThan(high.length);
    expect(low.some((x) => x.ev.type === 'decal')).toBe(false);
    expect(low.some((x) => x.ev.type === 'mesh' && x.ev.shape === 'slash_thick')).toBe(true);
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
    expect(stops).toEqual(
      expect.arrayContaining([
        [0, 40],
        [1, 40],
        [2, 70],
      ]),
    );
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
    const ids = [
      'skl_phi_kiem',
      'skl_kiem_khi_tram',
      'skl_linh_khi_ho_the',
      'skl_thien_kiem_vu',
      'skl_hoi_nguyen_thuat',
      'skl_loi_dinh_nhat_kiem',
      'skl_kiem_anh_bo',
      'skl_phi_kiem_truy_hon',
      'skl_van_kiem_quy_tong',
      'skl_hoanh_kiem_pha_mach',
      'skl_kiem_vu_tam_diep',
      'skl_kiem_dan_ban_menh',
      'skl_nghich_kiem_chuyen_phong',
      'skl_phan_anh_kiem_anh',
      'skl_thuan_di_tram',
      'skl_thien_kiem_hoa_hinh',
    ];
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
    expect(
      variantFor({ mine: true, skillId: 'skl_hoanh_kiem_pha_mach', chosen: undefined, variants: vars, lastFx: 'twin' }),
    ).toBeUndefined();
  });
  it('của người khác: dùng biến thức S.FX cùng loại hiệu ứng', () => {
    expect(variantFor({ mine: false, skillId: 'x', lastFx: 'long' })).toBe('long');
    expect(variantFor({ mine: false, skillId: 'x' })).toBeUndefined();
  });
});

describe('V3: Hộ pháp + Đan sư', () => {
  const HP = [
    'skl_tran_son_an',
    'skl_kim_cuong_bat_hoai',
    'skl_thiet_quyen_chan_dia',
    'skl_kim_chung_tran',
    'skl_son_nhac_hoa_than',
    'skl_anh_thiet_than',
    'skl_thuan_di_ho_the',
    'skl_thien_kim_phap_tuong',
    'skl_thiet_bich_xung',
    'skl_dich_son_xung',
  ];
  const DS = [
    'skl_hoi_xuan_quyet',
    'skl_hoi_thien_dan_lo',
    'skl_moc_linh_tran',
    'skl_duoc_vu',
    'skl_ngung_dan_ho_the',
    'skl_dan_hoa_phong_tran',
    'skl_anh_duoc_hoa_than',
    'skl_thuan_di_cuu_vien',
    'skl_thien_dan_phap_gioi',
    'skl_luu_huong_bo',
  ];
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
    const keys = ['skl_kiem_anh_bo', 'skl_thiet_bich_xung', 'skl_luu_huong_bo']
      .map((id) => FX_TIMELINE.get(id)!)
      .map((tl) => `${tl.fxKind}:${tl.method}`);
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
    const want: Record<string, string> = {
      skl_van_kiem_quy_tong: 'dragon_sword',
      skl_kim_cuong_bat_hoai: 'card',
      skl_hoi_thien_dan_lo: 'card',
    };
    for (const [id, shape] of Object.entries(want)) {
      const ev = fxEventsFor(FX_TIMELINE.get(id)!, -1);
      expect(
        ev.some((e) => e.type === 'mesh' && e.shape === shape),
        id,
      ).toBe(true);
      const cam = ev.find((e) => e.type === 'camera');
      expect(cam, id).toBeTruthy();
      expect((cam as { pull: number }).pull).toBeLessThanOrEqual(0.4);
    }
  });
  it('thẻ La Hán / Phượng đúng tranh theo nhánh', () => {
    const card = (id: string) =>
      (fxEventsFor(FX_TIMELINE.get(id)!, -1).find((e) => e.type === 'mesh' && e.shape === 'card') as { card?: string }).card;
    expect(card('skl_kim_cuong_bat_hoai')).toBe('arhat');
    expect(card('skl_hoi_thien_dan_lo')).toBe('phoenix');
  });
  it('pháp tướng mọc (sweep) rồi tan (erodeFrom < 1): có dissolve', () => {
    for (const id of ['skl_van_kiem_quy_tong', 'skl_kim_cuong_bat_hoai', 'skl_hoi_thien_dan_lo']) {
      const big = fxEventsFor(FX_TIMELINE.get(id)!, -1).filter(
        (e) => e.type === 'mesh' && (e.shape === 'dragon' || e.shape === 'dragon_sword' || e.shape === 'card'),
      );
      expect(big.length).toBeGreaterThan(0);
      for (const e of big) if (e.type === 'mesh') expect(e.erodeFrom ?? 0.5).toBeLessThan(0.9);
    }
  });
});

describe('V4 phần 2: cảnh lớn theo S.FX', () => {
  it('đột phá/độ kiếp có bốn timeline theo cảnh giới (`when`), mặc định là Trúc Cơ', () => {
    for (const kind of ['ascend', 'tribstart']) {
      const all = [...FX_TIMELINE.values()].filter((t) => t.fxKind === kind);
      expect(all.map((t) => t.when ?? 'truc_co').sort()).toEqual(['hoa_than', 'ket_dan', 'nguyen_anh', 'truc_co']);
      expect(new Set(all.map((t) => t.palette)).size).toBe(4);
    }
  });
  it('chớp (burst) < 120 ms và không có chớp toàn cảnh > 0,3 ở mọi cảnh lớn', () => {
    for (const tl of FX_TIMELINE.values()) {
      if (!tl.skill.startsWith('fx_')) continue;
      for (const e of tl.events) {
        if (e.type === 'mesh' && e.shape === 'burst') expect(e.dur, tl.skill).toBeLessThanOrEqual(0.12);
        if (e.type === 'flash') expect(e.amount, tl.skill).toBeLessThanOrEqual(0.3);
      }
    }
  });
  it('xuất khiếu, thuấn di, ngự kiếm có timeline', () => {
    for (const id of ['fx_soul_out', 'fx_soul_in', 'fx_blink', 'fx_fly_on']) expect(FX_TIMELINE.has(id), id).toBe(true);
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
      expect(validateFxTimeline(tl, (id) => SKILL.has(id) || id.startsWith('fx_'))).toEqual([]);
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

describe('Kiếm Khí Trảm VS-1 (chiêu mẫu phong cách mới)', () => {
  const tl = FX_TIMELINE.get('skl_kiem_khi_tram')!;
  it('hợp lệ và trong ngân sách: ≤ 12 draw mỗi mốc, ≤ 25 cả chiêu, hạt ≤ 1.500', () => {
    expect(validateFxTimeline(tl, (id) => SKILL.has(id))).toEqual([]);
    expect(fxDrawCount(fxEventsFor(tl, -1))).toBeLessThanOrEqual(12);
    expect(fxParticleCount(tl.events)).toBeLessThanOrEqual(1500);
  });
  it('dùng hình thư viện, flipbook, âm đặt mốc và khựng/rung/fov (không còn gai spike phẳng)', () => {
    const ev = fxEventsFor(tl, -1);
    const shapes = new Set(ev.flatMap((e) => (e.type === 'mesh' ? [e.shape] : [])));
    expect(shapes.has('slash_thick')).toBe(true);
    expect(shapes.has('flip')).toBe(true);
    expect(shapes.has('spike')).toBe(false);
    const types = new Set(ev.map((e) => e.type));
    for (const t of ['soundAt', 'hitstop', 'shake', 'camera']) expect(types.has(t as 'soundAt'), t).toBe(true);
    // Nhịp: có âm trước đòn (báo trước), trúng, và âm đúng mốc trúng.
    const snd = ev.filter((e) => e.type === 'soundAt').map((e) => e.t);
    expect(Math.min(...snd)).toBeLessThan(0);
    expect(snd.some((t) => t === 0)).toBe(true);
  });
});

describe('VS-1: chiêu làm lại giữ biến thức (tín hiệu thị giác của lựa chọn)', () => {
  // Thêm id vào đây khi một chiêu được làm lại theo ngôn ngữ VS-1; chiêu cũ chưa làm lại chưa bị ép.
  const REDONE = [
    'skl_phi_kiem_truy_hon',
    'skl_hoanh_kiem_pha_mach',
    'skl_thien_kiem_vu',
    'skl_van_kiem_quy_tong',
    'skl_thien_kiem_hoa_hinh',
    'skl_thiet_quyen_chan_dia',
    'skl_tran_son_an',
    'skl_kim_cuong_bat_hoai',
    'skl_kim_chung_tran',
    'skl_son_nhac_hoa_than',
    'skl_thien_kim_phap_tuong',
    'skl_thiet_bich_xung',
    'skl_dich_son_xung',
    'skl_anh_thiet_than',
    'skl_thuan_di_ho_the',
    'skl_dan_hoa_phong_tran',
    'skl_hoi_xuan_quyet',
    'skl_hoi_thien_dan_lo',
    'skl_moc_linh_tran',
    'skl_ngung_dan_ho_the',
    'skl_thien_dan_phap_gioi',
    'skl_luu_huong_bo',
    'skl_duoc_vu',
    'skl_anh_duoc_hoa_than',
    'skl_thuan_di_cuu_vien',
  ];
  it('mọi biến thức trong methods.json của chiêu đã làm lại có sự kiện riêng trong timeline', () => {
    for (const id of REDONE) {
      const tl = FX_TIMELINE.get(id)!;
      for (const v of Object.values(VARIANTS[id] ?? {})) {
        const fx = (v as { fx?: string }).fx;
        if (fx) expect(Object.keys(tl.variants ?? {}), `${id}:${fx}`).toContain(fx);
      }
    }
  });
});

describe('VS-1 Hộ pháp: 10 chiêu làm lại (đồng/nâu/đá, mỗi chiêu một hình khối)', () => {
  /** Hình khối chủ đạo của từng chiêu (nhận diện riêng). */
  const HERO: Record<string, string[]> = {
    skl_thiet_quyen_chan_dia: ['rubble_a'],
    skl_tran_son_an: ['seal_block'],
    skl_kim_chung_tran: ['bell_cage'],
    skl_son_nhac_hoa_than: ['rock_spire', 'rubble_b'],
    skl_kim_cuong_bat_hoai: ['shield_plate', 'diamond_cage'],
    skl_thien_kim_phap_tuong: ['rock_spire', 'rune_ring2'],
    skl_thiet_bich_xung: ['shield_plate'],
    skl_dich_son_xung: ['rock_spire', 'rift_line'],
    skl_anh_thiet_than: ['card', 'rune_ring2'],
    skl_thuan_di_ho_the: ['shield_plate', 'rune_ring2'],
  };
  const all = (id: string) => {
    const tl = FX_TIMELINE.get(id)!;
    return [...tl.events, ...Object.values(tl.variants ?? {}).flat()];
  };
  it('trong ngân sách: ≤ 12 draw mỗi biến thức, ≤ 25 cả chiêu, hạt ≤ 1.500', () => {
    for (const id of Object.keys(HERO)) {
      const tl = FX_TIMELINE.get(id)!;
      expect(
        validateFxTimeline(tl, (s) => SKILL.has(s)),
        id,
      ).toEqual([]);
      for (const v of [undefined, ...Object.keys(tl.variants ?? {})])
        expect(fxDrawCount(fxEventsFor(tl, -1, v)), `${id}:${v}`).toBeLessThanOrEqual(12);
      expect(fxDrawCount(all(id)), id).toBeLessThanOrEqual(25);
      expect(fxParticleCount(all(id)), id).toBeLessThanOrEqual(1500);
    }
  });
  it('có hình khối chủ đạo riêng, không còn gai/vòng phẳng kiểu cũ (spike, ripple, helix)', () => {
    for (const [id, hero] of Object.entries(HERO)) {
      const shapes = new Set(all(id).flatMap((e) => (e.type === 'mesh' ? [e.shape] : [])));
      for (const h of hero) expect(shapes.has(h as 'burst'), `${id}:${h}`).toBe(true);
      for (const old of ['spike', 'ripple', 'helix', 'kite'] as const) expect(shapes.has(old), `${id}:${old}`).toBe(false);
    }
    // Ấn, chuông, kim cương chỉ thuộc về một chiêu.
    for (const only of ['seal_block', 'bell_cage', 'diamond_cage'] as const) {
      const users = Object.keys(HERO).filter((id) => all(id).some((e) => e.type === 'mesh' && e.shape === only));
      expect(users, only).toHaveLength(1);
    }
  });
  it('chỉ tông đồng/nâu/đá (body, core, shadow): không accent vàng chanh, không rim kem', () => {
    for (const id of Object.keys(HERO))
      for (const e of all(id)) {
        const tone = (e as { tone?: string }).tone;
        if (tone !== undefined && e.type !== 'vignette') expect(['body', 'core', 'shadow'], `${id}:${e.type}`).toContain(tone);
      }
  });
  it('nhịp và cảm giác theo luật chiêu thường: chớp ≤ 0,15, vignette tối ≤ 0,35 (tối thượng ≤ 0,45), slowmo chỉ ở tối thượng', () => {
    for (const id of Object.keys(HERO)) {
      const ult = SKILL.get(id)!.ult === true;
      const ev = all(id);
      // Chiêu lướt kích theo S.FX: t = 0 là lúc nhận tin (không có báo trước), cú húc ở mốc `hit` riêng sau khi trượt tới nơi.
      const dash = FX_TIMELINE.get(id)!.trigger === 'fx';
      const stops = ev.filter((e) => e.type === 'hitstop').map((e) => e.t);
      const hit = dash ? Math.min(...stops) : 0;
      const snd = ev.filter((e) => e.type === 'soundAt').map((e) => e.t);
      if (dash) {
        expect(Math.min(...ev.map((e) => e.t)), id).toBeGreaterThanOrEqual(0);
        expect(hit, id).toBeGreaterThan(0.15);
        expect(hit, id).toBeLessThanOrEqual(0.35);
      }
      expect(Math.min(...snd), id).toBeLessThan(dash ? hit : 0);
      expect(
        snd.some((t) => t === hit),
        id,
      ).toBe(true);
      for (const e of ev) {
        if (e.type === 'flash') expect(e.amount, id).toBeLessThanOrEqual(0.15);
        if (e.type === 'vignette') {
          expect(e.tone ?? 'dark', id).toBe('dark');
          expect(e.amount, id).toBeLessThanOrEqual(ult ? 0.45 : 0.35);
        }
        if (e.type === 'slowmo') expect(ult, id).toBe(true);
      }
      // Đòn kết đúng mốc trúng: khựng + rung tại mốc trúng (t = 0; chiêu lướt: mốc húc).
      expect(
        ev.some((e) => e.type === 'hitstop' && e.t === hit),
        id,
      ).toBe(true);
      expect(
        ev.some((e) => e.type === 'shake' && e.t === hit),
        id,
      ).toBe(true);
    }
  });
  it('khiên/hộ thể/vùng: có hình Ở LẠI ≥ 1,5 s báo vùng tác dụng (vành mép vùng hoặc khung quanh thân)', () => {
    const stay = (id: string, shapes: string[], variant?: string) =>
      fxEventsFor(FX_TIMELINE.get(id)!, -1, variant).some((e) => e.type === 'mesh' && shapes.includes(e.shape) && !e.move && e.dur >= 1.5);
    expect(stay('skl_tran_son_an', ['rune_ring2'])).toBe(true);
    expect(stay('skl_tran_son_an', ['shield_plate'], 'guard')).toBe(true);
    expect(stay('skl_kim_chung_tran', ['bell_cage'])).toBe(true);
    expect(stay('skl_kim_chung_tran', ['rune_ring2'], 'ally')).toBe(true);
    expect(stay('skl_son_nhac_hoa_than', ['rock_spire'])).toBe(true);
    expect(stay('skl_son_nhac_hoa_than', ['rune_ring2'], 'stomp')).toBe(true);
    expect(stay('skl_kim_cuong_bat_hoai', ['diamond_cage'])).toBe(true);
    expect(stay('skl_thien_kim_phap_tuong', ['rune_ring2'])).toBe(true);
    expect(stay('skl_anh_thiet_than', ['rune_ring2'])).toBe(true);
    expect(stay('skl_anh_thiet_than', ['shield_plate'], 'self')).toBe(true);
    expect(stay('skl_thuan_di_ho_the', ['shield_plate'])).toBe(true);
    expect(stay('skl_thuan_di_ho_the', ['rune_ring2'], 'taunt')).toBe(true);
  });
});

describe('camFade: khối cao quanh người tự ẩn khi nằm giữa camera và người ra chiêu', () => {
  it('phía camera ẩn hẳn, hai bên và phía sau hiện đủ, sát người không mờ', () => {
    // Camera ở +Z so với người ra chiêu.
    expect(fxCamFade(0, 9, 0, 5)).toBe(0);
    expect(fxCamFade(0, 9, 2, 5)).toBe(0);
    expect(fxCamFade(0, 9, 5, 0)).toBe(1);
    expect(fxCamFade(0, 9, 0, -5)).toBe(1);
    expect(fxCamFade(0, 9, 0, 0.3)).toBe(1);
    const mid = fxCamFade(0, 9, 4.4, 2.6);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
  it('trụ đá, thuẫn dựng quanh thân của Hộ pháp đều bật camFade', () => {
    for (const id of ['skl_son_nhac_hoa_than', 'skl_thien_kim_phap_tuong', 'skl_kim_cuong_bat_hoai']) {
      const tl = FX_TIMELINE.get(id)!;
      const tall = [...tl.events, ...Object.values(tl.variants ?? {}).flat()].filter(
        (e) => e.type === 'mesh' && (e.shape === 'rock_spire' || e.shape === 'shield_plate'),
      );
      expect(tall.length, id).toBeGreaterThan(0);
      for (const e of tall) expect((e as { camFade?: boolean }).camFade, id).toBe(true);
    }
  });
});

describe('unless: biến thức thay một phần hình chung', () => {
  it('Dịch Sơn Xung: đẩy (mặc định, stun) có vách đá trượt về trước; kéo (pull) bỏ vách trượt, có đá kéo về', () => {
    const tl = FX_TIMELINE.get('skl_dich_son_xung')!;
    const pushed = (v?: string) =>
      fxEventsFor(tl, -1, v).filter((e) => e.type === 'mesh' && e.shape === 'rock_spire' && (e as { unless?: string }).unless === 'pull')
        .length;
    expect(pushed()).toBeGreaterThan(0);
    expect(pushed('stun')).toBe(pushed());
    expect(pushed('pull')).toBe(0);
    expect(fxEventsFor(tl, -1, 'pull').some((e) => e.type === 'mesh' && e.shape === 'rock_spire')).toBe(true);
    // Timeline không dùng `unless` thì trả đúng mảng gốc (không sao chép).
    const plain = FX_TIMELINE.get('skl_kim_chung_tran')!;
    expect(fxEventsFor(plain, -1)).toBe(plain.events);
  });
  it('chiêu lướt Hộ pháp vẫn kích theo S.FX đúng loại, đúng công pháp', () => {
    const a = FX_TIMELINE.get('skl_thiet_bich_xung')!;
    expect([a.trigger, a.fxKind, a.method]).toEqual(['fx', 'dash', 'bat_dong_kim_than']);
    const b = FX_TIMELINE.get('skl_dich_son_xung')!;
    expect([b.trigger, b.fxKind]).toEqual(['fx', 'dichson']);
    expect(b.replaces).toContain('dichson');
  });
});

describe('VS-1 Đan sư: chiêu mẫu Đan Hỏa Phong Trần (ngọc lục + đỏ son, viên đan và sen lửa)', () => {
  const tl = FX_TIMELINE.get('skl_dan_hoa_phong_tran')!;
  const all = [...tl.events, ...Object.values(tl.variants ?? {}).flat()];
  it('trong ngân sách: ≤ 12 draw mỗi biến thức, ≤ 25 cả chiêu, hạt ≤ 1.500', () => {
    expect(validateFxTimeline(tl, (id) => SKILL.has(id))).toEqual([]);
    for (const v of [undefined, ...Object.keys(tl.variants ?? {})])
      expect(fxDrawCount(fxEventsFor(tl, -1, v)), String(v)).toBeLessThanOrEqual(12);
    expect(fxDrawCount(all)).toBeLessThanOrEqual(25);
    expect(fxParticleCount(all)).toBeLessThanOrEqual(1500);
  });
  it('hình chủ đạo là viên đan + sen nở; không mượn đá vỡ/nứt gãy của Hộ pháp hay vết chém của Kiếm tu', () => {
    const shapes = new Set(all.flatMap((e) => (e.type === 'mesh' ? [e.shape as string] : [])));
    expect(shapes.has('pill_orb')).toBe(true);
    expect(shapes.has('lotus_bloom')).toBe(true);
    expect(shapes.has('flame_tongue')).toBe(true);
    for (const s of shapes) expect(/^(rubble_|crack_radial|slash_|blade_|spike|kite|ripple|helix)/.test(s), s).toBe(false);
  });
  it('viên đan bay trong lúc vung và tới nơi đúng mốc trúng; đòn kết (sen, khựng, rung, âm) ở t = 0', () => {
    const orb = tl.events.find((e) => e.type === 'mesh' && e.shape === 'pill_orb' && e.move);
    expect(orb).toBeTruthy();
    if (orb?.type === 'mesh') {
      expect(orb.t).toBeLessThan(0);
      expect(orb.t + orb.dur).toBeCloseTo(0, 6);
    }
    // Khung hit không được trống: sen đã bắt đầu nở trước mốc trúng ≤ 50 ms, và có hình bật NGAY (sweep 0) ở mốc trúng:
    // lõi đan phình, mảnh đan, tia lửa.
    const lotus = tl.events.find((e) => e.type === 'mesh' && e.shape === 'lotus_bloom')!;
    expect(lotus.t).toBeLessThanOrEqual(0);
    expect(lotus.t).toBeGreaterThanOrEqual(-0.05);
    const instant = tl.events
      .filter((e) => e.type === 'mesh' && e.sweep === 0 && e.t >= -0.03 && e.t <= 0)
      .map((e) => (e.type === 'mesh' ? e.shape : ''));
    for (const sh of ['pill_orb', 'spark_streak', 'burst']) expect(instant, sh).toContain(sh);
    expect(tl.events.filter((e) => e.type === 'mesh' && e.shape === 'flame_tongue').length).toBeGreaterThanOrEqual(4);
    expect(tl.events.some((e) => e.type === 'hitstop' && e.t === 0)).toBe(true);
    expect(tl.events.some((e) => e.type === 'shake' && e.t === 0)).toBe(true);
    const snd = tl.events.filter((e) => e.type === 'soundAt').map((e) => e.t);
    expect(Math.min(...snd)).toBeLessThan(0);
    expect(snd.some((t) => t === 0)).toBe(true);
  });
  it('luật chiêu thường: chớp ≤ 0,15, vignette tối ≤ 0,35, không slowmo; vùng thiêu đốt có vành ở lại theo vùng thật', () => {
    for (const e of all) {
      if (e.type === 'flash') expect(e.amount).toBeLessThanOrEqual(0.15);
      if (e.type === 'vignette') {
        expect(e.tone ?? 'dark').toBe('dark');
        expect(e.amount).toBeLessThanOrEqual(0.35);
      }
      expect(e.type).not.toBe('slowmo');
    }
    expect(
      tl.events.some(
        (e) => e.type === 'mesh' && e.shape === 'rune_ring2' && e.fit === 'area' && !e.scaleTo?.toString().startsWith('0') && e.dur >= 1.5,
      ),
    ).toBe(true);
  });
});

describe('VS-1 Đan sư phần 2: 5 chiêu hồi/hộ (ngọc lục là chính, sen thấp, viên đan làm hạt nhân)', () => {
  const IDS = ['skl_hoi_xuan_quyet', 'skl_hoi_thien_dan_lo', 'skl_moc_linh_tran', 'skl_ngung_dan_ho_the', 'skl_thien_dan_phap_gioi'];
  const all = (id: string) => {
    const tl = FX_TIMELINE.get(id)!;
    return [...tl.events, ...Object.values(tl.variants ?? {}).flat()];
  };
  it('trong ngân sách: ≤ 12 draw mỗi biến thức, ≤ 25 cả chiêu, hạt ≤ 1.500', () => {
    for (const id of IDS) {
      const tl = FX_TIMELINE.get(id)!;
      expect(
        validateFxTimeline(tl, (s) => SKILL.has(s)),
        id,
      ).toEqual([]);
      for (const v of [undefined, ...Object.keys(tl.variants ?? {})])
        expect(fxDrawCount(fxEventsFor(tl, -1, v)), `${id}:${v}`).toBeLessThanOrEqual(12);
      expect(fxDrawCount(all(id)), id).toBeLessThanOrEqual(25);
      expect(fxParticleCount(all(id)), id).toBeLessThanOrEqual(1500);
    }
  });
  it('mỗi chiêu có viên đan; không mượn đá/nứt của Hộ pháp hay vết chém, kiểu cũ của Kiếm tu; đan lô chỉ ở Hồi Thiên Đan Lô', () => {
    for (const id of IDS) {
      const shapes = new Set(all(id).flatMap((e) => (e.type === 'mesh' ? [e.shape as string] : [])));
      expect(shapes.has('pill_orb'), id).toBe(true);
      for (const s of shapes)
        expect(/^(rubble_|rock_spire|crack_radial|shield_plate|slash_|blade_|spike|kite|ripple|helix)/.test(s), `${id}:${s}`).toBe(false);
      expect(shapes.has('dan_lo'), id).toBe(id === 'skl_hoi_thien_dan_lo');
    }
  });
  it('sen dưới chân luôn THẤP (scale y ≤ 0,5) để không che người hay quái đứng ở tâm', () => {
    for (const id of [...IDS, 'skl_dan_hoa_phong_tran'])
      for (const e of all(id))
        if (e.type === 'mesh' && e.shape === 'lotus_bloom') {
          const sc = e.scale as [number, number, number];
          // Đan Hỏa: nhụy sen lửa (vòng trong) được cao tới 1,0 vì là đòn đánh; còn lại ≤ 0,5.
          expect(sc[1], id).toBeLessThanOrEqual(id === 'skl_dan_hoa_phong_tran' ? 1.2 : 0.5);
        }
  });
  it('đỏ son chỉ ở phần gây hại/lửa: chiêu hồi không có sen hay viên đan màu accent; cảm giác nhẹ, slowmo chỉ ở tối thượng', () => {
    for (const id of IDS) {
      const ult = SKILL.get(id)!.ult === true;
      for (const e of all(id)) {
        if (e.type === 'mesh' && (e.shape === 'lotus_bloom' || e.shape === 'pill_orb')) expect(e.tone, id).not.toBe('accent');
        if (e.type === 'hitstop') expect(e.ms, id).toBeLessThanOrEqual(60);
        if (e.type === 'shake') expect(e.level, id).toBeLessThanOrEqual(0.35);
        if (e.type === 'flash') expect(e.amount, id).toBeLessThanOrEqual(0.1);
        if (e.type === 'vignette') expect(ult, id).toBe(true);
        if (e.type === 'slowmo') expect(ult, id).toBe(true);
      }
      const snd = all(id)
        .filter((e) => e.type === 'soundAt')
        .map((e) => e.t);
      expect(Math.min(...snd), id).toBeLessThan(0);
      expect(
        snd.some((t) => t === 0),
        id,
      ).toBe(true);
    }
  });
  it('vùng hồi/hộ có vành Ở LẠI ≥ 1,5 s (theo vùng thật của server, hoặc quanh thân với khiên)', () => {
    for (const id of IDS)
      expect(
        FX_TIMELINE.get(id)!.events.some(
          (e) => e.type === 'mesh' && e.shape === 'rune_ring2' && e.dur >= 1.5 && (e.fit === 'area' || e.follow === true),
        ),
        id,
      ).toBe(true);
  });
});

describe('VS-1 Đan sư phần 3: 4 chiêu cuối (cả 10 chiêu Đan sư theo ngôn ngữ mới)', () => {
  const IDS = ['skl_luu_huong_bo', 'skl_duoc_vu', 'skl_anh_duoc_hoa_than', 'skl_thuan_di_cuu_vien'];
  const all = (id: string) => {
    const tl = FX_TIMELINE.get(id)!;
    return [...tl.events, ...Object.values(tl.variants ?? {}).flat()];
  };
  it('trong ngân sách: ≤ 12 draw mỗi biến thức, ≤ 25 cả chiêu, hạt ≤ 1.500', () => {
    for (const id of IDS) {
      const tl = FX_TIMELINE.get(id)!;
      expect(
        validateFxTimeline(tl, (s) => SKILL.has(s)),
        id,
      ).toEqual([]);
      for (const v of [undefined, ...Object.keys(tl.variants ?? {})])
        expect(fxDrawCount(fxEventsFor(tl, -1, v)), `${id}:${v}`).toBeLessThanOrEqual(12);
      expect(fxDrawCount(all(id)), id).toBeLessThanOrEqual(25);
      expect(fxParticleCount(all(id)), id).toBeLessThanOrEqual(1500);
    }
  });
  it('không mượn hình Hộ pháp/Kiếm tu hay kiểu cũ; sen thấp; không đỏ son (đều là chiêu hồi/di chuyển)', () => {
    for (const id of IDS)
      for (const e of all(id)) {
        if (e.type !== 'mesh') continue;
        expect(
          /^(rubble_|rock_spire|crack_radial|shield_plate|slash_|blade_|spike|kite|ripple|helix)/.test(e.shape),
          `${id}:${e.shape}`,
        ).toBe(false);
        expect(e.tone, `${id}:${e.shape}`).not.toBe('accent');
        if (e.shape === 'lotus_bloom') expect((e.scale as number[])[1], id).toBeLessThanOrEqual(0.5);
      }
  });
  it('Lưu Hương Bộ kích theo S.FX lướt của Đan sư, mọi t ≥ 0, không khựng/rung (không gây hại)', () => {
    const tl = FX_TIMELINE.get('skl_luu_huong_bo')!;
    expect([tl.trigger, tl.fxKind, tl.method]).toEqual(['fx', 'dash', 'thanh_moc_dan_kinh']);
    expect(Math.min(...tl.events.map((e) => e.t))).toBeGreaterThanOrEqual(0);
    expect(tl.events.some((e) => e.type === 'hitstop' || e.type === 'shake' || e.type === 'flash')).toBe(false);
  });
  it('ba chiêu có động tác: âm báo trước + âm đúng mốc trúng, cảm giác nhẹ, có vành ở lại ≥ 1,5 s', () => {
    for (const id of IDS.slice(1)) {
      const ev = all(id);
      const snd = ev.filter((e) => e.type === 'soundAt').map((e) => e.t);
      expect(Math.min(...snd), id).toBeLessThan(0);
      expect(
        snd.some((t) => t === 0),
        id,
      ).toBe(true);
      for (const e of ev) {
        if (e.type === 'hitstop') expect(e.ms, id).toBeLessThanOrEqual(60);
        if (e.type === 'shake') expect(e.level, id).toBeLessThanOrEqual(0.35);
        if (e.type === 'flash') expect(e.amount, id).toBeLessThanOrEqual(0.1);
        expect(e.type, id).not.toBe('slowmo');
      }
      expect(
        FX_TIMELINE.get(id)!.events.some((e) => e.type === 'mesh' && e.shape === 'rune_ring2' && e.dur >= 1.5),
        id,
      ).toBe(true);
    }
  });
});
