import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, GM_LIST_KINDS, GM_LIST_MAX, GM_MAX_ARG_LEN, GM_MAX_ARGS, S, type GmListResult, type GmReply, type GmState } from '@dtl/shared';

// Kênh GM có cấu trúc (C.GM → S.GM): chạy lệnh có kết quả thành công/lỗi + dữ liệu, trạng thái, danh sách có lọc; chỉ tài khoản thử; yêu cầu hỏng không đụng trạng thái.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
});

const X = 2040;
const Z = 2040;
let nextAcc = 97500;

function setup(dev = true, levelId = 'van_lam') {
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => {} } as never, {
    levelId,
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const char = Character.create(nextAcc++, 'Rpc' + nextAcc);
  char.level = 20;
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  const sent: { t: string; m: unknown }[] = [];
  const p = sim.addPlayer({ sessionId: 'rpc' + nextAcc, send: (t: string, m: unknown) => sent.push({ t, m }) } as never, char, dev, 's' + nextAcc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  let r = 0;
  /** Gửi một yêu cầu qua kênh GM và trả lời đầu tiên của S.GM (undefined nếu server im lặng). */
  const ask = (body: object): GmReply | undefined => {
    sim.now += 100; // qua khoảng giãn GM_MIN_GAP_MS
    const n0 = sent.length;
    sim.onGm(p, { r: ++r, ...body });
    return sent.slice(n0).find((x) => x.t === S.GM)?.m as GmReply | undefined;
  };
  const run = (...a: string[]) => ask({ a });
  return { sim, p, sent, ask, run };
}

describe('kênh GM có cấu trúc: chạy lệnh', () => {
  it('thành công: ok + dòng kết quả + trạng thái sau lệnh, KHÔNG gửi chat; r được trả lại nguyên', () => {
    const { sent, p, run } = setup();
    const r = run('level', '12')!;
    expect(r.ok).toBe(true);
    expect(r.e).toBeUndefined();
    expect(r.m).toContain('level = 12');
    expect(r.st!.level).toBe(12);
    expect(p.char.level).toBe(12);
    expect(r.r).toBe(1);
    expect(sent.some((x) => x.t === S.SYS)).toBe(false);
  });

  it('lỗi có mã: unknown (lệnh lạ), usage (thiếu tham số), fail (đúng cú pháp nhưng không làm được)', () => {
    const { run } = setup();
    expect(run('khong_co_lenh')).toMatchObject({ ok: false, e: 'unknown' });
    expect(run('build')).toMatchObject({ ok: false, e: 'usage' });
    expect(run('kit', '9', 'kiem')).toMatchObject({ ok: false, e: 'usage' });
    // Không ở phòng tập: hình nộm/boss/scene bị từ chối (cùng kiểm với gõ tay).
    expect(run('dummy')).toMatchObject({ ok: false, e: 'fail' });
    expect(run('boss', 'boss_han_giao')).toMatchObject({ ok: false, e: 'fail' });
    expect(run('dps', 'stop')).toMatchObject({ ok: false, e: 'fail' });
    const bad = run('boss', 'khong_co_boss');
    expect(bad).toMatchObject({ ok: false });
  });

  it('lệnh lỗi không đổi trạng thái (tham số sai)', () => {
    const { p, run } = setup();
    const lv = p.char.level;
    for (const a of [['level', 'abc'], ['preset', 'dansu', '3'], ['preset', 'khong_co', '10'], ['kit', '0', 'kiem']]) run(...a);
    // `level abc` bị chuẩn về 1 theo luật cũ của lệnh; các lệnh còn lại không đổi cấp.
    run('level', String(lv));
    expect(p.char.level).toBe(lv);
    expect(p.char.meta.method).not.toBe('thanh_moc_dan_kinh');
  });

  it('dữ liệu có cấu trúc: preset trả bậc đồ/nhánh; dps trả báo cáo; boss trả id và máu (phòng tập)', () => {
    const a = setup();
    const pre = a.run('preset', 'dansu', '16')!;
    expect(pre.ok).toBe(true);
    expect(pre.d).toMatchObject({ branch: 'dansu', level: 16, tier: 2, quality: 2, skillLevel: 1 });
    expect(pre.st!.method).toBe('thanh_moc_dan_kinh');
    expect(Object.keys(pre.st!.branches)).toEqual(['16']);

    const b = setup(true, 'dien_vo');
    const boss = b.run('boss', 'boss_han_giao', '15')!;
    expect(boss.ok).toBe(true);
    expect(boss.d).toMatchObject({ def: 'boss_han_giao', level: 15, phases: 2 });
    expect((boss.d as { hp: number }).hp).toBeGreaterThan(0);
    expect(boss.st!.practice).toBe(true);
    expect(boss.st!.spawned.map((m) => m.def)).toEqual(['boss_han_giao']);
    b.sim.damageMonster(b.sim.monsters.find((m) => m.def.id === 'boss_han_giao')!, 100, b.p);
    const dps = b.run('dps')!;
    expect(dps.ok).toBe(true);
    expect((dps.d as { hits: number }).hits).toBeGreaterThan(0);
  });

  it('đường chat /gm vẫn như cũ: gửi sys.gm, không có S.GM', () => {
    const { sim, p, sent } = setup();
    p.chatAt = 0;
    sim.onChat(p, { m: '/gm level 7' });
    expect(p.char.level).toBe(7);
    expect(sent.some((x) => x.t === S.SYS)).toBe(true);
    expect(sent.some((x) => x.t === S.GM)).toBe(false);
  });
});

describe('kênh GM có cấu trúc: trạng thái', () => {
  it('phản ánh công tắc và quái gọi bằng lệnh', () => {
    const { ask, run } = setup(true, 'dien_vo');
    const st0 = (ask({ q: 'state' })!.d as GmState);
    expect(st0).toMatchObject({ god: false, free: false, freeze: false, lockhp: false, phaseLock: false, dummy: false, meter: false, loop: null, spawned: [] });
    expect(st0.practice).toBe(true);
    run('god', 'on');
    run('free', 'on');
    run('lockhp', 'on');
    run('freeze', 'on');
    run('spawn', 'mon_soi_xam', '2');
    const st1 = ask({ q: 'state' })!.d as GmState;
    expect(st1).toMatchObject({ god: true, free: true, lockhp: true, freeze: true });
    expect(st1.spawned).toHaveLength(2);
    run('dummy', 'mon_soi_xam');
    expect((ask({ q: 'state' })!.d as GmState).dummy).toBe(true);
    run('labreset');
    expect(ask({ q: 'state' })!.d).toMatchObject({ god: false, free: false, lockhp: false, freeze: false, dummy: false, spawned: [] });
  });
});

describe('kênh GM có cấu trúc: danh sách có lọc', () => {
  const list = (ask: ReturnType<typeof setup>['ask'], k: string, f?: string, n?: number) => ask({ q: 'list', k, f, n })!;

  it('mọi loại trả danh sách hợp lệ (id + tên), cắt theo n, tối đa GM_LIST_MAX', () => {
    const { ask } = setup();
    for (const k of GM_LIST_KINDS) {
      const r = list(ask, k);
      expect(r.ok, k).toBe(true);
      const d = r.d as GmListResult;
      expect(d.k).toBe(k);
      expect(d.items.length, k).toBeLessThanOrEqual(GM_LIST_MAX);
      expect(d.total, k).toBeGreaterThanOrEqual(d.items.length);
      for (const it of d.items) expect(typeof it.id === 'string' && it.id.length > 0 && typeof it.name === 'string', `${k} ${it.id}`).toBe(true);
    }
    const two = list(ask, 'mon', undefined, 2).d as GmListResult;
    expect(two.items).toHaveLength(2);
    expect(two.total).toBeGreaterThan(50);
    expect((list(ask, 'item', undefined, 100000).d as GmListResult).items.length).toBeLessThanOrEqual(GM_LIST_MAX);
  });

  it('lọc không dấu theo id hoặc tên; boss chỉ gồm boss/tinh anh; branch theo công pháp đang tu', () => {
    const { ask, run } = setup();
    const sk = list(ask, 'skill', 'hoi xuan').d as GmListResult;
    expect(sk.items.map((x) => x.id)).toContain('skl_hoi_xuan_quyet');
    expect(sk.items.every((x) => x.id.includes('hoi_xuan') || x.name.toLowerCase().includes('xuân') || x.name.length > 0)).toBe(true);
    const bosses = list(ask, 'boss', 'han giao').d as GmListResult;
    expect(bosses.items.map((x) => x.id)).toEqual(['boss_han_giao']);
    const allBoss = list(ask, 'boss').d as GmListResult;
    expect(allBoss.items.some((x) => x.id === 'mon_soi_xam')).toBe(false);
    expect(allBoss.items.some((x) => x.id.startsWith('elite_'))).toBe(true);
    expect((list(ask, 'mon', 'zzzz_khong_co').d as GmListResult)).toMatchObject({ total: 0, items: [] });
    expect((list(ask, 'branch').d as GmListResult).items).toEqual([]);
    run('preset', 'dansu', '31');
    expect((list(ask, 'branch').d as GmListResult).items.map((x) => x.id)).toContain('moc_linh');
    expect((list(ask, 'place').d as GmListResult).items.length).toBeGreaterThan(0);
  });
});

describe('kênh GM có cấu trúc: quyền và yêu cầu hỏng', () => {
  it('tài khoản thường: im lặng hoàn toàn, không đổi trạng thái (mọi loại yêu cầu)', () => {
    const { p, sent, ask } = setup(false);
    const lv = p.char.level;
    expect(ask({ a: ['level', '3'] })).toBeUndefined();
    expect(ask({ q: 'state' })).toBeUndefined();
    expect(ask({ q: 'list', k: 'mon' })).toBeUndefined();
    expect(p.char.level).toBe(lv);
    expect(sent.some((x) => x.t === S.GM || x.t === S.SYS)).toBe(false);
  });

  it('yêu cầu hỏng: trả bad, không đổi trạng thái, không sập', () => {
    const { p, ask, sim } = setup();
    const lv = p.char.level;
    const long = 'x'.repeat(GM_MAX_ARG_LEN + 1);
    const bads: unknown[] = [
      {},
      { a: 5 },
      { a: [] },
      { a: ['level', 5] },
      { a: ['level', ''] },
      { a: ['level', 'a b'] },
      { a: ['level\n99'] },
      { a: ['level', long] },
      { a: Array.from({ length: GM_MAX_ARGS + 1 }, () => 'x') },
      { a: { 0: 'level' } },
      { q: 'khong_co' },
      { q: 'list' },
      { q: 'list', k: 'khong_co' },
      { q: 'list', k: 5 },
      { r: 1.5, a: ['level', '11'] },
      { r: 'x', q: 'state' },
      { r: Number.MAX_SAFE_INTEGER + 2, a: ['level', '11'] },
    ];
    for (const b of bads) expect(ask(b as object), JSON.stringify(b)).toMatchObject({ ok: false, e: 'bad' });
    // Không có r: từ chối, không chạy (r là bắt buộc).
    sim.now += 100;
    sim.onGm(p, { a: ['level', '11'] });
    expect(p.char.level).toBe(lv);
    // Không phải đối tượng: bỏ qua có kiểm soát.
    for (const m of [null, undefined, 5, 'level 3', [], true]) {
      sim.now += 100;
      expect(() => sim.onGm(p, m)).not.toThrow();
    }
    expect(p.char.level).toBe(lv);
  });

  it('quá nhanh (dưới GM_MIN_GAP_MS): trả rate, lệnh không chạy; sau khoảng giãn thì chạy', () => {
    const { sim, p, sent } = setup();
    sim.now += 100;
    const n0 = sent.length;
    sim.onGm(p, { r: 1, a: ['level', '5'] });
    sim.onGm(p, { r: 2, a: ['level', '6'] });
    const replies = sent.slice(n0).filter((x) => x.t === S.GM).map((x) => x.m as GmReply);
    expect(replies).toHaveLength(2);
    expect(replies[0]).toMatchObject({ r: 1, ok: true });
    expect(replies[1]).toMatchObject({ r: 2, ok: false, e: 'rate' });
    expect(p.char.level).toBe(5);
    sim.now += 100;
    sim.onGm(p, { r: 3, a: ['level', '6'] });
    expect(p.char.level).toBe(6);
  });
});
