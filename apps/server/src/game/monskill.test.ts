import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, type HazardMsg, MF_BURROW, MF_FACE, MF_REFLECT, MF_WEAK, MS_CHASE, type MonsterAi, S, VALLEY } from '@dtl/shared';

// Nguyên tắc quái mở rộng (E1-E): server phán định theo vị trí người chơi lúc vạch nổ.
// DB trong bộ nhớ: sim.ts kéo theo character.ts → db.ts.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let PlayerS: typeof import('../state').PlayerS;
let MONSTER: typeof import('@dtl/content').MONSTER;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState, PlayerS } = await import('../state'));
  ({ MONSTER } = await import('@dtl/content'));
});

const X = VALLEY.x + 40;
const Z = VALLEY.z + 40;
const T0 = 1_000_000;
const DT = 50;

interface Sent {
  type: string;
  msg: unknown;
}

type Private = {
  tickMonster(m: unknown, dt: number): void;
  tickHazards(): void;
};

function makePlayer(sim: Sim, sid: string, x: number, z: number) {
  const p = {
    sid,
    s: new PlayerS(),
    move: { x, y: groundAt(x, z), z },
    char: { def: 5, hp: 1000, mhp: 1000, meta: {} },
    mth: { guardUntil: 0, guardReduce: 0 },
    shield: null,
    meditating: false,
    lastCombatAt: 0,
    hazardWin: { until: 0, taken: 0 },
    client: { send: () => {} },
  };
  sim.players.set(sid, p as never);
  return p;
}

/** Quái thử (khung của Hỏa Vân Hồ, bộ chiêu `ai` tự đặt) đứng ở (X, Z), người chơi p1 ở (X, Z + 8) trong tầm. */
function setup(ai: MonsterAi, defExtra: Record<string, unknown> = {}) {
  const sent: Sent[] = [];
  const sim: Sim = new GameSim(new WorldState(), { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const base = MONSTER.get('mon_hoa_van_ho')!;
  const def = { ...base, ai, ...defExtra };
  const mon = sim.spawnMonster(def, 10, X, Z, null);
  // Cho đánh ngay lần đầu: chiêu nào sẵn sàng thì dùng ở tick đầu.
  mon.state = MS_CHASE;
  mon.target = 'p1';
  mon.attackAt = Number.MAX_SAFE_INTEGER;
  for (const k of Object.keys(ai)) (mon.mx.next as Record<string, number>)[k] = 1;
  const p = makePlayer(sim, 'p1', X, Z + 8);
  const priv = sim as unknown as Private;
  let t = T0;
  sim.now = t;
  /** Chạy `ms` mili giây giả: mỗi bước tick quái rồi vạch, như vòng tick thật. */
  const run = (ms: number) => {
    const end = t + ms;
    while (t < end) {
      t += DT;
      sim.now = t;
      priv.tickMonster(mon, DT / 1000);
      priv.tickHazards();
    }
  };
  const hazards = () => sent.filter((x) => x.type === S.HAZARD).map((x) => x.msg as HazardMsg);
  return { sim, sent, mon, p, run, hazards, now: () => t };
}

const hp = (p: { char: { hp: number } }) => p.char.hp;

describe('line: đường thẳng', () => {
  const LINE: MonsterAi = { line: { cd: 8, range: 10, r: 12, w: 2, delay: 1.2, mul: 1.5, kind: 'fire' } };

  it('đứng trong vạch lúc nổ thì trúng, người đứng ngoài bề ngang thì không', () => {
    const { sim, p, run, hazards } = setup(LINE);
    const q = makePlayer(sim, 'p2', X + 4, Z + 8);
    run(DT);
    const [h] = hazards();
    expect(h).toMatchObject({ sh: 'rect', mv: 'line', r: 12, w: 2, delay: 1.2 });
    expect(hp(p)).toBe(1000);
    run(1300);
    expect(hp(p)).toBeLessThan(1000);
    expect(hp(q)).toBe(1000);
  });

  it('bước ngang ra khỏi vạch trước giờ nổ thì né được; chưa tới giờ thì chưa trúng', () => {
    const { p, run } = setup(LINE);
    run(DT);
    run(800);
    expect(hp(p)).toBe(1000);
    p.move.x += 3;
    run(800);
    expect(hp(p)).toBe(1000);
  });

  it('quái đứng yên khóa hướng trong lúc báo, không đánh thường', () => {
    const { mon, run } = setup(LINE);
    const x0 = mon.s.x;
    run(DT);
    const yaw = mon.s.yaw;
    run(900);
    expect(mon.s.x).toBe(x0);
    expect(mon.s.yaw).toBe(yaw);
  });

  it('mục tiêu ngoài `range` thì chưa ra chiêu', () => {
    const { p, run, hazards } = setup(LINE, { speed: 0 });
    p.move.z = Z + 11;
    run(500);
    expect(hazards()).toHaveLength(0);
  });
});

describe('charge: lao tới', () => {
  const CHARGE: MonsterAi = { charge: { cd: 10, min: 4, range: 16, r: 14, w: 2.4, delay: 1, mul: 1.6, speed: 20, kind: 'fire' } };

  it('trúng người đứng trên đường lúc nổ; lao hết đường rồi dừng; người ngoài bề ngang không trúng', () => {
    const { sim, mon, p, run, hazards } = setup(CHARGE);
    p.move.z = Z + 10;
    const q = makePlayer(sim, 'p2', X + 5, Z + 6);
    run(DT);
    const [h] = hazards();
    expect(h).toMatchObject({ sh: 'rect', mv: 'charge', delay: 1 });
    expect(h.r).toBeGreaterThan(5);
    run(1100);
    expect(hp(p)).toBeLessThan(1000);
    expect(hp(q)).toBe(1000);
    for (let i = 0; i < 40 && mon.mx.act; i++) run(DT);
    expect(mon.mx.act).toBeNull();
    expect(mon.s.z).toBeCloseTo(Z + h.r, 0);
  });

  it('né sang ngang trước giờ nổ thì không trúng, quái vẫn lao qua chỗ cũ', () => {
    const { mon, p, run } = setup(CHARGE);
    p.move.z = Z + 10;
    run(DT);
    p.move.x += 4;
    run(2500);
    expect(hp(p)).toBe(1000);
    expect(mon.s.z).toBeGreaterThan(Z + 10);
  });

  it('mục tiêu sát hơn `min` thì không lao', () => {
    const { p, run, hazards } = setup(CHARGE);
    p.move.z = Z + 2;
    run(300);
    expect(hazards()).toHaveLength(0);
  });

  it('bị quỵ (hủy chiêu) khi đang báo thì không lao nữa, vạch vẫn nổ đúng chỗ', () => {
    const { sim, mon, p, run } = setup(CHARGE, { speed: 0 });
    p.move.z = Z + 10;
    run(DT);
    sim.monSkills.cancel(mon);
    run(2000);
    expect(mon.s.z).toBe(Z);
    expect(hp(p)).toBeLessThan(1000);
  });
});

describe('leap: nhảy đập', () => {
  const LEAP: MonsterAi = { leap: { cd: 8, min: 3, range: 14, r: 3.5, delay: 1, mul: 1.8, kind: 'fire' } };

  it('khóa chỗ mục tiêu đứng lúc bắt đầu: ở lại chỗ đó thì trúng, quái đáp đúng vạch', () => {
    const { mon, p, run, hazards } = setup(LEAP);
    run(DT);
    const [h] = hazards();
    expect(h).toMatchObject({ mv: 'leap', r: 3.5, x: X, z: Z + 8 });
    run(1200);
    expect(hp(p)).toBeLessThan(1000);
    expect(mon.s.x).toBeCloseTo(X);
    expect(mon.s.z).toBeCloseTo(Z + 8);
  });

  it('chạy ra khỏi vòng trước giờ nổ thì né; người ngoài vòng không trúng', () => {
    const { sim, p, run } = setup(LEAP);
    const q = makePlayer(sim, 'p2', X + 5, Z + 8);
    run(DT);
    p.move.z += 5;
    run(1300);
    expect(hp(p)).toBe(1000);
    expect(hp(q)).toBe(1000);
  });

  it('đang bay giữa chừng quái nằm giữa chỗ cũ và chỗ đáp, nhấc khỏi mặt đất; đứng yên ở chỗ cũ trước đó', () => {
    const { mon, run } = setup(LEAP);
    run(DT);
    run(500);
    expect(mon.s.z).toBe(Z);
    run(400);
    expect(mon.s.z).toBeGreaterThan(Z);
    expect(mon.s.z).toBeLessThan(Z + 8);
    expect(mon.s.y).toBeGreaterThan(groundAt(mon.s.x, mon.s.z) + 0.2);
  });

  it('bị quỵ giữa lúc bay thì hạ xuống mặt đất, không treo lơ lửng', () => {
    const { sim, mon, run } = setup(LEAP, { speed: 0 });
    run(DT);
    run(850);
    expect(mon.s.y).toBeGreaterThan(groundAt(mon.s.x, mon.s.z) + 0.2);
    sim.monSkills.cancel(mon);
    expect(mon.s.y).toBeCloseTo(groundAt(mon.s.x, mon.s.z));
    run(500);
    expect(mon.s.y).toBeCloseTo(groundAt(mon.s.x, mon.s.z));
  });

  it('mục tiêu sát hơn `min` thì không nhảy', () => {
    const { p, run, hazards } = setup(LEAP);
    p.move.z = Z + 1.5;
    run(300);
    expect(hazards()).toHaveLength(0);
  });
});

describe('burrow: chui đất', () => {
  const BURROW: MonsterAi = {
    burrow: { cd: 14, range: 20, hide: 2, n: 3, r: 2, spread: 5, mul: 1.5, cone: { r: 14, w: 25, delay: 1.5, mul: 2 }, kind: 'fire' },
  };

  it('chui xuống: cờ MF_BURROW, miễn sát thương, để lại 3 vạch tròn quanh người chơi', () => {
    const { sim, mon, run, hazards } = setup(BURROW);
    run(DT);
    expect(mon.s.mf & MF_BURROW).toBeTruthy();
    const hs = hazards();
    expect(hs).toHaveLength(3);
    for (const h of hs) {
      expect(h).toMatchObject({ mv: 'burrow', r: 2, delay: 2 });
      expect(Math.hypot(h.x - X, h.z - (Z + 8))).toBeCloseTo(5, 3);
    }
    const before = mon.s.hp;
    sim.damageMonster(mon, 500, null);
    expect(mon.s.hp).toBe(before);
  });

  it('đứng trên một vạch lúc nổ thì trúng; đứng giữa (ngoài mọi vạch) thì không', () => {
    const { sim, p, run, hazards } = setup(BURROW);
    const q = makePlayer(sim, 'p2', X, Z + 8);
    run(DT);
    const [h0] = hazards();
    p.move.x = h0.x;
    p.move.z = h0.z;
    run(2200);
    expect(hp(p)).toBeLessThan(1000);
    expect(hp(q)).toBe(1000);
  });

  it('trồi ở vạch đầu, gỡ cờ, đánh vạch quạt về phía mục tiêu rồi mới đánh thường được; lại nhận sát thương', () => {
    const { sim, mon, p, run, hazards } = setup(BURROW);
    run(DT);
    const [h0] = hazards();
    p.move.x = X + 20; // chạy khỏi mọi vạch tròn
    p.move.z = Z + 8;
    run(2100);
    expect(mon.s.mf & MF_BURROW).toBe(0);
    expect(mon.s.x).toBeCloseTo(h0.x);
    expect(mon.s.z).toBeCloseTo(h0.z);
    const cone = hazards().find((h) => h.mv === 'emerge')!;
    expect(cone).toMatchObject({ sh: 'cone', r: 14, delay: 1.5 });
    const before = mon.s.hp;
    sim.damageMonster(mon, 100, null);
    expect(mon.s.hp).toBe(before - 100);
  });

  it('vạch quạt trúng người đứng trong quạt lúc nổ, không trúng người đứng ngoài góc', () => {
    const { sim, p, run, hazards } = setup(BURROW);
    run(DT);
    const [h0] = hazards();
    p.move.x = h0.x + 9; // chạy khỏi vạch tròn, vẫn ở gần chỗ trồi
    p.move.z = h0.z;
    run(2100);
    const cone = hazards().find((h) => h.mv === 'emerge')!;
    const q = makePlayer(sim, 'p2', h0.x - Math.sin(cone.yaw!) * 6, h0.z - Math.cos(cone.yaw!) * 6);
    q.move.y = groundAt(q.move.x, q.move.z);
    p.move.x = h0.x + Math.sin(cone.yaw!) * 8;
    p.move.z = h0.z + Math.cos(cone.yaw!) * 8;
    run(1800);
    expect(hp(p)).toBeLessThan(1000);
    expect(hp(q)).toBe(1000);
  });
});

describe('reflect: phản đòn', () => {
  const REFLECT: MonsterAi = { reflect: { cd: 12, warn: 1, dur: 3, ratio: 0.5, cap: 0.1, take: 0.25 } };

  it('chưa hết thời gian tụ thế thì chưa phản; hết tụ thế phản theo tỉ lệ, quái chỉ nhận một phần', () => {
    const { sim, mon, p, run } = setup(REFLECT);
    run(DT);
    expect(mon.s.mf & MF_REFLECT).toBeTruthy();
    const full = mon.s.hp;
    sim.damageMonster(mon, 100, p as never);
    expect(mon.s.hp).toBe(full - 100);
    expect(hp(p)).toBe(1000);
    run(1000);
    sim.damageMonster(mon, 100, p as never);
    expect(mon.s.hp).toBe(full - 100 - 25);
    expect(hp(p)).toBe(1000 - 50);
  });

  it('phản không quá `cap` × máu tối đa người đánh', () => {
    const { sim, mon, p, run } = setup(REFLECT);
    run(1100);
    mon.s.hp = mon.s.mhp = 10_000_000;
    sim.damageMonster(mon, 10_000, p as never);
    expect(hp(p)).toBe(1000 - 100);
  });

  it('chất độc (dot) không bị phản; hết cửa sổ thì sát thương và cờ trở lại bình thường', () => {
    const { sim, mon, p, run } = setup(REFLECT);
    run(1100);
    const a = mon.s.hp;
    sim.damageMonster(mon, 40, p as never, false, false, false, 0, true);
    expect(hp(p)).toBe(1000);
    expect(mon.s.hp).toBe(a - 40);
    run(3200);
    expect(mon.s.mf & MF_REFLECT).toBe(0);
    const b = mon.s.hp;
    sim.damageMonster(mon, 80, p as never);
    expect(mon.s.hp).toBe(b - 80);
    expect(hp(p)).toBe(1000);
  });
});

describe('summon: gọi đệ tử', () => {
  const SUMMON: MonsterAi = { summon: { cd: 10, mon: 'mon_hoa_van_ho', n: 2, max: 3, r: 5, delay: 1.2 } };

  it('vạch báo không gây sát thương; hết thời gian báo mới có đệ tử, đúng số, cùng cấp, có dấu chủ', () => {
    const { sim, mon, p, run, hazards } = setup(SUMMON);
    // Người đứng ngay chỗ một vạch gọi: không bị thương.
    run(DT);
    const hs = hazards();
    expect(hs).toHaveLength(2);
    expect(hs.every((h) => h.mv === 'summon')).toBe(true);
    p.move.x = hs[0].x;
    p.move.z = hs[0].z;
    expect(sim.monsters.filter((m) => m.minionOf)).toHaveLength(0);
    run(1300);
    const kids = sim.monsters.filter((m) => m.minionOf);
    expect(kids).toHaveLength(2);
    expect(kids.every((m) => m.minionOf === mon.id && m.level === mon.level)).toBe(true);
    expect(hp(p)).toBe(1000);
  });

  it('không vượt `max`: lần gọi sau chỉ bổ sung cho đủ', () => {
    const { sim, mon, run } = setup(SUMMON);
    run(1400);
    mon.mx.next.summon = 1;
    run(1400);
    expect(sim.monsters.filter((m) => m.minionOf)).toHaveLength(3);
  });

  it('quái chủ chết thì đệ tử biến mất; đệ tử chết không cho tu vi/đồ', () => {
    const { sim, mon, run } = setup(SUMMON);
    run(1400);
    const kids = sim.monsters.filter((m) => m.minionOf);
    expect(kids).toHaveLength(2);
    sim.damageMonster(mon, mon.s.mhp, null);
    expect(sim.monsters.filter((m) => m.minionOf)).toHaveLength(0);
    expect(mon.mx.minions).toHaveLength(0);
  });
});

describe('reveal: lộ yếu điểm', () => {
  it('lộ theo giờ: trong cửa sổ nhận ×mul, ngoài cửa sổ nhận ×guard', () => {
    const { sim, mon, run } = setup({ reveal: { cd: 8, dur: 2, mul: 1.5, guard: 0.5 } });
    const a0 = mon.s.hp;
    sim.damageMonster(mon, 100, null);
    expect(mon.s.hp).toBe(a0 - 50);
    run(DT);
    expect(mon.s.mf & MF_WEAK).toBeTruthy();
    const a1 = mon.s.hp;
    sim.damageMonster(mon, 100, null);
    expect(mon.s.hp).toBe(a1 - 150);
    run(2100);
    expect(mon.s.mf & MF_WEAK).toBe(0);
    const a2 = mon.s.hp;
    sim.damageMonster(mon, 100, null);
    expect(mon.s.hp).toBe(a2 - 50);
  });

  it('after: chỉ lộ ngay sau khi nhảy đập xong', () => {
    const { sim, mon, run } = setup({
      leap: { cd: 20, min: 3, range: 14, r: 3, delay: 1, mul: 1, kind: 'fire' },
      reveal: { cd: 8, dur: 2, mul: 2, after: 'leap' },
    });
    run(DT);
    run(500);
    expect(mon.s.mf & MF_WEAK).toBe(0);
    run(700);
    expect(mon.s.mf & MF_WEAK).toBeTruthy();
    const a = mon.s.hp;
    sim.damageMonster(mon, 100, null);
    expect(mon.s.hp).toBe(a - 200);
  });
});

describe('chant/cast đang chạy thì không mở chiêu mới', () => {
  const LEAP: MonsterAi = { leap: { cd: 8, min: 3, range: 14, r: 3, delay: 1, mul: 1, kind: 'fire' } };

  it('boss đang niệm chú không nhảy; hết chú thì nhảy', () => {
    const { mon, run, hazards } = setup(LEAP);
    mon.chant = { startAt: T0, endAt: T0 + 5000 };
    run(1000);
    expect(hazards()).toHaveLength(0);
    expect(mon.mx.act).toBeNull();
    mon.chant = null;
    run(DT * 2);
    expect(hazards().some((h) => h.mv === 'leap')).toBe(true);
  });

  it('quái đang đọc chú đánh xa cũng không mở chiêu', () => {
    const { mon, run, hazards } = setup({
      ...LEAP,
      burrow: { cd: 14, range: 20, hide: 2, n: 1, r: 2, spread: 4, mul: 1, cone: { r: 10, w: 20, delay: 1.5, mul: 1 }, kind: 'fire' },
    });
    mon.cast = { endAt: T0 + 5000 };
    run(800);
    expect(hazards()).toHaveLength(0);
    expect(mon.s.mf & MF_BURROW).toBe(0);
  });
});

describe('faces: hai mặt Âm/Dương (Phủ Chủ)', () => {
  const FACES: MonsterAi = { faces: { duong: 10, am: 6, warn: 2, take: 0 } };
  const fxOf = (sent: Sent[], t: string) =>
    sent.filter((x) => x.type === S.FX && (x.msg as { t: string }).t === t).map((x) => x.msg as { v?: string; d?: number });

  it('mặt Dương nhận đủ sát thương; sang mặt Âm miễn hẳn (0) và có cờ MF_FACE tới lúc lật', () => {
    const { sim, sent, mon, run } = setup(FACES);
    run(DT);
    expect(mon.s.mf & MF_FACE).toBe(0);
    const a0 = mon.s.hp;
    sim.damageMonster(mon, 100, null);
    expect(mon.s.hp).toBe(a0 - 100);
    run(10_000);
    expect(mon.s.mf & MF_FACE).toBeTruthy();
    expect(mon.s.ce).toBeGreaterThan(sim.now);
    const a1 = mon.s.hp;
    sim.damageMonster(mon, 5000, null);
    expect(mon.s.hp).toBe(a1);
    expect(sent.some((x) => x.type === S.DMG && (x.msg as { n: number }).n === 0)).toBe(true);
    run(6_100);
    expect(mon.s.mf & MF_FACE).toBe(0);
    const a2 = mon.s.hp;
    sim.damageMonster(mon, 100, null);
    expect(mon.s.hp).toBe(a2 - 100);
  });

  it('báo trước 2 giây trước mỗi lần lật, rồi phát FX `face` đúng mặt mới; không phát lại', () => {
    const { sent, run } = setup(FACES);
    run(7_900);
    expect(fxOf(sent, 'face_warn')).toHaveLength(0);
    run(300);
    expect(fxOf(sent, 'face_warn')).toEqual([expect.objectContaining({ v: 'am' })]);
    expect(fxOf(sent, 'face')).toHaveLength(0);
    run(2_000);
    expect(fxOf(sent, 'face').map((f) => f.v)).toEqual(['am']);
    expect(fxOf(sent, 'face_warn')).toHaveLength(1);
    run(6_000);
    expect(fxOf(sent, 'face').map((f) => f.v)).toEqual(['am', 'duong']);
    expect(fxOf(sent, 'face_warn').map((f) => f.v)).toEqual(['am', 'duong']);
  });

  it('`take` > 0: mặt Âm còn lọt một phần sát thương', () => {
    const { sim, mon, run } = setup({ faces: { duong: 10, am: 6, warn: 2, take: 0.1 } });
    run(10_100);
    const a0 = mon.s.hp;
    sim.damageMonster(mon, 1000, null);
    expect(mon.s.hp).toBe(a0 - 100);
  });

  it('bỏ trận (resetAi): đồng hồ đặt lại, vào trận lại bắt đầu bằng mặt Dương', () => {
    const { sim, mon, run } = setup(FACES);
    run(11_000);
    expect(mon.s.mf & MF_FACE).toBeTruthy();
    (sim as unknown as { resetAi(m: unknown): void }).resetAi(mon);
    expect(mon.s.mf & MF_FACE).toBe(0);
    mon.state = MS_CHASE;
    run(DT);
    expect(mon.s.mf & MF_FACE).toBe(0);
    const a0 = mon.s.hp;
    sim.damageMonster(mon, 100, null);
    expect(mon.s.hp).toBe(a0 - 100);
  });
});

describe('armor: giáp phá theo chu kỳ (Thạch Tượng, TN-7)', () => {
  const ARMOR: MonsterAi = { armor: { cycle: 30, window: 8, take: 0.15 } };

  it('ngoài cửa sổ nhận `take`, cửa sổ cuối chu kỳ nhận đủ; mốc là đòn đầu trúng', () => {
    const { sim, mon } = setup(ARMOR);
    mon.s.hp = mon.s.mhp = 1e7;
    const dmg = (n: number) => {
      const a = mon.s.hp;
      sim.damageMonster(mon, n, null);
      return a - mon.s.hp;
    };
    sim.now = T0;
    expect(dmg(1000)).toBe(150); // đòn đầu đặt mốc, ở đầu chu kỳ: giáp còn
    sim.now = T0 + 21_000;
    expect(dmg(1000)).toBe(150); // còn một giây trước cửa sổ (22 s)
    sim.now = T0 + 23_000;
    expect(dmg(1000)).toBe(1000); // trong cửa sổ 22–30 s
    sim.now = T0 + 31_000;
    expect(dmg(1000)).toBe(150); // chu kỳ mới
    sim.now = T0 + 55_000;
    expect(dmg(1000)).toBe(1000);
  });
});

describe('resist: kháng theo Bản Nguyên (Đạo Linh, TN-7)', () => {
  const RESIST: MonsterAi = { resist: { forms: ['kim', 'thuy', 'hoa'], same: 0.35, counter: 1.5 } };

  function hit(root: string, dao: string | undefined, phase: number) {
    const { sim, mon, p } = setup(RESIST);
    (p.char as Record<string, unknown>).root = root;
    if (dao) (p.char.meta as Record<string, unknown>).dao = dao;
    mon.phase = phase;
    mon.s.hp = mon.s.mhp = 1e7;
    const a = mon.s.hp;
    sim.damageMonster(mon, 1000, p as never);
    return a - mon.s.hp;
  }

  it('cùng hệ hình thái thì giảm, hệ khắc hình thái thì tăng, còn lại nguyên; hình thái đổi theo pha', () => {
    expect(hit('kim', undefined, 0)).toBe(350); // hình thái Kim, người Kim
    expect(hit('hoa', undefined, 0)).toBe(1500); // Hỏa khắc Kim
    expect(hit('moc', undefined, 0)).toBe(1000); // Mộc không liên quan Kim
    expect(hit('kim', undefined, 1)).toBe(1000); // hình thái Thủy: Kim không liên quan
    expect(hit('tho', undefined, 1)).toBe(1500); // Thổ khắc Thủy
    expect(hit('hoa', undefined, 2)).toBe(350); // hình thái Hỏa
  });

  it('có Đạo thì theo Đạo, không theo Bản Nguyên gốc', () => {
    expect(hit('kim', 'hoa', 0)).toBe(1500); // gốc Kim nhưng Đạo Hỏa: Hỏa khắc Kim
    expect(hit('hoa', 'kim', 0)).toBe(350);
  });
});

describe('armor: tín hiệu cho người chơi (TN-7)', () => {
  const ARMOR: MonsterAi = { armor: { cycle: 30, window: 8, take: 0.15 } };

  it('báo trước 2 s, báo khi giáp vỡ và khi liền lại, đúng mốc chu kỳ, không báo lặp; chưa bị đánh thì im', () => {
    const { sim, mon, p, run } = setup(ARMOR);
    const got: string[] = [];
    (p.client as { send: (t: string, m: unknown) => void }).send = (t, m) => {
      if (t === S.SYS) got.push((m as { k: string }).k);
    };
    mon.s.hp = mon.s.mhp = 1e7;
    run(25_000);
    expect(got.filter((k) => k.startsWith('sys.armor'))).toEqual([]); // chưa trúng đòn nào: chưa có mốc
    sim.damageMonster(mon, 10, null); // mốc chu kỳ = lúc này
    run(19_500);
    expect(got.filter((k) => k.startsWith('sys.armor'))).toEqual([]);
    run(1_000); // 20,5 s: vào khoảng báo trước
    expect(got.filter((k) => k.startsWith('sys.armor'))).toEqual(['sys.armor_warn']);
    run(2_000); // 22,5 s: giáp vỡ
    expect(got.filter((k) => k.startsWith('sys.armor'))).toEqual(['sys.armor_warn', 'sys.armor_break']);
    run(6_000); // 28,5 s: vẫn mở, không báo lặp
    expect(got.filter((k) => k.startsWith('sys.armor')).length).toBe(2);
    run(2_000); // 30,5 s: liền lại
    expect(got.filter((k) => k.startsWith('sys.armor'))).toEqual(['sys.armor_warn', 'sys.armor_break', 'sys.armor_seal']);
  });
});
