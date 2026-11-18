import { beforeAll, describe, expect, it } from 'vitest';
import { S, TOUCH_R, questSpot, type EscortMsg } from '@dtl/shared';
import { LEVELS, NPC, QUEST } from '@dtl/content';

// Nhiệm vụ phụ chương 3 (E3-H2): s3_do_thuyen (hộ tống qua ba đảo) và s3_guong_nuoc (chạm bốn mảnh gương), thưởng một lần (tx + ledger).
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

const VH = LEVELS.van_hai;
let acc = 9980;

function setup() {
  const sent: { type: string; msg: unknown }[] = [];
  const host = { broadcast: () => {} };
  const sim = new GameSim(new WorldState(), host as never, {
    levelId: 'van_hai',
    roomName: 'test',
    spawn: { x: 1024, z: 1036 },
    respawn: { x: 1024, z: 1036 },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'q3b' + acc);
  char.level = 22;
  char.recalc();
  char.hp = char.mhp;
  const p = sim.addPlayer(
    { sessionId: 's' + acc, send: (type: string, msg: unknown) => sent.push({ type, msg }) } as never,
    char,
    true,
    's' + acc,
  );
  sim.now = 1_000_000;
  const at = (x: number, z: number) => {
    p.move.x = x;
    p.move.z = z;
    p.move.y = 0;
  };
  const atNpc = (id: string) => at(NPC.get(id)!.x, NPC.get(id)!.z);
  const step = (ms = 300) => {
    sim.now += ms;
    (sim.questObj as unknown as { stepAt: number }).stepAt = 0;
    sim.questObj.tick();
  };
  const sys = () => sent.filter((s) => s.type === S.SYS).map((s) => (s.msg as { k: string }).k);
  const esc = () => sent.filter((s) => s.type === S.ESCORT).map((s) => s.msg as EscortMsg);
  return {
    sim,
    p,
    char,
    at,
    atNpc,
    step,
    sys,
    esc,
    accept: (id: string) => sim.onQuest(p, { a: 'accept', id }),
    turnin: (id: string) => sim.onQuest(p, { a: 'turnin', id }),
  };
}

describe('dữ liệu', () => {
  it('hai phụ nhận ở Lâm Chiếu Dung, requires q3_*; điểm và tuyến có trong van_hai', () => {
    for (const id of ['s3_do_thuyen', 's3_guong_nuoc']) {
      const q = QUEST.get(id)!;
      expect([q.giver, q.turnin]).toEqual(['npc_lam_chieu_dung', 'npc_lam_chieu_dung']);
      expect(q.requires?.startsWith('q3_')).toBe(true);
    }
    expect(VH.spots!.length).toBe(4);
    const esc = VH.escorts!.find((e) => e.id === 'esc_do_thuyen')!;
    expect(esc.npc).toBe('npc_lam_chieu_dung_do');
    expect(NPC.has(esc.npc)).toBe(false);
  });
});

describe('s3_guong_nuoc', () => {
  it('bốn mảnh gương: xa thì không tính, đứng sát từng mảnh mới tính, trả một lần', () => {
    const t = setup();
    t.char.quests.done.push('q3_than_thuc');
    t.atNpc('npc_lam_chieu_dung');
    t.accept('s3_guong_nuoc');
    expect(t.char.quests.active.s3_guong_nuoc).toEqual([0, 0, 0, 0]);
    const s1 = questSpot(VH, 'guong_nuoc_1')!;
    t.at(s1.x + TOUCH_R + 3, s1.z);
    t.step();
    expect(t.char.quests.active.s3_guong_nuoc).toEqual([0, 0, 0, 0]);
    for (let i = 1; i <= 4; i++) {
      const s = questSpot(VH, `guong_nuoc_${i}`)!;
      t.at(s.x, s.z);
      t.step();
    }
    expect(t.char.quests.active.s3_guong_nuoc).toEqual([1, 1, 1, 1]);
    t.atNpc('npc_lam_chieu_dung');
    const gold = t.char.gold;
    t.turnin('s3_guong_nuoc');
    t.turnin('s3_guong_nuoc');
    expect(t.char.gold).toBe(gold + QUEST.get('s3_guong_nuoc')!.rewards.gold);
    const rows = sqlite.prepare("SELECT delta FROM ledger WHERE char_id = ? AND reason = 'quest:s3_guong_nuoc'").all(t.char.id);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('s3_do_thuyen', () => {
  const def = VH.escorts!.find((e) => e.id === 'esc_do_thuyen')!;
  type Convoys = Map<string, Map<string, { walk: { x: number; z: number } }>>;
  const walkOf = (t: ReturnType<typeof setup>) =>
    (t.sim.questObj as unknown as { convoys: Convoys }).convoys.get(t.p.sid)?.get(def.id)?.walk;

  it('đi cùng ba chuyến thì tới nơi, trả nhiệm vụ một lần', () => {
    const t = setup();
    t.char.quests.done.push('q3_len_may');
    t.atNpc('npc_lam_chieu_dung');
    t.accept('s3_do_thuyen');
    expect(t.char.quests.active.s3_do_thuyen).toEqual([0]);
    for (let i = 0; i < 4 * 600 && t.char.quests.active.s3_do_thuyen[0] === 0; i++) {
      const w = walkOf(t);
      if (w) t.at(w.x + 2, w.z);
      t.step(250);
    }
    expect(t.char.quests.active.s3_do_thuyen).toEqual([1]);
    expect(t.sys()).toContain('sys.escort_done');
    t.atNpc('npc_lam_chieu_dung');
    const gold = t.char.gold;
    t.turnin('s3_do_thuyen');
    t.turnin('s3_do_thuyen');
    expect(t.char.gold).toBe(gold + QUEST.get('s3_do_thuyen')!.rewards.gold);
    const rows = sqlite.prepare("SELECT delta FROM ledger WHERE char_id = ? AND reason = 'quest:s3_do_thuyen'").all(t.char.id);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('bỏ quá xa thì quay về đầu đường, báo mất dấu', () => {
    const t = setup();
    t.char.quests.done.push('q3_len_may');
    t.atNpc('npc_lam_chieu_dung');
    t.accept('s3_do_thuyen');
    for (let i = 0; i < 80; i++) {
      const w = walkOf(t);
      if (w) t.at(w.x + 2, w.z);
      t.step(250);
    }
    t.at(def.path[0][0] + 1500, def.path[0][1]);
    t.step();
    expect(t.sys()).toContain('sys.escort_lost');
  });
});
