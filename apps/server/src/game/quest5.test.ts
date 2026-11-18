import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_LEVEL, TOUCH_R, questSpot } from '@dtl/shared';
import { LEVELS, MONSTER, NPC, QUEST } from '@dtl/content';

// Nhiệm vụ chương 5 Bắc Hoang (DV3-H): chuỗi q5_*, phụ s5_*, trận mở bằng nhiệm vụ kiểm cấp, nhiệm vụ chờ dữ liệu bị khóa theo cấp.
process.env.DB_FILE = ':memory:';

let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
});

const BH = LEVELS.bac_hoang;
let acc = 9970;

function setup(level = 28, levelId = 'bac_hoang') {
  const host = { broadcast: () => {} };
  const sim = new GameSim(new WorldState(), host as never, {
    levelId,
    roomName: 'test',
    spawn: { x: 1024, z: 1556 },
    respawn: { x: 1024, z: 1556 },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'q5' + acc);
  char.level = level;
  char.recalc();
  char.hp = char.mhp;
  const p = sim.addPlayer({ sessionId: 's' + acc, send: () => {} } as never, char, true, 's' + acc);
  sim.now = 1_000_000;
  const at = (x: number, z: number) => {
    p.move.x = x;
    p.move.z = z;
    p.move.y = 0;
  };
  const step = () => {
    sim.now += 300;
    (sim.questObj as unknown as { stepAt: number }).stepAt = 0;
    sim.questObj.tick();
  };
  const accept = (id: string) => {
    const n = NPC.get(QUEST.get(id)!.giver)!;
    at(n.x, n.z);
    sim.onQuest(p, { a: 'accept', id });
  };
  return { sim, p, char, at, step, accept };
}

const ch5 = () => [...QUEST.values()].filter((q) => /^[qs]5_/.test(q.id));

describe('dữ liệu chương 5', () => {
  it('12 chính + 4 phụ; chuỗi nối từ q4_hoa_than; q5_bac_hanh mở trận trạm', () => {
    expect(ch5().filter((q) => q.id.startsWith('q5_'))).toHaveLength(12);
    expect(ch5().filter((q) => q.id.startsWith('s5_'))).toHaveLength(4);
    expect(QUEST.get('q5_bac_hanh')!.requires).toBe('q4_hoa_than');
    expect(QUEST.get('q5_bac_hanh')!.unlockTele).toEqual(['bh_tp_tram']);
  });
  it('NPC nhận/trả có thật; điểm chạm/quét có trong bac_hoang', () => {
    for (const q of ch5()) {
      for (const n of [q.giver, q.turnin]) expect(NPC.get(n), `${q.id}: ${n}`).toBeTruthy();
      for (const o of q.objectives)
        if (o.type === 'touch' || o.type === 'scan') expect(questSpot(BH, o.target), `${q.id}/${o.target}`).toBeTruthy();
    }
  });
  it('nhiệm vụ mở trận không cho nhận sớm hơn cấp vào level đích', () => {
    expect(QUEST.get('q5_bac_hanh')!.minLevel).toBeGreaterThanOrEqual(BH.minLevel!);
  });
  it('mọi nhiệm vụ làm được ở trần cấp: minLevel <= MAX_LEVEL, mục tiêu kill có quái thật (s5_cham_ba nhắm tinh anh ngoài bản đồ)', () => {
    for (const q of ch5()) {
      expect(q.minLevel ?? 1, q.id).toBeLessThanOrEqual(MAX_LEVEL);
      for (const o of q.objectives) if (o.type === 'kill') expect(MONSTER.get(o.target ?? ''), `${q.id}/${o.target}`).toBeTruthy();
    }
  });
});

describe('nhận và chạm', () => {
  it('nhận q5_bac_hanh ở cấp 28 mở trận bh_tp_tram; cấp thấp bị từ chối', () => {
    const low = setup(27, 'thien_khuyet');
    low.char.quests.done.push('q4_hoa_than');
    low.accept('q5_bac_hanh');
    expect(low.char.quests.active.q5_bac_hanh).toBeUndefined();
    const t = setup(28, 'thien_khuyet');
    t.char.quests.done.push('q4_hoa_than');
    t.accept('q5_bac_hanh');
    expect(t.char.quests.active.q5_bac_hanh).toBeTruthy();
    expect(t.char.tele).toContain('bh_tp_tram');
  });
  it('phó bản chờ dữ liệu (Kim Dạ Cung): không nhận được ở cấp 28', () => {
    const t = setup(28);
    t.char.quests.done.push('q5_thu_khich');
    t.accept('q5_kim_da');
    expect(t.char.quests.active.q5_kim_da).toBeUndefined();
  });
  it('mạch nhãn: đi bộ sát điểm thì tính', () => {
    const t = setup(28);
    t.char.quests.done.push('q5_then_cai');
    t.accept('s5_buom_mach');
    const s = questSpot(BH, 'mach_nhan_1')!;
    t.at(s.x + TOUCH_R + 3, s.z);
    t.step();
    expect(t.char.quests.active.s5_buom_mach[0]).toBe(0);
    t.at(s.x, s.z);
    t.step();
    expect(t.char.quests.active.s5_buom_mach[0]).toBe(1);
  });
});
