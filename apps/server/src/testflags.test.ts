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

  it('?realm / ?tribulation / ?at=x,z: tài khoản thật bị từ chối như ?god', () => {
    for (const o of [{ realm: 'nk15' }, { trib: true }, { pos: [2048, 2088] }, { realm: 15, trib: 1, pos: [1, 2] }]) {
      expect(readTestFlags(o, false, true), JSON.stringify(o)).toEqual({ kind: 'denied' });
      expect(readTestFlags(o, true, false), JSON.stringify(o)).toEqual({ kind: 'denied' });
    }
  });

  it('?realm: mã cảnh giới hợp lệ thành cấp, mã sai thì không áp gì', () => {
    const ok = (realm: unknown) => {
      const r = readTestFlags({ realm }, true, true);
      return r.kind === 'ok' ? r.flags.realm : r.kind;
    };
    expect(ok('nk15')).toBe(15);
    expect(ok('NK3')).toBe(3);
    expect(ok('tc')).toBe(16);
    expect(ok('tc3')).toBe(18);
    expect(ok(9)).toBe(9);
    for (const bad of ['nk16', 'nk0', 'tc4', 'kd1', '19', '0', -1, 1.5, 'a'.repeat(50), { level: 15 }, ['nk15'], '__proto__']) expect(ok(bad), String(bad)).toBe('bad_realm');
    // Sai một tham số thì không áp tham số nào (không bật god một nửa).
    expect(readTestFlags({ god: true, realm: 'nk99' }, true, true).kind).toBe('bad_realm');
  });

  it('?at=x,z: chỉ nhận cặp số hữu hạn trong bản đồ; có địa điểm đặt tên thì bỏ qua tọa độ', () => {
    const r = readTestFlags({ pos: [2300.5, 2400], trib: true }, true, true);
    expect(r).toEqual({ kind: 'ok', flags: { god: false, at: null, pos: { x: 2300.5, z: 2400 }, realm: null, trib: true } });
    for (const pos of [[1, 2, 3], [NaN, 1], [Infinity, 1], [-5, 10], [10, 99999], ['1', '2'], '10,20', { x: 1, z: 2 }, [null, null]]) {
      expect(readTestFlags({ pos }, true, true).kind, JSON.stringify(pos)).toBe('bad_place');
    }
    const named = readTestFlags({ at: 'rung', pos: [NaN, NaN] }, true, true);
    expect(named.kind === 'ok' && named.flags.at?.id === 'rung' && named.flags.pos === null).toBe(true);
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
      char: { hp: 100, mhp: 100, mp: 50, mmp: 50, level: 5, meta: {} },
      mth: { guardUntil: 0, guardReduce: 0 },
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
    expect([p.move.x, p.move.z]).toEqual([2450, 2110]);
    sim.applyTestFlags(p as never, { god: false, at: PLACE.get('kt_giua')! });
    expect([p.move.x, p.move.z]).toEqual([2450, 2110]);
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

describe('?realm, ?tribulation, /gm realm, /gm trib với nhân vật thật', () => {
  let GameSim: typeof import('./game/sim').GameSim;
  let WorldState: typeof import('./state').WorldState;
  let Character: typeof import('./game/character').Character;
  let sqlite: typeof import('./db').sqlite;
  beforeAll(async () => {
    ({ GameSim } = await import('./game/sim'));
    ({ WorldState } = await import('./state'));
    ({ Character } = await import('./game/character'));
    ({ sqlite } = await import('./db'));
  });

  let n = 0;
  function join(dev: boolean, levelId = 'van_lam') {
    const sent: { type: string; msg: unknown }[] = [];
    const sim = new GameSim(new WorldState(), { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) } as never, {
      levelId,
      roomName: 'test',
      spawn: { x: 2048, z: 2088 },
      respawn: { x: 2048, z: 2088 },
      persistPosition: false,
    });
    const char = Character.create(970_000 + ++n, 'Dbg' + n + (Date.now() % 100000), null, null);
    const client = { sessionId: 's' + n, send: (type: string, msg: unknown) => sent.push({ type, msg }) };
    const p = sim.addPlayer(client as never, char, dev, 'sess', false);
    return { sim, p, char, sent };
  }
  const ledger = (id: number) => sqlite.prepare('SELECT ref, delta, reason FROM ledger WHERE char_id = ? ORDER BY id').all(id) as { ref: string; delta: number; reason: string }[];

  it('?realm=nk15 đặt cấp, hồi đầy, bình cảnh các mốc dưới coi như đã vượt', () => {
    const { sim, p, char } = join(true);
    sim.applyTestFlags(p, { god: false, at: null, realm: 15 });
    expect(char.level).toBe(15);
    expect(char.bk).toBe(10);
    expect(char.hp).toBe(char.mhp);
  });

  it('?at=x,z dịch chuyển tới tọa độ', () => {
    const { sim, p } = join(true);
    sim.applyTestFlags(p, { god: false, at: null, pos: { x: 2300, z: 2400 } });
    expect([p.move.x, p.move.z]).toEqual([2300, 2400]);
  });

  it('?tribulation=1: về Ngưng Khí 15 viên mãn, cấp Trúc Cơ Đan qua sổ cái rồi tiêu đúng một viên, bắt đầu độ kiếp', () => {
    const { sim, p, char } = join(true);
    sim.applyTestFlags(p, { god: false, at: null, trib: true });
    expect(char.level).toBe(15);
    expect(char.bk).toBe(15);
    expect(p.trib).not.toBeNull();
    expect(char.inv.some((it) => it?.id === 'itm_truc_co_dan')).toBe(false);
    const rows = ledger(char.id).filter((r) => r.ref === 'itm_truc_co_dan');
    expect(rows.map((r) => [r.delta, r.reason])).toEqual([[1, 'gm'], [-1, 'tribulation']]);
  });

  it('/gm trib gọi hai lần liền không chồng độ kiếp, không nhân đan', () => {
    const { sim, p, char } = join(true);
    sim.onChat(p, { m: '/gm trib' });
    const trib = p.trib;
    sim.now += 1000;
    sim.onChat(p, { m: '/gm trib' });
    expect(p.trib).toBe(trib);
    expect(ledger(char.id).filter((r) => r.ref === 'itm_truc_co_dan').length).toBe(2);
  });

  it('người chơi thật: /gm realm, /gm trib và cờ kiểm thử đều không đổi gì', () => {
    const { sim, p, char } = join(false);
    const x0 = p.move.x;
    sim.onChat(p, { m: '/gm realm nk15' });
    sim.now += 1000;
    sim.onChat(p, { m: '/gm trib' });
    sim.applyTestFlags(p, { god: true, at: null, realm: 15, trib: true, pos: { x: 100, z: 100 } });
    expect(char.level).toBe(1);
    expect(p.trib).toBeNull();
    expect(p.god).toBe(false);
    expect(p.move.x).toBe(x0);
    expect(ledger(char.id).length).toBe(0);
  });

  it('/gm realm: mã hợp lệ đặt cấp, mã sai giữ nguyên; trong bí cảnh không độ kiếp được', () => {
    const { sim, p, char } = join(true);
    sim.onChat(p, { m: '/gm realm tc2' });
    expect(char.level).toBe(17);
    sim.now += 1000;
    sim.onChat(p, { m: '/gm realm kd1' });
    expect(char.level).toBe(17);
    const dg = join(true, 'kiem_trung');
    dg.sim.onChat(dg.p, { m: '/gm trib' });
    expect(dg.p.trib).toBeNull();
    expect(dg.char.level).toBe(1);
  });
});
