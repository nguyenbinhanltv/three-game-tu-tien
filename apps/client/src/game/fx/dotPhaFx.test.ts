import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FX_TIMELINE } from '@dtl/content';
import { FX_SPRITES, fxEventsFor, fxParticleCount, isRedOrange, validateFxTimeline, type FxEvent, type VfxCard } from '@dtl/shared';
import { FX_PALETTE } from '../../render/vfx/palette';
import { SPRITE_STYLE } from './fxTimeline';
import { fxTriggered, replacedFx } from './skillFx';

// V-P10 đợt 1: đột phá (lên tầng + bốn cảnh giới) theo Họa Pháp Lô 2. Mỗi cảnh một hình sprite vẽ tay `dp_*` riêng, ba nhịp quanh mốc nhấn của thẻ cảnh.
const IDS = ['fx_levelup', 'fx_dotpha_tc', 'fx_dotpha_kd', 'fx_dotpha_na', 'fx_dotpha_hn'];
/** Hình nhận diện của từng cảnh (không cảnh nào dùng chung hình chính với cảnh khác). */
const HERO: Record<string, string> = {
  fx_levelup: 'dp_ribbon',
  fx_dotpha_tc: 'dp_slab',
  fx_dotpha_kd: 'dp_pill',
  fx_dotpha_na: 'dp_lotus',
  fx_dotpha_hn: 'dp_spirit',
};
const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const card = (id: string): VfxCard =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/content/data/vfx/cards', `${id}.json`), 'utf8')) as VfxCard;
const evs = (id: string): FxEvent[] => fxEventsFor(FX_TIMELINE.get(id)!, -1);
type M = FxEvent & { sprite?: string; t?: number; shape?: string; tex?: string };
const hex = (n: number): string => n.toString(16).padStart(6, '0');

describe('VFX đột phá (V-P10, sprite Họa Pháp Lô 2)', () => {
  it('timeline hợp lệ, kích theo S.FX, thay hình cũ; draw call THẬT (mỗi sprite một draw) ≤ 12', () => {
    for (const id of IDS) {
      const tl = FX_TIMELINE.get(id)!;
      expect(tl, id).toBeDefined();
      expect(
        validateFxTimeline(tl, (x) => x.startsWith('fx_')),
        id,
      ).toEqual([]);
      expect(tl.trigger, id).toBe('fx');
      const e = evs(id) as M[];
      const draws = e.filter((x) => x.type === 'mesh' || x.type === 'decal').length;
      expect(draws, id).toBeLessThanOrEqual(12);
      expect(draws, id).toBeLessThanOrEqual(card(id).budget.drawCalls);
      expect(fxParticleCount(evs(id)), id).toBeLessThanOrEqual(card(id).budget.particles);
    }
    expect(replacedFx('levelup')).toBe(true);
    expect(replacedFx('ascend')).toBe(true);
  });

  it('mỗi cảnh một hình chính riêng; không vòng rune, không sao tỏa tia, không lưỡi liềm', () => {
    for (const id of IDS) {
      const e = evs(id) as M[];
      const meshes = e.filter((x) => x.type === 'mesh');
      for (const m of meshes) {
        expect(m.shape, id).toBe('sprite');
        expect(String(m.sprite), id).toMatch(/^dp_/);
        expect((FX_SPRITES as readonly string[]).includes(String(m.sprite)), `${id}:${m.sprite}`).toBe(true);
      }
      expect(
        e.some((x) => x.type === 'decal' && x.tex === 'rune'),
        id,
      ).toBe(false);
      expect(
        meshes.some((m) => m.sprite === HERO[id]),
        id,
      ).toBe(true);
      for (const [other, hero] of Object.entries(HERO)) {
        if (other !== id)
          expect(
            meshes.some((m) => m.sprite === hero),
            `${id} dùng hình chính của ${other}`,
          ).toBe(false);
      }
    }
    expect(SPRITE_STYLE.dp_).toBe(12);
  });

  it('ba nhịp quanh mốc nhấn của thẻ: tụ trước mốc, điểm nhấn `dp_crack` ở +30 ms, dư ba từ +150 ms', () => {
    for (const id of IDS) {
      const I = card(id).scene!.impactAt;
      const e = (evs(id) as M[]).filter((x) => x.type === 'mesh' || x.type === 'particles');
      expect(
        e.every((x) => (x.t ?? 0) >= 0),
        `${id}: timeline kích theo S.FX không có mốc âm`,
      ).toBe(true);
      expect(
        e.some((x) => (x.t ?? 0) < I - 0.05),
        `${id} thiếu nhịp tụ`,
      ).toBe(true);
      const accent = e.find((x) => x.sprite === 'dp_crack');
      expect(accent, `${id} thiếu điểm nhấn`).toBeDefined();
      expect((accent!.t ?? 0) - I, id).toBeCloseTo(0.03, 2);
      expect(
        e.some((x) => (x.t ?? 0) >= I + 0.15),
        `${id} thiếu dư ba`,
      ).toBe(true);
    }
  });

  it('bảng màu của thẻ cảnh bằng bảng của timeline ở client và không có tông đỏ/cam', () => {
    for (const id of IDS) {
      const pal = FX_PALETTE[FX_TIMELINE.get(id)!.palette!]!;
      const c = card(id).scene!.palette;
      for (const k of ['core', 'body', 'rim', 'accent', 'shadow'] as const) {
        expect(c[k], `${id}.${k}`).toBe(hex(pal[k]));
        expect(isRedOrange(hex(pal[k])), `${id}.${k} đỏ/cam`).toBe(false);
      }
    }
  });

  it('chọn timeline theo cảnh giới (`tb`); cảnh giới chưa có timeline riêng dùng bản Trúc Cơ', () => {
    expect(fxTriggered('levelup', undefined)?.skill).toBe('fx_levelup');
    expect(fxTriggered('ascend', undefined)?.skill).toBe('fx_dotpha_tc');
    expect(fxTriggered('ascend', undefined, 'ket_dan')?.skill).toBe('fx_dotpha_kd');
    expect(fxTriggered('ascend', undefined, 'nguyen_anh')?.skill).toBe('fx_dotpha_na');
    expect(fxTriggered('ascend', undefined, 'hoa_than')?.skill).toBe('fx_dotpha_hn');
  });
});
