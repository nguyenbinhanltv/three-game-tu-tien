import { beforeAll, describe, expect, it } from 'vitest';
import { branchResetCost, groundAt, S, type MethodMsg, type SysMsg } from '@dtl/shared';

// VS-2d: nhánh công pháp. Chọn/reset ghi DB trong một giao dịch có khóa chống trùng và dòng ledger; server chặn chiêu theo nhánh.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let sqlite: typeof import('../db').sqlite;
let MONSTER: typeof import('@dtl/content').MONSTER;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ sqlite } = await import('../db'));
  ({ MONSTER } = await import('@dtl/content'));
});

const X = 2040;
const Z = 2040;
let nextAcc = 12_000;

function setup() {
  const sent: { type: string; msg: unknown }[] = [];
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const join = (method: string, level: number): Ent => {
    const char = Character.create(nextAcc++, 'br' + nextAcc);
    char.level = level;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const p = sim.addPlayer(
      { sessionId: 'c' + nextAcc, send: (type: string, msg: unknown) => sent.push({ type, msg }) } as never,
      char,
      true,
      's' + nextAcc,
    );
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    sim.onMethod(p, { method });
    p.lastCombatAt = 0;
    return p;
  };
  const mon = () => {
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 10, X + 5, Z, null);
    m.s.hp = m.s.mhp = 50_000_000;
    return m;
  };
  /** Bấm chiêu rồi xả đòn chờ ngay. */
  const use = (p: Ent, id: string, t?: string) => {
    p.gcdAt = 0;
    p.cds.clear();
    p.char.mp = p.char.mmp;
    p.skillCount = 0;
    p.warnAt = 0;
    sim.onSkill(p, { id, t });
    const st = p.flow.pending;
    if (st) {
      st.at = sim.now;
      (sim as unknown as { resolvePending(p: Ent): void }).resolvePending(p);
    }
    p.lastCombatAt = 0;
  };
  const warns = () => sent.filter((s) => s.type === S.SYS).map((s) => (s.msg as SysMsg).k);
  const live = (p: Ent) => (sim as unknown as { combat: { liveRes(p: Ent): number } }).combat.liveRes(p);
  return { sim, sent, join, mon, use, warns, live };
}

const rows = (charId: number) =>
  sqlite.prepare('SELECT method, tier, branch FROM branches WHERE char_id = ? ORDER BY tier').all(charId) as {
    method: string;
    tier: number;
    branch: string;
  }[];
const ledger = (charId: number) =>
  sqlite.prepare("SELECT kind, delta, reason, idem FROM ledger WHERE char_id = ? AND reason LIKE 'branch:%' ORDER BY id").all(charId) as {
    kind: string;
    delta: number;
    reason: string;
    idem: string | null;
  }[];

describe('chọn nhánh', () => {
  it('chọn nhánh mốc 16: ghi bảng branches + một dòng ledger có khóa; gửi lại cùng khóa không ghi thêm', () => {
    const { sim, join } = setup();
    const p = join('lac_kiem_quyet', 16);
    sim.onBranch(p, { a: 'pick', tier: 16, id: 'pha_mach', r: 'pick-0001' });
    expect(p.char.branches.lac_kiem_quyet).toEqual({ 16: 'pha_mach' });
    expect(rows(p.char.id)).toEqual([{ method: 'lac_kiem_quyet', tier: 16, branch: 'pha_mach' }]);
    const lg = ledger(p.char.id);
    expect(lg).toHaveLength(1);
    expect(lg[0]).toMatchObject({ kind: 'noop', delta: 0, reason: 'branch:pick:lac_kiem_quyet:16:pha_mach' });
    expect(lg[0]!.idem).toBe(`${p.char.id}:pick-0001`);
    sim.onBranch(p, { a: 'pick', tier: 16, id: 'pha_mach', r: 'pick-0001' });
    expect(ledger(p.char.id)).toHaveLength(1);
  });
  it('mốc đã chọn không đổi được nếu chưa reset; chưa đủ cảnh giới, nhánh lạ, thiếu khóa đều bị từ chối', () => {
    const { sim, join, warns } = setup();
    const p = join('lac_kiem_quyet', 16);
    for (const bad of [
      null,
      {},
      { a: 'pick', tier: 16, id: 'pha_mach' },
      { a: 'pick', tier: 16, id: 'pha_mach', r: 'x' },
      { a: 'pick', tier: 20, id: 'ngu_kiem', r: 'bad-0001' },
      { a: 'pick', tier: 16, id: 'chan_dia', r: 'bad-0002' },
      { a: 'pick', tier: '16', id: 'pha_mach', r: 'bad-0003' },
      { a: 'pick', tier: 16, id: '__proto__', r: 'bad-0004' },
      { a: 'pick', tier: Number.NaN, id: 'pha_mach', r: 'bad-0005' },
      { a: 'xoa', r: 'bad-0006' },
    ]) {
      p.warnAt = 0;
      sim.onBranch(p, bad);
    }
    expect(p.char.branches.lac_kiem_quyet).toBeUndefined();
    expect(rows(p.char.id)).toEqual([]);
    expect(warns()).toEqual(expect.arrayContaining(['sys.branch_level', 'sys.branch_branch', 'sys.branch_tier']));
    sim.onBranch(p, { a: 'pick', tier: 16, id: 'pha_mach', r: 'ok-00001' });
    p.warnAt = 0;
    sim.onBranch(p, { a: 'pick', tier: 16, id: 'tam_diep', r: 'ok-00002' });
    expect(p.char.branches.lac_kiem_quyet).toEqual({ 16: 'pha_mach' });
    expect(warns()).toContain('sys.branch_taken');
  });
  it('đang giao chiến hoặc chưa có công pháp thì không chọn được', () => {
    const { sim, join, warns } = setup();
    const p = join('lac_kiem_quyet', 16);
    p.lastCombatAt = sim.now;
    sim.onBranch(p, { a: 'pick', tier: 16, id: 'pha_mach', r: 'cb-00001' });
    expect(p.char.branches.lac_kiem_quyet).toBeUndefined();
    expect(warns()).toContain('sys.branch_combat');
    const q = join('', 16);
    q.warnAt = 0;
    sim.onBranch(q, { a: 'pick', tier: 16, id: 'pha_mach', r: 'cb-00002' });
    expect(Object.keys(q.char.branches)).toHaveLength(0);
  });
  it('nhánh còn nguyên sau khi nạp lại nhân vật từ DB; dòng lạ trong DB bị bỏ khi đọc', () => {
    const { sim, join } = setup();
    const p = join('bat_dong_kim_than', 20);
    sim.onBranch(p, { a: 'pick', tier: 16, id: 'kim_chung', r: 'ld-00001' });
    sim.onBranch(p, { a: 'pick', tier: 20, id: 'dich_son', r: 'ld-00002' });
    p.char.save();
    sqlite
      .prepare("INSERT INTO branches (char_id, method, tier, branch, at) VALUES (?, 'bat_dong_kim_than', 24, 'khong_co', 0)")
      .run(p.char.id);
    sqlite.prepare("INSERT INTO branches (char_id, method, tier, branch, at) VALUES (?, 'cong_phap_la', 16, 'x', 0)").run(p.char.id);
    const again = Character.load(p.char.id)!;
    expect(again.branches).toEqual({ bat_dong_kim_than: { 16: 'kim_chung', 20: 'dich_son' } });
  });
});

describe('reset nhánh', () => {
  it('tốn linh thạch theo cảnh giới, xóa mọi nhánh của công pháp đang tu, ghi ledger; có giãn cách', () => {
    const { sim, join, warns } = setup();
    const p = join('lac_kiem_quyet', 20);
    sim.onBranch(p, { a: 'pick', tier: 16, id: 'pha_mach', r: 'rs-00001' });
    sim.onBranch(p, { a: 'pick', tier: 20, id: 'ngu_kiem', r: 'rs-00002' });
    const cost = branchResetCost(20);
    // Thiếu linh thạch: không đổi gì.
    p.char.gold = cost - 1;
    sim.onBranch(p, { a: 'reset', r: 'rs-00003' });
    expect(Object.keys(p.char.branches.lac_kiem_quyet ?? {})).toHaveLength(2);
    expect(warns()).toContain('sys.not_enough_gold');
    p.char.gold = cost + 50;
    sim.onBranch(p, { a: 'reset', r: 'rs-00004' });
    expect(p.char.gold).toBe(50);
    expect(p.char.branches.lac_kiem_quyet).toBeUndefined();
    expect(rows(p.char.id)).toEqual([]);
    const last = ledger(p.char.id).at(-1)!;
    expect(last).toMatchObject({ kind: 'gold', delta: -cost, reason: 'branch:reset:lac_kiem_quyet' });
    // Gửi lại cùng khóa: không trừ thêm.
    sim.onBranch(p, { a: 'reset', r: 'rs-00004' });
    expect(p.char.gold).toBe(50);
    // Chọn lại miễn phí, rồi reset tiếp ngay thì bị giãn cách chặn.
    sim.onBranch(p, { a: 'pick', tier: 16, id: 'tam_diep', r: 'rs-00005' });
    expect(p.char.branches.lac_kiem_quyet).toEqual({ 16: 'tam_diep' });
    p.char.gold = 10_000;
    p.warnAt = 0;
    sim.onBranch(p, { a: 'reset', r: 'rs-00006' });
    expect(p.char.gold).toBe(10_000);
    expect(warns()).toContain('sys.branch_cd');
  });
  it('chưa chọn nhánh nào thì reset không tốn gì; đổi công pháp không làm mất nhánh của công pháp cũ', () => {
    const { sim, join, warns } = setup();
    const p = join('lac_kiem_quyet', 16);
    p.char.gold = 5000;
    sim.onBranch(p, { a: 'reset', r: 'no-00001' });
    expect(p.char.gold).toBe(5000);
    expect(warns()).toContain('sys.branch_none');
    sim.onBranch(p, { a: 'pick', tier: 16, id: 'pha_mach', r: 'no-00002' });
    p.char.meta.method = 'bat_dong_kim_than';
    sim.onBranch(p, { a: 'pick', tier: 16, id: 'chan_dia', r: 'no-00003' });
    expect(p.char.branches).toEqual({ lac_kiem_quyet: { 16: 'pha_mach' }, bat_dong_kim_than: { 16: 'chan_dia' } });
  });
});

describe('server chặn chiêu theo nhánh', () => {
  it('chưa chọn nhánh: chiêu của mốc đó không ra; chọn rồi thì ra, chiêu nhánh kia thì không', () => {
    const { sim, join, mon, use, warns } = setup();
    const p = join('lac_kiem_quyet', 16);
    const m = mon();
    use(p, 'skl_hoanh_kiem_pha_mach', m.id);
    expect(p.cds.has('skl_hoanh_kiem_pha_mach')).toBe(false);
    expect(m.s.hp).toBe(m.s.mhp);
    expect(warns()).toContain('sys.branch_needed');
    sim.onBranch(p, { a: 'pick', tier: 16, id: 'pha_mach', r: 'gt-00001' });
    use(p, 'skl_hoanh_kiem_pha_mach', m.id);
    expect(m.s.hp).toBeLessThan(m.s.mhp);
    const hp = m.s.hp;
    use(p, 'skl_kiem_vu_tam_diep', m.id);
    expect(m.s.hp).toBe(hp);
    expect(warns()).toContain('sys.branch_other');
  });
  it('chiêu lướt thuộc nhánh (Nghịch Kiếm Chuyển Phong) cũng bị chặn khi chọn nhánh kia', () => {
    const { sim, join, mon, use } = setup();
    const p = join('lac_kiem_quyet', 20);
    mon();
    sim.onBranch(p, { a: 'pick', tier: 20, id: 'ngu_kiem', r: 'ds-00001' });
    const x0 = p.move.x;
    use(p, 'skl_nghich_kiem_chuyen_phong');
    expect(p.move.x).toBe(x0);
    expect(p.cds.has('skl_nghich_kiem_chuyen_phong')).toBe(false);
  });
  it('chiêu chung và chiêu đặc trưng không bị nhánh chặn', () => {
    const { join, mon, use } = setup();
    const p = join('lac_kiem_quyet', 28);
    const m = mon();
    use(p, 'skl_kiem_khi_tram', m.id);
    use(p, 'skl_phi_kiem_truy_hon', m.id);
    expect(p.cds.has('skl_phi_kiem_truy_hon')).toBe(true);
  });
});

describe('luật riêng của nhánh mốc 28', () => {
  it('Vạn Kiếm: Kiếm ý tối đa 7 ô; Nhất Kiếm: xả giữ lại 2 ô', () => {
    const a = setup();
    const p = a.join('lac_kiem_quyet', 28);
    const m = a.mon();
    a.sim.onBranch(p, { a: 'pick', tier: 28, id: 'van_kiem', r: 'md-00001' });
    for (let i = 0; i < 9; i++) a.use(p, 'skl_phi_kiem', m.id);
    expect(a.live(p)).toBe(7);
    const msg = a.sent.filter((s) => s.type === S.METHOD).at(-1)?.msg as MethodMsg | undefined;
    p.mth.dirty = true;
    p.mth.sentAt = 0;
    a.sim.tick(50);
    const last = a.sent.filter((s) => s.type === S.METHOD).at(-1)!.msg as MethodMsg;
    expect(last.br).toEqual({ 28: 'van_kiem' });
    expect(last.resMods).toEqual({ max: 2 });
    expect(msg === undefined || typeof msg.res === 'number').toBe(true);

    const b = setup();
    const q = b.join('lac_kiem_quyet', 28);
    const m2 = b.mon();
    b.sim.onBranch(q, { a: 'pick', tier: 28, id: 'nhat_kiem', r: 'md-00002' });
    for (let i = 0; i < 6; i++) b.use(q, 'skl_phi_kiem', m2.id);
    expect(b.live(q)).toBe(5);
    b.use(q, 'skl_loi_dinh_nhat_kiem', m2.id);
    (b.sim as unknown as { finishCast(p: Ent): void }).finishCast(q);
    expect(b.live(q)).toBe(2);
  });
  it('Bất Động: Huyết khí không rụng; Kim Cương: tích nhanh hơn 30%', () => {
    const a = setup();
    const p = a.join('bat_dong_kim_than', 28);
    a.sim.onBranch(p, { a: 'pick', tier: 28, id: 'bat_dong', r: 'md-00003' });
    p.char.hp = p.char.mhp = 10_000;
    a.sim.damagePlayer(p, 1000, 'mon_x');
    expect(a.live(p)).toBeCloseTo(25);
    a.sim.now += 60_000;
    expect(a.live(p)).toBeCloseTo(25);

    const b = setup();
    const q = b.join('bat_dong_kim_than', 28);
    b.sim.onBranch(q, { a: 'pick', tier: 28, id: 'kim_cuong', r: 'md-00004' });
    q.char.hp = q.char.mhp = 10_000;
    b.sim.damagePlayer(q, 1000, 'mon_x');
    expect(b.live(q)).toBeCloseTo(32.5);
  });
  it('reset không làm mới hồi chiêu của chiêu thuộc nhánh (không mua được lượt dùng lại bằng linh thạch)', () => {
    const { sim, join } = setup();
    const p = join('lac_kiem_quyet', 28);
    sim.onBranch(p, { a: 'pick', tier: 28, id: 'van_kiem', r: 'cd-00001' });
    const until = sim.now + 55_000;
    p.cds.set('skl_thien_kiem_hoa_hinh', until);
    p.char.gold = 100_000;
    sim.onBranch(p, { a: 'reset', r: 'cd-00002' });
    expect(p.char.branches.lac_kiem_quyet).toBeUndefined();
    sim.onBranch(p, { a: 'pick', tier: 28, id: 'van_kiem', r: 'cd-00003' });
    expect(p.cds.get('skl_thien_kiem_hoa_hinh')).toBe(until);
  });
  it('reset: tài nguyên vượt trần cũ bị kẹp về trần gốc', () => {
    const { sim, join, mon, use, live } = setup();
    const p = join('lac_kiem_quyet', 28);
    const m = mon();
    sim.onBranch(p, { a: 'pick', tier: 28, id: 'van_kiem', r: 'cl-00001' });
    for (let i = 0; i < 8; i++) use(p, 'skl_phi_kiem', m.id);
    expect(live(p)).toBe(7);
    p.char.gold = 100_000;
    p.lastCombatAt = 0;
    sim.onBranch(p, { a: 'reset', r: 'cl-00002' });
    expect(live(p)).toBe(5);
  });
});
