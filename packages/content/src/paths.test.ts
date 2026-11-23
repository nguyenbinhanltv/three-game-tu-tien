import { describe, expect, it } from 'vitest';
import { methodOfVoice, poseIdsFor, voiceOf } from '@dtl/shared';
import { METHODS, PATHS, pathOf } from './index';

// VS-3 không đổi hành vi: dữ liệu hướng tu phải cho đúng kết quả của các bảng viết cứng trước đây (chép nguyên ở đây làm mốc).
const LEGACY = {
  lac_kiem_quyet: {
    voice: 'kt',
    gm: 'kiem',
    art: 'kiem',
    dao: 'kiem',
    tint: 'cff3ff',
    palette: { core: '0a3f5e', body: '2cc7dc', rim: 'f2fdff', accent: 'f3c860', shadow: '08202e' },
    hit: { sfx: 'crit', gain: 0.18, rate: 1.2, strongOnly: true },
  },
  bat_dong_kim_than: {
    // C3f: thể tu tách khỏi giọng hộ pháp `hp` (nay dùng cho cổ thần) sang giọng riêng `tt` (quyền thuật); mọi trường khác giữ nguyên bảng cũ.
    voice: 'tt',
    gm: 'hophap',
    art: 'ho_phap',
    dao: 'ho',
    tint: 'ffde96',
    palette: { core: '5a2d0b', body: 'e39a2c', rim: 'fff0c2', accent: 'ffd25a', shadow: '2a1708' },
    hit: { sfx: 'impact', gain: 0.2, rate: 1 },
  },
  thanh_moc_dan_kinh: {
    voice: 'ds',
    gm: 'dansu',
    art: 'dan_su',
    dao: 'dan',
    tint: '7fe3d0',
    palette: { core: '06301f', body: '23b374', rim: '9fe9bd', accent: 'e4452f', shadow: '071c13' },
    hit: { sfx: 'cast', gain: 0.12, rate: 1.3 },
  },
} as const;

/** `daoOf` trước VS-3 (regex trên id công pháp). */
function legacyDao(mt: string | undefined): string {
  if (!mt) return 'kiem';
  if (/kim_than|ho_phap|hophap/.test(mt)) return 'ho';
  if (/dan_kinh|dan_su|dansu|moc_dan/.test(mt)) return 'dan';
  return 'kiem';
}

describe('hướng tu khớp các bảng cứng trước VS-3', () => {
  it('mỗi công pháp thuộc đúng một hướng, thứ tự hướng khớp thứ tự công pháp', () => {
    expect(PATHS.flatMap((p) => p.methods)).toEqual(METHODS.map((m) => m.id));
  });
  it('giọng động tác, bí danh GM, tranh đạo, hào quang, màu, tiếng đòn: đúng từng giá trị cũ', () => {
    for (const [mid, want] of Object.entries(LEGACY)) {
      const p = pathOf(mid)!;
      expect({ voice: p.voice, gm: p.gm, art: p.art, dao: p.dao, tint: p.tint, palette: p.palette, hit: p.hit }, mid).toEqual(want);
      expect(voiceOf(mid)).toBe(want.voice);
      expect(methodOfVoice(want.voice)).toBe(mid);
    }
  });
  it('khóa lạ và bí danh cũ ra cùng đạo với regex cũ', () => {
    const keys = [
      undefined,
      '',
      'lac_kiem_quyet',
      'bat_dong_kim_than',
      'thanh_moc_dan_kinh',
      'ho_phap',
      'hophap',
      'dan_su',
      'dansu',
      'x_kim_than',
      'moc_dan_y',
      'kiem',
      'la_hoan_toan',
    ];
    for (const k of keys) expect(pathOf(k)?.dao ?? 'kiem', String(k)).toBe(legacyDao(k));
  });
  it('danh sách pose các giọng vẫn sinh đủ (ba giọng cũ + đao tu C3c + lôi tu C3d)', () => {
    expect(poseIdsFor('phi_kiem', 3)).toEqual([
      'phi_kiem',
      'phi_kiem_2',
      'phi_kiem_3',
      'phi_kiem_hp',
      'phi_kiem_2_hp',
      'phi_kiem_3_hp',
      'phi_kiem_ds',
      'phi_kiem_2_ds',
      'phi_kiem_3_ds',
      'phi_kiem_dt',
      'phi_kiem_2_dt',
      'phi_kiem_3_dt',
      'phi_kiem_lt',
      'phi_kiem_2_lt',
      'phi_kiem_3_lt',
      'phi_kiem_ht',
      'phi_kiem_2_ht',
      'phi_kiem_3_ht',
      'phi_kiem_ct',
      'phi_kiem_2_ct',
      'phi_kiem_3_ct',
      'phi_kiem_tt',
      'phi_kiem_2_tt',
      'phi_kiem_3_tt',
      'phi_kiem_cs',
      'phi_kiem_2_cs',
      'phi_kiem_3_cs',
    ]);
  });
});
