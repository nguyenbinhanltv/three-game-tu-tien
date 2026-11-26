import { describe, expect, it } from 'vitest';
import { FX_TIMELINE } from '@dtl/content';
import {
  MF_BURN,
  MF_DAZED,
  MF_FACE,
  MF_FACE_T,
  MF_POISON,
  MF_REAL,
  MF_REFLECT,
  MF_SENSED,
  MF_SLOW,
  MF_STUN,
  MF_WEAK,
  PF_DEAD,
  PF_HOT,
  PF_SHIELD,
} from '@dtl/shared';
import { FX_PALETTE } from '../../render/vfx/palette';
import { STATUS_DEF, StatusFx, WARD_END_KEY, monStatusOf, playerStatusOf, type StatusEnt, type StatusKind } from './statusFx';
import type { FxRunner } from './fxTimeline';

describe('hình trạng thái kéo dài (HPL2 PR2)', () => {
  it('ưu tiên: choáng > bỏng > độc > chậm', () => {
    expect(monStatusOf(MF_SLOW | MF_POISON | MF_BURN | MF_DAZED)).toBe('stun');
    expect(monStatusOf(MF_SLOW | MF_POISON | MF_BURN)).toBe('burn');
    expect(monStatusOf(MF_SLOW | MF_POISON)).toBe('poison');
    expect(monStatusOf(MF_SLOW)).toBe('slow');
    expect(monStatusOf(0)).toBeUndefined();
  });
  it('MF_STUN (khựng của đòn nặng) không vẽ choáng, không che bỏng/độc/chậm', () => {
    expect(monStatusOf(MF_STUN)).toBeUndefined();
    expect(monStatusOf(MF_STUN | MF_BURN)).toBe('burn');
  });
  it('hồi dần chỉ vẽ khi còn sống', () => {
    expect(playerStatusOf(PF_HOT)).toBe('hot');
    expect(playerStatusOf(PF_HOT | PF_DEAD)).toBeUndefined();
    expect(playerStatusOf(0)).toBeUndefined();
  });
  it('mỗi trạng thái có timeline fx_st_* và bảng màu', () => {
    for (const k of Object.keys(STATUS_DEF) as StatusKind[]) {
      const d = STATUS_DEF[k];
      expect(FX_TIMELINE.get(d.key), k).toBeTruthy();
      expect(FX_PALETTE[d.pal], d.pal).toBeTruthy();
      expect(d.period).toBeGreaterThan(0.5);
    }
    expect(FX_TIMELINE.get(WARD_END_KEY)).toBeTruthy();
  });
});

describe('trạng thái nhóm 2a (cờ quái mở rộng, khiên)', () => {
  it('mỗi cờ ra đúng loại', () => {
    expect(monStatusOf(MF_FACE)).toBe('yin');
    expect(monStatusOf(MF_FACE_T)).toBe('yang');
    expect(monStatusOf(MF_REFLECT)).toBe('reflect');
    expect(monStatusOf(MF_WEAK)).toBe('weak');
    expect(monStatusOf(MF_SENSED)).toBe('sensed');
    expect(monStatusOf(MF_REAL)).toBe('real');
  });
  it('ưu tiên: mặt Âm > phản đòn > choáng > yếu điểm > mặt Dương > bị soi > bỏng > độc > chậm > thể thật', () => {
    const chain: [number, StatusKind][] = [
      [MF_FACE, 'yin'],
      [MF_REFLECT, 'reflect'],
      [MF_DAZED, 'stun'],
      [MF_WEAK, 'weak'],
      [MF_FACE_T, 'yang'],
      [MF_SENSED, 'sensed'],
      [MF_BURN, 'burn'],
      [MF_POISON, 'poison'],
      [MF_SLOW, 'slow'],
      [MF_REAL, 'real'],
    ];
    let mf = 0;
    for (let i = chain.length - 1; i >= 0; i--) {
      mf |= chain[i]![0];
      expect(monStatusOf(mf), String(chain[i]![1])).toBe(chain[i]![1]);
    }
  });
  it('khiên: người có PF_SHIELD vẽ ward, ưu tiên hơn hồi dần; chết thì không vẽ', () => {
    expect(playerStatusOf(PF_SHIELD)).toBe('ward');
    expect(playerStatusOf(PF_SHIELD | PF_HOT)).toBe('ward');
    expect(playerStatusOf(PF_SHIELD | PF_DEAD)).toBeUndefined();
  });
  it('mọi timeline nhóm 2a bám thân (at self + follow) và không dùng bảng đỏ/cam', () => {
    for (const k of ['yin', 'reflect', 'weak', 'yang', 'sensed', 'real', 'ward'] as StatusKind[]) {
      const tl = FX_TIMELINE.get(STATUS_DEF[k].key)!;
      const meshes = tl.events.filter((e) => e.type === 'mesh') as { at?: string; follow?: boolean }[];
      expect(meshes.length, k).toBeGreaterThan(0);
      for (const m of meshes) {
        expect(m.at, k).toBe('self');
        expect(m.follow, k).toBe(true);
      }
    }
  });
  it('phản đòn xoay, khiên đứng yên (phân biệt bằng mắt)', () => {
    const spin = (k: StatusKind) =>
      (FX_TIMELINE.get(STATUS_DEF[k].key)!.events.find((e) => e.type === 'mesh') as { spin?: number }).spin ?? 0;
    expect(spin('reflect')).toBeGreaterThan(0);
    expect(spin('ward')).toBe(0);
    expect(spin('yin')).toBe(0);
  });
});

describe('khiên vỡ (StatusFx)', () => {
  function setup(ents: () => StatusEnt[]) {
    const started: string[] = [];
    const runner = { startAt: (tl: { skill: string }) => void started.push(tl.skill) } as unknown as FxRunner;
    const fx = new StatusFx(runner, { camera: () => ({ position: { x: 0, z: 0 } }), live: () => 0, entities: ents });
    return { fx, started };
  }
  const ward = (id = 'p', x = 3): StatusEnt => ({
    id,
    x,
    y: 0,
    z: 0,
    scale: 1,
    kind: 'ward',
    mine: true,
    actor: { x, y: 0, z: 0, yaw: 0, model: {} },
  });

  it('còn khiên thì chỉ phát fx_st_ward, hết khiên phát fx_st_ward_end đúng một lần', () => {
    let list: StatusEnt[] = [ward()];
    const { fx, started } = setup(() => list);
    fx.update(0.3);
    expect(started).toEqual(['fx_st_ward']);
    list = [];
    fx.update(0.3);
    expect(started).toEqual(['fx_st_ward', WARD_END_KEY]);
    fx.update(0.3);
    expect(started.filter((k) => k === WARD_END_KEY).length).toBe(1);
  });
  it('trạng thái khác (độc) biến mất không phát khiên vỡ', () => {
    let list: StatusEnt[] = [{ ...ward(), kind: 'poison' }];
    const { fx, started } = setup(() => list);
    fx.update(0.3);
    list = [];
    fx.update(0.3);
    expect(started).not.toContain(WARD_END_KEY);
  });
});
