import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FX_TIMELINE } from '@dtl/content';
import { FX_SPRITES, fxEventsFor, fxParticleCount, isRedOrange, validateFxTimeline, type FxEvent, type VfxCard } from '@dtl/shared';
import { FX_PALETTE } from '../../render/vfx/palette';
import { SPRITE_STYLE } from './fxTimeline';

// V-P10 đợt 3: ngự kiếm (cất cánh, hạ cánh) theo Họa Pháp Lô 2, sprite vẽ tay `ngu_*`.
const IDS = ['fx_fly_on', 'fx_fly_off'];
const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const card = (id: string): VfxCard =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/content/data/vfx/cards', `${id}.json`), 'utf8')) as VfxCard;
const evs = (id: string): FxEvent[] => fxEventsFor(FX_TIMELINE.get(id)!, -1);
type M = FxEvent & { sprite?: string; t?: number; shape?: string; tex?: string };
const hex = (n: number): string => n.toString(16).padStart(6, '0');

describe('VFX ngự kiếm (V-P10, sprite Họa Pháp Lô 2)', () => {
  it('timeline hợp lệ, draw call (mỗi sprite một draw) trong ngân sách của thẻ', () => {
    for (const id of IDS) {
      const tl = FX_TIMELINE.get(id)!;
      expect(tl, id).toBeDefined();
      expect(
        validateFxTimeline(tl, (x) => x.startsWith('fx_')),
        id,
      ).toEqual([]);
      const e = evs(id) as M[];
      const draws = e.filter((x) => x.type === 'mesh' || x.type === 'decal').length;
      expect(draws, id).toBeLessThanOrEqual(card(id).budget.drawCalls);
      expect(fxParticleCount(evs(id)), id).toBeLessThanOrEqual(card(id).budget.particles);
    }
  });

  it('chỉ dùng sprite `ngu_*`; không vòng rune; cất cánh có kiếm, hạ cánh có vệt kiếm ngắn', () => {
    for (const id of IDS) {
      const e = evs(id) as M[];
      for (const m of e.filter((x) => x.type === 'mesh')) {
        expect(m.shape, id).toBe('sprite');
        expect(String(m.sprite), id).toMatch(/^ngu_/);
        expect((FX_SPRITES as readonly string[]).includes(String(m.sprite)), `${id}:${m.sprite}`).toBe(true);
      }
      expect(
        e.some((x) => x.type === 'decal' && x.tex === 'rune'),
        id,
      ).toBe(false);
    }
    expect((evs('fx_fly_on') as M[]).some((m) => m.sprite === 'ngu_blade')).toBe(true);
    expect((evs('fx_fly_off') as M[]).some((m) => m.sprite === 'ngu_streak')).toBe(true);
    expect(SPRITE_STYLE.ngu_).toBe(12);
  });

  it('ba nhịp quanh mốc nhấn của thẻ: có nhịp tụ, mọi mốc ≥ 0, dư ba từ +150 ms', () => {
    for (const id of IDS) {
      const I = card(id).scene!.impactAt;
      const e = (evs(id) as M[]).filter((x) => x.type === 'mesh' || x.type === 'particles');
      expect(
        e.every((x) => (x.t ?? 0) >= 0),
        id,
      ).toBe(true);
      expect(
        e.some((x) => (x.t ?? 0) < I - 0.05),
        `${id} thiếu nhịp tụ`,
      ).toBe(true);
      expect(
        e.some((x) => (x.t ?? 0) >= I + 0.15),
        `${id} thiếu dư ba`,
      ).toBe(true);
    }
  });

  it('bảng màu của thẻ cảnh bằng bảng timeline ở client và không có tông đỏ/cam', () => {
    for (const id of IDS) {
      const pal = FX_PALETTE[FX_TIMELINE.get(id)!.palette!]!;
      const c = card(id).scene!.palette;
      for (const k of ['core', 'body', 'rim', 'accent', 'shadow'] as const) {
        expect(c[k], `${id}.${k}`).toBe(hex(pal[k]));
        expect(isRedOrange(hex(pal[k])), `${id}.${k} đỏ/cam`).toBe(false);
      }
    }
  });
});
