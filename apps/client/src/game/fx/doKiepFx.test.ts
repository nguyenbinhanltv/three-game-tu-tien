import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FX_TIMELINE } from '@dtl/content';
import { FX_SPRITES, fxEventsFor, fxParticleCount, isRedOrange, validateFxTimeline, type FxEvent, type VfxCard } from '@dtl/shared';
import { FX_PALETTE } from '../../render/vfx/palette';
import { hazardStyleDanger, HAZARD_DANGER_COLORS } from '../../render/vfx/phases';
import { SPRITE_STYLE } from './fxTimeline';
import { fxTriggered } from './skillFx';
import { HOT_BOLT_CORE } from './vfxParts/common';

// V-P10 đợt 2: độ kiếp theo Họa Pháp Lô 2. Mở kiếp (bốn kiếp theo cảnh giới) + cụm nổ chỗ thiên lôi rơi, sprite vẽ tay `kiep_*`.
const OPEN = ['fx_kiep_tc', 'fx_kiep_kd', 'fx_kiep_na', 'fx_kiep_hn'];
const IDS = [...OPEN, 'fx_kiep_strike'];
const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const card = (id: string): VfxCard =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/content/data/vfx/cards', `${id}.json`), 'utf8')) as VfxCard;
type M = FxEvent & { sprite?: string; t?: number; shape?: string; tex?: string; ink?: boolean };
const evs = (id: string): M[] => fxEventsFor(FX_TIMELINE.get(id)!, -1) as M[];
const hex = (n: number): string => n.toString(16).padStart(6, '0');

describe('VFX độ kiếp (V-P10, sprite Họa Pháp Lô 2)', () => {
  it('timeline hợp lệ, trong ngân sách thẻ, hình là sprite `kiep_*`, không vòng rune hay sao tỏa tia', () => {
    for (const id of IDS) {
      const tl = FX_TIMELINE.get(id)!;
      expect(tl, id).toBeDefined();
      expect(
        validateFxTimeline(tl, (x) => x.startsWith('fx_')),
        id,
      ).toEqual([]);
      const e = evs(id);
      const meshes = e.filter((x) => x.type === 'mesh');
      expect(meshes.length, id).toBeGreaterThanOrEqual(4);
      for (const m of meshes) {
        expect(m.shape, id).toBe('sprite');
        expect(String(m.sprite), id).toMatch(/^kiep_/);
        expect((FX_SPRITES as readonly string[]).includes(String(m.sprite)), `${id}:${m.sprite}`).toBe(true);
      }
      expect(
        e.some((x) => x.type === 'decal' && x.tex === 'rune'),
        id,
      ).toBe(false);
      // Draw call thật: mỗi sprite và mỗi decal một draw; tia sét sống 0,42 s nên không chồng lên nhau.
      expect(meshes.length + e.filter((x) => x.type === 'decal').length, id).toBeLessThanOrEqual(card(id).budget.drawCalls);
      expect(fxParticleCount(e as FxEvent[]), id).toBeLessThanOrEqual(card(id).budget.particles);
    }
    expect(SPRITE_STYLE.kiep_).toBe(12);
  });

  it('mở kiếp: tụ mây trước mốc nhấn, nút sét ở +30 ms, tia sét đầu có lõi mực, dư ba từ +150 ms; tối đa 4 tia', () => {
    for (const id of OPEN) {
      const I = card(id).scene!.impactAt;
      const e = evs(id);
      expect(FX_TIMELINE.get(id)!.trigger, id).toBe('fx');
      expect(
        e.some((x) => x.sprite === 'kiep_cloud' && (x.t ?? 0) < I - 0.05),
        `${id} thiếu nhịp tụ`,
      ).toBe(true);
      const knot = e.find((x) => x.sprite === 'kiep_knot');
      expect((knot!.t ?? 0) - I, id).toBeCloseTo(0.03, 2);
      const bolts = e.filter((x) => x.type === 'bolt');
      expect(bolts.length, id).toBeGreaterThanOrEqual(2);
      expect(bolts.length, id).toBeLessThanOrEqual(4);
      for (const b of bolts) expect(b.ink, id).toBe(true);
      expect(
        e.some((x) => x.type === 'mesh' && (x.t ?? 0) >= I + 0.15),
        `${id} thiếu dư ba`,
      ).toBe(true);
    }
    expect(fxTriggered('tribstart', undefined)?.skill).toBe('fx_kiep_tc');
    expect(fxTriggered('tribstart', undefined, 'ket_dan')?.skill).toBe('fx_kiep_kd');
  });

  it('bảng màu của thẻ bằng bảng timeline, không tông đỏ/cam (Đan Hỏa Kiếp là lửa tím, không cam)', () => {
    for (const id of IDS) {
      const pal = FX_PALETTE[FX_TIMELINE.get(id)!.palette!]!;
      const c = card(id).scene!.palette;
      for (const k of ['core', 'body', 'rim', 'accent', 'shadow'] as const) {
        expect(c[k], `${id}.${k}`).toBe(hex(pal[k]));
        expect(isRedOrange(hex(pal[k])), `${id}.${k} đỏ/cam`).toBe(false);
      }
    }
    expect(FX_TIMELINE.get('fx_kiep_kd')!.palette).toBe('kiep_hoa');
    expect(isRedOrange(hex(HOT_BOLT_CORE))).toBe(false);
  });

  it('vạch báo thiên lôi dùng màu cảnh báo kẻ địch (đỏ/cam theo mức nguy hiểm), không còn tím sét', () => {
    for (const d of [0, 1, 2] as const) expect(hazardStyleDanger('lightning', d).color).toBe(HAZARD_DANGER_COLORS[d]);
    expect(isRedOrange(hex(HAZARD_DANGER_COLORS[1]))).toBe(true);
    expect(isRedOrange(hex(HAZARD_DANGER_COLORS[2]))).toBe(true);
  });
});
