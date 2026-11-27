import { beforeAll, describe, expect, it } from 'vitest';
import { allowSkillForTest } from './testkit';
import { groundAt } from '@dtl/shared';

// Cổ Thần (TN-5): lĩnh ngộ từ Thể tu, thang sao (rèn bằng Cổ Huyết Tinh + linh thạch), chiêu đòi sao, Cổ huyết, thưởng sao.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let MONSTER: typeof import('@dtl/content').MONSTER;
let NPC: typeof import('@dtl/content').NPC;
let PATH: typeof import('@dtl/content').PATH;
let STARS: typeof import('@dtl/content').STARS;
let sqlite: typeof import('../db').sqlite;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ MONSTER, NPC, PATH, STARS } = await import('@dtl/content'));
  ({ sqlite } = await import('../db'));
});

const X = 2040;
const Z = 2040;
const CT = 'co_than_quyet';
const THE = 'bat_dong_kim_than';
let nextAcc = 16000;

function setup(level = 32) {
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const raw0 = sim.onSkill.bind(sim);
  const priv = sim as unknown as { resolvePending(p: Ent): void; combat: { liveRes(p: Ent): number } };
  const use = (pl: Ent, id: string, t?: string) => {
    allowSkillForTest(pl.char, id);
    raw0(pl, { id, t });
    const st = pl.flow.pending;
    if (st) {
      st.at = sim.now;
      priv.resolvePending(pl);
    }
  };
  const join = (method: string | '' = CT, lv = level, stars = 0): Ent => {
    const char = Character.create(nextAcc++, 'ct' + nextAcc);
    char.level = lv;
    if (method === CT) char.meta.paths = ['co_than'];
    if (method) char.meta.method = method;
    if (stars) char.meta.stars = stars;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const p = sim.addPlayer({ sessionId: 'c' + nextAcc, send: () => undefined } as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    return p;
  };
  const fresh = (p: Ent) => {
    p.gcdAt = 0;
    p.cds.clear();
    p.flow.lastDashAt = -1e9;
    p.flow.opened.clear();
    p.char.mp = p.char.mmp;
    p.lastCombatAt = 0;
    p.skillCount = 0;
  };
  const mon = (hp = 50_000_000) => {
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 10, X + 5, Z, null);
    m.s.hp = m.s.mhp = hp;
    return m;
  };
  return { sim, join, use, fresh, mon, res: (p: Ent) => priv.combat.liveRes(p) };
}

const nearNpc = (p: Ent) => {
  const npc = NPC.get('npc_chuong_mon')!;
  p.move.x = npc.x;
  p.move.z = npc.z;
};
const rows = (charId: number, reason: string) =>
  sqlite.prepare('SELECT kind, ref, delta FROM ledger WHERE char_id = ? AND reason = ?').all(charId, reason) as {
    kind: string;
    ref: string;
    delta: number;
  }[];

describe('lĩnh ngộ Cổ Thần', () => {
  it('chỉ lĩnh ngộ khi đang tu Thể tu, đủ cảnh giới và linh thạch; trừ một lần, ghi ledger, cùng khóa không trừ lại', () => {
    const { sim, join } = setup();
    const u = PATH.get('co_than')!.unlock!;
    expect(u.from).toBe(THE);
    const other = join('lac_kiem_quyet', u.level);
    other.char.gold = 99999;
    nearNpc(other);
    sim.onMethod(other, { method: CT, r: 'ct-000001' });
    expect(other.char.meta.method).toBe('lac_kiem_quyet');
    const low = join(THE, u.level - 1);
    low.char.gold = 99999;
    nearNpc(low);
    sim.onMethod(low, { method: CT, r: 'ct-000002' });
    expect(low.char.meta.method).toBe(THE);
    const p = join(THE, u.level);
    nearNpc(p);
    p.char.gold = u.gold - 1;
    sim.onMethod(p, { method: CT, r: 'ct-000003' });
    expect(p.char.meta.method).toBe(THE);
    p.char.gold = u.gold + 100;
    sim.onMethod(p, { method: CT, r: 'ct-000004' });
    expect(p.char.meta.method).toBe(CT);
    expect(p.char.meta.paths).toEqual(['co_than']);
    expect(p.char.gold).toBe(100);
    expect(rows(p.char.id, 'path:unlock:co_than')).toEqual([{ kind: 'gold', ref: '', delta: -u.gold }]);
    sim.onMethod(p, { method: CT, r: 'ct-000004' });
    expect(p.char.gold).toBe(100);
    expect(rows(p.char.id, 'path:unlock:co_than')).toHaveLength(1);
  });
});

describe('thang sao', () => {
  const give = (p: Ent, n: number, gold: number) => {
    p.char.gold = gold;
    expect(p.char.tx('test:give', null, (d) => d.add(STARS.item, n))).toBe(true);
  };
  it('rèn Nhất Tinh trừ đúng Cổ Huyết Tinh + linh thạch, ghi ledger, cùng khóa không rèn lại', () => {
    const { sim, join } = setup();
    const p = join();
    const s1 = STARS.stars[0]!;
    give(p, s1.mats + 2, s1.gold + 50);
    nearNpc(p);
    sim.onStar(p, { r: 'st-000001' });
    expect(p.char.meta.stars).toBe(1);
    expect(p.char.gold).toBe(50);
    expect(rows(p.char.id, 'costar:1').sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([
      { kind: 'gold', ref: '', delta: -s1.gold },
      { kind: 'item', ref: STARS.item, delta: -s1.mats },
    ]);
    sim.onStar(p, { r: 'st-000001' });
    expect(p.char.meta.stars).toBe(1);
    expect(rows(p.char.id, 'costar:1')).toHaveLength(2);
  });
  it('bị chặn khi thiếu vật phẩm/linh thạch, xa người truyền công, sai công pháp, thiếu cảnh giới; không mất gì', () => {
    const { sim, join } = setup();
    const s1 = STARS.stars[0]!;
    const poor = join();
    give(poor, s1.mats - 1, s1.gold * 2);
    nearNpc(poor);
    sim.onStar(poor, { r: 'st-000002' });
    expect(poor.char.meta.stars).toBeUndefined();
    expect(poor.char.gold).toBe(s1.gold * 2);
    const far = join();
    give(far, s1.mats, s1.gold);
    sim.onStar(far, { r: 'st-000003' });
    expect(far.char.meta.stars).toBeUndefined();
    const wrong = join(THE);
    give(wrong, s1.mats, s1.gold);
    nearNpc(wrong);
    sim.onStar(wrong, { r: 'st-000004' });
    expect(wrong.char.meta.stars).toBeUndefined();
    const young = join(CT, s1.level - 1);
    give(young, s1.mats, s1.gold);
    nearNpc(young);
    sim.onStar(young, { r: 'st-000005' });
    expect(young.char.meta.stars).toBeUndefined();
    expect(young.char.gold).toBe(s1.gold);
  });
  it('mỗi lần chỉ lên một sao, sao kế tiếp đòi cảnh giới cao hơn; tới Cửu Tinh thì dừng', () => {
    const { sim, join } = setup(44);
    const p = join(CT, 44);
    give(p, 500, 1_000_000);
    nearNpc(p);
    for (let i = 1; i <= 9; i++) {
      sim.onStar(p, { r: `st-1000${i}` });
      expect(p.char.meta.stars).toBe(i);
    }
    const left = p.char.gold;
    sim.onStar(p, { r: 'st-100010' });
    expect(p.char.meta.stars).toBe(9);
    expect(p.char.gold).toBe(left);
    // trần cấp 32 hiện chỉ cho tới Tam Tinh (cấp 28/30/32); sao 4 đòi cấp 34
    const cap = join(CT, 32);
    give(cap, 500, 1_000_000);
    nearNpc(cap);
    for (let i = 1; i <= 6; i++) sim.onStar(cap, { r: `st-2000${i}` });
    expect(cap.char.meta.stars).toBe(3);
  });
  it('khí huyết tối đa và giảm sát thương tăng theo sao, chỉ khi giữ Cổ Thần Quyết', () => {
    const { sim, join } = setup();
    const a = join(CT, 32, 0);
    const b = join(CT, 32, 3);
    expect(b.char.mhp).toBeGreaterThan(a.char.mhp);
    const off = join(THE, 32, 3);
    const base = join(THE, 32, 0);
    expect(off.char.mhp).toBe(base.char.mhp);
    // cộng dồn nhiều đòn: tổng sát thương nhận của 3 sao thấp hơn 0 sao
    let da = 0;
    let db = 0;
    for (let i = 0; i < 200; i++) {
      a.char.hp = a.char.mhp;
      b.char.hp = b.char.mhp;
      sim.damagePlayer(a, 1000, 'mon_x');
      sim.damagePlayer(b, 1000, 'mon_x');
      da += a.char.mhp - a.char.hp;
      db += b.char.mhp - b.char.hp;
    }
    expect(db).toBeLessThan(da);
  });
});

describe('chiêu và Cổ huyết', () => {
  it('chiêu đòi sao bị chặn khi chưa đủ sao, dùng được khi đủ', () => {
    const { join, fresh, use } = setup();
    const p = join(CT, 32, 0);
    fresh(p);
    // Hóa Hình cần Nhất Tinh.
    use(p, 'skl_hoa_hinh');
    expect(p.mth.stance?.id).not.toBe('skl_hoa_hinh');
    const q = join(CT, 32, 1);
    fresh(q);
    use(q, 'skl_hoa_hinh');
    expect(q.mth.stance?.id).toBe('skl_hoa_hinh');
  });
  it('Tinh Bạo (nhánh Huyết Trận, mốc 16) không đòi sao: dùng được ngay từ cấp 16', () => {
    const { join, mon, fresh, use } = setup();
    const m = mon();
    const p = join(CT, 16, 0);
    fresh(p);
    const hp = m.s.hp;
    use(p, 'skl_tinh_bao', m.id);
    expect(m.s.hp).toBeLessThan(hp);
  });
  it('Thái Cổ Quyền tích 8 Cổ huyết mỗi nhát; chịu đòn cũng tích, không vượt 100', () => {
    const { sim, join, mon, fresh, use, res } = setup();
    const p = join();
    const m = mon();
    for (let i = 0; i < 3; i++) {
      fresh(p);
      use(p, 'skl_thai_co_quyen', m.id);
    }
    expect(res(p)).toBe(24);
    for (let i = 0; i < 60; i++) sim.damagePlayer(p, Math.floor(p.char.mhp / 20), 'mon_x');
    expect(res(p)).toBeLessThanOrEqual(100);
  });
  it('người chưa tu Cổ Thần Quyết không dùng được chiêu của nó', () => {
    const { join, mon, fresh, sim } = setup();
    const p = join('lac_kiem_quyet');
    const m = mon();
    fresh(p);
    const hp = m.s.hp;
    sim.onSkill(p, { id: 'skl_thai_co_quyen', t: m.id });
    expect(m.s.hp).toBe(hp);
  });
});
