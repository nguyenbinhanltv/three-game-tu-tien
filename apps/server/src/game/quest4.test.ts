import { beforeAll, describe, expect, it } from 'vitest';
import { PF_SOUL, TOUCH_R, questSpot } from '@dtl/shared';
import { LEVELS, NPC, QUEST } from '@dtl/content';

// Nhiệm vụ chương 4 Thiên Khuyết (E4-H): chuỗi q4_*, phụ s4_*, môn phong ấn chỉ nguyên anh xuất khiếu chạm được, phó bản Thần Tàng Điện.
process.env.DB_FILE = ':memory:';

let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
});

const TK = LEVELS.thien_khuyet;
let acc = 9870;

function setup() {
  const host = { broadcast: () => {} };
  const sim = new GameSim(new WorldState(), host as never, { levelId: 'thien_khuyet', roomName: 'test', spawn: { x: 1024, z: 1036 }, respawn: { x: 1024, z: 1036 }, persistPosition: false });
  const char = Character.create(acc++, 'q4' + acc);
  char.level = 25;
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
  return { sim, p, char, at, step, accept: (id: string) => {
      const n = NPC.get(QUEST.get(id)!.giver)!;
      at(n.x, n.z);
      sim.onQuest(p, { a: 'accept', id });
    },
  };
}

describe('dữ liệu chương 4', () => {
  it('chuỗi nối đuôi từ q3_nguyen_anh; nhận/trả ở NPC có thật ở thien_khuyet; mở trận trạm', () => {
    expect(QUEST.get('q4_bac_len')!.requires).toBe('q3_nguyen_anh');
    expect(QUEST.get('q4_bac_len')!.unlockTele).toEqual(['tk_tp_tram']);
    for (const q of [...QUEST.values()].filter((x) => /^[qs]4_/.test(x.id))) {
      for (const n of [q.giver, q.turnin]) {
        const npc = NPC.get(n);
        expect(npc, `${q.id}: ${n}`).toBeTruthy();
        if (n !== 'npc_lam_chieu_dung') expect(npc!.level).toBe('thien_khuyet');
      }
    }
  });
  it('điểm, tuyến hộ tống và poi mà nhiệm vụ trỏ tới có trong thien_khuyet', () => {
    expect(TK.escorts!.find((e) => e.id === 'esc_mac_chieu')!.npc).toBe('npc_mac_chieu_do');
    expect(NPC.has('npc_mac_chieu_do')).toBe(false);
    for (const q of [...QUEST.values()].filter((x) => /^[qs]4_/.test(x.id))) {
      for (const o of q.objectives) if (o.type === 'touch' || o.type === 'scan') expect(questSpot(TK, o.target), `${q.id}/${o.target}`).toBeTruthy();
    }
  });
});

describe('chạm điểm', () => {
  it('đèn trời: đi bộ sát điểm thì tính; bay thì không', () => {
    const t = setup();
    t.char.quests.done.push('q4_bac_len');
    t.accept('s4_den_troi');
    const s = questSpot(TK, 'den_troi_1')!;
    t.at(s.x + TOUCH_R + 3, s.z);
    t.step();
    expect(t.char.quests.active.s4_den_troi[0]).toBe(0);
    t.at(s.x, s.z);
    t.p.move.flying = true;
    t.step();
    expect(t.char.quests.active.s4_den_troi[0]).toBe(0);
    t.p.move.flying = false;
    t.step();
    expect(t.char.quests.active.s4_den_troi[0]).toBe(1);
  });

  it('môn phong ấn: thân xác đứng sát vẫn không tính, nguyên anh xuất khiếu mới tính', () => {
    const t = setup();
    t.char.quests.done.push('q4_da_minh');
    t.accept('q4_xuat_khieu');
    const s = questSpot(TK, 'phong_an_mon_1')!;
    t.at(s.x, s.z);
    t.step();
    expect(t.char.quests.active.q4_xuat_khieu).toEqual([0, 0, 0]);
    t.p.s.fl |= PF_SOUL;
    t.p.move.flying = true;
    t.step();
    expect(t.char.quests.active.q4_xuat_khieu).toEqual([1, 0, 0]);
  });
});

describe('phó bản và quái', () => {
  it('q4_than_tang chỉ nhận sự kiện dungeon đúng đích', () => {
    const t = setup();
    t.char.level = 26;
    t.char.quests.done.push('q4_thu_linh');
    t.accept('q4_than_tang');
    t.sim.questEvent(t.p, 'dungeon', undefined, 1);
    t.sim.questEvent(t.p, 'dungeon', 'kinh_nguyet_cung', 1);
    expect(t.char.quests.active.q4_than_tang).toEqual([0]);
    t.sim.questEvent(t.p, 'dungeon', 'than_tang_dien', 1);
    expect(t.char.quests.active.q4_than_tang).toEqual([1]);
  });
});
