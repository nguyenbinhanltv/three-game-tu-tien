import { describe, expect, it } from 'vitest';
import { FX_SPRITES, isRedOrange } from '@dtl/shared';
import { FX_PALETTE } from '../../render/vfx/palette';
import { SPRITE_GROUPS, spriteCell } from '../../render/vfx/art';
import { SPRITE_STYLE } from './fxTimeline';
import { AURA_SPRITE_OTHERS } from './realmAuraRules';

// V-P10 đợt 4: hào quang cảnh giới bằng sprite vẽ tay nhóm `hq_*` (thay ấn rune, vòng ngũ hành, phù văn lưng).
const HQ = ['hq_dan', 'hq_smoke', 'hq_cloud', 'hq_cloud2', 'hq_orb', 'hq_mantle', 'hq_glyph', 'hq_wisp'] as const;
const hex = (n: number): string => n.toString(16).padStart(6, '0');

describe('hào quang sprite (V-P10 đợt 4)', () => {
  it('nhóm atlas `hq` đủ 8 ô theo thứ tự khai trong FX_SPRITES, kiểu tô 12 theo bảng màu', () => {
    expect(SPRITE_GROUPS.hq.cols * SPRITE_GROUPS.hq.rows).toBe(HQ.length);
    HQ.forEach((name, i) => {
      expect((FX_SPRITES as readonly string[]).includes(name), name).toBe(true);
      const c = spriteCell(name);
      expect(c.group, name).toBe('hq');
      expect(c.idx, name).toBe(i);
    });
    expect(SPRITE_STYLE.hq_).toBe(12);
  });

  it('bảng màu ba bậc không có tông đỏ/cam; Hóa Thần ngả ngà/lam (xanh dương trội hơn đỏ ở thân)', () => {
    for (const id of ['hq_kd', 'hq_na', 'hq_hn']) {
      const pal = FX_PALETTE[id]!;
      for (const k of ['core', 'body', 'rim', 'accent', 'shadow'] as const) expect(isRedOrange(hex(pal[k])), `${id}.${k}`).toBe(false);
    }
    const hn = FX_PALETTE.hq_hn!;
    expect(hn.body & 0xff, 'thân Hóa Thần: kênh lam ≥ kênh đỏ (lam ngà, không nâu)').toBeGreaterThanOrEqual((hn.body >> 16) & 0xff);
  });

  it('hào quang của người khác mờ còn một nửa', () => {
    expect(AURA_SPRITE_OTHERS).toBeLessThanOrEqual(0.5);
  });
});
