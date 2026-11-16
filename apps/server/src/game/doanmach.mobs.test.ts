import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, type HazardMsg, MF_BURROW, MF_REFLECT, MF_WEAK, MS_CHASE, S, VALLEY } from '@dtl/shared';

// E2-B: quái, tinh anh, boss của Đoạn Mạch Cổ Cốc dùng bảy kiểu chiêu của E1-E bằng dữ liệu thật trong monsters.json.
// Mỗi con: chiêu đặc trưng ra đúng vạch, trúng/né theo vị trí lúc nổ. Dữ liệu: rơi đồ chỉ ở loot.json.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let PlayerS: typeof import('../state').PlayerS;
let C: typeof import('@dtl/content');
let LOOT: typeof import('@dtl/content/loot');
let SH: typeof import('@dtl/shared');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState, PlayerS } = await import('../state'));
  C = await import('@dtl/content');
  LOOT = await import('@dtl/content/loot');
  SH = await import('@dtl/shared');
});

const X = VALLEY.x + 40;
const Z = VALLEY.z + 40;
const T0 = 1_000_000;
const DT = 50;
type Private = { tickMonster(m: unknown, dt: number): void; tickHazards(): void; checkPhase(m: unknown): void };

function makePlayer(sim: Sim, sid: string, x: number, z: number) {
  const p = {
    sid,
    s: new PlayerS(),
    move: { x, y: groundAt(x, z), z },
    char: { def: 5, hp: 100000, mhp: 100000, meta: {} },
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

/** Quái thật `id` cấp `lv` ở (X, Z), người chơi cách `dist` m về phía nam. */
function setup(id: string, lv: number, dist: number) {
  const sent: { type: string; msg: unknown }[] = [];
  const sim: Sim = new GameSim(new WorldState(), { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const def = C.MONSTER.get(id)!;
  const mon = sim.spawnMonster(def, lv, X, Z, null);
  mon.state = MS_CHASE;
  mon.target = 'p1';
  mon.attackAt = Number.MAX_SAFE_INTEGER;
  for (const k of Object.keys(def.ai ?? {})) (mon.mx.next as Record<string, number>)[k] = 1;
  const p = makePlayer(sim, 'p1', X, Z + dist);
  const priv = sim as unknown as Private;
  let t = T0;
  sim.now = t;
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
  return { sim, mon, p, run, hazards, priv };
}
const hp = (p: { char: { hp: number } }) => p.char.hp;

describe('dữ liệu Đoạn Mạch', () => {
  it('mọi quái trong level có định nghĩa, cấp 16–19, có bảng rơi, không `drops` trong monsters.json', () => {
    const spawns = SH.levelSpawns(C.LEVELS.doan_mach);
    const ids = new Set(spawns.map((s) => s.mon));
    expect([...ids].sort()).toEqual(
      ['boss_dia_mach_long', 'elite_ho_mach_khoi_tuong', 'elite_liet_cot_bao', 'elite_xich_sa_ngo_cong', 'mon_khai_mach_khoi_loi', 'mon_mach_thuong_ho_ve', 'mon_ngo_cong_au', 'mon_thach_giap_te'].sort(),
    );
    for (const s of spawns) {
      expect(C.MONSTER.get(s.mon)).toBeTruthy();
      expect(s.levelMin).toBeGreaterThanOrEqual(16);
      expect(s.levelMax).toBeLessThanOrEqual(19);
    }
    for (const id of ids) {
      expect(LOOT.lootOf(id).gold[1]).toBeGreaterThan(0);
      expect((C.MONSTER.get(id) as unknown as Record<string, unknown>).drops).toBeUndefined();
    }
  });

  it('mỗi loại dùng đúng kiểu chiêu mới theo thiết kế', () => {
    const ai = (id: string) => C.MONSTER.get(id)!.ai!;
    expect(ai('mon_thach_giap_te').charge).toBeTruthy();
    expect(ai('mon_khai_mach_khoi_loi').leap).toBeTruthy();
    expect(ai('mon_mach_thuong_ho_ve').line).toBeTruthy();
    expect(ai('elite_liet_cot_bao').leap).toBeTruthy();
    expect(ai('elite_ho_mach_khoi_tuong').reflect).toBeTruthy();
    expect(ai('elite_xich_sa_ngo_cong').burrow).toBeTruthy();
    expect(ai('boss_dia_mach_long').line).toMatchObject({ r: 30, w: 4, delay: 2 });
    const ph = C.MONSTER.get('boss_dia_mach_long')!.phases!;
    expect(ph).toHaveLength(3);
    expect(ph[0].ai!.sweep).toBeTruthy();
    expect(ph[1].ai!.reveal).toBeTruthy();
    expect(ph[2].ai!.chant).toMatchObject({ r: 14 });
  });
});

describe('quái thường', () => {
  it('Thạch Giáp Tê: vạch lao 12×2 báo 1 s; đứng trên đường thì trúng, né ngang thì không', () => {
    const a = setup('mon_thach_giap_te', 17, 10);
    a.run(DT);
    expect(a.hazards()[0]).toMatchObject({ sh: 'rect', mv: 'charge', w: 2, delay: 1 });
    a.run(1100);
    expect(hp(a.p)).toBeLessThan(100000);
    const b = setup('mon_thach_giap_te', 17, 10);
    b.run(DT);
    b.p.move.x += 4;
    b.run(1500);
    expect(hp(b.p)).toBe(100000);
  });

  it('Khai Mạch Khôi Lỗi: đập r 3,5 báo 1,2 s xuống chỗ mục tiêu đứng', () => {
    const a = setup('mon_khai_mach_khoi_loi', 18, 6);
    a.run(DT);
    expect(a.hazards()[0]).toMatchObject({ mv: 'leap', r: 3.5, delay: 1.2 });
    a.run(1300);
    expect(hp(a.p)).toBeLessThan(100000);
  });

  it('Mạch Thương Hộ Vệ: húc khiên là vạch đường ngắn, né được', () => {
    const a = setup('mon_mach_thuong_ho_ve', 19, 4);
    a.run(DT);
    expect(a.hazards()[0]).toMatchObject({ mv: 'line', delay: 1 });
    a.p.move.x += 3;
    a.run(1200);
    expect(hp(a.p)).toBe(100000);
  });
});

describe('tinh anh', () => {
  it('Liệt Cốt Báo Vương: vồ nhắm chỗ người đứng, báo 0,8 s; sau vồ lộ yếu điểm', () => {
    const a = setup('elite_liet_cot_bao', 17, 8);
    a.run(DT);
    expect(a.hazards()[0]).toMatchObject({ mv: 'leap', r: 3, delay: 0.8 });
    a.run(900);
    expect(hp(a.p)).toBeLessThan(100000);
    a.run(200);
    expect(a.mon.s.mf & MF_WEAK).toBeTruthy();
  });

  it('Hộ Mạch Khôi Tướng: giơ khiên (cờ phản) rồi chặn đòn; búa r 5 báo 1,4 s', () => {
    const a = setup('elite_ho_mach_khoi_tuong', 18, 6);
    a.run(DT);
    expect(a.hazards().some((h) => h.mv === 'leap' && h.r === 5 && h.delay === 1.4)).toBe(true);
    let seen = false;
    for (let i = 0; i < 120 && !seen; i++) {
      a.run(DT);
      seen = !!(a.mon.s.mf & MF_REFLECT);
    }
    expect(seen).toBe(true);
  });

  it('Xích Sa Ngô Công: chui đất (miễn sát thương), ba vòng quanh người, trồi đánh quạt', () => {
    const a = setup('elite_xich_sa_ngo_cong', 19, 8);
    a.run(DT);
    expect(a.mon.s.mf & MF_BURROW).toBeTruthy();
    expect(a.hazards().filter((h) => h.mv === 'burrow').length).toBe(3);
    a.run(2200);
    expect(a.mon.s.mf & MF_BURROW).toBeFalsy();
    expect(a.hazards().some((h) => h.sh === 'cone')).toBe(true);
  });
});

describe('boss Địa Mạch Long', () => {
  it('Đứt mạch: khe nứt 30×4 báo 2 s, trúng người đứng trong khe, né ngang thì không', () => {
    const a = setup('boss_dia_mach_long', 19, 20);
    a.run(DT);
    const line = a.hazards().find((h) => h.mv === 'line')!;
    expect(line).toMatchObject({ sh: 'rect', r: 30, w: 4, delay: 2 });
    a.run(2100);
    expect(hp(a.p)).toBeLessThan(100000);
    const b = setup('boss_dia_mach_long', 19, 20);
    b.run(DT);
    b.p.move.x += 4;
    b.run(2100);
    expect(hp(b.p)).toBe(100000);
  });

  it('đổi pha theo máu: 70% thêm chém quạt, 50% lộ điểm yếu, 30% mạch chảy lại (niệm r 14)', () => {
    const a = setup('boss_dia_mach_long', 19, 20);
    const r = () => a.mon.rules.ai;
    expect(r().sweep).toBeUndefined();
    a.mon.s.hp = Math.floor(a.mon.s.mhp * 0.65);
    a.priv.checkPhase(a.mon);
    expect(r().sweep).toMatchObject({ r: 16 });
    a.mon.s.hp = Math.floor(a.mon.s.mhp * 0.45);
    a.priv.checkPhase(a.mon);
    expect(r().reveal).toBeTruthy();
    expect(r().chant).toBeUndefined();
    a.mon.s.hp = Math.floor(a.mon.s.mhp * 0.25);
    a.priv.checkPhase(a.mon);
    expect(r().chant).toMatchObject({ r: 14 });
    expect(r().slam).toBeTruthy();
  });
});
