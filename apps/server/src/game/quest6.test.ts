import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_LEVEL, MS_DEAD, questSpot, xpNeed } from '@dtl/shared';
import { LEVELS, MONSTER, NPC, QUEST } from '@dtl/content';

// Nhiệm vụ chương 6 Vấn Đỉnh (TN-3): đi hết chuỗi q6_* bằng đường server thật (nhận ở NPC, mục tiêu, trả, thưởng) và bốn nhiệm vụ phụ s6_*.
process.env.DB_FILE = ':memory:';

let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
});

const VD = LEVELS.van_dinh;
let acc = 9990;
const SPAWN = VD.spawn ?? { x: 1024, z: 1596 };

/** Một người chơi (nhân vật `char` dùng chung) ở room của level `levelId`: NPC chỉ nhận lời khi cùng level (`nearNpc`). */
function setup(level: number, levelId = 'van_dinh', existing?: InstanceType<typeof Character>) {
  const host = { broadcast: () => {} };
  const sim = new GameSim(new WorldState(), host as never, {
    levelId,
    roomName: 'test',
    spawn: { x: SPAWN.x, z: SPAWN.z },
    respawn: { x: SPAWN.x, z: SPAWN.z },
    persistPosition: false,
  });
  const char = existing ?? Character.create(acc++, 'q6' + acc);
  if (!existing) {
    char.level = level;
    char.recalc();
    char.hp = char.mhp;
  }
  const p = sim.addPlayer({ sessionId: 's' + acc + levelId, send: () => {} } as never, char, true, 's' + acc + levelId);
  sim.now = 1_000_000;
  const at = (x: number, z: number) => {
    p.move.x = x;
    p.move.z = z;
    p.move.y = 0;
  };
  const near = (npc: string) => {
    const n = NPC.get(npc)!;
    at(n.x, n.z);
  };
  const step = () => {
    sim.now += 300;
    (sim.questObj as unknown as { stepAt: number }).stepAt = 0;
    sim.questObj.tick();
  };
  return { sim, p, char, at, near, step };
}

const q6 = () => [...QUEST.values()].filter((q) => /^[qs]6_/.test(q.id));

describe('dữ liệu chương 6', () => {
  it('11 chính + 4 phụ; chuỗi nối từ q5_anh_bien; mỗi nhiệm vụ nhận/trả ở NPC có thật', () => {
    expect(q6().filter((q) => q.id.startsWith('q6_'))).toHaveLength(11);
    expect(q6().filter((q) => q.id.startsWith('s6_'))).toHaveLength(4);
    expect(QUEST.get('q6_gioi_mon')!.requires).toBe('q5_anh_bien');
    for (const q of q6()) {
      for (const n of [q.giver, q.turnin]) expect(NPC.get(n), `${q.id}: ${n}`).toBeTruthy();
      expect(q.minLevel ?? 1, q.id).toBeLessThanOrEqual(MAX_LEVEL);
      if (q.requires) expect(QUEST.get(q.requires), `${q.id} requires ${q.requires}`).toBeTruthy();
      for (const o of q.objectives) {
        if (o.type === 'kill') expect(MONSTER.get(o.target ?? ''), `${q.id}/${o.target}`).toBeTruthy();
        if (o.type === 'touch') expect(questSpot(VD, o.target ?? ''), `${q.id}/${o.target}`).toBeTruthy();
      }
    }
  });

  it('quái nhắm của nhiệm vụ kill có trong bản đồ van_dinh (cụm hoặc điểm sinh), cấp tối đa của bãi >= minLevel', () => {
    const spawns = [
      ...(VD.camps ?? []).map((c) => ({ mon: c.mon, hi: c.levelMax })),
      ...(VD.spawns ?? []).map((s) => ({ mon: s.mon, hi: s.levelMax })),
    ];
    for (const q of q6()) {
      for (const o of q.objectives) {
        if (o.type !== 'kill') continue;
        const hit = spawns.filter((s) => s.mon === o.target);
        expect(hit.length, `${q.id}/${o.target} không có trong van_dinh`).toBeGreaterThan(0);
        expect(Math.max(...hit.map((s) => s.hi)), `${q.id}/${o.target}`).toBeGreaterThanOrEqual(q.minLevel ?? 1);
      }
    }
  });
});

describe('đi hết chuỗi q6_* bằng server thật', () => {
  it('từ q6_gioi_mon tới q6_dung_thuc: nhận ở NPC, làm mục tiêu, trả, thưởng vàng đúng, xong cả 11', () => {
    const t = setup(32, 'bac_hoang');
    t.char.quests.done.push('q5_anh_bien');
    const sess = new Map<string, ReturnType<typeof setup>>([['bac_hoang', t]]);
    /** Phiên ở room của NPC `npc` (cùng nhân vật). */
    const at = (npc: string) => {
      const lv = NPC.get(npc)!.level ?? 'van_lam';
      let s = sess.get(lv);
      if (!s) sess.set(lv, (s = setup(t.char.level, lv, t.char)));
      s.near(npc);
      return s;
    };
    const order: string[] = [];
    let cur = 'q5_anh_bien';
    for (;;) {
      const next = q6().find((q) => q.requires === cur && q.id.startsWith('q6_'));
      if (!next) break;
      order.push(next.id);
      cur = next.id;
    }
    expect(order).toHaveLength(11);
    expect(order[0]).toBe('q6_gioi_mon');
    expect(order.at(-1)).toBe('q6_dung_thuc');
    for (const id of order) {
      const q = QUEST.get(id)!;
      if (t.char.level < (q.minLevel ?? 1)) {
        t.char.level = q.minLevel ?? 1;
        t.char.recalc();
      }
      const giver = at(q.giver);
      giver.sim.onQuest(giver.p, { a: 'accept', id });
      expect(t.char.quests.active[id], `${id} chưa nhận được`).toBeTruthy();
      const vd = sess.get('van_dinh') ?? (sess.set('van_dinh', setup(t.char.level, 'van_dinh', t.char)), sess.get('van_dinh')!);
      for (const o of q.objectives) {
        if (o.type === 'kill') vd.sim.questEvent(vd.p, 'kill', o.target, o.count);
        else if (o.type === 'touch') {
          const sp = questSpot(VD, o.target ?? '')!;
          vd.at(sp.x, sp.z);
          vd.step();
        } else if (o.type === 'dungeon') vd.sim.questEvent(vd.p, 'dungeon', o.target, o.count);
        else if (o.type === 'breakthrough') vd.sim.questEvent(vd.p, 'breakthrough', o.target, o.count);
        // `talk`: tính khi đứng cạnh NPC lúc trả.
      }
      const gold0 = t.char.gold;
      const turn = at(q.turnin);
      turn.sim.onQuest(turn.p, { a: 'turnin', id });
      expect(t.char.quests.done, `${id} chưa trả được`).toContain(id);
      expect(t.char.gold - gold0).toBe(q.rewards.gold);
    }
    expect(t.char.quests.done.filter((id) => id.startsWith('q6_'))).toHaveLength(11);
  });

  it('q6_gioi_mon mở Truyền Tống vd_tp_tram; cấp thấp hơn minLevel bị từ chối', () => {
    const low = setup(31, 'bac_hoang');
    low.char.quests.done.push('q5_anh_bien');
    low.near(QUEST.get('q6_gioi_mon')!.giver);
    low.sim.onQuest(low.p, { a: 'accept', id: 'q6_gioi_mon' });
    expect(low.char.quests.active.q6_gioi_mon).toBeUndefined();
    const ok = setup(32, 'bac_hoang');
    ok.char.quests.done.push('q5_anh_bien');
    ok.near(QUEST.get('q6_gioi_mon')!.giver);
    ok.sim.onQuest(ok.p, { a: 'accept', id: 'q6_gioi_mon' });
    expect(ok.char.quests.active.q6_gioi_mon).toBeTruthy();
    expect(ok.char.tele).toContain('vd_tp_tram');
  });

  it('q6_dung_thuc: đã qua Dương Thực Kiếp (cấp 44) trước khi nhận thì tính xong ngay', () => {
    const t = setup(44);
    t.char.quests.done.push('q6_dinh_linh');
    const q = QUEST.get('q6_dung_thuc')!;
    t.near(q.giver);
    t.sim.onQuest(t.p, { a: 'accept', id: 'q6_dung_thuc' });
    expect(t.char.quests.active.q6_dung_thuc?.[0]).toBe(1);
    t.near(q.turnin);
    t.sim.onQuest(t.p, { a: 'turnin', id: 'q6_dung_thuc' });
    expect(t.char.quests.done).toContain('q6_dung_thuc');
  });
});

describe('nhiệm vụ phụ s6_*', () => {
  it('chỉ nhận được sau nhiệm vụ chính đứng trước; đánh chết quái thật tính vào mục tiêu kill', () => {
    const t = setup(33);
    const id = 's6_re_chua';
    const q = QUEST.get(id)!;
    t.near(q.giver);
    t.sim.onQuest(t.p, { a: 'accept', id });
    expect(t.char.quests.active[id]).toBeUndefined();
    t.char.quests.done.push(q.requires!);
    t.sim.onQuest(t.p, { a: 'accept', id });
    expect(t.char.quests.active[id]).toBeTruthy();
    const def = MONSTER.get('mon_bong_re')!;
    const m = t.sim.spawnMonster(def, 33, t.p.move.x + 3, t.p.move.z, null);
    t.sim.damageMonster(m, m.s.hp + 1, t.p);
    expect(m.state).toBe(MS_DEAD);
    expect(t.char.quests.active[id]![0]).toBe(1);
  });

  it('phần thưởng xp phụ vừa phải so với xpNeed của cấp nhận (<= 20%)', () => {
    for (const q of q6().filter((x) => x.id.startsWith('s6_')))
      expect(q.rewards.xp / xpNeed(Math.max(32, q.minLevel ?? 32)), q.id).toBeLessThanOrEqual(0.2);
  });
});
