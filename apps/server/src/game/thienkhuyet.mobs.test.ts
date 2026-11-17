import { beforeAll, describe, expect, it } from 'vitest';
import { type HazardMsg, MF_REFLECT, MF_WEAK, MS_CHASE, S } from '@dtl/shared';

// E4-B: quái, tinh anh, boss ngoài trời của Thiên Khuyết Cổ Thành dùng các kiểu chiêu E1-E bằng dữ liệu thật trong monsters.json.
// Level Thiên Khuyết thuộc E4-A (chưa có ở nhánh này) nên đấu trường mượn mặt đảo phẳng Kình Ngư Đài của Vân Hải; người chơi đứng cách quái `dist` m về phía nam.
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

const IDS = {
  common: ['mon_thach_tuong_vo_si', 'mon_da_minh_loc', 'mon_cot_ve_kiem_thu', 'mon_co_thanh_chien_ma'],
  elite: ['elite_thach_tuong_dai_tuong', 'elite_da_minh_loc_vuong', 'elite_cot_kiem_thong_linh'],
  boss: ['boss_thien_khuyet_thu_linh'],
};

describe('dữ liệu Thiên Khuyết (E4-B)', () => {
  it('đủ 4 quái thường, 3 tinh anh, 1 boss; cấp theo thiết kế; không `drops`/`gold` trong monsters.json; có bảng rơi', () => {
    for (const id of [...IDS.common, ...IDS.elite, ...IDS.boss]) {
      const d = C.MONSTER.get(id)! as unknown as Record<string, unknown>;
      expect(d, id).toBeDefined();
      expect(d.drops, id).toBeUndefined();
      expect(d.gold, id).toBeUndefined();
      expect(LOOT.lootOf(id).gold[1], id).toBeGreaterThan(0);
    }
    for (const id of IDS.elite) expect(C.MONSTER.get(id)!.elite).toBe(true);
    expect(C.MONSTER.get('boss_thien_khuyet_thu_linh')!.boss).toBe(true);
  });

  it('hành đúng thiết kế (6.3)', () => {
    const el = (id: string) => C.MONSTER.get(id)!.elem;
    expect(el('mon_thach_tuong_vo_si')).toBe('tho');
    expect(el('mon_da_minh_loc')).toBe('thuy');
    expect(el('mon_cot_ve_kiem_thu')).toBe('kim');
    expect(el('mon_co_thanh_chien_ma')).toBe('hoa');
    expect(el('boss_thien_khuyet_thu_linh')).toBe('tho');
  });

  it('nguyên liệu bậc 4 rơi từ quái Thiên Khuyết (không còn nguồn tạm ở Vân Hải), boss rơi chắc', () => {
    const boss = LOOT.lootOf('boss_thien_khuyet_thu_linh').drops;
    for (const it of ['itm_tinh_quang_mac', 'itm_than_tang_ngoc', 'itm_co_thanh_phien']) expect(boss.map((d) => d.item)).toContain(it);
    expect(boss.find((d) => d.item === 'itm_tinh_quang_mac')!.chance).toBe(1);
    for (const id of IDS.elite) expect(LOOT.lootOf(id).drops.map((d) => d.item)).toContain('itm_tinh_quang_mac');
    expect(LOOT.lootOf('elite_van_hac_vuong').drops.map((d) => d.item)).not.toContain('itm_tinh_quang_mac');
  });
});

describe('quái thường', () => {
  it('Thạch Tượng Võ Sĩ: chém ngang nón 6 m báo 1 s', () => {
    const a = setup('mon_thach_tuong_vo_si', 25, 5);
    a.run(1500);
    expect(a.hazards().find((h) => h.sh === 'cone')).toMatchObject({ r: 6, delay: 1 });
  });

  it('Dạ Minh Lộc: húc lao line 10×2 báo 0,9 s', () => {
    const a = setup('mon_da_minh_loc', 24, 8);
    a.run(DT);
    expect(a.hazards()[0]).toMatchObject({ mv: 'charge', r: 10, w: 2, delay: 0.9 });
  });

  it('Cổ Thành Chiến Ma: đâm giáo line 8×2,5 báo 1,1 s; né ngang thì không trúng', () => {
    const a = setup('mon_co_thanh_chien_ma', 27, 5);
    a.run(DT);
    expect(a.hazards()[0]).toMatchObject({ sh: 'rect', mv: 'line', r: 8, w: 2.5, delay: 1.1 });
    a.p.move.x += 4;
    a.run(1300);
    expect(hp(a.p)).toBe(100000);
  });

  it('Cốt Vệ Kiếm Thủ: combo hai kiếm (cấu hình)', () => {
    expect(C.MONSTER.get('mon_cot_ve_kiem_thu')!.ai!.combo).toBeTruthy();
  });
});

describe('tinh anh', () => {
  it('Thạch Tượng Đại Tướng: giáng kiếm line 14×3 và quét nón 12 m', () => {
    const a = setup('elite_thach_tuong_dai_tuong', 26, 8);
    a.run(3000);
    const hz = a.hazards();
    expect(hz.some((h) => h.mv === 'line' && h.r === 14 && h.w === 3)).toBe(true);
    expect(hz.some((h) => h.sh === 'cone' && h.r === 12)).toBe(true);
  });

  it('Dạ Minh Lộc Vương: quầng sao r 6 báo 1,3 s, húc lao line 14×2', () => {
    const a = setup('elite_da_minh_loc_vuong', 25, 8);
    a.run(3500);
    const hz = a.hazards();
    expect(hz.some((h) => h.sh === undefined && h.r === 6 && h.delay === 1.3)).toBe(true);
    expect(hz.some((h) => h.mv === 'charge' && h.r === 14)).toBe(true);
  });

  it('Cốt Kiếm Thống Lĩnh: tia quét line 10×3 báo 1,1 s', () => {
    const a = setup('elite_cot_kiem_thong_linh', 27, 6);
    a.run(2500);
    expect(a.hazards().some((h) => h.mv === 'line' && h.r === 10 && h.delay === 1.1)).toBe(true);
  });
});

describe('boss Thiên Khuyết Thủ Linh', () => {
  it('búa halberd: line 20×4 báo 1,8 s, trúng người đứng trên đường, né ngang thì không', () => {
    const a = setup('boss_thien_khuyet_thu_linh', 27, 14);
    a.run(DT);
    expect(a.hazards().find((h) => h.mv === 'line')).toMatchObject({ sh: 'rect', r: 20, w: 4, delay: 1.8 });
    a.run(1900);
    expect(hp(a.p)).toBeLessThan(100000);
    const b = setup('boss_thien_khuyet_thu_linh', 27, 14);
    b.run(DT);
    b.p.move.x += 5;
    b.run(1900);
    expect(hp(b.p)).toBe(100000);
  });

  it('gọi tượng: Thạch Tượng Võ Sĩ (quái thường), tối đa 4', () => {
    const s = C.MONSTER.get('boss_thien_khuyet_thu_linh')!.ai!.summon!;
    expect(s).toMatchObject({ mon: 'mon_thach_tuong_vo_si', n: 2, max: 4, cd: 20 });
    const a = setup('boss_thien_khuyet_thu_linh', 27, 20);
    for (let i = 0; i < 40 && !a.sim.monsters.some((m) => m.minionOf); i++) a.run(1000);
    const kids = a.sim.monsters.filter((m) => m.minionOf);
    expect(kids.length).toBeGreaterThanOrEqual(2);
    expect(kids.length).toBeLessThanOrEqual(4);
    expect(kids.every((m) => m.def.id === 'mon_thach_tuong_vo_si' && m.minionOf === a.mon.id)).toBe(true);
  });

  it('đổi pha theo máu: 70% quét nón, 50% quầng sao dồn, 30% quầng sao lớn (niệm r 16)', () => {
    const a = setup('boss_thien_khuyet_thu_linh', 27, 20);
    const r = () => a.mon.rules.ai;
    expect(r().sweep).toBeUndefined();
    a.mon.s.hp = Math.floor(a.mon.s.mhp * 0.65);
    a.priv.checkPhase(a.mon);
    expect(r().sweep).toMatchObject({ r: 14 });
    a.mon.s.hp = Math.floor(a.mon.s.mhp * 0.45);
    a.priv.checkPhase(a.mon);
    expect(r().slam).toMatchObject({ max: 5 });
    a.mon.s.hp = Math.floor(a.mon.s.mhp * 0.25);
    a.priv.checkPhase(a.mon);
    expect(r().chant).toMatchObject({ r: 16 });
  });
});
