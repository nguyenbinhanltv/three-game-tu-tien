import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, MAX_LEVEL, S } from '@dtl/shared';
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
    expect(ok('tc4')).toBe(19);
    expect(ok('kd1')).toBe(20);
    expect(ok('na4')).toBe(27);
    expect(ok('ht')).toBe(28);
    expect(ok('28')).toBe(28);
    for (const bad of [
      'nk16',
      'nk0',
      'tc5',
      'kd5',
      'ht5',
      'ab5',
      'dt2',
      '45',
      '0',
      -1,
      1.5,
      'a'.repeat(50),
      { level: 15 },
      ['nk15'],
      '__proto__',
    ])
      expect(ok(bad), String(bad)).toBe('bad_realm');
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
  const ledger = (id: number) =>
    sqlite.prepare('SELECT ref, delta, reason FROM ledger WHERE char_id = ? ORDER BY id').all(id) as {
      ref: string;
      delta: number;
      reason: string;
    }[];

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
    expect(rows.map((r) => [r.delta, r.reason])).toEqual([
      [1, 'gm'],
      [-1, 'tribulation'],
    ]);
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
    expect(char.level).toBe(20);
    sim.now += 1000;
    sim.onChat(p, { m: '/gm realm kd9' });
    expect(char.level).toBe(20);
    const dg = join(true, 'kiem_trung');
    dg.sim.onChat(dg.p, { m: '/gm trib' });
    expect(dg.p.trib).toBeNull();
    expect(dg.char.level).toBe(1);
  });
});

// GM-TEST: lệnh thử đồ/kỹ năng/trang phục/quái chỉ chạy với tài khoản thử; mọi thay đổi vật phẩm đi qua tx + sổ cái.
describe('lệnh GM thử đồ: help, skills, learn, kit, outfit, weapon, find, spawn, bag', () => {
  let GameSim: typeof import('./game/sim').GameSim;
  let WorldState: typeof import('./state').WorldState;
  let Character: typeof import('./game/character').Character;
  let sqlite: typeof import('./db').sqlite;
  let SYS: string;
  let content: typeof import('@dtl/content');
  let tools: typeof import('./game/gm/tools');
  beforeAll(async () => {
    ({ GameSim } = await import('./game/sim'));
    ({ WorldState } = await import('./state'));
    ({ Character } = await import('./game/character'));
    ({ sqlite } = await import('./db'));
    SYS = (await import('@dtl/shared')).S.SYS;
    content = await import('@dtl/content');
    tools = await import('./game/gm/tools');
  });

  let n = 0;
  function join(dev: boolean) {
    const sent: { type: string; msg: unknown }[] = [];
    const sim = new GameSim(new WorldState(), { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) } as never, {
      levelId: 'van_lam',
      roomName: 'test',
      spawn: { x: 2048, z: 2088 },
      respawn: { x: 2048, z: 2088 },
      persistPosition: false,
    });
    const char = Character.create(980_000 + ++n, 'Gm' + n + (Date.now() % 100000), null, null);
    const client = { sessionId: 'g' + n, send: (type: string, msg: unknown) => sent.push({ type, msg }) };
    const p = sim.addPlayer(client as never, char, dev, 'sess', false);
    const run = (cmd: string): string => {
      sent.length = 0;
      sim.now += 1000;
      sim.onChat(p, { m: '/gm ' + cmd });
      (sim as unknown as { syncPublic(q: unknown): void }).syncPublic(p);
      return sent
        .filter((m) => m.type === SYS)
        .map((m) => (m.msg as { p?: Record<string, string> }).p?.m ?? '')
        .join('\n');
    };
    return { sim, p, char, run };
  }

  /** Sổ cái khớp túi + trang bị: tổng delta theo id vật phẩm bằng số đang có. */
  function ledgerBalanced(char: InstanceType<typeof Character>): void {
    const have = new Map<string, number>();
    for (const it of char.inv) if (it) have.set(it.id, (have.get(it.id) ?? 0) + it.n);
    for (const it of Object.values(char.equip)) if (it) have.set(it.id, (have.get(it.id) ?? 0) + (it.n || 1));
    const sums = new Map<string, number>();
    for (const r of sqlite.prepare("SELECT ref, delta FROM ledger WHERE char_id = ? AND kind = 'item'").all(char.id) as {
      ref: string;
      delta: number;
    }[])
      sums.set(r.ref, (sums.get(r.ref) ?? 0) + r.delta);
    for (const id of new Set([...have.keys(), ...sums.keys()])) expect(sums.get(id) ?? 0, id).toBe(have.get(id) ?? 0);
  }

  it('tài khoản thường: mọi lệnh mới bị từ chối, không đổi gì, sổ cái trống', () => {
    const { sim, p, char, run } = join(false);
    const monsters0 = sim.monsters.length;
    for (const cmd of [
      'help',
      'skills all',
      'skills max',
      'learn skl_kiem_khi_tram 5',
      'kit 2 kiem +10 f',
      'outfit set_liet_mach f',
      'outfit off',
      'weapon itm_liet_mach_kiem +10',
      'find kiem',
      'spawn boss_han_giao 3',
      'spawn clear',
      'bag clear',
      'bag sort',
    ]) {
      expect(run(cmd), cmd).toBe('');
    }
    expect(char.level).toBe(1);
    expect(char.equip.weapon).toBeUndefined();
    expect(char.meta.method).toBeUndefined();
    expect(p.s.g).toBe(char.appearance.g);
    expect(sim.monsters.length).toBe(monsters0);
    expect(sqlite.prepare('SELECT COUNT(*) c FROM ledger WHERE char_id = ?').get(char.id)).toEqual({ c: 0 });
  });

  it('help liệt kê mọi lệnh, help <lệnh> cho cú pháp và ví dụ', () => {
    const { run } = join(true);
    const all = run('help');
    for (const cmd of tools.GM_COMMANDS) expect(all, cmd).toContain('/gm ' + cmd);
    expect(run('help kit')).toContain('VD: /gm kit 2 kiem +10');
    expect(run('help khong_co')).toContain('khong_co');
    for (const cmd of tools.GM_COMMANDS) expect(content.hasString('gm.cmd.' + cmd), cmd).toBe(true);
  });

  it('skills all/max/list và learn', () => {
    const { p, char, run } = join(true);
    expect(run('skills list')).toContain('skl_phi_kiem');
    run('skills all');
    expect(char.level).toBe(MAX_LEVEL);
    expect(p.mth.dirty).toBe(true);
    const c2 = join(true);
    expect(c2.run('learn skl_kiem_khi_tram 3')).toContain('cấp 3');
    expect(c2.run('learn khong_co')).toContain('khong_co');
    // E4-G mở hết chiêu: khóa tạm một chiêu để kiểm lệnh `learn` với chiêu còn khóa.
    const locked = content.SKILL.get('skl_phan_anh_kiem_anh')!;
    locked.locked = true;
    const c3 = join(true);
    expect(c3.run(`learn ${locked.id}`)).toContain('khóa');
    locked.locked = false;
    expect(c3.char.level).toBeGreaterThanOrEqual(locked.unlock);
    expect(c3.char.meta.method).toBe(locked.method);
  });

  it('kit bậc 2 kiếm tu +10 nữ: đủ ô, Thiên phẩm, +10, sổ cái khớp', () => {
    const { p, char, run } = join(true);
    expect(run('kit 2 kiem +10 f')).toContain('bậc 2');
    expect(p.s.g).toBe('f');
    expect(char.meta.method).toBe('lac_kiem_quyet');
    expect(char.equip.weapon?.id).toBe('itm_liet_mach_kiem');
    expect(char.equip.head?.id).toBe('itm_lm_trang_suc');
    expect(char.equip.robe?.id).toBe('itm_lm_dao_bao');
    for (const slot of ['weapon', 'robe', 'bracer', 'boots', 'belt', 'jade', 'ring', 'head'] as const) {
      expect(char.equip[slot], slot).toBeTruthy();
      expect(char.equip[slot]?.plus, slot).toBe(10);
      expect(char.equip[slot]?.inst?.q, slot).toBe(4);
    }
    expect(char.equip.artifact).toBeTruthy();
    expect(p.s.sk).toBe('set_liet_mach');
    expect(char.level).toBeGreaterThanOrEqual(16);
    ledgerBalanced(char);
    run('kit 1 hophap');
    expect(char.meta.method).toBe('bat_dong_kim_than');
    expect(char.equip.weapon?.plus).toBeUndefined();
    ledgerBalanced(char);
  });

  it('kit: tham số sai không đổi gì; bậc 4 dùng bộ bậc 4 (Tinh Khuyết Kiếm chung)', () => {
    const { char, run } = join(true);
    for (const bad of ['kit', 'kit 0 kiem', 'kit 6 kiem', 'kit 2 xyz', 'kit 2 kiem +abc']) {
      expect(run(bad), bad).toContain('/gm kit');
      expect(char.equip.weapon, bad).toBeUndefined();
    }
    expect(run('kit 4 dansu')).not.toContain('cao nhất');
    expect(char.equip.weapon?.id).toBe('itm_tinh_khuyet_kiem');
    expect(char.equip.robe?.id).toBe('itm_tt_dao_bao');
    expect(char.equip.head?.id).toBe('itm_tt_trang_suc');
    run('kit 4 kiem');
    expect(char.equip.weapon?.id).toBe('itm_tinh_khuyet_kiem');
    expect(char.equip.robe?.id).toBe('itm_tk_dao_bao');
    run('kit 4 hophap');
    expect(char.equip.weapon?.id).toBe('itm_tinh_khuyet_kiem');
    expect(char.equip.robe?.id).toBe('itm_ct_dao_bao');
    run('kit 5 dansu');
    expect(char.equip.weapon?.id).toBe('itm_gioi_quang_kiem');
    expect(char.equip.robe?.id).toBe('itm_tqd_dao_bao');
    expect(char.equip.head?.id).toBe('itm_tqd_trang_suc');
    ledgerBalanced(char);
  });

  it('mọi bậc × nhánh dựng được kế hoạch hợp lệ (id có thật, đúng ô, không trùng ô)', () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (const br of tools.GM_BRANCHES) {
        const plan = tools.planKit(tier, br);
        expect(
          plan.pieces.map((x) => x.slot),
          `${tier}/${br}`,
        ).toContain('weapon');
        for (const x of plan.pieces) expect(content.ITEM.get(x.id)?.kind, x.id).toBe(x.slot);
        expect(new Set(plan.pieces.map((x) => x.slot)).size).toBe(plan.pieces.length);
      }
    }
  });

  it('outfit list / mặc bộ / off, bộ chưa có vật phẩm bị báo', () => {
    const { p, char, run } = join(true);
    const list = run('outfit list');
    expect(list).toContain('set_liet_mach');
    expect(list).toContain('set_tinh_khuyet');
    expect(run('outfit set_tinh_khuyet')).toContain('Đã mặc');
    expect(p.s.sk).toBe('set_tinh_khuyet');
    expect(run('outfit khong_co')).toContain('khong_co');
    expect(run('outfit set_liet_mach f')).toContain('Đã mặc');
    expect(p.s.sk).toBe('set_liet_mach');
    expect(p.s.g).toBe('f');
    ledgerBalanced(char);
    run('outfit off');
    expect(char.equip.robe).toBeUndefined();
    ledgerBalanced(char);
  });

  it('weapon list / lấy kiếm +N / id lạ', () => {
    const { p, char, run } = join(true);
    expect(run('weapon list')).toContain('itm_liet_mach_kiem');
    expect(run('weapon itm_liet_mach_kiem +10')).toContain('+10');
    expect(char.equip.weapon?.id).toBe('itm_liet_mach_kiem');
    expect(char.equip.weapon?.plus).toBe(10);
    ledgerBalanced(char);
    expect(p.s.wp).toBeDefined();
    expect(run('weapon itm_bo_y')).toContain('itm_bo_y');
    expect(char.equip.weapon?.id).toBe('itm_liet_mach_kiem');
    run('weapon itm_moc_kiem');
    expect(char.equip.weapon?.id).toBe('itm_moc_kiem');
    expect(char.equip.weapon?.plus).toBeUndefined();
    ledgerBalanced(char);
  });

  it('find tìm theo id hoặc tên bỏ dấu; từ khóa ngắn thì không trả gì', () => {
    const { run } = join(true);
    expect(run('find liet mach')).toContain('itm_liet_mach_kiem');
    expect(run('find Lạc Kiếm')).toContain('set_lac_kiem');
    expect(run('find a')).toContain('2 ký tự');
    expect(run('find zzzzzz')).toContain('Không thấy');
  });

  it('spawn: n ≤ 20, spawn clear dọn đúng quái đã gọi', () => {
    const { sim, run } = join(true);
    const before = sim.monsters.length;
    run('spawn boss_han_giao 99');
    expect(sim.monsters.length).toBe(before + 20);
    expect(run('spawn khong_co')).toContain('khong_co');
    expect(run('spawn clear')).toContain('20');
    expect(sim.monsters.length).toBe(before);
  });

  it('bag clear: ghi sổ cái, bỏ ô khóa; bag sort giữ nguyên số lượng', () => {
    const { char, run } = join(true);
    run('give itm_pha_canh_dan 3');
    run('give itm_truc_co_dan 2');
    char.inv.find((s) => s?.id === 'itm_truc_co_dan')!.lk = true;
    run('bag sort');
    expect(char.inv.filter((s) => s?.id === 'itm_pha_canh_dan').reduce((a, s) => a + s!.n, 0)).toBe(3);
    run('bag clear');
    expect(char.inv.filter(Boolean).map((s) => s!.id)).toEqual(['itm_truc_co_dan']);
    ledgerBalanced(char);
  });
});
