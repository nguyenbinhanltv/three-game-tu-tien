import { beforeAll, describe, expect, it } from 'vitest';
import { CHARGE_MAX, groundAt, MS_CHASE, MS_DEAD, PF_DEAD, S, skillUpgradeCost, type MethodMsg } from '@dtl/shared';

// Công pháp (Phase 3-5): server quyết định cấp chiêu, biến thức, sạc, khiêu khích, giữ.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let sqlite: typeof import('../db').sqlite;
let MONSTER: typeof import('@dtl/content').MONSTER;
let QUEST: typeof import('@dtl/content').QUEST;
let SKILL: typeof import('@dtl/content').SKILL;
let VARIANTS: typeof import('@dtl/content').VARIANTS;
let lootOf: typeof import('@dtl/content/loot').lootOf;
let NPC: typeof import('@dtl/content').NPC;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ sqlite } = await import('../db'));
  ({ MONSTER, NPC, QUEST, SKILL, VARIANTS } = await import('@dtl/content'));
  ({ lootOf } = await import('@dtl/content/loot'));
});

const X = 2040;
const Z = 2040;
let nextAcc = 1000;
const SCROLL = 'itm_bi_tich_tan_quyen';

interface Sent {
  type: string;
  msg: unknown;
}

function setup(level = 8) {
  const sent: Sent[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const sim: Sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  // K-2: chiêu không niệm áp tại `hitAt`. Các test cũ kiểm hiệu quả của chiêu nên "xả" đòn chờ ngay lúc bấm;
  // test về độ trễ gọi `sim.onSkillRaw` (bản gốc).
  const raw = sim.onSkill.bind(sim);
  (sim as unknown as { onSkillRaw: typeof raw }).onSkillRaw = raw;
  sim.onSkill = (pl: Ent, msg: unknown) => {
    raw(pl, msg);
    const st = pl.flow.pending;
    if (st) {
      st.at = sim.now;
      (sim as unknown as { resolvePending(p: Ent): void }).resolvePending(pl);
    }
  };
  const join = (name: string, lv = level): Ent => {
    const char = Character.create(nextAcc++, name + nextAcc);
    char.level = lv;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const client = {
      sessionId: name + nextAcc,
      send: (type: string, msg: unknown) => sent.push({ type, msg: { to: name, ...(msg as object) } }),
    };
    const p = sim.addPlayer(client as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    return p;
  };
  const p = join('a');
  const mon = (x = X + 6, z = Z) => {
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 10, x, z, null);
    m.s.hp = m.s.mhp = 1_000_000;
    return m;
  };
  /** Cho phép ra chiêu tiếp (bỏ GCD, hồi chiêu) để thử nhiều chiêu liên tiếp. */
  const fresh = (e: Ent) => {
    e.gcdAt = 0;
    e.cds.clear();
    e.flow.lastDashAt = -1e9;
    e.char.mp = e.char.mmp;
    e.lastCombatAt = 0;
    // Đồng hồ sim đứng yên nên giới hạn lệnh chiêu mỗi giây (SKILL_MSG_PER_SEC) cộng dồn qua cả vòng thử.
    e.skillCount = 0;
  };
  return { sim, sent, p, join, mon, fresh };
}

const ledgerOf = (charId: number) =>
  sqlite.prepare("SELECT kind, ref, delta, reason, idem FROM ledger WHERE char_id = ? AND reason LIKE 'skillup:%'").all(charId) as {
    kind: string;
    ref: string;
    delta: number;
    reason: string;
  }[];

describe('chọn và đổi công pháp', () => {
  it('chưa tới Ngưng Khí 5 thì không chọn được; tới rồi thì chọn ở đâu cũng được', () => {
    const { sim, p } = setup(4);
    sim.onMethod(p, { method: 'lac_kiem_quyet' });
    expect(p.char.meta.method).toBeUndefined();
    p.char.level = 5;
    p.move.x = 100;
    sim.onMethod(p, { method: 'lac_kiem_quyet' });
    expect(p.char.meta.method).toBe('lac_kiem_quyet');
  });
  it('id lạ, kiểu lạ bị bỏ qua', () => {
    const { sim, p } = setup();
    for (const m of [null, 5, {}, { method: 7 }, { method: 'khong_co' }, { method: '__proto__' }]) sim.onMethod(p, m);
    expect(p.char.meta.method).toBeUndefined();
  });
  it('đổi công pháp phải ở chỗ Lạc Vân, tốn linh thạch có ledger, có chờ', () => {
    const { sim, p } = setup();
    sim.onMethod(p, { method: 'lac_kiem_quyet' });
    p.lastCombatAt = 0;
    p.move.x = 100; // xa NPC
    p.char.gold = 5000;
    sim.onMethod(p, { method: 'bat_dong_kim_than', r: 'sw-000001' });
    expect(p.char.meta.method).toBe('lac_kiem_quyet');
    const npc = NPC.get('npc_chuong_mon')!;
    p.move.x = npc.x;
    p.move.z = npc.z;
    // còn trong thời gian chờ
    sim.onMethod(p, { method: 'bat_dong_kim_than', r: 'sw-000001' });
    expect(p.char.meta.method).toBe('lac_kiem_quyet');
    p.char.meta.methodAt = 0;
    const gold = p.char.gold;
    sim.onMethod(p, { method: 'bat_dong_kim_than', r: 'sw-000001' });
    expect(p.char.meta.method).toBe('bat_dong_kim_than');
    expect(p.char.gold).toBeLessThan(gold);
    const rows = sqlite.prepare("SELECT kind, delta FROM ledger WHERE char_id = ? AND reason = 'method:switch'").all(p.char.id) as {
      kind: string;
      delta: number;
    }[];
    expect(rows).toEqual([{ kind: 'gold', delta: p.char.gold - gold }]);
  });
  it('không đổi khi đang giao chiến, thiếu tiền thì không đổi', () => {
    const { sim, p } = setup();
    sim.onMethod(p, { method: 'lac_kiem_quyet' });
    const npc = NPC.get('npc_chuong_mon')!;
    p.move.x = npc.x;
    p.move.z = npc.z;
    p.char.meta.methodAt = 0;
    p.char.gold = 0;
    p.lastCombatAt = 0;
    sim.onMethod(p, { method: 'bat_dong_kim_than', r: 'sw-000002' });
    expect(p.char.meta.method).toBe('lac_kiem_quyet');
    p.char.gold = 5000;
    p.lastCombatAt = sim.now;
    sim.onMethod(p, { method: 'bat_dong_kim_than', r: 'sw-000003' });
    expect(p.char.meta.method).toBe('lac_kiem_quyet');
  });
  it('Kim Thân cộng 15% phòng ngự', () => {
    const { sim, p } = setup();
    const before = p.char.def;
    sim.onMethod(p, { method: 'bat_dong_kim_than' });
    expect(p.char.def).toBe(Math.round(before * 1.15));
  });
});

describe('chiêu công pháp: server kiểm điều kiện', () => {
  it('chưa chọn công pháp hoặc chọn công pháp khác thì chiêu của công pháp khác không ra', () => {
    const { sim, p, mon, fresh } = setup();
    const m = mon();
    fresh(p);
    sim.onSkill(p, { id: 'skl_phi_kiem_truy_hon', t: m.id });
    expect(m.s.hp).toBe(m.s.mhp);
    sim.onMethod(p, { method: 'bat_dong_kim_than' });
    fresh(p);
    sim.onSkill(p, { id: 'skl_phi_kiem_truy_hon', t: m.id });
    expect(m.s.hp).toBe(m.s.mhp);
    expect(p.mth.charge).toBe(0);
  });
  it('khiêu khích giả: không công pháp thì không khiêu khích được quái', () => {
    const { sim, p, mon, fresh } = setup();
    const m = mon();
    fresh(p);
    sim.onSkill(p, { id: 'skl_tran_son_an' });
    expect(m.taunt).toBeUndefined();
  });
  it('chiêu tối thượng cần vòng sạc đầy, ra xong sạc về 0', () => {
    const { sim, p, mon, fresh } = setup();
    sim.onMethod(p, { method: 'lac_kiem_quyet' });
    const m = mon();
    fresh(p);
    sim.onSkill(p, { id: 'skl_van_kiem_quy_tong', t: m.id });
    expect(m.s.hp).toBe(m.s.mhp);
    p.mth.charge = CHARGE_MAX - 1;
    fresh(p);
    sim.onSkill(p, { id: 'skl_van_kiem_quy_tong', t: m.id });
    expect(m.s.hp).toBe(m.s.mhp);
    p.mth.charge = CHARGE_MAX;
    fresh(p);
    sim.onSkill(p, { id: 'skl_van_kiem_quy_tong', t: m.id });
    expect(m.s.hp).toBeLessThan(m.s.mhp);
    expect(p.mth.charge).toBeLessThan(CHARGE_MAX);
  });
  it('gây sát thương sạc vòng; Lạc Kiếm tích kiếm ý và Lôi Đình tiêu hết', () => {
    const { sim, p, mon, fresh } = setup(10);
    sim.onMethod(p, { method: 'lac_kiem_quyet' });
    const m = mon();
    for (let i = 0; i < 6; i++) {
      fresh(p);
      sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    }
    expect(p.mth.stacks).toBe(5);
    expect(p.mth.charge).toBeGreaterThan(0);
    fresh(p);
    sim.onSkill(p, { id: 'skl_loi_dinh_nhat_kiem', t: m.id });
    // niệm 1,5 giây: kết thúc bằng tick
    sim.now += 2000;
    (sim as unknown as { finishCast(p: Ent): void }).finishCast(p);
    expect(p.mth.stacks).toBe(1);
  });
  it('dấu ấn Kiếm Ảnh tăng sát thương của chính người đánh dấu', () => {
    const { sim, p, mon, fresh } = setup(10);
    sim.onMethod(p, { method: 'lac_kiem_quyet' });
    const m = mon();
    fresh(p);
    sim.onSkill(p, { id: 'skl_phi_kiem_truy_hon', t: m.id });
    expect(m.mark?.sid).toBe(p.sid);
    expect(m.mark?.mul).toBeCloseTo(0.2);
  });
});

describe('khiêu khích, giữ, hồi sinh', () => {
  it('Trấn Sơn Ấn buộc quái nhắm mình, người khác bị đánh dồn thù vẫn bị đổi hướng', () => {
    const { sim, p, join, mon, fresh } = setup(10);
    const other = join('b', 10);
    sim.onMethod(p, { method: 'bat_dong_kim_than' });
    const m = mon();
    m.state = MS_CHASE;
    m.s.st = MS_CHASE;
    m.target = other.sid;
    m.threat.set(other.sid, 99999);
    fresh(p);
    sim.onSkill(p, { id: 'skl_tran_son_an' });
    expect(m.taunt?.sid).toBe(p.sid);
    sim.now += 100;
    (sim as unknown as { tickMonster(m: unknown, dt: number): void }).tickMonster(m, 0.05);
    expect(m.target).toBe(p.sid);
    // hết hạn thì buông
    sim.now += 60_000;
    (sim as unknown as { tickMonster(m: unknown, dt: number): void }).tickMonster(m, 0.05);
    expect(m.taunt).toBeUndefined();
  });
  it('Kim Cương Bất Hoại giảm 60% sát thương nhận rồi hết hạn; nhận đòn tích thế và sạc', () => {
    const { sim, p, fresh } = setup(10);
    sim.onMethod(p, { method: 'bat_dong_kim_than' });
    p.mth.charge = CHARGE_MAX;
    fresh(p);
    sim.onSkill(p, { id: 'skl_kim_cuong_bat_hoai' });
    expect(p.mth.charge).toBe(0);
    p.char.hp = p.char.mhp = 10_000;
    sim.damagePlayer(p, 1000, 'mon_x');
    expect(p.char.hp).toBe(10_000 - 400);
    expect(p.mth.stacks).toBe(1);
    expect(p.mth.charge).toBeGreaterThan(0);
    sim.now += 7000;
    (sim as unknown as { tickMethods(): void }).tickMethods();
    const hp = p.char.hp;
    sim.damagePlayer(p, 1000, 'mon_x');
    expect(p.char.hp).toBe(hp - 1000);
  });
  it('thế rụng sau khi quá thời gian', () => {
    const { sim, p } = setup(10);
    sim.onMethod(p, { method: 'bat_dong_kim_than' });
    sim.damagePlayer(p, 10, 'mon_x');
    expect(p.mth.stacks).toBe(1);
    sim.now += 9000;
    (sim as unknown as { tickMethods(): void }).tickMethods();
    expect(p.mth.stacks).toBe(0);
  });
  it('Hồi Thiên Đan Lộ hồi sinh đạo hữu ngã gần, không có ai ngã thì không ra chiêu và không mất sạc', () => {
    const { sim, p, join, fresh } = setup(10);
    const ally = join('b', 10);
    sim.onMethod(p, { method: 'thanh_moc_dan_kinh' });
    p.mth.charge = CHARGE_MAX;
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoi_thien_dan_lo' });
    expect(p.mth.charge).toBe(CHARGE_MAX);
    sim.damagePlayer(ally, 999999, '');
    expect(ally.s.fl & PF_DEAD).toBe(PF_DEAD);
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoi_thien_dan_lo' });
    expect(ally.s.fl & PF_DEAD).toBe(0);
    expect(ally.char.hp).toBeGreaterThan(ally.char.mhp * 0.4);
    expect(p.mth.charge).toBe(0);
  });
  it('Xuân Phong Hóa Vũ hồi theo thời gian cho cả đạo hữu gần', () => {
    const { sim, p, join, fresh } = setup(10);
    const ally = join('b', 10);
    ally.char.hp = 1;
    ally.char.mhp = 1000;
    sim.onMethod(p, { method: 'thanh_moc_dan_kinh' });
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoi_xuan_quyet' });
    sim.now += 3200;
    (sim as unknown as { tickMethods(): void }).tickMethods();
    expect(ally.char.hp).toBeGreaterThan(100);
    expect(ally.char.hp).toBeLessThan(1000);
  });
});

describe('nâng cấp chiêu và biến thức', () => {
  const give = (p: Ent, scrolls: number, gold: number) => {
    p.char.tx('test', null, (d) => d.add(SCROLL, scrolls) && (d.addGold(gold), true));
  };
  const lv = (p: Ent, id = 'skl_phi_kiem') => p.char.meta.skillLv?.[id] ?? 1;

  it('nâng cấp tốn đúng Bí Tịch + linh thạch, ghi ledger, trùng khóa không nâng hai lần', () => {
    const { sim, p } = setup();
    const c2 = skillUpgradeCost(2)!;
    give(p, 5, 1000);
    const gold = p.char.gold;
    sim.onSkillUp(p, { skill: 'skl_phi_kiem', r: 'up-000001' });
    expect(lv(p)).toBe(2);
    expect(p.char.gold).toBe(gold - c2.gold);
    sim.onSkillUp(p, { skill: 'skl_phi_kiem', r: 'up-000001' });
    expect(lv(p)).toBe(2);
    const rows = ledgerOf(p.char.id);
    expect(rows.filter((r) => r.kind === 'item' && r.ref === SCROLL)).toEqual([expect.objectContaining({ delta: -c2.scrolls })]);
    expect(rows.filter((r) => r.kind === 'gold')).toEqual([expect.objectContaining({ delta: -c2.gold })]);
  });
  it('thiếu nguyên liệu hoặc linh thạch thì không nâng, không mất gì', () => {
    const { sim, p } = setup();
    give(p, 0, 1000);
    sim.onSkillUp(p, { skill: 'skl_phi_kiem', r: 'up-000010' });
    expect(lv(p)).toBe(1);
    give(p, 5, 0);
    const gold = p.char.gold;
    p.char.gold = 0;
    sim.onSkillUp(p, { skill: 'skl_phi_kiem', r: 'up-000011' });
    expect(lv(p)).toBe(1);
    p.char.gold = gold;
    expect(p.char.inv.some((s) => s?.id === SCROLL && s.n === 5)).toBe(true);
  });
  it('tối đa cấp 5; chiêu chưa mở khóa, chiêu của công pháp khác, id lạ đều bị từ chối', () => {
    const { sim, p } = setup(8);
    give(p, 50, 100000);
    for (let i = 0; i < 8; i++) sim.onSkillUp(p, { skill: 'skl_phi_kiem', r: 'up-' + (100000 + i) });
    expect(lv(p)).toBe(5);
    sim.onSkillUp(p, { skill: 'skl_phi_kiem_truy_hon', r: 'up-200001' });
    expect(lv(p, 'skl_phi_kiem_truy_hon')).toBe(1);
    sim.onSkillUp(p, { skill: 'skl_khong_co', r: 'up-200002' });
    sim.onSkillUp(p, { skill: 7, r: 'up-200003' });
    sim.onSkillUp(p, { skill: 'skl_loi_dinh_nhat_kiem', r: 'up-200004' }); // cần tầng 10
    expect(lv(p, 'skl_loi_dinh_nhat_kiem')).toBe(1);
    sim.onMethod(p, { method: 'lac_kiem_quyet' });
    sim.onSkillUp(p, { skill: 'skl_phi_kiem_truy_hon', r: 'up-200005' });
    expect(lv(p, 'skl_phi_kiem_truy_hon')).toBe(2);
  });
  it('biến thức: cấp 3 mới chọn, không chọn khi giao chiến, chỉ a/b', () => {
    const { sim, p } = setup();
    sim.onSkillVar(p, { skill: 'skl_phi_kiem', v: 'a' });
    expect(p.char.meta.skillVar?.skl_phi_kiem).toBeUndefined();
    p.char.meta.skillLv = { skl_phi_kiem: 3 };
    sim.onSkillVar(p, { skill: 'skl_phi_kiem', v: 'c' });
    expect(p.char.meta.skillVar?.skl_phi_kiem).toBeUndefined();
    p.lastCombatAt = sim.now;
    sim.onSkillVar(p, { skill: 'skl_phi_kiem', v: 'a' });
    expect(p.char.meta.skillVar?.skl_phi_kiem).toBeUndefined();
    p.lastCombatAt = 0;
    sim.onSkillVar(p, { skill: 'skl_phi_kiem', v: 'b' });
    expect(p.char.meta.skillVar?.skl_phi_kiem).toBe('b');
    sim.onSkillVar(p, { skill: 'skl_phi_kiem_truy_hon', v: 'a' });
    expect(p.char.meta.skillVar?.skl_phi_kiem_truy_hon).toBeUndefined();
  });
  it('biến thức Song Kiếm đánh hai lần, cấp chiêu cộng sức mạnh, FX mang nhãn biến thức', () => {
    const { sim, sent, p, mon, fresh } = setup();
    const m = mon();
    const hitsOn = () => sent.filter((x) => x.type === S.DMG && (x.msg as { dst: string }).dst === m.id).length;
    fresh(p);
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    expect(hitsOn()).toBe(1);
    p.char.meta.skillLv = { skl_phi_kiem: 3 };
    p.char.meta.skillVar = { skl_phi_kiem: 'a' };
    fresh(p);
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    expect(hitsOn()).toBe(3);
    const fx = sent
      .filter((x) => x.type === S.FX)
      .map((x) => x.msg as { t: string; v?: string; lv?: number })
      .pop()!;
    expect(fx).toMatchObject({ t: 'sword', v: 'twin', lv: 3 });
  });
  it('đổi biến thức không xóa hồi chiêu đang chạy', () => {
    const { sim, p, mon, fresh } = setup(10);
    const m = mon();
    p.char.meta.skillLv = { skl_kiem_khi_tram: 3 };
    fresh(p);
    sim.onSkill(p, { id: 'skl_kiem_khi_tram', t: m.id });
    const cd = p.cds.get('skl_kiem_khi_tram')!;
    expect(cd).toBeGreaterThan(sim.now);
    p.lastCombatAt = 0;
    sim.onSkillVar(p, { skill: 'skl_kiem_khi_tram', v: 'b' });
    expect(p.cds.get('skl_kiem_khi_tram')).toBe(cd);
  });
  it('meta hỏng hoặc có id lạ được làm sạch khi nạp', () => {
    const char = Character.create(nextAcc++, 'meta' + nextAcc);
    char.meta = {
      method: 'xyz',
      skillLv: { skl_phi_kiem: 99, khong_co: 3, skl_hoi_nguyen_thuat: -2 },
      skillVar: { skl_phi_kiem: 'z' as never, skl_thien_kiem_vu: 'b' },
    } as never;
    // lưu rồi nạp lại đi qua sanitize
    char.save();
    const again = Character.load(char.id)!;
    expect(again.meta.method).toBeUndefined();
    expect(again.meta.skillLv).toEqual({ skl_phi_kiem: 5 });
    expect(again.meta.skillVar).toEqual({ skl_thien_kiem_vu: 'b' });
  });
});

describe('đồng bộ', () => {
  it('server gửi S.METHOD khi trạng thái đổi, không lộ dữ liệu của người khác', () => {
    const { sim, sent, p, join } = setup();
    join('b');
    sim.onMethod(p, { method: 'lac_kiem_quyet' });
    sim.now += 1000;
    sim.tick(50);
    const msgs = sent.filter((s) => s.type === S.METHOD).map((s) => s.msg as MethodMsg & { to: string });
    const mine = msgs.filter((m) => m.to === 'a').pop()!;
    expect(mine.method).toBe('lac_kiem_quyet');
    expect(MS_DEAD).toBe(4);
  });
});

describe('soát netcode: lỗ hổng đã vá', () => {
  it('chiêu tối thượng đánh nhiều quái không tự nạp lại vòng sạc', () => {
    const { sim, p, mon, fresh } = setup(10);
    sim.onMethod(p, { method: 'lac_kiem_quyet' });
    const ms = Array.from({ length: 8 }, (_, i) => mon(X + 3 + i * 0.5, Z));
    p.mth.charge = CHARGE_MAX;
    fresh(p);
    sim.onSkill(p, { id: 'skl_van_kiem_quy_tong', t: ms[0].id });
    expect(p.mth.charge).toBe(0);
    expect(p.mth.lockCharge).toBe(false);
  });
  it('đánh quái đang miễn sát thương không cho kiếm ý hay sạc', () => {
    const { sim, p, mon, fresh } = setup(10);
    sim.onMethod(p, { method: 'lac_kiem_quyet' });
    const m = mon();
    m.evadeUntil = sim.now + 60_000;
    fresh(p);
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    expect(p.mth.stacks).toBe(0);
    expect(p.mth.charge).toBe(0);
  });
  it('khiêu khích bỏ qua bóng tâm ma của người khác', () => {
    const { sim, p, mon, fresh } = setup(10);
    sim.onMethod(p, { method: 'bat_dong_kim_than' });
    const shadow = mon();
    shadow.owner = 'someone-else';
    fresh(p);
    sim.onSkill(p, { id: 'skl_tran_son_an' });
    expect(shadow.taunt).toBeUndefined();
  });
  it('đổi biến thức/công pháp khi đang niệm bị từ chối; chọn lại cùng biến thức không ghi lại', () => {
    const { sim, p, mon, fresh } = setup(10);
    const m = mon();
    p.char.meta.skillLv = { skl_loi_dinh_nhat_kiem: 3 };
    fresh(p);
    sim.onSkill(p, { id: 'skl_loi_dinh_nhat_kiem', t: m.id });
    expect(p.casting).not.toBeNull();
    p.lastCombatAt = 0;
    sim.onSkillVar(p, { skill: 'skl_loi_dinh_nhat_kiem', v: 'b' });
    expect(p.char.meta.skillVar?.skl_loi_dinh_nhat_kiem).toBeUndefined();
  });
  it('lớp giáp yếu không kéo dài lớp mạnh', () => {
    const { p, sim } = setup(10);
    p.mth.setGuard(sim.now, 0.6, 1);
    const until = p.mth.guardUntil;
    p.mth.setGuard(sim.now, 0.25, 3);
    expect(p.mth.guardUntil).toBe(until);
    expect(p.mth.guardReduce).toBe(0.6);
  });
});

describe('hỗ trợ đồng đội không can thiệp độ kiếp/tâm ma', () => {
  const mark = (o: Ent, k: 'trib' | 'trial') =>
    ((o as unknown as Record<string, unknown>)[k] =
      k === 'trib' ? { endAt: Date.now() + 1e6, nextAt: 0, n: 0 } : { until: Date.now() + 1e6 });
  for (const k of ['trib', 'trial'] as const) {
    it(`Xuân Phong Hóa Vũ và Hồi Thiên bỏ qua người đang ${k}`, () => {
      const { sim, p, join, fresh } = setup(10);
      const ally = join('b', 10);
      ally.char.mhp = 1000;
      ally.char.hp = 1;
      mark(ally, k);
      sim.onMethod(p, { method: 'thanh_moc_dan_kinh' });
      fresh(p);
      sim.onSkill(p, { id: 'skl_hoi_xuan_quyet' });
      sim.now += 3200;
      (sim as unknown as { tickMethods(): void }).tickMethods();
      expect(ally.char.hp).toBe(1);
      p.mth.charge = CHARGE_MAX;
      fresh(p);
      sim.onSkill(p, { id: 'skl_hoi_thien_dan_lo' }); // không ai ngã: bị từ chối, nhưng vòng hồi 20% cũng không áp được
      expect(ally.char.hp).toBe(1);
    });
    it(`khiên Đồng Hành không che người đang ${k}`, () => {
      const { sim, p, join, fresh } = setup(10);
      const ally = join('b', 10);
      mark(ally, k);
      p.char.meta.skillLv = { skl_linh_khi_ho_the: 3 };
      p.char.meta.skillVar = { skl_linh_khi_ho_the: 'b' };
      fresh(p);
      sim.onSkill(p, { id: 'skl_linh_khi_ho_the' });
      expect(p.shield).not.toBeNull();
      expect(ally.shield).toBeNull();
    });
  }
  it('đan dược Đan Kinh không dùng lên người đang độ kiếp', () => {
    const { sim, p, join } = setup(10);
    const ally = join('b', 10);
    mark(ally, 'trib');
    ally.char.hp = 1;
    ally.char.mhp = 1000;
    sim.onMethod(p, { method: 'thanh_moc_dan_kinh' });
    p.char.tx('t', null, (d) => d.add('itm_hoi_xuan_dan', 1));
    const slot = p.char.inv.findIndex((x) => x?.id === 'itm_hoi_xuan_dan');
    sim.onUse(p, { slot, r: 'use-000001', to: ally.sid });
    expect(ally.char.hp).toBe(1);
  });
  it('vòng hồi 20% của Hồi Thiên không áp lên người đang độ kiếp', () => {
    const { sim, p, join, fresh } = setup(10);
    const dead = join('c', 10);
    const busy = join('b', 10);
    busy.char.mhp = 1000;
    busy.char.hp = 1;
    mark(busy, 'trib');
    sim.onMethod(p, { method: 'thanh_moc_dan_kinh' });
    sim.damagePlayer(dead, 999999, '');
    p.mth.charge = CHARGE_MAX;
    fresh(p);
    sim.onSkill(p, { id: 'skl_hoi_thien_dan_lo' });
    expect(dead.s.fl & PF_DEAD).toBe(0);
    expect(busy.char.hp).toBe(1);
  });
});

describe('bí tịch: nguồn và luật đổi biến thức (3-6)', () => {
  const cnt = (p: Ent, id: string) => p.char.inv.reduce((n, s) => (s?.id === id ? n + s.n : n), 0);
  const lvs = (p: Ent, o: Record<string, number>) => {
    p.char.meta.skillLv = o;
  };
  it('đổi biến thức cách nhau ít nhất 5 giây; chọn lại cái đang chọn không tính', () => {
    const { sim, p } = setup(10);
    lvs(p, { skl_phi_kiem: 3, skl_kiem_khi_tram: 3 });
    sim.onSkillVar(p, { skill: 'skl_phi_kiem', v: 'a' });
    expect(p.char.meta.skillVar?.skl_phi_kiem).toBe('a');
    sim.onSkillVar(p, { skill: 'skl_kiem_khi_tram', v: 'b' });
    expect(p.char.meta.skillVar?.skl_kiem_khi_tram).toBeUndefined();
    sim.onSkillVar(p, { skill: 'skl_phi_kiem', v: 'a' });
    sim.now += 5100;
    sim.onSkillVar(p, { skill: 'skl_kiem_khi_tram', v: 'b' });
    expect(p.char.meta.skillVar?.skl_kiem_khi_tram).toBe('b');
  });
  it('mọi biến thức A/B cấp 3 đều ra được: FX mang nhãn riêng, chiêu không lỗi', () => {
    const { sim, sent, p, mon, fresh } = setup(12);
    const m = mon();
    p.char.meta.method = 'lac_kiem_quyet';
    const tags = new Set<string>();
    for (const [id, vars] of Object.entries(VARIANTS)) {
      const sk = SKILL.get(id)!;
      if (sk.method && sk.method !== 'lac_kiem_quyet') continue;
      // E2-G: chiêu bậc 2–3 mở theo cảnh giới; chiêu còn khóa (Nguyên Anh+) có test riêng ở e2g.test.ts.
      if (sk.locked) continue;
      p.char.level = Math.max(12, sk.unlock);
      p.char.recalc();
      for (const v of ['a', 'b'] as const) {
        p.char.meta.skillLv = { [id]: 3 };
        p.char.meta.skillVar = { [id]: v };
        p.char.hp = p.char.mhp;
        p.char.mp = p.char.mmp;
        fresh(p);
        sim.onSkill(p, { id, t: m.id });
        // Lôi Đình A bỏ niệm chú; B niệm lâu hơn bản gốc.
        if (id === 'skl_loi_dinh_nhat_kiem') expect(p.casting === null, `${id}:${v}`).toBe(v === 'a');
        if (p.casting) ((sim.now += 3000), (sim as unknown as { finishCast(p: Ent): void }).finishCast(p));
        const fx = sent
          .filter((x) => x.type === S.FX)
          .map((x) => x.msg as { v?: string })
          .filter((x) => x.v === vars[v].fx)
          .pop();
        expect(fx, `${id}:${v}`).toBeDefined();
        tags.add(`${id}:${vars[v].fx}`);
        sent.length = 0;
      }
    }
    expect(tags.size).toBeGreaterThanOrEqual(12);
  });
  it('quái rơi bí tịch; có nhiệm vụ thưởng bí tịch; Dược sư chép bí tịch từ yêu đan + thiết tinh có ledger', () => {
    const drops = [...MONSTER.values()].filter((m) => (lootOf(m.id).drops ?? []).some((d) => d.item === SCROLL));
    expect(drops.length).toBeGreaterThanOrEqual(6);
    expect(QUEST.size).toBeGreaterThan(0);
    const rewarded = [...QUEST.values()].filter((q) => q.rewards.items?.some((i) => i.id === SCROLL));
    expect(rewarded.length).toBeGreaterThanOrEqual(5);
    const { sim, p } = setup();
    const npc = NPC.get('npc_duoc_su')!;
    p.move.x = npc.x;
    p.move.z = npc.z;
    p.char.tx('mat', null, (d) => d.add('itm_yeu_dan', 8) && d.add('itm_thiet_tinh', 2) && (d.addGold(500), true));
    const gold = p.char.gold;
    sim.onCraft(p, { id: 'rcp_bi_tich', n: 1, r: 'cr-000001' });
    sim.onCraft(p, { id: 'rcp_bi_tich', n: 1, r: 'cr-000001' });
    expect(cnt(p, SCROLL)).toBe(1);
    expect(cnt(p, 'itm_yeu_dan')).toBe(0);
    expect(p.char.gold).toBe(gold - 120);
    // Thiếu nguyên liệu: không ra thêm.
    sim.onCraft(p, { id: 'rcp_bi_tich', n: 1, r: 'cr-000002' });
    expect(cnt(p, SCROLL)).toBe(1);
    const rows = sqlite
      .prepare("SELECT kind, ref, delta FROM ledger WHERE char_id = ? AND reason = 'craft:rcp_bi_tich'")
      .all(p.char.id) as { kind: string; ref: string; delta: number }[];
    expect(rows.find((r) => r.ref === SCROLL)?.delta).toBe(1);
  });
});
