import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, S } from '@dtl/shared';
import { readTestFlags, testAccess } from './testflags';

// M1-10: ?god / ?at chỉ cho tài khoản thử; tài khoản thật và server production bị từ chối.
process.env.DB_FILE = ':memory:';

describe('quyền tham số kiểm thử', () => {
  it('chỉ tài khoản thử trên server bật dev bypass', () => {
    expect(testAccess(true, true)).toBe(true);
    expect(testAccess(false, true)).toBe(false); // tài khoản Google thật
    expect(testAccess(true, false)).toBe(false); // phiên dev sót lại khi production / có GOOGLE_CLIENT_ID
    expect(testAccess(false, false)).toBe(false);
  });

  it('tài khoản thật xin ?god / ?at bị từ chối', () => {
    expect(readTestFlags({ god: true }, false, true)).toEqual({ kind: 'denied' });
    expect(readTestFlags({ at: 'tong_mon' }, false, true)).toEqual({ kind: 'denied' });
    expect(readTestFlags({ god: true, at: 'boss' }, true, false)).toEqual({ kind: 'denied' });
  });

  it('không xin gì thì không báo gì', () => {
    expect(readTestFlags({}, false, false)).toEqual({ kind: 'none' });
    expect(readTestFlags(null, true, true)).toEqual({ kind: 'none' });
    expect(readTestFlags({ god: false, at: '' }, true, true)).toEqual({ kind: 'none' });
    expect(readTestFlags({ god: 'yes' }, true, true)).toEqual({ kind: 'none' });
  });

  it('tài khoản thử: god + địa điểm có trong bảng', () => {
    const r = readTestFlags({ god: true, at: 'rung' }, true, true);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.flags.god).toBe(true);
      expect(r.flags.at?.id).toBe('rung');
    }
  });

  it('địa điểm lạ / sai kiểu / dài / thuộc tính kế thừa thì không dịch chuyển', () => {
    for (const at of ['khong_co', '../x', 'constructor', '__proto__', 'a'.repeat(200), 42, { x: 1 }, ['rung']]) {
      expect(readTestFlags({ at }, true, true).kind, String(at)).toBe('bad_place');
    }
  });
});

describe('god và tp <địa điểm> trong sim', () => {
  let GameSim: typeof import('./game/sim').GameSim;
  let WorldState: typeof import('./state').WorldState;
  let PlayerS: typeof import('./state').PlayerS;
  let PLACE: typeof import('@dtl/content/places').PLACE;
  beforeAll(async () => {
    ({ GameSim } = await import('./game/sim'));
    ({ WorldState, PlayerS } = await import('./state'));
    ({ PLACE } = await import('@dtl/content/places'));
  });

  function setup(dev: boolean, levelId = 'van_lam') {
    const sent: { type: string; msg: unknown }[] = [];
    const sim = new GameSim(new WorldState(), { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) } as never, {
      levelId,
      roomName: 'test',
      spawn: { x: 2048, z: 2088 },
      respawn: { x: 2048, z: 2088 },
      persistPosition: false,
    });
    const p = {
      sid: 'p1',
      dev,
      god: false,
      s: new PlayerS(),
      client: { send: (type: string, msg: unknown) => sent.push({ type, msg }) },
      move: { x: 2048, y: groundAt(2048, 2088), z: 2088, vy: 0, grounded: true, flying: false },
      inputs: [],
      char: { hp: 100, mhp: 100, mp: 50, mmp: 50, level: 5 },
      shield: null,
      meditating: false,
      lastCombatAt: 0,
      chatAt: -10_000,
      hazardWin: { until: 0, taken: 0 },
    };
    sim.players.set('p1', p as never);
    return { sim, p, sent };
  }

  it('god: nhận đòn (vẫn phát DMG) nhưng không mất máu, không chết', () => {
    const { sim, p, sent } = setup(true);
    sim.applyTestFlags(p as never, { god: true, at: null });
    sim.damagePlayer(p as never, 500, 'mon_x');
    expect(p.char.hp).toBe(100);
    expect(sent.some((m) => m.type === S.DMG && (m.msg as { n: number }).n === 500)).toBe(true);
  });

  it('applyTestFlags bỏ qua người không phải tài khoản thử (chốt thứ hai)', () => {
    const { sim, p } = setup(false);
    sim.applyTestFlags(p as never, { god: true, at: PLACE.get('rung')! });
    expect(p.god).toBe(false);
    expect(p.move.x).toBe(2048);
    sim.damagePlayer(p as never, 30, 'mon_x');
    expect(p.char.hp).toBe(70);
  });

  it('?at dịch chuyển tới điểm cùng level, điểm của level khác thì không', () => {
    const { sim, p } = setup(true);
    sim.applyTestFlags(p as never, { god: false, at: PLACE.get('rung')! });
    expect([p.move.x, p.move.z]).toEqual([2720, 2180]);
    sim.applyTestFlags(p as never, { god: false, at: PLACE.get('kt_giua')! });
    expect([p.move.x, p.move.z]).toEqual([2720, 2180]);
  });

  it('chat /gm god và /gm tp <địa điểm> chỉ chạy với tài khoản thử', () => {
    const real = setup(false);
    real.sim.onChat(real.p as never, { m: '/gm tp boss' });
    expect(real.p.move.x).toBe(2048);
    real.p.chatAt = -10_000;
    real.sim.onChat(real.p as never, { m: '/gm god' });
    expect(real.p.god).toBe(false);

    const dev = setup(true);
    dev.sim.onChat(dev.p as never, { m: '/gm tp boss' });
    expect([dev.p.move.x, dev.p.move.z]).toEqual([PLACE.get('boss')!.x, PLACE.get('boss')!.z]);
    dev.sim.now += 1000;
    dev.sim.onChat(dev.p as never, { m: '/gm god on' });
    expect(dev.p.god).toBe(true);
    // Điểm của level khác (bí cảnh) không áp trong room thế giới.
    dev.sim.now += 1000;
    dev.sim.onChat(dev.p as never, { m: '/gm tp kt_giua' });
    expect([dev.p.move.x, dev.p.move.z]).toEqual([PLACE.get('boss')!.x, PLACE.get('boss')!.z]);
  });
});
