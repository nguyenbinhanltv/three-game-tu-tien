import { beforeAll, describe, expect, it } from 'vitest';
import { S, SPIRIT_UNLOCK_LEVEL, KET_DAN_LEVEL, NGUYEN_ANH_LEVEL, xpNeed } from '@dtl/shared';
import { NPC, QUEST } from '@dtl/content';

// Nhiệm vụ chương 3 (E3-H): chuỗi q3_*, mở trận bằng nhiệm vụ đầu chương, nối Tam Trọng Kiếp, thưởng một lần (tx + ledger).
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

let acc = 9950;

function setup(levelId: string, level: number) {
  const sent: { type: string; msg: unknown }[] = [];
  const host = { broadcast: () => {} };
  const sim = new GameSim(new WorldState(), host as never, { levelId, roomName: 'test', spawn: { x: 1024, z: 1036 }, respawn: { x: 1024, z: 1036 }, persistPosition: false });
  const char = Character.create(acc++, 'q3' + acc);
  char.level = level;
  char.recalc();
  char.hp = char.mhp;
  const p = sim.addPlayer({ sessionId: 's' + acc, send: (type: string, msg: unknown) => sent.push({ type, msg }) } as never, char, true, 's' + acc);
  sim.now = 1_000_000;
  const atNpc = (id: string) => {
    p.move.x = NPC.get(id)!.x;
    p.move.z = NPC.get(id)!.z;
    p.move.y = 0;
  };
  const accept = (id: string) => sim.onQuest(p, { a: 'accept', id });
  const turnin = (id: string) => sim.onQuest(p, { a: 'turnin', id });
  const sys = () => sent.filter((s) => s.type === S.SYS).map((s) => (s.msg as { k: string }).k);
  return { sim, p, char, atNpc, accept, turnin, sys };
}

const MAIN = ['q3_len_may', 'q3_van_hac', 'q3_than_thuc', 'q3_kinh_linh', 'q3_thach_quy', 'q3_loi_van', 'q3_kinh_nguyet', 'q3_kinh_vuong'];

describe('dữ liệu chương 3', () => {
  it('9 nhiệm vụ chính nối đuôi từ q2_ket_dan, phụ requires nhiệm vụ chương 3', () => {
    MAIN.forEach((id, i) => {
      expect(QUEST.has(id), id).toBe(true);
      expect(QUEST.get(id)!.requires).toBe(i === 0 ? 'q2_ket_dan' : MAIN[i - 1]);
    });
    for (const id of ['s3_bich_ngoc', 's3_thu_ban_ve']) expect(QUEST.get(id)!.requires?.startsWith('q3_'), id).toBe(true);
  });

  it('thưởng tu vi nhiệm vụ chính ≈ 14% chặng Kết Đan, mỗi nhiệm vụ không quá 20% một cấp', () => {
    let stage = 0;
    for (let l = KET_DAN_LEVEL; l < NGUYEN_ANH_LEVEL; l++) stage += xpNeed(l);
    const xp = [...QUEST.values()].filter((q) => q.id.startsWith('q3_')).reduce((n, q) => n + q.rewards.xp, 0);
    expect(xp / stage).toBeGreaterThan(0.12);
    expect(xp / stage).toBeLessThan(0.16);
    for (const q of QUEST.values()) if (/^[qs]3_/.test(q.id)) expect(q.rewards.xp).toBeLessThanOrEqual(xpNeed(Math.max(q.minLevel ?? KET_DAN_LEVEL, KET_DAN_LEVEL)) * 0.2);
  });

  it('mục tiêu dùng loại sẵn có; scan từ Kết Đan; dungeon có tên', () => {
    for (const q of QUEST.values()) {
      if (!/^[qs]3_/.test(q.id)) continue;
      for (const o of q.objectives) {
        expect(['kill', 'gather', 'talk', 'scan', 'dungeon', 'breakthrough']).toContain(o.type);
        if (o.type === 'scan') expect(q.minLevel ?? 1).toBeGreaterThanOrEqual(SPIRIT_UNLOCK_LEVEL);
      }
    }
    expect(QUEST.get('q3_kinh_nguyet')!.objectives[0]).toMatchObject({ type: 'dungeon', target: 'kinh_nguyet_cung' });
    expect(QUEST.get('q3_kinh_vuong')!.objectives[0]).toMatchObject({ type: 'kill', target: 'boss_van_hai_kinh_vuong' });
  });

  it('q3_nguyen_anh nối sau q3_kinh_vuong, giao/trả ở Lâm Chiếu Dung (Phù Đảo Các, E3-B đã có quái); q3_len_may mở trận hub', () => {
    const na = QUEST.get('q3_nguyen_anh')!;
    expect(na.objectives).toEqual([{ type: 'breakthrough', target: 'nguyen_anh', count: 1 }]);
    expect([na.giver, na.turnin, na.requires]).toEqual(['npc_lam_chieu_dung', 'npc_lam_chieu_dung', 'q3_kinh_vuong']);
    expect(NPC.get(na.giver)!.level).toBe('van_hai');
    expect(QUEST.get('q3_len_may')!.unlockTele).toContain('vh_tp_hub');
  });

  it('NPC chương 3 ở Phù Đảo Các (van_hai); giao việc đúng người', () => {
    for (const id of ['npc_lam_chieu_dung', 'npc_to_van_ngu_hai']) expect(NPC.get(id)!.level).toBe('van_hai');
    expect(QUEST.get('q3_len_may')!.giver).toBe('npc_to_van_ngu');
    expect(QUEST.get('q3_len_may')!.turnin).toBe('npc_lam_chieu_dung');
  });
});

describe('nhận q3_len_may ở Hạ Khuyết Trạm', () => {
  it('cần xong q2_ket_dan và đúng cấp; xong thì nhận được', () => {
    const t = setup('doan_mach', 20);
    t.atNpc('npc_to_van_ngu');
    t.accept('q3_len_may');
    expect(t.char.quests.active.q3_len_may).toBeUndefined();
    t.char.quests.done.push('q2_ket_dan');
    t.accept('q3_len_may');
    expect(t.char.quests.active.q3_len_may).toBeDefined();
    expect(t.char.teleOpen()).toContain('vh_tp_hub');
  });
});

describe('chơi chương 3 ở Vân Hải', () => {
  it('trả q3_len_may ở Lâm Chiếu Dung: thưởng một lần, ghi ledger', () => {
    const t = setup('van_hai', 20);
    t.char.quests.done.push('q2_ket_dan');
    t.char.quests.active.q3_len_may = [0];
    t.atNpc('npc_lam_chieu_dung');
    const gold = t.char.gold;
    t.turnin('q3_len_may');
    expect(t.char.quests.done).toContain('q3_len_may');
    expect(t.char.gold).toBe(gold + QUEST.get('q3_len_may')!.rewards.gold);
    t.turnin('q3_len_may');
    expect(t.char.gold).toBe(gold + QUEST.get('q3_len_may')!.rewards.gold);
    const rows = sqlite.prepare("SELECT delta FROM ledger WHERE char_id = ? AND reason = 'quest:q3_len_may'").all(t.char.id);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('kill Kình Vương hoàn thành q3_kinh_vuong', () => {
    const t = setup('van_hai', 23);
    t.char.quests.done.push('q3_kinh_nguyet');
    t.atNpc('npc_lam_chieu_dung');
    t.accept('q3_kinh_vuong');
    t.sim.questEvent(t.p, 'kill', 'boss_van_hai_kinh_vuong', 1);
    expect(t.char.questComplete('q3_kinh_vuong')).toBe(true);
  });
});

describe('q3_nguyen_anh (Tam Trọng Kiếp, #143)', () => {
  it('nhận ở Lâm Chiếu Dung sau q3_kinh_vuong; độ kiếp Nguyên Anh hoàn thành nhiệm vụ; trả ở Lâm Chiếu Dung', () => {
    const t = setup('van_hai', 23);
    t.char.quests.done.push('q3_kinh_vuong');
    t.atNpc('npc_lam_chieu_dung');
    t.accept('q3_nguyen_anh');
    expect(t.char.quests.active.q3_nguyen_anh).toEqual([0]);
    t.sim.questEvent(t.p, 'breakthrough', 'nguyen_anh', 1);
    expect(t.char.questComplete('q3_nguyen_anh')).toBe(true);
    t.turnin('q3_nguyen_anh');
    expect(t.char.quests.done).toContain('q3_nguyen_anh');
  });
});
