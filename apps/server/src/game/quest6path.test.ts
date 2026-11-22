import { beforeAll, describe, expect, it } from 'vitest';
import { MS_DEAD } from '@dtl/shared';
import { LEVELS, MONSTER, NPC, PATHS, QUEST, pathOf, questPathOk } from '@dtl/content';

// Nhánh nhiệm vụ chương 6 theo Hướng tu (h6_*): chỉ người đang tu đúng hướng nhận được, đi chuỗi qua server thật,
// thưởng vào ví/túi trong một transaction có idempotency key và ghi ledger.
process.env.DB_FILE = ':memory:';

let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let sqlite: typeof import('../db').sqlite;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ sqlite } = await import('../db'));
});

const SPAWN = LEVELS.van_dinh.spawn ?? { x: 1024, z: 1596 };
let acc = 7770;
const h6 = () => [...QUEST.values()].filter((q) => q.id.startsWith('h6_'));

function setup(level: number, methodId: string) {
  const sim = new GameSim(new WorldState(), { broadcast: () => {} } as never, {
    levelId: 'van_dinh',
    roomName: 'test',
    spawn: { x: SPAWN.x, z: SPAWN.z },
    respawn: { x: SPAWN.x, z: SPAWN.z },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'h6' + acc);
  char.level = level;
  char.meta.method = methodId;
  char.recalc();
  char.hp = char.mhp;
  const sid = 's' + acc;
  const p = sim.addPlayer({ sessionId: sid, send: () => {} } as never, char, true, sid);
  sim.now = 1_000_000;
  const near = (npc: string) => {
    const n = NPC.get(npc)!;
    p.move.x = n.x;
    p.move.z = n.z;
    p.move.y = 0;
  };
  return { sim, p, char, near };
}

const PATH_IDS = ['hon_tu', 'the_tu', 'dao_tu', 'co_tu', 'co_than', 'loi_tu', 'cam_che_su'];

describe('dữ liệu nhánh hướng tu chương 6', () => {
  it('mỗi hướng trong bảy hướng có đúng 2 nhiệm vụ, giao ở NPC van_dinh, nối tiếp nhau', () => {
    for (const id of PATH_IDS) {
      const qs = h6().filter((q) => q.path === id);
      expect(
        qs.map((q) => q.id),
        id,
      ).toEqual([`h6_${id}_1`, `h6_${id}_2`]);
      expect(PATHS.some((p) => p.id === id)).toBe(true);
      expect(qs[0]!.requires).toBe('q6_dao');
      expect(qs[1]!.requires).toBe(qs[0]!.id);
      for (const q of qs) {
        expect(NPC.get(q.giver)?.level, q.id).toBe('van_dinh');
        expect(NPC.get(q.turnin)?.level, q.id).toBe('van_dinh');
        expect(q.rewards.items?.length, q.id).toBeGreaterThan(0);
      }
    }
    expect(h6()).toHaveLength(PATH_IDS.length * 2);
  });

  it('quái nhắm có trong bản đồ van_dinh và cấp tối đa của bãi >= minLevel', () => {
    const sp = [...(LEVELS.van_dinh.camps ?? []), ...(LEVELS.van_dinh.spawns ?? [])];
    for (const q of h6())
      for (const o of q.objectives) {
        const hit = sp.filter((s) => s.mon === o.target);
        expect(hit.length, `${q.id}/${o.target}`).toBeGreaterThan(0);
        expect(Math.max(...hit.map((s) => s.levelMax)), `${q.id}/${o.target}`).toBeGreaterThanOrEqual(q.minLevel ?? 1);
      }
  });

  it('questPathOk: không gắn hướng thì ai cũng nhận; gắn hướng thì phải trùng', () => {
    expect(questPathOk({}, undefined)).toBe(true);
    expect(questPathOk({ path: 'hon_tu' }, 'hon_tu')).toBe(true);
    expect(questPathOk({ path: 'hon_tu' }, 'dao_tu')).toBe(false);
    expect(questPathOk({ path: 'hon_tu' }, undefined)).toBe(false);
  });
});

describe('đi chuỗi h6_* qua server thật', () => {
  it('đúng hướng nhận được; sai hướng bị từ chối, không đổi trạng thái', () => {
    const q = QUEST.get('h6_hon_tu_1')!;
    const wrong = setup(36, PATHS.find((p) => p.id === 'dao_tu')!.methods[0]!);
    wrong.char.quests.done.push('q6_dao');
    wrong.near(q.giver);
    wrong.sim.onQuest(wrong.p, { a: 'accept', id: q.id });
    expect(wrong.char.quests.active[q.id]).toBeUndefined();
    const ok = setup(36, PATHS.find((p) => p.id === 'hon_tu')!.methods[0]!);
    ok.char.quests.done.push('q6_dao');
    ok.near(q.giver);
    ok.sim.onQuest(ok.p, { a: 'accept', id: q.id });
    expect(ok.char.quests.active[q.id]).toBeTruthy();
  });

  it.each(PATH_IDS)('%s: đi hết hai nhiệm vụ, thưởng đúng, ledger có dòng, trả lại lần hai không phát thêm', (pid) => {
    const method = PATHS.find((p) => p.id === pid)!.methods[0]!;
    expect(pathOf(method)?.id).toBe(pid);
    const t = setup(40, method);
    t.char.quests.done.push('q6_dao', 'q6_chuyen_dien');
    for (const q of h6().filter((x) => x.path === pid)) {
      t.near(q.giver);
      t.sim.onQuest(t.p, { a: 'accept', id: q.id });
      expect(t.char.quests.active[q.id], `${q.id} chưa nhận được`).toBeTruthy();
      // Đánh chết quái thật bằng đường server.
      for (const o of q.objectives) {
        for (let i = 0; i < o.count; i++) {
          const m = t.sim.spawnMonster(MONSTER.get(o.target!)!, 40, t.p.move.x + 3, t.p.move.z, null);
          t.sim.damageMonster(m, m.s.hp + 1, t.p);
          expect(m.state).toBe(MS_DEAD);
        }
      }
      const gold0 = t.char.gold;
      const have0 = (id: string) => t.char.inv.reduce((s, x) => s + (x?.id === id ? x.n : 0), 0);
      const before = Object.fromEntries((q.rewards.items ?? []).map((i) => [i.id, have0(i.id)]));
      t.near(q.turnin);
      t.sim.onQuest(t.p, { a: 'turnin', id: q.id });
      expect(t.char.quests.done, `${q.id} chưa trả được`).toContain(q.id);
      expect(t.char.gold - gold0).toBe(q.rewards.gold);
      for (const i of q.rewards.items ?? []) expect(have0(i.id) - before[i.id]!, `${q.id}/${i.id}`).toBe(i.n);
      const rows = sqlite.prepare('SELECT COUNT(*) AS n FROM ledger WHERE char_id = ? AND reason = ?').get(t.char.id, 'quest:' + q.id) as {
        n: number;
      };
      expect(rows.n, `${q.id}: ledger`).toBeGreaterThan(0);
      // Trả lần hai: nhiệm vụ đã xong, không phát thêm.
      t.sim.onQuest(t.p, { a: 'turnin', id: q.id });
      expect(t.char.gold - gold0).toBe(q.rewards.gold);
    }
  });
});
