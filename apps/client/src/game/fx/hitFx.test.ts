import { describe, expect, it } from 'vitest';
import { FX_TIMELINE } from '@dtl/content';
import { FX_PALETTE } from '../../render/vfx/palette';
import { HitFx, type HitPoint } from './hitFx';
import type { FxRunner } from './fxTimeline';

const pt: HitPoint = { id: 'p1', x: 0, y: 0, z: 0, chest: 1.15 };

function setup(live = 0) {
  const calls: { skill: string; palette: string }[] = [];
  const runner = { startAt: (tl: { skill: string }, o: { palette: string }) => calls.push({ skill: tl.skill, palette: o.palette }) };
  const fx = new HitFx(runner as unknown as FxRunner, { camera: () => ({ position: { x: 0, z: 5 } }), live: () => live });
  return { fx, calls };
}

describe('HitFx hồi linh lực (HPL2 A)', () => {
  it('mana phát fx_mana với bảng lam, khác hồi máu và khói đan', () => {
    const t = setup();
    t.fx.mana(pt, true);
    t.fx.potion({ ...pt, id: 'p2' }, true);
    t.fx.heal({ ...pt, id: 'p3' }, true, true);
    expect(t.calls).toEqual([
      { skill: 'fx_mana', palette: 'hit_mana' },
      { skill: 'fx_potion', palette: 'hit_heal' },
      { skill: 'fx_heal', palette: 'hit_heal' },
    ]);
    expect(FX_PALETTE.hit_mana).toBeTruthy();
    expect(FX_PALETTE.hit_mana!.body).not.toBe(FX_PALETTE.hit_heal!.body);
  });

  it('giãn cách theo người nhận; đông người thì bỏ phần của người khác', () => {
    const t = setup();
    t.fx.mana(pt, true);
    t.fx.mana(pt, true);
    expect(t.calls.length).toBe(1);
    const crowd = setup(999);
    crowd.fx.mana(pt, false);
    expect(crowd.calls.length).toBe(0);
    crowd.fx.mana(pt, true);
    expect(crowd.calls.length).toBe(1);
  });

  it('fx_mana không dùng tông đỏ/cam và không dùng sen của hồi máu', () => {
    const tl = FX_TIMELINE.get('fx_mana')!;
    expect(tl.palette).toBe('hit_mana');
    const sprites = tl.events.flatMap((e) => ('sprite' in e && e.sprite ? [e.sprite] : []));
    expect(sprites).toContain('chung_eddy');
    expect(sprites).toContain('chung_drops');
    expect(sprites).not.toContain('chung_lotus');
  });
});

describe('HitFx mảnh vụn theo chất liệu (HPL2 B)', () => {
  it('mỗi chất liệu một timeline + bảng màu riêng, không tông đỏ/cam', () => {
    const t = setup();
    for (const [i, m] of (['flesh', 'stone', 'metal'] as const).entries()) t.fx.debris({ ...pt, id: 'm' + i }, { x: 1, z: 1 }, m, true);
    expect(t.calls).toEqual([
      { skill: 'fx_debris_flesh', palette: 'deb_flesh' },
      { skill: 'fx_debris_stone', palette: 'deb_stone' },
      { skill: 'fx_debris_metal', palette: 'deb_metal' },
    ]);
    for (const k of ['deb_flesh', 'deb_stone', 'deb_metal']) {
      const pal = FX_PALETTE[k]!;
      for (const c of [pal.core, pal.body, pal.rim, pal.accent]) {
        const r = (c >> 16) & 255;
        const g = (c >> 8) & 255;
        const b = c & 255;
        // Đỏ/cam = kênh đỏ trội hẳn hai kênh kia.
        expect(r - Math.max(g, b) > 40 && g < r * 0.8).toBe(false);
      }
    }
  });

  it('chỉ phát cho đòn dính tới mình và giãn cách theo quái', () => {
    const t = setup();
    t.fx.debris(pt, null, 'stone', false);
    expect(t.calls.length).toBe(0);
    t.fx.debris(pt, null, 'stone', true);
    t.fx.debris(pt, null, 'stone', true);
    expect(t.calls.length).toBe(1);
  });

  it('đông hiệu ứng (≥ 20 lưới sống): bỏ mảnh vụn kể cả của mình', () => {
    const t = setup(20);
    t.fx.debris(pt, null, 'metal', true);
    expect(t.calls.length).toBe(0);
    t.fx.debris(pt, null, 'metal', true, true);
    expect(t.calls.length).toBe(1);
  });

  it('ngân sách: mỗi timeline mảnh vụn tối đa 2 sprite (thân + điểm nhấn 70 ms), đều ở tier 1', () => {
    for (const m of ['flesh', 'stone', 'metal']) {
      const sp = FX_TIMELINE.get('fx_debris_' + m)!.events.filter((e) => 'sprite' in e && e.sprite);
      expect(sp.length).toBeLessThanOrEqual(2);
      for (const e of sp) expect((e as { tier?: number }).tier).toBe(1);
    }
  });
});
