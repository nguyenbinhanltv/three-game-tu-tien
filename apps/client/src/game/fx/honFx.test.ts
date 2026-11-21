import { describe, expect, it } from 'vitest';
import type { FxMsg } from '@dtl/shared';
import { FX_TIMELINE, HON_FX, METHOD_SKILLS } from '@dtl/content';
import {
  HON_BINH_MAX,
  HON_BINH_SEG,
  HON_FX_DIST,
  HON_FX_KINDS,
  HON_FX_LIVE_MAX,
  HON_PALETTE,
  playHonBinh,
  playHonFx,
  type HonBinhEnv,
  type HonFxEnv,
} from './honFx';
import { paletteOf } from '../../render/vfx/palette';

function mk(o: { live?: number; viewer?: { x: number; z: number } } = {}) {
  const calls: { tl: string; x: number; z: number; tgt: { x: number; z: number } | null; mine: boolean; pal: string }[] = [];
  const pos: Record<string, { x: number; y: number; z: number }> = {
    me: { x: 0, y: 0, z: 0 },
    other: { x: 5, y: 0, z: 0 },
    mon: { x: 3, y: 0, z: 4 },
  };
  const env: HonFxEnv = {
    startAt: (tl, a) =>
      calls.push({
        tl: tl.skill,
        x: a.actor.x,
        z: a.actor.z,
        tgt: a.tgt ? { x: a.tgt.x, z: a.tgt.z } : null,
        mine: !!a.mine,
        pal: a.palette,
      }),
    posOf: (id) => pos[id] ?? null,
    mySid: () => 'me',
    viewer: () => o.viewer ?? { x: 0, z: 0 },
    live: () => o.live ?? 0,
  };
  return { env, calls };
}
const fx = (t: string, src: string, dst: string): FxMsg => ({ t, src, dst });

describe('hiệu ứng tại điểm của Hồn tu (TN-2)', () => {
  it('mọi loại S.FX trong bảng đều có timeline; tin loại khác không thuộc nhóm này', () => {
    for (const k of Object.values(HON_FX_KINDS)) expect(HON_FX.has(k.tl), k.tl).toBe(true);
    const { env, calls } = mk();
    expect(playHonFx(env, fx('kanh', 'me', 'mon'))).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it('nhịp hồn binh phát ở quái bị đánh; tia hồn bắt đầu ở quái và bay về người thu', () => {
    const { env, calls } = mk();
    expect(playHonFx(env, fx('honbinh_hit', 'me', 'mon'))).toBe(true);
    expect(calls[0]).toMatchObject({ tl: 'hon_binh_hit', x: 3, z: 4, tgt: null, mine: true, pal: HON_PALETTE });
    playHonFx(env, fx('soul_reap', 'mon', 'me'));
    expect(calls[1]).toMatchObject({ tl: 'hon_reap', x: 3, z: 4, tgt: { x: 0, z: 0 }, mine: true });
    playHonFx(env, fx('artreap', 'mon', 'other'));
    expect(calls[2]).toMatchObject({ tl: 'hon_reap', tgt: { x: 5, z: 0 }, mine: false });
  });
  it('của người khác: ở xa hoặc sân đang đông lưới thì bỏ; của mình thì luôn phát; thực thể đã rời tầm nhìn thì bỏ êm', () => {
    const far = mk({ viewer: { x: HON_FX_DIST + 20, z: 0 } });
    playHonFx(far.env, fx('soul_reap', 'mon', 'other'));
    expect(far.calls).toHaveLength(0);
    playHonFx(far.env, fx('soul_reap', 'mon', 'me'));
    expect(far.calls).toHaveLength(1);
    const busy = mk({ live: HON_FX_LIVE_MAX });
    playHonFx(busy.env, fx('honbinh_hit', 'other', 'mon'));
    expect(busy.calls).toHaveLength(0);
    playHonFx(busy.env, fx('honbinh_hit', 'me', 'mon'));
    expect(busy.calls).toHaveLength(1);
    const gone = mk();
    expect(playHonFx(gone.env, fx('soul_reap', 'da_bien_mat', 'me'))).toBe(true);
    expect(gone.calls).toHaveLength(0);
  });
  it('mọi chiêu Hồn tu có động tác riêng đều có timeline riêng; bảng màu của hướng tu tra được', () => {
    const own = METHOD_SKILLS.filter((s) => s.method === 'dan_hon_kinh' && s.kind !== 'stance' && !s.stanceOf);
    expect(own.length).toBe(7);
    for (const s of own) expect(FX_TIMELINE.has(s.id), s.id).toBe(true);
    const pal = paletteOf(HON_PALETTE);
    expect(pal.rim).toBe(0xc9d4e0);
    expect(pal.core).toBe(0x2a2338);
  });
});

describe('ba hồn binh của Tát Đậu Thành Binh (TN-2)', () => {
  function mkBinh() {
    const starts: { tl: string; mine: boolean }[] = [];
    const timers: { sec: number; done: () => void }[] = [];
    let alive = true;
    const actor = { x: 0, y: 0, z: 0, yaw: 0, model: {} };
    const env: HonBinhEnv = {
      startAt: (tl, o) => starts.push({ tl: tl.skill, mine: !!o.mine }),
      caster: () => (alive ? actor : null),
      mySid: () => 'me',
      after: (sec, done) => timers.push({ sec, done }),
    };
    /** Cho đồng hồ chạy hết mọi hẹn giờ đang chờ (kể cả hẹn giờ sinh ra trong lúc chạy). */
    const run = () => {
      let guard = 0;
      while (timers.length && guard++ < 100) timers.shift()!.done();
    };
    return { env, starts, timers, run, kill: () => (alive = false) };
  }
  it('phát nối tiếp đủ phủ thời gian chiêu rồi dừng; hình là timeline hon_binh_stand có ba bóng lính bám theo người gọi', () => {
    const { env, starts, timers, run } = mkBinh();
    playHonBinh(env, 'me', 10);
    expect(starts).toEqual([{ tl: 'hon_binh_stand', mine: true }]);
    expect(timers[0]!.sec).toBe(HON_BINH_SEG);
    run();
    expect(starts).toHaveLength(Math.ceil((10 - 0.3) / HON_BINH_SEG));
    const tl = HON_FX.get('hon_binh_stand')!;
    const soldiers = tl.events.filter((e) => e.type === 'mesh' && e.shape === 'soul_soldier');
    expect(soldiers).toHaveLength(3);
    for (const e of soldiers) {
      if (e.type !== 'mesh') continue;
      expect(e.follow).toBe(true);
      expect(e.dur).toBeGreaterThan(HON_BINH_SEG);
      // Không con nào đứng sau lưng người gọi (phía camera mặc định): z trong khung người gọi luôn dương.
      expect((e.offset as number[])[2]).toBeGreaterThan(0);
    }
  });
  it('gọi lại thì bộ cũ thôi phát; người gọi ngã/rời tầm nhìn thì dừng; thời gian lạ bị chặn', () => {
    const a = mkBinh();
    playHonBinh(a.env, 'p1', 10);
    playHonBinh(a.env, 'p1', 10);
    a.run();
    // Lượt đầu chỉ phát đúng một đoạn rồi nhường; lượt sau phát đủ.
    expect(a.starts).toHaveLength(1 + Math.ceil((10 - 0.3) / HON_BINH_SEG));
    const b = mkBinh();
    playHonBinh(b.env, 'p2', 10);
    b.kill();
    b.run();
    expect(b.starts).toHaveLength(1);
    const c = mkBinh();
    playHonBinh(c.env, 'p3', 9999);
    c.run();
    expect(c.starts.length).toBeLessThanOrEqual(Math.ceil(HON_BINH_MAX / HON_BINH_SEG));
    const d = mkBinh();
    playHonBinh(d.env, 'p4', 0);
    expect(d.starts).toHaveLength(0);
  });
});
