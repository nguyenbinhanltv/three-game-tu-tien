import { beforeAll, describe, expect, it } from 'vitest';
import { type HazardMsg, MF_REFLECT, MF_WEAK, MS_CHASE, S } from '@dtl/shared';

// E3-B: quái, tinh anh, boss ngoài trời của Vân Hải Phù Đảo dùng các kiểu chiêu E1-E bằng dữ liệu thật trong monsters.json.
// Đấu trường Kình Ngư Đài là mặt đảo phẳng; người chơi đứng cách quái `dist` m về phía nam.
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

const T0 = 1_000_000;
const DT = 50;
type Private = { tickMonster(m: unknown, dt: number): void; tickHazards(): void; checkPhase(m: unknown): void };

function setup(id: string, lv: number, dist: number) {
  const KN = SH.levelSpawns(C.LEVELS.van_hai).find((s) => s.mon === 'boss_van_hai_kinh_vuong')!;
  const X = KN.x;
  const Z = KN.z;
  const sent: { type: string; msg: unknown }[] = [];
  const sim: Sim = new GameSim(new WorldState(), { broadcast: (type: string, msg: unknown) => sent.push({ type, msg }) } as never, {
    levelId: 'van_hai',
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
  const pz = Z + dist;
  const p = {
    sid: 'p1',
    s: new PlayerS(),
    move: { x: X, y: sim.terrain.groundAt(X, pz), z: pz },
    char: { def: 5, hp: 100000, mhp: 100000, meta: {} },
    mth: { guardUntil: 0, guardReduce: 0 },
    shield: null,
    meditating: false,
    lastCombatAt: 0,
    hazardWin: { until: 0, taken: 0 },
    client: { send: () => {} },
  };
  sim.players.set('p1', p as never);
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
  return { sim, mon, p, run, hazards, sent, priv, X, Z };
}
const hp = (p: { char: { hp: number } }) => p.char.hp;

describe('dữ liệu Vân Hải', () => {
  const ids = ['boss_van_hai_kinh_vuong', 'elite_kinh_dien_ma_quan', 'elite_loi_van_su_vuong', 'elite_van_hac_vuong', 'mon_bich_ngoc_kim_thien', 'mon_kinh_linh', 'mon_phu_dao_thach_quy', 'mon_van_hac'];

  it('level chỉ dùng quái riêng của Vân Hải (không còn quái tạm Đoạn Mạch), cấp 20–23, có bảng rơi, không `drops` trong monsters.json', () => {
    const spawns = SH.levelSpawns(C.LEVELS.van_hai);
    expect([...new Set(spawns.map((s) => s.mon))].sort()).toEqual(ids);
    for (const s of spawns) {
      expect(s.levelMin).toBeGreaterThanOrEqual(20);
      expect(s.levelMax).toBeLessThanOrEqual(23);
    }
    for (const id of ids) {
      expect(LOOT.lootOf(id).gold[1]).toBeGreaterThan(0);
      expect((C.MONSTER.get(id) as unknown as Record<string, unknown>).drops).toBeUndefined();
    }
  });

  it('thiết kế: 12 tinh anh, đúng một boss ở tâm Kình Ngư Đài, hồi sinh 30 phút', () => {
    const spawns = SH.levelSpawns(C.LEVELS.van_hai);
    expect(spawns.filter((s) => C.MONSTER.get(s.mon)!.elite)).toHaveLength(12);
    const boss = spawns.filter((s) => C.MONSTER.get(s.mon)!.boss);
    expect(boss).toHaveLength(1);
    expect(boss[0]).toMatchObject({ mon: 'boss_van_hai_kinh_vuong', levelMin: 23, levelMax: 23, respawn: 1800 });
  });

  it('thưởng chỉ qua bảng rơi của server: vật liệu bậc 3 và Ngưng Anh Phách có trong bảng rơi boss/tinh anh', () => {
    const boss = LOOT.lootOf('boss_van_hai_kinh_vuong').drops.map((d) => d.item);
    expect(boss).toEqual(expect.arrayContaining(['itm_kinh_hoa_sa', 'itm_van_hai_lo', 'itm_bich_ngoc_nhi', 'itm_ngung_anh_phach']));
    const elite = LOOT.lootOf('elite_van_hac_vuong').drops.map((d) => d.item);
    expect(elite).toEqual(expect.arrayContaining(['itm_kinh_hoa_sa', 'itm_ngung_anh_phach']));
  });

  it('quái bay có `hover`, quái đi bộ thì không; boss nhỏ lại để hợp tỉ lệ nhân vật', () => {
    const hv = (id: string) => C.MONSTER.get(id)!.hover;
    for (const id of ['mon_van_hac', 'mon_bich_ngoc_kim_thien', 'elite_van_hac_vuong', 'boss_van_hai_kinh_vuong']) expect(hv(id), id).toBeGreaterThan(0);
    for (const id of ['mon_kinh_linh', 'mon_phu_dao_thach_quy', 'elite_kinh_dien_ma_quan', 'elite_loi_van_su_vuong']) expect(hv(id), id).toBeUndefined();
    const boss = C.MONSTER.get('boss_van_hai_kinh_vuong')!;
    expect(boss.scale).toBeLessThan(0.8);
    expect(boss.hover!).toBeLessThanOrEqual(8);
  });
});

describe('quái thường', () => {
  it('Vân Hạc: đạn lông ba viên', () => {
    const a = setup('mon_van_hac', 21, 8);
    a.run(1500);
    expect(a.sent.filter((x) => x.type === S.BOLT).length).toBeGreaterThanOrEqual(3);
  });

  it('Phù Đảo Thạch Quy: giậm r 5 báo 1,8 s xuống chỗ người đứng', () => {
    const a = setup('mon_phu_dao_thach_quy', 21, 4);
    a.run(DT);
    expect(a.hazards()[0]).toMatchObject({ mv: 'leap', r: 5, delay: 1.8 });
    a.run(1900);
    expect(hp(a.p)).toBeLessThan(100000);
  });

  it('Bích Ngọc Kim Thiền: đâm thẳng là vạch ngắn 6×1,2, né ngang thì không trúng', () => {
    const a = setup('mon_bich_ngoc_kim_thien', 21, 4);
    a.run(DT);
    expect(a.hazards()[0]).toMatchObject({ sh: 'rect', mv: 'line', r: 6, w: 1.2 });
    a.p.move.x += 3;
    a.run(1200);
    expect(hp(a.p)).toBe(100000);
  });

  it('Kính Linh: giơ khiên (cờ phản đòn) theo chu kỳ', () => {
    const a = setup('mon_kinh_linh', 22, 3);
    let seen = false;
    for (let i = 0; i < 200 && !seen; i++) {
      a.run(DT);
      seen = !!(a.mon.s.mf & MF_REFLECT);
    }
    expect(seen).toBe(true);
  });
});

describe('tinh anh', () => {
  it('Lôi Vân Sư Vương: sấm vùng r 4 báo 1,2 s xuống chân người chơi', () => {
    const a = setup('elite_loi_van_su_vuong', 22, 8);
    a.run(3000);
    expect(a.hazards().some((h) => h.sh === undefined && h.r === 4 && h.delay === 1.2)).toBe(true);
  });

  it('Kính Diện Ma Quân: cắt kiếm bạc nón 10 m báo 1,2 s', () => {
    const a = setup('elite_kinh_dien_ma_quan', 22, 6);
    for (let i = 0; i < 100 && a.hazards().length === 0; i++) a.run(DT);
    expect(a.hazards().some((h) => h.sh === 'cone' && h.r === 10 && h.delay === 1.2)).toBe(true);
  });

  it('Tuyết Vũ Vân Hạc Vương: mưa lông 5 đạn', () => {
    const a = setup('elite_van_hac_vuong', 22, 8);
    a.run(2500);
    expect(a.sent.filter((x) => x.type === S.BOLT).length).toBeGreaterThanOrEqual(5);
  });
});

describe('boss Vân Hải Kình Vương', () => {
  it('Cuốn sóng mây: vạch 40×6 báo 2 s; trúng người đứng trên đường, né ngang thì không', () => {
    const a = setup('boss_van_hai_kinh_vuong', 23, 20);
    a.run(DT);
    const line = a.hazards().find((h) => h.mv === 'line')!;
    expect(line).toMatchObject({ sh: 'rect', r: 40, w: 6, delay: 2 });
    a.run(2100);
    expect(hp(a.p)).toBeLessThan(100000);
    const b = setup('boss_van_hai_kinh_vuong', 23, 20);
    b.run(DT);
    b.p.move.x += 5;
    b.run(2100);
    expect(hp(b.p)).toBe(100000);
  });

  it('server vẫn đặt boss trên mặt đất (bay lơ lửng chỉ là hình ở client; vạch báo vẽ theo mặt sàn)', () => {
    const a = setup('boss_van_hai_kinh_vuong', 23, 20);
    a.run(1500);
    expect(a.mon.s.y).toBeCloseTo(a.sim.terrain.groundAt(a.mon.s.x, a.mon.s.z), 3);
  });

  it('cửa sổ đánh: mỗi 25 s lộ yếu điểm (cờ MF_WEAK) để client hạ thấp', () => {
    const a = setup('boss_van_hai_kinh_vuong', 23, 30);
    expect(C.MONSTER.get('boss_van_hai_kinh_vuong')!.ai!.reveal).toMatchObject({ cd: 25 });
    let seen = false;
    for (let i = 0; i < 1000 && !seen; i++) {
      a.run(DT);
      seen = !!(a.mon.s.mf & MF_WEAK);
    }
    expect(seen).toBe(true);
  });

  it('đổi pha theo máu: 70% chém quạt, 50% cuốn sóng dồn, 30% nuốt (niệm r 8) + vây rơi dồn', () => {
    const a = setup('boss_van_hai_kinh_vuong', 23, 20);
    const r = () => a.mon.rules.ai;
    expect(r().sweep).toBeUndefined();
    a.mon.s.hp = Math.floor(a.mon.s.mhp * 0.65);
    a.priv.checkPhase(a.mon);
    expect(r().sweep).toMatchObject({ r: 18 });
    a.mon.s.hp = Math.floor(a.mon.s.mhp * 0.45);
    a.priv.checkPhase(a.mon);
    expect(r().line).toMatchObject({ delay: 1.8 });
    expect(r().chant).toBeUndefined();
    a.mon.s.hp = Math.floor(a.mon.s.mhp * 0.25);
    a.priv.checkPhase(a.mon);
    expect(r().chant).toMatchObject({ r: 8 });
    expect(r().slam).toMatchObject({ max: 5 });
  });
});
