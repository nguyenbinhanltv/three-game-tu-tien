import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CLONE_CD_MS,
  CLONE_LIFE_MS,
  CLONE_MP,
  DOMAIN_EFFECT,
  S,
  domainRadius,
  domainScale,
  groundAt,
  type CloneStateMsg,
  type FxMsg,
} from '@dtl/shared';

// E4-K: phân thân thần niệm (thực thể phụ có chủ do server giữ), lĩnh vực, ô chiêu 10. Server quyết định hết.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let MONSTER: typeof import('@dtl/content').MONSTER;
let SKILL: typeof import('@dtl/content').SKILL;
let CLONE_MOVES: typeof import('@dtl/content').CLONE_MOVES;
let METHOD_SKILLS: typeof import('@dtl/content').METHOD_SKILLS;
let thanThong10Skill: typeof import('@dtl/content').thanThong10Skill;
let tierBar: typeof import('@dtl/content').tierBar;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ MONSTER, SKILL, CLONE_MOVES, METHOD_SKILLS, thanThong10Skill, tierBar } = await import('@dtl/content'));
});

afterEach(() => vi.useRealTimers());

const X = 2040;
const Z = 2040;
let acc = 9000;

interface Sent {
  type: string;
  msg: unknown;
}

function world() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(3_000_000);
  const sent: Sent[] = [];
  const host = { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) };
  const sim: Sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X + 300, z: Z },
    persistPosition: false,
  });
  sim.monsters.splice(0);
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += 50) {
      vi.setSystemTime(Date.now() + 50);
      sim.tick(50);
    }
  };
  const join = (level: number, method: string, dx = 0): Ent => {
    const char = Character.create(acc++, 'pt' + acc, null, 'kim');
    char.level = level;
    char.meta.method = method;
    char.recalc();
    char.hp = char.mhp;
    char.mp = char.mmp;
    const client = { sessionId: 'c' + acc, send: (type: string, msg: unknown) => sent.push({ type: 'to:' + type, msg }) };
    const p: Ent = sim.addPlayer(client as never, char, true, 's' + acc);
    p.move.x = X + dx;
    p.move.z = Z;
    p.move.y = groundAt(X + dx, Z);
    return p;
  };
  const mon = (x: number, z: number, hp = 1_000_000) => {
    const m = sim.spawnMonster(MONSTER.get('mon_soi_xam')!, 10, x, z, null);
    m.s.hp = m.s.mhp = hp;
    return m;
  };
  const fxs = () => sent.filter((s) => s.type === S.FX).map((s) => s.msg as FxMsg);
  const states = () => sent.filter((s) => s.type === 'to:' + S.CLONE_STATE).map((s) => s.msg as CloneStateMsg);
  advance(100);
  return { sim, sent, advance, join, mon, fxs, states };
}

const lost = (m: { s: { hp: number; mhp: number } }) => m.s.mhp - m.s.hp;

describe('dữ liệu', () => {
  it('mỗi công pháp có danh sách chiêu phân thân; ba thần thông ô 10 chơi được, không lọt vào hàng bậc cao', () => {
    for (const m of ['lac_kiem_quyet', 'bat_dong_kim_than', 'thanh_moc_dan_kinh']) {
      expect(CLONE_MOVES[m]?.moves.length, m).toBeGreaterThan(0);
      const s = thanThong10Skill(m);
      expect(s, m).toBeDefined();
      expect(s!.unlock).toBe(28);
      expect(s!.locked).toBeFalsy();
      expect(tierBar(m).includes(s!)).toBe(false);
    }
    expect(METHOD_SKILLS.filter((s) => s.unlock === 28 && s.locked)).toHaveLength(0);
  });
  it('lĩnh vực: 0 / 8 / 10 / 20 m theo cấp, lớn mạnh gấp rưỡi', () => {
    expect([24, 25, 26, 27, 28].map(domainRadius)).toEqual([0, 8, 10, 10, 20]);
    expect(domainScale(27)).toBe(1);
    expect(domainScale(28)).toBe(1.5);
  });
});

describe('tạo và thu phân thân (G)', () => {
  it('chưa Hóa Thần thì từ chối', () => {
    const { sim, join } = world();
    const p = join(27, 'lac_kiem_quyet');
    sim.onClone(p, {});
    expect(sim.clone.has(p)).toBe(false);
  });

  it('tạo ở điểm chỉ (kẹp tầm), tốn linh lực, vào hồi chiêu, báo trạng thái và FX', () => {
    const { sim, join, states, fxs } = world();
    const p = join(28, 'lac_kiem_quyet');
    const mp = p.char.mp;
    sim.onClone(p, {});
    expect(sim.clone.has(p)).toBe(true);
    const c = sim.clone.of(p)!;
    expect(Math.hypot(c.x - X, c.z - Z)).toBeLessThan(10);
    expect(p.char.mp).toBe(mp - CLONE_MP);
    expect(states().at(-1)).toMatchObject({ open: true });
    expect(states().at(-1)!.left).toBeGreaterThan(CLONE_LIFE_MS - 500);
    expect(states().at(-1)!.cd).toBeGreaterThan(CLONE_CD_MS - 500);
    expect(fxs().some((f) => f.t === 'clone_out' && f.src === p.sid)).toBe(true);
  });

  it('thiếu linh lực thì không tạo, không vào hồi chiêu', () => {
    const { sim, join, advance } = world();
    const p = join(28, 'lac_kiem_quyet');
    p.char.mp = CLONE_MP - 1;
    sim.onClone(p, {});
    expect(sim.clone.has(p)).toBe(false);
    p.char.mp = p.char.mmp;
    advance(600);
    sim.onClone(p, {});
    expect(sim.clone.has(p)).toBe(true);
  });

  it('bấm G lần nữa thu về; hồi chiêu chặn tạo lại tới khi hết', () => {
    const { sim, join, advance } = world();
    const p = join(28, 'lac_kiem_quyet');
    sim.onClone(p, {});
    advance(600);
    sim.onClone(p, {});
    expect(sim.clone.has(p)).toBe(false);
    advance(600);
    p.char.mp = p.char.mmp;
    sim.onClone(p, {});
    expect(sim.clone.has(p)).toBe(false);
    advance(CLONE_CD_MS);
    sim.onClone(p, {});
    expect(sim.clone.has(p)).toBe(true);
  });

  it('hết giờ thì tan; chủ chết cũng tan', () => {
    const { sim, join, advance, fxs } = world();
    const p = join(28, 'bat_dong_kim_than');
    sim.onClone(p, {});
    advance(CLONE_LIFE_MS + 500);
    expect(sim.clone.has(p)).toBe(false);
    expect(fxs().some((f) => f.t === 'clone_end')).toBe(true);
    advance(CLONE_CD_MS);
    p.char.mp = p.char.mmp;
    sim.onClone(p, {});
    expect(sim.clone.has(p)).toBe(true);
    sim.damagePlayer(p, p.char.mhp * 20, '');
    expect(sim.clone.has(p)).toBe(false);
  });

  it('trong kiếp, G vẫn là thế thân của kiếp, không sinh phân thân', () => {
    const { sim, join } = world();
    const p = join(28, 'lac_kiem_quyet');
    p.trib = { id: 'hoa_than', endAt: Date.now() + 80_000 } as never;
    sim.onClone(p, {});
    expect(sim.clone.has(p)).toBe(false);
  });

  it('phân thân đi theo khi chủ chạy xa', () => {
    const { sim, join, advance } = world();
    const p = join(28, 'lac_kiem_quyet');
    sim.onClone(p, {});
    p.move.x = X + 40;
    advance(5000);
    const c = sim.clone.of(p)!;
    expect(Math.hypot(c.x - p.move.x, 0)).toBeLessThan(15);
  });
});

describe('Kiếm tu: lặp chiêu của chủ ở 50% và chém một đòn khi tan', () => {
  it('chủ ra một chiêu rồi đứng im: phân thân tiếp tục đánh đúng mục tiêu', () => {
    const { sim, join, advance, mon } = world();
    const p = join(28, 'lac_kiem_quyet');
    const m = mon(X + 8, Z);
    p.gcdAt = 0;
    p.cds.clear();
    sim.onSkill(p, { id: 'skl_phi_kiem', t: m.id });
    advance(1200);
    sim.onClone(p, {});
    const before = lost(m);
    advance(4500);
    expect(lost(m)).toBeGreaterThan(before);
  });

  it('chiêu cuối khi tan gây thêm sát thương', () => {
    const { sim, join, advance, mon, fxs } = world();
    const p = join(28, 'lac_kiem_quyet');
    const m = mon(X + 8, Z);
    sim.onClone(p, {});
    // Dời mốc lặp chiêu ra xa để chỉ còn chiêu cuối.
    advance(CLONE_LIFE_MS - 300);
    const before = lost(m);
    const acts = fxs().filter((f) => f.t === 'clone_act').length;
    advance(600);
    expect(sim.clone.has(p)).toBe(false);
    expect(lost(m)).toBeGreaterThan(before);
    expect(fxs().filter((f) => f.t === 'clone_act').length).toBeGreaterThan(acts);
  });

  it('không có mục tiêu trong tầm thì không đánh gì', () => {
    const { sim, join, advance, mon } = world();
    const p = join(28, 'lac_kiem_quyet');
    const m = mon(X + 200, Z);
    sim.onClone(p, {});
    advance(CLONE_LIFE_MS + 500);
    expect(lost(m)).toBe(0);
  });

  it('không cộng kiếm ý hay vòng sạc cho chủ', () => {
    const { sim, join, advance, mon } = world();
    const p = join(28, 'lac_kiem_quyet');
    const m = mon(X + 8, Z);
    m.stunUntil = Date.now() + 60_000;
    sim.onClone(p, {});
    const ch = p.mth.charge;
    advance(6000);
    expect(p.mth.res).toBe(0);
    expect(p.mth.charge).toBe(ch);
  });
});

describe('Hộ pháp: phân thân khiêu khích và gánh đòn', () => {
  it('quái trong vùng bị khiêu khích nhắm chủ; gánh 60% sát thương quái ở gần phân thân', () => {
    const { sim, join, advance, mon } = world();
    const p = join(28, 'bat_dong_kim_than');
    const m = mon(X + 6, Z);
    sim.onClone(p, {});
    advance(3600);
    expect(m.taunt?.sid).toBe(p.sid);
    const base = Character.create(acc++, 'ref' + acc, null, 'kim');
    base.level = 28;
    base.meta.method = 'bat_dong_kim_than';
    base.recalc();
    const raw = 400;
    // Cùng đòn không có phân thân: chỉ lĩnh vực giảm.
    const q = world();
    const p2 = q.join(28, 'bat_dong_kim_than');
    const m2 = q.mon(X + 6, Z);
    const hp2 = p2.char.hp;
    q.sim.damagePlayer(p2, raw, m2.id);
    const withoutClone = hp2 - p2.char.hp;
    // Dựng lại thế giới đầu (đồng hồ giả bị đặt lại ở `world()` thứ hai nhưng đồng hồ sim của mỗi bên đọc Date.now chung).
    const hp = p.char.hp;
    sim.damagePlayer(p, raw, m.id);
    const withClone = hp - p.char.hp;
    expect(withClone).toBeLessThan(withoutClone * 0.5);
    expect(sim.clone.of(p)!.hp).toBeLessThan(sim.clone.of(p)!.mhp);
  });

  it('quái đứng ngoài vùng khiêu khích thì phân thân không gánh', () => {
    const { sim, join, mon } = world();
    const p = join(28, 'bat_dong_kim_than');
    const m = mon(X + 60, Z);
    sim.onClone(p, {});
    const c0 = sim.clone.of(p)!.hp;
    sim.damagePlayer(p, 300, m.id);
    expect(sim.clone.of(p)!.hp).toBe(c0);
  });

  it('gánh quá khí huyết thì phân thân vỡ và tan', () => {
    const { sim, join, mon, fxs } = world();
    const p = join(28, 'bat_dong_kim_than');
    const m = mon(X + 6, Z);
    sim.onClone(p, {});
    p.god = true;
    for (let i = 0; i < 40 && sim.clone.has(p); i++) sim.damagePlayer(p, p.char.mhp, m.id);
    expect(sim.clone.has(p)).toBe(false);
    expect(fxs().some((f) => f.t === 'clone_end' && f.pg === 1)).toBe(true);
  });
});

describe('Đan sư: phân thân hồi đồng đội quanh nó', () => {
  it('đồng đội trong vùng được hồi, người đứng ngoài thì không', () => {
    const { sim, join, advance } = world();
    const p = join(28, 'thanh_moc_dan_kinh');
    const near = join(28, 'lac_kiem_quyet', 3);
    const far = join(28, 'lac_kiem_quyet', 90);
    sim.onClone(p, {});
    // Lĩnh vực cũng hồi quanh chủ: ghim phân thân bằng cách hạ máu rồi so với bản không có phân thân ở người đứng xa.
    near.char.hp = Math.round(near.char.mhp * 0.3);
    far.char.hp = Math.round(far.char.mhp * 0.3);
    const n0 = near.char.hp;
    const f0 = far.char.hp;
    advance(2300);
    // Ngoài vùng vẫn có hồi tự nhiên, nên so mức tăng.
    expect(near.char.hp - n0 - (far.char.hp - f0)).toBeGreaterThan(near.char.mhp * 0.04);
  });
});

describe('Lĩnh vực', () => {
  it('Kiếm tu cộng bạo kích, mức lớn gấp rưỡi mức nhỏ; công pháp khác không có', () => {
    const { sim, join } = world();
    const k25 = join(25, 'lac_kiem_quyet');
    const k28 = join(28, 'lac_kiem_quyet');
    const t28 = join(28, 'bat_dong_kim_than');
    const k24 = join(24, 'lac_kiem_quyet');
    expect(sim.domain.critAdd(k24)).toBe(0);
    expect(sim.domain.critAdd(k25)).toBeCloseTo(DOMAIN_EFFECT.dps.crit);
    expect(sim.domain.critAdd(k28)).toBeCloseTo(DOMAIN_EFFECT.dps.crit * 1.5);
    expect(sim.domain.critAdd(t28)).toBe(0);
  });

  it('Hộ pháp giảm sát thương cho đồng đội trong vùng, không cho người ngoài vùng', () => {
    const { sim, join, advance } = world();
    const t = join(28, 'bat_dong_kim_than');
    const ally = join(28, 'lac_kiem_quyet', 10);
    const out = join(28, 'lac_kiem_quyet', 80);
    advance(1200);
    expect(sim.domain.reduce(t)).toBeCloseTo(DOMAIN_EFFECT.tank.reduce * 1.5);
    expect(sim.domain.reduce(ally)).toBeCloseTo(DOMAIN_EFFECT.tank.reduce * 1.5);
    expect(sim.domain.reduce(out)).toBe(0);
  });

  it('Đan sư hồi dần đồng đội trong vùng mỗi giây', () => {
    const { sim, join, advance } = world();
    const d = join(28, 'thanh_moc_dan_kinh');
    void sim;
    d.char.hp = Math.round(d.char.mhp * 0.5);
    const h0 = d.char.hp;
    advance(3500);
    expect(d.char.hp).toBeGreaterThan(h0);
  });
});

describe('Lĩnh vực: chủ chết thì hết tác dụng', () => {
  it('hộ pháp chết không còn giảm sát thương, đan sư chết không còn hồi', () => {
    const { sim, join, advance } = world();
    const t = join(28, 'bat_dong_kim_than');
    const ally = join(28, 'lac_kiem_quyet', 5);
    const d = join(28, 'thanh_moc_dan_kinh', 8);
    const far = join(28, 'lac_kiem_quyet', 90);
    advance(1200);
    expect(sim.domain.reduce(ally)).toBeGreaterThan(0);
    sim.damagePlayer(t, t.char.mhp * 50, '');
    sim.damagePlayer(d, d.char.mhp * 50, '');
    ally.char.hp = Math.round(ally.char.mhp * 0.4);
    far.char.hp = ally.char.hp;
    const h0 = ally.char.hp;
    advance(3500);
    expect(sim.domain.reduce(ally)).toBe(0);
    // Chỉ còn hồi tự nhiên như người đứng xa.
    expect(ally.char.hp - h0).toBeCloseTo(far.char.hp - h0, 0);
  });
});

describe('nhiệm vụ s4_thu_niem', () => {
  it('hóa phân thân một lần thì hoàn thành mục tiêu clone', () => {
    const { sim, join } = world();
    const p = join(28, 'lac_kiem_quyet');
    p.char.quests.active.s4_thu_niem = [0];
    sim.onClone(p, {});
    expect(p.char.quests.active.s4_thu_niem[0]).toBe(1);
  });
});

describe('chống khai thác', () => {
  it('chủ ngự kiếm lơ lửng: không tạo được; đang có phân thân mà bay lên thì phân thân tan', () => {
    const { sim, join, advance } = world();
    const p = join(28, 'lac_kiem_quyet');
    p.move.flying = true;
    p.move.grounded = false;
    sim.onClone(p, {});
    expect(sim.clone.has(p)).toBe(false);
    p.move.flying = false;
    p.move.grounded = true;
    advance(600);
    sim.onClone(p, {});
    expect(sim.clone.has(p)).toBe(true);
    // Xuất khiếu (thám thính) giữa lúc có phân thân: phân thân tan.
    sim.soul.command(p, {});
    expect(sim.soul.isScouting(p)).toBe(true);
    advance(600);
    expect(sim.clone.has(p)).toBe(false);
  });
  it('chủ mất kết nối thì phân thân tan; có phân thân thì không đả tọa được', () => {
    const { sim, join, advance } = world();
    const p = join(28, 'lac_kiem_quyet');
    sim.onClone(p, {});
    sim.onMeditate(p, { on: true });
    expect(p.meditating).toBeFalsy();
    p.connected = false;
    advance(600);
    expect(sim.clone.has(p)).toBe(false);
  });
  it('echo tôn trọng hồi chiêu gốc: chiêu cd 60 s lặp đúng một lần trong 20 s, chiêu cd ngắn lặp nhiều lần', () => {
    const run = (id: string, fxId: string) => {
      const { sim, join, advance, mon, fxs } = world();
      const p = join(28, 'lac_kiem_quyet');
      const m = mon(X + 8, Z);
      m.stunUntil = Date.now() + 60_000;
      p.gcdAt = 0;
      p.cds.clear();
      sim.onSkill(p, { id, t: m.id });
      advance(900);
      sim.onClone(p, {});
      advance(CLONE_LIFE_MS - 2500);
      return fxs().filter((f) => f.t === 'clone_act' && f.s === fxId).length;
    };
    const longSk = SKILL.get('skl_thien_kiem_hoa_hinh')!;
    const shortSk = SKILL.get('skl_phi_kiem')!;
    expect(longSk.cd).toBeGreaterThanOrEqual(60);
    expect(shortSk.cd).toBeLessThan(5);
    expect(run(longSk.id, longSk.fx)).toBe(1);
    // Spy đếm được: chiêu cd ngắn lặp ≥ 3 lần trong ~17 s.
    expect(run(shortSk.id, shortSk.fx)).toBeGreaterThanOrEqual(3);
  });
});

describe('tải: 50 người cùng gọi phân thân', () => {
  it('tick server vẫn thấp khi 50 phân thân cùng hoạt động giữa đám quái', () => {
    const w = world();
    const methods = ['lac_kiem_quyet', 'bat_dong_kim_than', 'thanh_moc_dan_kinh'];
    const ps: Ent[] = [];
    for (let i = 0; i < 50; i++) ps.push(w.join(28, methods[i % 3], (i % 10) * 4));
    for (let i = 0; i < 40; i++) w.mon(X + (i % 10) * 4 + 3, Z + 6 + Math.floor(i / 10) * 3, 5_000_000);
    for (const p of ps) {
      p.gcdAt = 0;
      p.cds.clear();
      if (methods.indexOf(p.char.meta.method!) === 0) w.sim.onSkill(p, { id: 'skl_phi_kiem', t: [...w.sim.monsters][0].id });
    }
    w.advance(600);
    for (const p of ps) w.sim.onClone(p, {});
    expect(ps.filter((p) => w.sim.clone.has(p))).toHaveLength(50);
    w.sim.tickSamples.length = 0;
    w.advance(10_000);
    const s = [...w.sim.tickSamples].sort((a, b) => a - b);
    const avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
    console.log(
      `[e4k] 50 phân thân: ${s.length} tick, trung bình ${avg.toFixed(2)} ms, p95 ${s[Math.floor(s.length * 0.95)]?.toFixed(2)} ms, lớn nhất ${s.at(-1)?.toFixed(2)} ms`,
    );
    // Dùng trung vị (không phải trung bình) để không rớt oan khi máy đang chạy song song nhiều bộ test.
    expect(s[Math.floor(s.length / 2)]).toBeLessThan(10);
  });
});
