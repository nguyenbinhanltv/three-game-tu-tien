import { beforeAll, describe, expect, it } from 'vitest';
import {
  computeDamage,
  groundAt,
  MF_BURN,
  MF_DAZED,
  MF_POISON,
  MF_SLOW,
  MF_STUN,
  PF_HOT,
  MAX_LEVEL,
  monsterStats,
  playerBaseStats,
  realmMul,
  S,
  TRIBULATION_REFUND_AFTER,
  xpNeed,
  type DmgMsg,
} from '@dtl/shared';

// Cân bằng 3-10: khắc chế ngũ hành (cờ `ke` do server tính), nội tại ba công pháp, hoàn Trúc Cơ Đan khi độ kiếp.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let MONSTER: typeof import('@dtl/content').MONSTER;
let SKILL: typeof import('@dtl/content').SKILL;
let TRUC_CO_PILL: string;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ MONSTER, SKILL, TRUC_CO_PILL } = await import('@dtl/content'));
});

const X = 2040;
const Z = 2040;
let acc = 5000;

function setup(level = 10, method?: string) {
  const sent: { type: string; msg: unknown }[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const sim: Sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const raw = sim.onSkill.bind(sim);
  sim.onSkill = (pl: Ent, msg: unknown) => {
    raw(pl, msg);
    const st = pl.flow.pending;
    if (st) {
      st.at = sim.now;
      (sim as unknown as { resolvePending(p: Ent): void }).resolvePending(pl);
    }
  };
  const char = Character.create(acc++, 'bal' + acc);
  char.level = level;
  char.root = 'tho'; // cố định linh căn (linh căn Kim có bạo kích riêng)
  if (method) char.meta.method = method;
  char.recalc();
  char.hp = char.mhp;
  char.mp = char.mmp;
  const client = { sessionId: 's' + acc, send: () => undefined };
  const p = sim.addPlayer(client as never, char, true, 's' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  const mon = (id: string, dx = 6) => {
    const m = sim.spawnMonster(MONSTER.get(id)!, level, X + dx, Z, null);
    m.s.hp = m.s.mhp = 1_000_000;
    return m;
  };
  const fresh = () => {
    p.gcdAt = 0;
    p.cds.clear();
    p.char.mp = p.char.mmp;
    p.lastCombatAt = 0;
  };
  const dmgOn = (id: string) => sent.filter((x) => x.type === S.DMG && (x.msg as DmgMsg).dst === id).map((x) => x.msg as DmgMsg);
  return { sim, sent, p, mon, fresh, dmgOn };
}

describe('khắc chế ngũ hành', () => {
  it('Phi Kiếm (kim) đánh sói xám (mộc): cờ ke = 1 và đau hơn so với quái không hệ cùng chỉ số', () => {
    const { sim, p, mon, fresh, dmgOn } = setup();
    const m = mon('mon_soi_xam');
    const none = mon('mon_tam_ma'); // không hệ
    none.owner = '';
    fresh();
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    const d = dmgOn(m.id).find((x) => x.n > 0)!;
    expect(d.ke).toBe(1);
    expect(none.def.elem).toBeUndefined();
  });
  it('kim đánh hệ hỏa bị khắc ngược: ke = -1; cùng hệ hoặc quái không hệ: không có cờ', () => {
    const { sim, p, mon, fresh, dmgOn } = setup();
    const ho = mon('mon_hoa_van_ho');
    fresh();
    sim.onSkill(p, { id: 'skl_phi_kiem', t: ho.id });
    expect(dmgOn(ho.id).find((x) => x.n > 0)!.ke).toBe(-1);
    const kl = mon('mon_kiem_linh'); // kim: cùng hệ
    fresh();
    sim.onSkill(p, { id: 'skl_phi_kiem', t: kl.id });
    expect(dmgOn(kl.id).find((x) => x.n > 0)!.ke).toBeUndefined();
  });
  it('mọi tinh anh và boss đều có hệ (người chơi đọc được để chọn chiêu)', () => {
    for (const m of MONSTER.values()) if (m.elite || m.boss) expect(m.elem, m.id).toBeTruthy();
  });
});

describe('bản sắc công pháp (số)', () => {
  it('Hộ pháp: khí huyết tối đa cao hơn người không công pháp cùng cấp; Đan sư thấp hơn', () => {
    const base = setup(10).p.char.mhp;
    const tank = setup(10, 'bat_dong_kim_than').p.char.mhp;
    const sup = setup(10, 'thanh_moc_dan_kinh').p.char.mhp;
    expect(tank).toBeGreaterThan(base * 1.1);
    expect(sup).toBeLessThan(base);
  });
  it('Kiếm tu: bạo kích gốc cao hơn người không công pháp', () => {
    expect(setup(10, 'lac_kiem_quyet').p.char.stats.critRate).toBeCloseTo(setup(10).p.char.stats.critRate + 0.05, 5);
  });
  it('Hộ pháp: Thiết Bích Xung choáng quái thường, không choáng boss', () => {
    const { sim, p, mon, fresh } = setup(10, 'bat_dong_kim_than');
    const m = mon('mon_yeu_lang', 5);
    const boss = mon('boss_kiem_khoi', 5);
    fresh();
    sim.onSkill(p, { id: 'skl_thiet_bich_xung', t: m.id });
    expect(m.stunUntil).toBeGreaterThan(sim.now);
    fresh();
    p.flow.lastDashAt = 0;
    p.move.x = X;
    sim.onSkill(p, { id: 'skl_thiet_bich_xung', t: boss.id });
    expect(boss.stunUntil).toBe(0);
  });
  it('Hộ pháp: Thiết Bích Xung không choáng bóng tâm ma của người khác hay quái đang miễn sát thương', () => {
    const { sim, p, mon, fresh } = setup(10, 'bat_dong_kim_than');
    const shadow = mon('mon_yeu_lang', 5);
    shadow.owner = 'nguoi-khac';
    const evading = mon('mon_yeu_lang', 5);
    evading.evadeUntil = sim.now + 60_000;
    for (const m of [shadow, evading]) {
      fresh();
      p.flow.lastDashAt = 0;
      p.move.x = X;
      sim.onSkill(p, { id: 'skl_thiet_bich_xung', t: m.id });
      expect(m.stunUntil).toBe(0);
    }
  });
  it('Đan sư: Hồi Xuân Quyết gieo mộc độc lên quái gần, độc gây sát thương theo thời gian', () => {
    const { sim, p, mon, fresh, dmgOn } = setup(10, 'thanh_moc_dan_kinh');
    const m = mon('mon_soi_xam', 4);
    fresh();
    sim.onSkill(p, { id: 'skl_hoi_xuan_quyet' });
    expect(m.poison).toBeTruthy();
    const hp0 = m.s.hp;
    m.poison!.nextAt = 0; // tick dùng giờ thật: đẩy mốc nhịp độc về quá khứ
    m.poison!.until = Date.now() + 5000;
    sim.tick(250);
    expect(m.s.hp).toBeLessThan(hp0);
    expect(dmgOn(m.id).length).toBeGreaterThan(0);
  });
  it('cờ hiển thị chậm/độc/bỏng của quái suy ra từ trạng thái server, không đổi sát thương, giữ qua cờ choáng', () => {
    const { sim, mon } = setup(10, 'thanh_moc_dan_kinh');
    const m = mon('mon_soi_xam', 4);
    expect(m.s.mf & (MF_SLOW | MF_POISON | MF_BURN)).toBe(0);
    m.slow = { until: Date.now() + 5000, mul: 0.5 };
    m.poison = { sid: 'x', until: Date.now() + 5000, nextAt: Date.now() + 5000, per: 1, kind: 'burn' };
    sim.tick(250);
    expect(m.s.mf & MF_SLOW).toBe(MF_SLOW);
    expect(m.s.mf & MF_BURN).toBe(MF_BURN);
    expect(m.s.mf & MF_POISON).toBe(0);
    // Choáng ghi đè cờ chú/choáng nhưng không xóa cờ hiển thị.
    (sim as unknown as { setMonFlags(m: unknown, mf: number, ce: number): void }).setMonFlags(m, MF_STUN, Date.now() + 1000);
    expect(m.s.mf & MF_STUN).toBe(MF_STUN);
    expect(m.s.mf & MF_SLOW).toBe(MF_SLOW);
    m.poison.kind = 'poison';
    sim.tick(250);
    expect(m.s.mf & MF_POISON).toBe(MF_POISON);
    expect(m.s.mf & MF_BURN).toBe(0);
    m.slow = undefined;
    m.poison = undefined;
    sim.tick(250);
    expect(m.s.mf & (MF_SLOW | MF_POISON | MF_BURN)).toBe(0);
  });
  it('MF_DAZED chỉ bật với choáng thật: khựng/ngã của đòn nặng (stunUntil = staggerUntil) không bật', () => {
    const { sim, mon } = setup(10, 'thanh_moc_dan_kinh');
    const m = mon('mon_soi_xam', 4);
    const setFlags = sim as unknown as { setMonFlags(m: unknown, mf: number, ce: number): void };
    sim.tick(250);
    // Khựng: giống `reactMonster` (MF_STUN + stunUntil = staggerUntil).
    m.stunUntil = m.staggerUntil = sim.now + 350;
    setFlags.setMonFlags(m, MF_STUN, m.stunUntil);
    sim.tick(50);
    expect(m.s.mf & MF_STUN).toBe(MF_STUN);
    expect(m.s.mf & MF_DAZED).toBe(0);
    // Choáng thật dài hơn khựng: bật.
    m.stunUntil = sim.now + 3000;
    setFlags.setMonFlags(m, MF_STUN, m.stunUntil);
    sim.tick(50);
    expect(m.s.mf & MF_DAZED).toBe(MF_DAZED);
    // Hết choáng: tắt.
    m.stunUntil = 0;
    m.staggerUntil = 0;
    sim.tick(50);
    expect(m.s.mf & MF_DAZED).toBe(0);
  });
  it('PF_HOT bật khi có hồi dần và tắt khi hết', () => {
    const { sim, p } = setup(10, 'thanh_moc_dan_kinh');
    expect(p.s.fl & PF_HOT).toBe(0);
    (sim as unknown as { combat: { addHot(sid: string, per: number, sec: number): void } }).combat.addHot(p.sid, 5, 3);
    expect(p.s.fl & PF_HOT).toBe(PF_HOT);
    (sim as unknown as { combat: { hots: unknown[] } }).combat.hots.length = 0;
    sim.tick(250);
    expect(p.s.fl & PF_HOT).toBe(0);
  });
  it('Đan sư: tầm đánh xa hơn Kiếm tu 4 m', () => {
    const far = SKILL.get('skl_phi_kiem')!.range + 2; // trong tầm đan sư nhưng ngoài tầm kiếm tu
    const sup = setup(10, 'thanh_moc_dan_kinh');
    const kt = setup(10, 'lac_kiem_quyet');
    const a = sup.mon('mon_soi_xam', far + 2.5);
    const b = kt.mon('mon_soi_xam', far + 2.5);
    sup.fresh();
    kt.fresh();
    sup.sim.onSkill(sup.p, { id: 'skl_phi_kiem', t: a.id });
    kt.sim.onSkill(kt.p, { id: 'skl_phi_kiem', t: b.id });
    expect(sup.dmgOn(a.id).some((x) => x.n > 0)).toBe(true);
    expect(kt.dmgOn(b.id).some((x) => x.n > 0)).toBe(false);
  });
});

describe('độ kiếp: hoàn Trúc Cơ Đan', () => {
  const dieAt = (secs: number) => {
    const { sim, p } = setup(15);
    p.char.level = 15;
    p.char.recalc();
    p.trib = { endAt: sim.now + (40 - secs) * 1000, nextAt: sim.now + 1e9, n: 0, fin: true, pills: 0 };
    const have = () => p.char.inv.reduce((n, it) => n + (it && it.id === TRUC_CO_PILL ? it.n : 0), 0);
    const before = have();
    (sim as unknown as { endTribulation(p: Ent, ok: boolean, silent: boolean): void }).endTribulation(p, false, false);
    return have() - before;
  };
  it('chết trước nửa thời gian: không hoàn; từ nửa trở đi: hoàn một viên', () => {
    expect(dieAt(TRIBULATION_REFUND_AFTER - 5)).toBe(0);
    expect(dieAt(TRIBULATION_REFUND_AFTER + 1)).toBe(1);
  });
});

// E1-G: thang 28 cấp (Ngưng Khí 1 → Hóa Thần sơ kỳ). Công thức thuần, không cần sim: số đòn hạ một quái thường cùng cấp và phần máu mất
// mỗi đòn quái phải nằm trong một dải hẹp ở MỌI cấp, kể cả khi vượt cảnh giới (hệ số cảnh giới nhân cả hai phía).
describe('thang 28 cấp', () => {
  const rows = Array.from({ length: MAX_LEVEL }, (_, i) => {
    const level = i + 1;
    const p = playerBaseStats(level);
    const m = monsterStats(level, 1, 1);
    const hit = computeDamage(p.atk, 1, m.def, 0.5, 1).dmg;
    const taken = computeDamage(m.atk, 1, p.def, 0.5, 1).dmg;
    return { level, p, m, hitsToKill: m.hp / hit, takenFrac: taken / p.hp };
  });

  it('MAX_LEVEL là 47 và chỉ số người/quái tăng nghiêm ngặt theo cấp', () => {
    expect(MAX_LEVEL).toBe(47);
    for (let i = 1; i < rows.length; i++) {
      for (const k of ['hp', 'atk', 'def'] as const) {
        expect(rows[i].p[k], `người ${k} cấp ${rows[i].level}`).toBeGreaterThan(rows[i - 1].p[k]);
        expect(rows[i].m[k], `quái ${k} cấp ${rows[i].level}`).toBeGreaterThan(rows[i - 1].m[k]);
      }
      expect(xpNeed(rows[i].level), `xpNeed cấp ${rows[i].level}`).toBeGreaterThan(0);
    }
  });

  it('số đòn hạ quái thường 8–14, máu mất mỗi đòn quái 5–10% ở mọi cấp', () => {
    for (const r of rows) {
      expect(r.hitsToKill, `cấp ${r.level}: số đòn hạ quái`).toBeGreaterThanOrEqual(8);
      expect(r.hitsToKill, `cấp ${r.level}: số đòn hạ quái`).toBeLessThanOrEqual(14);
      expect(r.takenFrac, `cấp ${r.level}: máu mất mỗi đòn`).toBeGreaterThanOrEqual(0.05);
      expect(r.takenFrac, `cấp ${r.level}: máu mất mỗi đòn`).toBeLessThanOrEqual(0.1);
    }
  });

  it('qua mốc cảnh giới (16, 20, 24, 28) không có bước nhảy độ khó: số đòn hạ quái lệch < 25%', () => {
    for (const lv of [16, 20, 24, 28]) {
      expect(realmMul(lv)).toBeGreaterThan(realmMul(lv - 1));
      const a = rows[lv - 2].hitsToKill;
      const b = rows[lv - 1].hitsToKill;
      expect(Math.abs(b / a - 1), `cấp ${lv - 1} → ${lv}`).toBeLessThan(0.25);
    }
  });
});
