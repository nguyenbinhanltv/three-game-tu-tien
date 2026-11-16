import { beforeAll, describe, expect, it } from 'vitest';
import { ESCORT_FOLLOW_R, escortAdvance, escortStart, questSpot, S, SPIRIT_UNLOCK_LEVEL, TELE_FREE, TOUCH_R, type EscortMsg } from '@dtl/shared';
import { LEVELS, NPC, QUEST } from '@dtl/content';

// Nhiệm vụ chương 2 (E2-H): chuỗi q2_*, mục tiêu touch/scan/escort do server chấm, mở trận bằng nhiệm vụ, thưởng một lần (tx + ledger).
process.env.DB_FILE = ':memory:';

let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
});

let acc = 9900;
const DM = LEVELS.doan_mach;

function setup(levelId = 'doan_mach', level = 18) {
  const sent: { type: string; msg: unknown }[] = [];
  const host = { broadcast: () => {} };
  const sim = new GameSim(new WorldState(), host as never, { levelId, roomName: 'test', spawn: { x: 1024, z: 1036 }, respawn: { x: 1024, z: 1036 }, persistPosition: false });
  const char = Character.create(acc++, 'q2' + acc);
  char.level = level;
  char.recalc();
  char.hp = char.mhp;
  const p = sim.addPlayer({ sessionId: 's' + acc, send: (type: string, msg: unknown) => sent.push({ type, msg }) } as never, char, true, 's' + acc);
  sim.now = 1_000_000;
  const at = (x: number, z: number) => {
    p.move.x = x;
    p.move.z = z;
    p.move.y = 0;
  };
  const atNpc = (id: string) => at(NPC.get(id)!.x, NPC.get(id)!.z);
  const accept = (id: string) => sim.onQuest(p, { a: 'accept', id });
  const turnin = (id: string) => sim.onQuest(p, { a: 'turnin', id });
  const sys = () => sent.filter((s) => s.type === S.SYS).map((s) => (s.msg as { k: string }).k);
  const step = (ms = 300) => {
    sim.now += ms;
    (sim.questObj as unknown as { stepAt: number }).stepAt = 0;
    sim.questObj.tick();
  };
  const esc = () => sent.filter((s) => s.type === S.ESCORT).map((s) => s.msg as EscortMsg);
  return { sim, p, char, at, atNpc, accept, turnin, sys, step, esc, sent };
}

type T = ReturnType<typeof setup>;

describe('dữ liệu chương 2', () => {
  it('9 nhiệm vụ chính nối đuôi và 4 nhiệm vụ phụ', () => {
    const main = ['q2_thu_ha_son', 'q2_mach_tinh', 'q2_khu_khoi_loi', 'q2_cau_da', 'q2_xich_sa', 'q2_hoi_chu', 'q2_phuc_mach', 'q2_dia_mach', 'q2_ket_dan'];
    main.forEach((id, i) => {
      expect(QUEST.has(id), id).toBe(true);
      if (i > 0) expect(QUEST.get(id)!.requires).toBe(main[i - 1]);
    });
    for (const id of ['s2_ho_tong', 's2_cu_tho', 's2_kiem_gay', 's2_thu_nghiem']) expect(QUEST.has(id), id).toBe(true);
  });

  it('thưởng tu vi nhiệm vụ chính ≈ 14% tu vi chặng Trúc Cơ (242.000)', () => {
    const xp = [...QUEST.values()].filter((q) => q.id.startsWith('q2_')).reduce((n, q) => n + q.rewards.xp, 0);
    expect(xp / 242_000).toBeGreaterThan(0.12);
    expect(xp / 242_000).toBeLessThan(0.16);
  });

  it('NPC chương 2 đứng ở Đoạn Mạch; trận trạm không mở sẵn', () => {
    for (const id of ['npc_to_van_ngu', 'npc_hua_lao', 'npc_khieu_han_son']) expect(NPC.get(id)!.level).toBe('doan_mach');
    expect(TELE_FREE).not.toContain('dm_tp_tram');
  });
});

describe('mở trận bằng nhiệm vụ đầu chương', () => {
  it('nhận q2_thu_ha_son ở Lạc Vân mở dm_tp_tram; chưa nhận thì khóa', () => {
    const t = setup('van_lam', 16);
    t.char.quests.done.push('q_truc_co');
    expect(t.char.teleOpen()).not.toContain('dm_tp_tram');
    t.atNpc('npc_chuong_mon');
    t.accept('q2_thu_ha_son');
    expect(t.char.teleOpen()).toContain('dm_tp_tram');
    expect(t.sys()).toContain('sys.tele_unlock');
  });

  it('chưa xong Trúc Cơ hoặc đứng xa NPC thì không nhận được: trận vẫn khóa', () => {
    const t = setup('van_lam', 16);
    t.atNpc('npc_chuong_mon');
    t.accept('q2_thu_ha_son');
    expect(t.char.quests.active.q2_thu_ha_son).toBeUndefined();
    t.char.quests.done.push('q_truc_co');
    t.at(2048, 1800);
    t.accept('q2_thu_ha_son');
    expect(t.char.teleOpen()).not.toContain('dm_tp_tram');
  });
});

describe('touch', () => {
  it('chạm Mạch Tinh Trụ trong TOUCH_R mới tính; xa hoặc đang bay thì không', () => {
    const t = setup();
    t.char.quests.done.push('q2_thu_ha_son');
    t.atNpc('npc_to_van_ngu');
    t.accept('q2_mach_tinh');
    const spot = questSpot(DM, 'mach_tinh_tru')!;
    t.at(spot.x + TOUCH_R + 3, spot.z);
    t.step();
    expect(t.char.quests.active.q2_mach_tinh[1]).toBe(0);
    t.at(spot.x + 2, spot.z);
    t.p.move.flying = true;
    t.step();
    expect(t.char.quests.active.q2_mach_tinh[1]).toBe(0);
    t.p.move.flying = false;
    t.step();
    expect(t.char.quests.active.q2_mach_tinh[1]).toBe(1);
  });

  it('s2_kiem_gay: năm điểm, mỗi điểm một lần', () => {
    const t = setup('doan_mach', 17);
    t.char.quests.done.push('q_kiem_trung');
    t.atNpc('npc_to_van_ngu');
    t.accept('s2_kiem_gay');
    for (let i = 1; i <= 5; i++) {
      const s = questSpot(DM, `kiem_gay_${i}`)!;
      t.at(s.x, s.z);
      t.step();
    }
    expect(t.char.quests.active.s2_kiem_gay).toEqual([1, 1, 1, 1, 1]);
    expect(t.char.questComplete('s2_kiem_gay')).toBe(true);
  });
});

describe('scan (qua thần thức E2-E)', () => {
  const start = (level: number): T => {
    const t = setup('doan_mach', level);
    t.char.quests.done.push('q2_thu_ha_son');
    t.atNpc('npc_to_van_ngu');
    t.accept('s2_thu_nghiem');
    return t;
  };
  const poi = (id: string) => ({ k: 'poi' as const, x: 0, z: 0, n: id });

  it('chưa Kết Đan thì không nhận được nhiệm vụ thần thức', () => {
    const t = start(SPIRIT_UNLOCK_LEVEL - 1);
    expect(t.char.quests.active.s2_thu_nghiem).toBeUndefined();
  });

  it('bản quét có điểm của mục tiêu thì tính; điểm khác hoặc loại khác thì không', () => {
    const t = start(SPIRIT_UNLOCK_LEVEL);
    expect(t.char.quests.active.s2_thu_nghiem).toEqual([0, 0, 0]);
    t.sim.questObj.onSpiritScan(t.p, [poi('mach_tinh_tru'), { k: 'mon', x: 0, z: 0, n: 'ho_sa_lun' }, poi('vach_dut_mach')]);
    expect(t.char.quests.active.s2_thu_nghiem).toEqual([1, 0, 0]);
    t.sim.questObj.onSpiritScan(t.p, [poi('ho_sa_lun'), poi('cong_mo')]);
    expect(t.char.quests.active.s2_thu_nghiem).toEqual([1, 1, 1]);
    expect(t.char.questComplete('s2_thu_nghiem')).toBe(true);
  });

  it('SpiritSystem thật: quét xong gọi nhiệm vụ với điểm trong bán kính', () => {
    const t = start(SPIRIT_UNLOCK_LEVEL);
    const a = questSpot(DM, 'mach_tinh_tru')!;
    t.at(a.x + 10, a.z);
    const hits = t.sim.spirit.scan(t.p, 60);
    t.sim.questObj.onSpiritScan(t.p, hits);
    expect(t.char.quests.active.s2_thu_nghiem?.[0]).toBe(1);
  });
});

describe('escort', () => {
  const def = DM.escorts![0];
  const start = (): T => {
    const t = setup('doan_mach', 17);
    t.char.quests.done.push('q2_thu_ha_son');
    t.atNpc('npc_hua_lao');
    t.accept('s2_ho_tong');
    return t;
  };
  type Convoys = Map<string, Map<string, { walk: { x: number; z: number } }>>;
  const walkOf = (t: T) => (t.sim.questObj as unknown as { convoys: Convoys }).convoys.get(t.p.sid)?.get(def.id)?.walk;
  /** Người chơi đứng sát người đồng hành mỗi nhịp. */
  const walk = (t: T, secs: number) => {
    for (let i = 0; i < secs * 4; i++) {
      const w = walkOf(t);
      if (w) t.at(w.x + 2, w.z);
      t.step(250);
    }
  };

  it('hàm thuần: đi nửa đường chưa tới, đi hết thì done', () => {
    let w = escortStart(def);
    const len = def.path.slice(1).reduce((n, [x, z], i) => n + Math.hypot(x - def.path[i][0], z - def.path[i][1]), 0);
    w = escortAdvance(def, w, len / 2);
    expect(w.done).toBe(false);
    w = escortAdvance(def, w, len);
    expect(w.done).toBe(true);
  });

  it('đi cùng thì tới nơi: tính xong mục tiêu, gỡ người đồng hành', () => {
    const t = start();
    expect(t.char.quests.active.s2_ho_tong).toEqual([0]);
    walk(t, 200);
    expect(t.char.quests.active.s2_ho_tong).toEqual([1]);
    expect(t.esc().at(-1)?.st).toBe(0);
    expect(t.sys()).toContain('sys.escort_done');
  });

  it('người nhận đứng xa thì người đồng hành đứng đợi, không tiến', () => {
    const t = start();
    t.at(def.path[0][0] + ESCORT_FOLLOW_R + 30, def.path[0][1]);
    for (let i = 0; i < 40; i++) t.step(250);
    const last = t.esc().at(-1)!;
    expect(last.st).toBe(2);
    expect(Math.hypot(last.x - def.path[0][0], last.z - def.path[0][1])).toBeLessThan(0.5);
  });

  it('bỏ quá xa thì quay về đầu đường, báo cho người chơi', () => {
    const t = start();
    walk(t, 20);
    const mid = walkOf(t)!;
    expect(Math.hypot(mid.x - def.path[0][0], mid.z - def.path[0][1])).toBeGreaterThan(20);
    t.at(def.path[0][0] + 1500, def.path[0][1]);
    t.step();
    expect(t.sys()).toContain('sys.escort_lost');
    const back = walkOf(t)!;
    expect(Math.hypot(back.x - def.path[0][0], back.z - def.path[0][1])).toBeLessThan(1);
  });

  it('đứng xa điểm đầu quá ESCORT_LOST_R qua nhiều nhịp: chỉ báo mất dấu tối đa một lần', () => {
    const t = start();
    t.at(def.path[0][0] + 1500, def.path[0][1]);
    for (let i = 0; i < 40; i++) {
      t.step(250);
      t.sim.now += 1000;
    }
    expect(t.sys().filter((k) => k === 'sys.escort_lost').length).toBe(0);
  });

  it('bỏ nhiệm vụ (hết mục tiêu) thì người đồng hành biến mất', () => {
    const t = start();
    walk(t, 4);
    delete t.char.quests.active.s2_ho_tong;
    t.step();
    expect(t.esc().at(-1)?.st).toBe(0);
  });
});

describe('thưởng và trả nhiệm vụ', () => {
  it('trả q2_thu_ha_son ở Tô Vãn Ngư: nhận thưởng một lần, nhận lại bị chặn', () => {
    const t = setup('doan_mach', 16);
    t.char.quests.done.push('q_truc_co');
    t.char.quests.active.q2_thu_ha_son = [0];
    t.atNpc('npc_to_van_ngu');
    const gold0 = t.char.gold;
    const xp0 = t.char.xp;
    t.turnin('q2_thu_ha_son');
    expect(t.char.quests.done).toContain('q2_thu_ha_son');
    expect(t.char.gold).toBe(gold0 + QUEST.get('q2_thu_ha_son')!.rewards.gold);
    expect(t.char.xp).toBeGreaterThan(xp0);
    const gold1 = t.char.gold;
    t.turnin('q2_thu_ha_son');
    expect(t.char.gold).toBe(gold1);
    t.accept('q2_thu_ha_son');
    expect(t.char.quests.active.q2_thu_ha_son).toBeUndefined();
  });

  it('q2_phuc_mach chỉ nhận sự kiện dungeon đúng đích (Kiếm Trủng không tính)', () => {
    const t = setup('doan_mach', 18);
    t.char.quests.done.push('q2_hoi_chu');
    t.atNpc('npc_to_van_ngu');
    t.accept('q2_phuc_mach');
    t.sim.questEvent(t.p, 'dungeon', undefined, 1);
    expect(t.char.quests.active.q2_phuc_mach).toEqual([0]);
    t.sim.questEvent(t.p, 'dungeon', 'phuc_mach_quat', 1);
    expect(t.char.quests.active.q2_phuc_mach).toEqual([1]);
  });

  it('q2_ket_dan giao ở Khưu Hàn Sơn và cần q2_dia_mach', () => {
    const t = setup('doan_mach', 19);
    t.char.quests.done.push('q_truc_co');
    t.atNpc('npc_khieu_han_son');
    t.accept('q2_ket_dan');
    expect(t.char.quests.active.q2_ket_dan).toBeUndefined();
    t.char.quests.done.push('q2_dia_mach');
    t.accept('q2_ket_dan');
    expect(t.char.quests.active.q2_ket_dan).toEqual([0]);
    expect(QUEST.get('q2_ket_dan')!.turnin).toBe('npc_khieu_han_son');
  });
});
