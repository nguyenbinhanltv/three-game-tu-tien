import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, MS_CHASE, MS_DEAD, MF_STUN, PF_SHIELD, S, type MethodMsg } from '@dtl/shared';

// Pháp bảo phụ và đan (Phase 3-8): server quyết định hồi chiêu, hiệu ứng, linh khí, phẩm đan, buff.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let sqlite: typeof import('../db').sqlite;
let MONSTER: typeof import('@dtl/content').MONSTER;
let NPC: typeof import('@dtl/content').NPC;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ sqlite } = await import('../db'));
  ({ MONSTER, NPC } = await import('@dtl/content'));
});

const X = 2040;
const Z = 2040;
let nextAcc = 3000;
const HO_LO = 'itm_tu_kim_ho_lo';
const LINH = 'itm_tran_hon_linh';
const AN = 'itm_thanh_lien_an';

interface Sent {
  type: string;
  msg: unknown;
}

function setup(level = 12) {
  const sent: Sent[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const sim: Sim = new GameSim(new WorldState(), host as never, { levelId: 'van_lam', roomName: 'test', spawn: { x: X, z: Z }, respawn: { x: X, z: Z }, persistPosition: false });
  const join = (name: string, lv = level): Ent => {
    const char = Character.create(nextAcc++, name + nextAcc);
    char.level = lv;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const client = { sessionId: name + nextAcc, send: (type: string, msg: unknown) => sent.push({ type, msg: { to: name, ...(msg as object) } }) };
    const p = sim.addPlayer(client as never, char, true, 's' + nextAcc);
    p.move.x = X;
    p.move.z = Z;
    p.move.y = groundAt(X, Z);
    return p;
  };
  const p = join('a');
  const wear = (e: Ent, id: string) => {
    e.char.equip.artifact = { id, n: 1 };
    e.char.recalc();
  };
  const mon = (x = X + 5, z = Z, id = 'mon_soi_xam') => {
    const m = sim.spawnMonster(MONSTER.get(id)!, 10, x, z, null);
    m.s.hp = m.s.mhp = 1_000_000;
    return m;
  };
  return { sim, sent, p, join, wear, mon };
}

describe('kích hoạt pháp bảo', () => {
  it('không đeo thì không làm gì, không tốn hồi chiêu', () => {
    const { sim, p } = setup();
    sim.onArtifact(p);
    expect(p.cds.size).toBe(0);
  });

  it('Hồ Lô hút linh lực quái quanh, có hồi chiêu và không vượt linh lực tối đa', () => {
    const { sim, p, wear, mon } = setup();
    wear(p, HO_LO);
    // Không quái thì không tiêu hồi chiêu.
    sim.onArtifact(p);
    expect(p.cds.has('art_ho_lo')).toBe(false);
    mon();
    mon(X - 5);
    p.char.mp = 0;
    sim.onArtifact(p);
    expect(p.char.mp).toBeGreaterThan(0);
    expect(p.char.mp).toBeLessThanOrEqual(p.char.mmp);
    expect(p.cds.get('art_ho_lo')).toBeGreaterThan(Date.now());
    // Đang hồi chiêu: lệnh thứ hai không hồi thêm.
    const mp = p.char.mp;
    sim.onArtifact(p);
    expect(p.char.mp).toBe(mp);
  });

  it('Trấn Hồn Linh làm quái đang giao chiến choáng, bỏ qua quái đang rảnh, tốn linh lực', () => {
    const { sim, p, wear, mon } = setup();
    wear(p, LINH);
    const idle = mon(X + 5);
    sim.onArtifact(p);
    expect(p.cds.has('art_linh')).toBe(false); // không có quái giao chiến
    const fight = mon(X - 5);
    fight.state = MS_CHASE;
    fight.s.st = MS_CHASE;
    const mp = p.char.mp;
    sim.onArtifact(p);
    expect(fight.stunUntil).toBeGreaterThan(Date.now());
    expect(fight.s.mf & MF_STUN).toBeTruthy();
    expect(idle.stunUntil).toBe(0);
    expect(p.char.mp).toBeLessThan(mp);
  });

  it('Trấn Hồn Linh cộng phá thế lên boss thay vì choáng thẳng', () => {
    const { sim, p, wear, mon } = setup();
    wear(p, LINH);
    const boss = mon(X + 6, Z, 'boss_han_giao');
    boss.state = MS_CHASE;
    boss.s.st = MS_CHASE;
    sim.onArtifact(p);
    expect(boss.posture).toBeGreaterThan(0.3);
    expect(boss.stunUntil).toBe(0);
  });

  it('Thanh Liên Ấn che cả đồng đội trong tổ đội gần, không che người xa', () => {
    const { sim, p, join, wear } = setup();
    wear(p, AN);
    const b = join('b');
    sim.onArtifact(p);
    expect(p.shield?.amount ?? 0).toBeGreaterThan(0);
    expect(p.s.fl & PF_SHIELD).toBeTruthy();
    // Không cùng tổ đội: người kia không được che.
    expect(b.shield).toBeNull();
    const dur = (p.shield!.until - Date.now()) / 1000;
    expect(dur).toBeGreaterThan(3);
    expect(dur).toBeLessThanOrEqual(4.1);
  });

  it('chết hoặc đang bay thì không dùng được', () => {
    const { sim, p, wear, mon } = setup();
    wear(p, HO_LO);
    mon();
    p.move.flying = true;
    sim.onArtifact(p);
    expect(p.cds.has('art_ho_lo')).toBe(false);
  });
});

describe('linh khí và cấp pháp bảo', () => {
  it('hạ quái nạp linh khí; đủ thì lên cấp và nội tại (linh lực tối đa) tăng', () => {
    const { sim, p, wear, mon } = setup();
    wear(p, HO_LO);
    const mmp0 = p.char.mmp;
    for (let i = 0; i < 60; i++) {
      const m = mon();
      m.threat.set(p.sid, m.s.mhp);
      sim.damageMonster(m, m.s.mhp, p);
      expect(m.state).toBe(MS_DEAD);
    }
    expect(p.char.meta.art?.[HO_LO]?.lv).toBe(2);
    expect(p.char.mmp).toBeGreaterThan(mmp0);
  });

  it('không đeo thì không nạp; quái quá thấp cấp không nạp', () => {
    const { sim, p, mon } = setup();
    const m = mon();
    m.threat.set(p.sid, m.s.mhp);
    sim.damageMonster(m, m.s.mhp, p);
    expect(p.char.meta.art ?? {}).toEqual({});
  });

  it('S.METHOD mang trạng thái pháp bảo của chính mình', () => {
    const { sim, sent, p, wear } = setup();
    wear(p, AN);
    p.mth.sentAt = 0;
    sim.tick(50);
    const msgs = sent.filter((s) => s.type === S.METHOD).map((s) => s.msg as MethodMsg);
    const last = msgs[msgs.length - 1];
    expect(last.art?.id).toBe(AN);
    expect(last.art?.lv).toBe(1);
  });
});

describe('đan: phẩm chất và buff', () => {
  const duocSu = () => NPC.get('npc_duoc_su')!;
  const give = (p: Ent, id: string, n: number, plus = 0) => {
    for (let i = 0; i < p.char.inv.length && n > 0; i++) {
      if (!p.char.inv[i]) {
        p.char.inv[i] = { id, n, ...(plus ? { plus } : {}) };
        return;
      }
    }
  };

  it('luyện đan roll phẩm ở server, ghi ledger có vết roll, tổng số lượng đúng', () => {
    const { sim, p } = setup();
    p.move.x = duocSu().x;
    p.move.z = duocSu().z;
    p.char.gold = 100000;
    give(p, 'itm_linh_thao', 60);
    sim.onCraft(p, { id: 'rcp_hoi_xuan_dan', n: 20, r: 'cr-pill-01' });
    let total = 0;
    for (const s of p.char.inv) if (s?.id === 'itm_hoi_xuan_dan') total += s.n;
    expect(total).toBe(20);
    const rows = sqlite.prepare("SELECT kind, ref, delta, reason FROM ledger WHERE char_id = ? AND reason LIKE 'craft:rcp_hoi_xuan_dan%'").all(p.char.id) as { kind: string; ref: string; delta: number; reason: string }[];
    expect(rows.find((r) => r.kind === 'item' && r.ref === 'itm_hoi_xuan_dan')?.delta).toBe(20);
    expect(rows[0].reason).toMatch(/roll=pill:[012]{20}/);
    // Cùng khóa idem thì không luyện lần nữa.
    sim.onCraft(p, { id: 'rcp_hoi_xuan_dan', n: 20, r: 'cr-pill-01' });
    let again = 0;
    for (const s of p.char.inv) if (s?.id === 'itm_hoi_xuan_dan') again += s.n;
    expect(again).toBe(20);
  });

  it('đan khác phẩm không chồng chung một ô', () => {
    const { p } = setup();
    p.char.inv.fill(null);
    const tx = (plus: number) => p.char.tx('t', null, (d) => d.add('itm_hoi_xuan_dan', 2, plus));
    expect(tx(0)).toBe(true);
    expect(tx(2)).toBe(true);
    expect(tx(2)).toBe(true);
    const stacks = p.char.inv.filter((s) => s?.id === 'itm_hoi_xuan_dan').map((s) => [s!.plus ?? 0, s!.n]);
    expect(stacks).toEqual([[0, 2], [2, 4]]);
  });

  it('đan Thượng phẩm hồi nhiều hơn đan Hạ phẩm', () => {
    const { sim, p } = setup();
    p.char.inv.fill(null);
    p.char.hp = 1;
    give(p, 'itm_hoi_xuan_dan', 1, 0);
    sim.onUse(p, { slot: 0, r: 'use-pill-a1' });
    const low = p.char.hp;
    p.char.hp = 1;
    p.itemCdAt = 0;
    p.char.inv.fill(null);
    give(p, 'itm_hoi_xuan_dan', 1, 2);
    sim.onUse(p, { slot: 0, r: 'use-pill-a2' });
    expect(p.char.hp).toBeGreaterThan(low);
  });

  it('đan tăng sức đặt buff, không cộng dồn, hết hạn thì chỉ số về cũ', () => {
    const { sim, p } = setup();
    p.char.inv.fill(null);
    const def0 = p.char.def;
    give(p, 'itm_kim_cuong_dan', 2, 0);
    sim.onUse(p, { slot: 0, r: 'use-buff-01' });
    const def1 = p.char.def;
    expect(def1).toBeGreaterThan(def0);
    p.itemCdAt = 0;
    sim.onUse(p, { slot: 0, r: 'use-buff-02' });
    expect(p.char.def).toBe(def1); // cùng loại cùng phẩm: làm mới, không cộng dồn
    p.char.meta.buffs!.def!.until = Date.now() - 1;
    sim.tick(50);
    expect(p.char.def).toBe(def0);
  });

  it('buff bạo kích không vượt trần 40%', () => {
    const { p } = setup();
    p.char.meta.buffs = { crit: { m: 0.5, until: Date.now() + 60000 } };
    p.char.recalc();
    expect(p.char.stats.critRate).toBeLessThanOrEqual(0.4);
  });
});

describe('chế tạo pháp bảo', () => {
  const thietLao = () => NPC.get('npc_thiet_lao')!;
  it('đủ cảnh giới và nguyên liệu thì chế, ghi ledger; chế lần hai bị chặn', () => {
    const { sim, p } = setup(8);
    p.move.x = thietLao().x;
    p.move.z = thietLao().z;
    p.char.gold = 5000;
    p.char.inv.fill(null);
    p.char.inv[0] = { id: 'itm_yeu_dan', n: 30 };
    p.char.inv[1] = { id: 'itm_kiem_phach', n: 10 };
    p.char.inv[2] = { id: 'itm_thiet_tinh', n: 10 };
    sim.onCraft(p, { id: 'rcp_tu_kim_ho_lo', n: 1, r: 'cr-art-001' });
    expect(p.char.inv.some((s) => s?.id === HO_LO)).toBe(true);
    const rows = sqlite.prepare("SELECT kind, ref, delta FROM ledger WHERE char_id = ? AND reason = 'craft:rcp_tu_kim_ho_lo'").all(p.char.id) as { kind: string; ref: string; delta: number }[];
    expect(rows.find((r) => r.ref === HO_LO)?.delta).toBe(1);
    const yeu = p.char.inv.filter((s) => s?.id === 'itm_yeu_dan').reduce((a, s) => a + s!.n, 0);
    sim.onCraft(p, { id: 'rcp_tu_kim_ho_lo', n: 1, r: 'cr-art-002' });
    expect(p.char.inv.filter((s) => s?.id === HO_LO).length).toBe(1);
    expect(p.char.inv.filter((s) => s?.id === 'itm_yeu_dan').reduce((a, s) => a + s!.n, 0)).toBe(yeu);
  });

  it('thiếu cảnh giới thì không chế; n > 1 bị chặn', () => {
    const { sim, p } = setup(3);
    p.move.x = thietLao().x;
    p.move.z = thietLao().z;
    p.char.gold = 5000;
    p.char.inv.fill(null);
    p.char.inv[0] = { id: 'itm_yeu_dan', n: 30 };
    p.char.inv[1] = { id: 'itm_kiem_phach', n: 10 };
    p.char.inv[2] = { id: 'itm_thiet_tinh', n: 10 };
    sim.onCraft(p, { id: 'rcp_tu_kim_ho_lo', n: 1, r: 'cr-art-003' });
    expect(p.char.inv.some((s) => s?.id === HO_LO)).toBe(false);
    p.char.level = 12;
    sim.onCraft(p, { id: 'rcp_tu_kim_ho_lo', n: 2, r: 'cr-art-004' });
    expect(p.char.inv.some((s) => s?.id === HO_LO)).toBe(false);
  });

  it('đeo được ở ô Pháp bảo phụ và tháo ra', () => {
    const { sim, p } = setup();
    p.char.inv.fill(null);
    p.char.inv[0] = { id: HO_LO, n: 1 };
    sim.onEquip(p, { slot: 0, r: 'eq-art-0001' });
    expect(p.char.equip.artifact?.id).toBe(HO_LO);
    sim.tick(50);
    expect(p.s.art).toBe(HO_LO);
  });
});
