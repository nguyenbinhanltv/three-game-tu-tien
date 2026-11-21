import { describe, expect, it } from 'vitest';
import type { FxMsg } from '@dtl/shared';
import { fxDrawCount, fxEventsFor, fxParticleCount, validateFxTimeline } from '@dtl/shared';
import { CO_FX, FX_TIMELINE, METHOD_SKILLS, PATH, SKILL } from '@dtl/content';
import { paletteOf } from '../../render/vfx/palette';
import {
  CO_FX_DIST,
  CO_FX_KINDS,
  CO_FX_LIVE_MAX,
  CO_PALETTE,
  CO_STAND_KINDS,
  CO_STAND_MAX,
  CO_STAND_SEG,
  playCoFx,
  playCoStand,
  type CoFxEnv,
  type CoStandEnv,
} from './coFx';

const METHOD = 'duong_co_kinh';
const OWN = ['skl_tha_co', 'skl_co_trieu', 'skl_hut_mau_co', 'skl_co_bao', 'skl_thu_co', 'skl_hoa_co_vuong'];
const evs = (id: string) => fxEventsFor(FX_TIMELINE.get(id)!, -1);

describe('VFX Cổ tu: timeline chiêu', () => {
  it('mỗi chiêu có timeline riêng, thay đúng loại FX của chiêu, hợp lệ và trong ngân sách', () => {
    for (const id of OWN) {
      const tl = FX_TIMELINE.get(id)!;
      const sk = METHOD_SKILLS.find((s) => s.id === id)!;
      expect(tl, id).toBeDefined();
      expect(tl.replaces, id).toEqual([sk.fx]);
      expect(
        validateFxTimeline(tl, (x) => SKILL.has(x)),
        id,
      ).toEqual([]);
      expect(fxDrawCount(evs(id)), id).toBeLessThanOrEqual(12);
      expect(fxParticleCount(evs(id)), id).toBeLessThanOrEqual(1500);
    }
  });

  it('không có timeline cho chiêu tư thế hay chiêu lướt (mượn hình chiêu nền)', () => {
    for (const s of METHOD_SKILLS.filter((x) => x.method === METHOD && (x.stanceOf || x.kind === 'dash')))
      expect(FX_TIMELINE.has(s.id), s.id).toBe(false);
  });

  it('không che camera/nhân vật: khối đứng/đá camFade, đá có trần 2,2 m; chỉ Cổ Triều dùng slowmo và kéo máy', () => {
    for (const id of OWN) {
      const e = evs(id);
      for (const x of e) {
        if (x.type !== 'mesh') continue;
        if (/^(blade_stuck|sword_halo|rubble_|rock_spire)/.test(x.shape)) expect(x.camFade, `${id}:${x.shape}`).toBe(true);
        if (x.shape.startsWith('rubble_') && x.move?.offset) expect(x.move.offset[1]!, `${id}:${x.shape}`).toBeLessThanOrEqual(2.2);
      }
      expect(
        e.some((x) => x.type === 'slowmo'),
        id,
      ).toBe(id === 'skl_co_trieu');
      expect(
        e.some((x) => x.type === 'camera' && (x.pull ?? 0) > 0),
        id,
      ).toBe(id === 'skl_co_trieu');
      for (const x of e) if (x.type === 'hitstop') expect(x.ms, id).toBeLessThanOrEqual(80);
    }
  });

  it('màu theo bảng màu hướng co_tu (lõi rêu đen, thân lục độc, viền lục vàng); không mượn hình kiếm/Hộ pháp/Đao tu', () => {
    const p = PATH.get('co_tu')!.palette;
    const pal = paletteOf(METHOD);
    expect(pal.core).toBe(parseInt(p.core, 16));
    expect(pal.body).toBe(parseInt(p.body, 16));
    expect(pal.rim).toBe(parseInt(p.rim, 16));
    for (const id of OWN)
      for (const x of evs(id))
        if (x.type === 'mesh')
          expect(
            /^(blade_|slash_thick|slash_fan|rock_spire|shield_plate|seal_block|bell_cage|diamond_cage|dragon_sword)/.test(x.shape),
            `${id}:${x.shape}`,
          ).toBe(false);
  });
});

describe('VFX Cổ tu: hiệu ứng tại điểm (timeline)', () => {
  it('đủ bốn timeline, hợp lệ, dùng bảng màu duong_co_kinh, rất nhẹ và không khựng/rung/chớp', () => {
    for (const name of ['co_bay_hit', 'co_vuong_hit', 'co_bay_stand', 'co_vuong_stand']) {
      const tl = CO_FX.get(name)!;
      expect(tl, name).toBeDefined();
      expect(tl.palette, name).toBe(CO_PALETTE);
      expect(
        validateFxTimeline(tl, (id) => id.startsWith('co_')),
        name,
      ).toEqual([]);
      expect(fxDrawCount(tl.events), name).toBeLessThanOrEqual(name.endsWith('_stand') ? 6 : 3);
      expect(fxParticleCount(tl.events), name).toBeLessThanOrEqual(30);
      expect(
        tl.events.some((e) => e.type === 'hitstop' || e.type === 'shake' || e.type === 'flash'),
        name,
      ).toBe(false);
    }
  });
});

function mkHit(o: { live?: number; viewer?: { x: number; z: number } } = {}) {
  const calls: { tl: string; x: number; z: number; mine: boolean; pal: string }[] = [];
  const pos: Record<string, { x: number; y: number; z: number }> = { mon: { x: 3, y: 0, z: 4 }, far: { x: 200, y: 0, z: 0 } };
  const env: CoFxEnv = {
    startAt: (tl, a) => calls.push({ tl: tl.skill, x: a.actor.x, z: a.actor.z, mine: !!a.mine, pal: a.palette }),
    posOf: (id) => pos[id] ?? null,
    mySid: () => 'me',
    viewer: () => o.viewer ?? { x: 0, z: 0 },
    live: () => o.live ?? 0,
  };
  return { env, calls };
}
const fx = (t: string, src: string, dst: string): FxMsg => ({ t, src, dst }) as FxMsg;

describe('playCoFx (nhịp cắn)', () => {
  it('bầy cổ và Cổ Vương cắn: phát đúng timeline tại con quái bị cắn, màu Cổ tu', () => {
    const { env, calls } = mkHit();
    expect(playCoFx(env, fx('cotrieu_hit', 'me', 'mon'))).toBe(true);
    expect(playCoFx(env, fx('covuong_hit', 'me', 'mon'))).toBe(true);
    expect(calls.map((c) => c.tl)).toEqual(['co_bay_hit', 'co_vuong_hit']);
    expect(calls[0]).toMatchObject({ x: 3, z: 4, mine: true, pal: CO_PALETTE });
    expect(Object.keys(CO_FX_KINDS).sort()).toEqual(['cotrieu_hit', 'covuong_hit']);
  });
  it('tin lạ không thuộc nhóm; quái không còn trong tầm nhìn thì bỏ', () => {
    const { env, calls } = mkHit();
    expect(playCoFx(env, fx('slash', 'me', 'mon'))).toBe(false);
    expect(playCoFx(env, fx('cotrieu_hit', 'me', 'gone'))).toBe(true);
    expect(calls).toHaveLength(0);
  });
  it('của người khác: bỏ khi ở xa hoặc sân đông; của mình luôn phát', () => {
    const far = mkHit();
    playCoFx(far.env, fx('cotrieu_hit', 'other', 'far'));
    expect(far.calls).toHaveLength(0);
    const busy = mkHit({ live: CO_FX_LIVE_MAX });
    playCoFx(busy.env, fx('cotrieu_hit', 'other', 'mon'));
    expect(busy.calls).toHaveLength(0);
    playCoFx(busy.env, fx('cotrieu_hit', 'me', 'mon'));
    expect(busy.calls).toHaveLength(1);
    expect(CO_FX_DIST).toBeGreaterThan(0);
  });
});

function mkStand() {
  const calls: { tl: string; mine: boolean }[] = [];
  const timers: { sec: number; done: () => void }[] = [];
  let alive = true;
  const env: CoStandEnv = {
    startAt: (tl, a) => calls.push({ tl: tl.skill, mine: !!a.mine }),
    caster: () => (alive ? ({ x: 0, y: 0, z: 0, yaw: 0, model: {} } as never) : null),
    mySid: () => 'me',
    after: (sec, done) => timers.push({ sec, done }),
  };
  return {
    env,
    calls,
    timers,
    kill: () => {
      alive = false;
    },
  };
}

describe('playCoStand (bầy cổ đứng)', () => {
  it('phát đoạn đầu ngay và nối tiếp theo từng đoạn tới hết giờ', () => {
    const s = mkStand();
    playCoStand(s.env, 'me', 10, 'cotrieu');
    expect(s.calls.map((c) => c.tl)).toEqual(['co_bay_stand']);
    for (let i = 0; i < 6; i++) s.timers.shift()?.done();
    expect(s.calls.length).toBe(Math.ceil((10 - 0.3) / CO_STAND_SEG));
    expect(s.calls.every((c) => c.mine)).toBe(true);
  });
  it('Cổ Vương dùng hình riêng; gọi lại cùng loại thay bộ cũ, khác loại không cắt nhau; người gọi ngã thì thôi', () => {
    const s = mkStand();
    playCoStand(s.env, 'me', 12, 'covuong');
    expect(s.calls[0]!.tl).toBe('co_vuong_stand');
    const old = s.timers.shift()!;
    playCoStand(s.env, 'me', 12, 'covuong');
    old.done();
    expect(s.calls).toHaveLength(2); // bộ cũ tự dừng
    playCoStand(s.env, 'me', 10, 'cotrieu');
    const n = s.calls.length;
    s.timers[0]!.done();
    expect(s.calls.length).toBe(n + 1); // bộ covuong mới vẫn chạy
    s.kill();
    s.timers.forEach((t) => t.done());
    expect(s.calls.length).toBe(n + 1);
  });
  it('chặn tin lạ: loại không biết, thời gian không dương, thời gian quá dài', () => {
    const s = mkStand();
    playCoStand(s.env, 'me', 10, 'khong_co');
    playCoStand(s.env, 'me', 0, 'cotrieu');
    expect(s.calls).toHaveLength(0);
    playCoStand(s.env, 'me', 9999, 'cotrieu');
    let n = 0;
    while (s.timers.length && n++ < 100) s.timers.shift()!.done();
    expect(s.calls.length).toBeLessThanOrEqual(Math.ceil(CO_STAND_MAX / CO_STAND_SEG) + 1);
    expect(Object.keys(CO_STAND_KINDS).sort()).toEqual(['cotrieu', 'covuong']);
  });
});
