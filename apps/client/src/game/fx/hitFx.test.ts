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
