import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MON_FX, MONSTER } from '@dtl/content';
import { isRedOrange, type FxTimeline } from '@dtl/shared';
import { FX_PALETTE } from '../../render/vfx/palette';
import { spriteGroupOf } from '../../render/vfx/art';

/** A6 (VFX quái chương 6–7): 33 chiêu của 9 boss + 5 tinh anh, thẻ ở data/vfx/cards/mon (sinh bằng tools/vfx/gen-cards-a6.py), timeline do tools/vfx/gen-fx-a6.py. */
const CARDS = new URL('../../../../../packages/content/data/vfx/cards/mon/', import.meta.url);
const A6 = [
  'boss_hu_anh_chu',
  'boss_dinh_linh',
  'boss_phu_chu',
  'boss_tu_quang_duc_chu',
  'boss_kieu_thu',
  'boss_ve_kieu',
  'boss_thach_tuong',
  'boss_dao_linh',
  'boss_lo_linh',
  'elite_hu_anh_nhan',
  'elite_anh_hac_vuong',
  'elite_lo_thach_tuong',
  'elite_sa_tuong',
  'elite_may_lang_vuong',
];
interface Card {
  monId: string;
  move: string;
  zone: { shape: 'circle' | 'cone' | 'rect' };
}
const cards: Card[] = fs
  .readdirSync(CARDS)
  .filter((f) => A6.some((m) => f.startsWith(`${m}__`)))
  .map((f) => JSON.parse(fs.readFileSync(new URL(f, CARDS), 'utf8')) as Card);
const keyOf = (c: Card, kind: 'warn' | 'boom'): string => {
  const sh = c.zone.shape === 'circle' ? '' : c.zone.shape === 'cone' ? '_cone' : '_line';
  const b =
    kind === 'boom' ? `mon_boom_${c.zone.shape === 'circle' ? 'circle' : c.zone.shape === 'cone' ? 'cone' : 'line'}` : `mon_warn${sh}`;
  return `${b}__${c.monId}__${c.move}`;
};
const tl = (k: string): FxTimeline | undefined => MON_FX.get(k);
const hex = (n: number) => n.toString(16).padStart(6, '0');

describe('A6: VFX quái chương 6–7', () => {
  it('đủ 33 thẻ và mỗi chiêu có cặp timeline báo + nổ', () => {
    expect(cards.length).toBe(33);
    for (const c of cards) {
      expect(MONSTER.has(c.monId), c.monId).toBe(true);
      expect(tl(keyOf(c, 'warn')), keyOf(c, 'warn')).toBeTruthy();
      expect(tl(keyOf(c, 'boom')), keyOf(c, 'boom')).toBeTruthy();
    }
  });

  it('vạch báo ĐỎ chuẩn và vẽ ĐÈ lên mô hình (decal top: không thử độ sâu), kể cả khi thân boss che (Lộ Linh scale 3,8)', () => {
    for (const c of cards) {
      const w = tl(keyOf(c, 'warn'))!;
      const pal = FX_PALETTE[w.palette ?? '']!;
      expect(pal, `${w.skill} palette`).toBeTruthy();
      expect(isRedOrange(hex(pal.accent)), `${w.skill} accent`).toBe(true);
      const decals = w.events.filter((e) => e.type === 'decal');
      expect(decals.length, w.skill).toBeGreaterThan(0);
      expect(
        decals.every((e) => (e as { top?: boolean }).top === true),
        `${w.skill} decal top`,
      ).toBe(true);
    }
  });

  it('thân vùng nổ theo màu hệ: bảng màu KHÔNG đỏ/cam ở core/body/rim', () => {
    for (const c of cards) {
      const b = tl(keyOf(c, 'boom'))!;
      const pal = FX_PALETTE[b.palette ?? '']!;
      for (const tone of ['core', 'body', 'rim'] as const) expect(isRedOrange(hex(pal[tone])), `${b.skill} ${tone}`).toBe(false);
    }
  });

  it('Lộ Linh và Đạo Linh (thân lớn che vùng): vùng nổ có lớp decal đất top phủ đúng zone', () => {
    for (const c of cards.filter((x) => /lo_linh|dao_linh/.test(x.monId))) {
      const b = tl(keyOf(c, 'boom'))!;
      expect(
        b.events.some((e) => e.type === 'decal' && (e as { top?: boolean }).top === true),
        b.skill,
      ).toBe(true);
    }
  });

  it('sprite dùng đúng nhóm atlas của A6 và tuq_ không có kiểu tô riêng (bảng tím theo độ sáng, bỏ quầng teal)', () => {
    const used = new Set<string>();
    for (const c of cards)
      for (const k of ['warn', 'boom'] as const)
        for (const e of tl(keyOf(c, k))!.events) if (e.type === 'mesh' && e.shape === 'sprite' && e.sprite) used.add(e.sprite);
    expect(used.size).toBeGreaterThan(30);
    for (const n of used) expect(['guong', 'dong', 'kieu'], n).toContain(spriteGroupOf(n));
  });
});
