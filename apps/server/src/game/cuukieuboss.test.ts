import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { daoForm } from '@dtl/shared';

// TN-7: ba boss Cửu Kiều (Thạch Tượng, Đạo Linh, Lộ Linh): dữ liệu, giáp phá theo chu kỳ (reveal) và kháng theo Bản Nguyên (dao) tính ở server.
process.env.DB_FILE = ':memory:';
process.env.AUTH_DEV_BYPASS = '1';

type Ent = import('./sim').PlayerEnt;
type Rooms = typeof import('../rooms');
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let content: typeof import('@dtl/content');

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  content = await import('@dtl/content');
});

afterEach(() => vi.restoreAllMocks());

describe('dữ liệu ba boss Cửu Kiều', () => {
  it('Thạch Tượng: giáp phá theo chu kỳ 30 s, cửa sổ 8 s; đứng ở đợt cuối cầu 1', () => {
    const b = content.MONSTER.get('boss_thach_tuong')!;
    const rv = b.ai!.reveal!;
    expect(rv.dur).toBe(8);
    expect(rv.dur + rv.cd).toBe(30);
    expect(rv.guard).toBeLessThan(0.5);
    expect(rv.mul).toBeGreaterThan(1);
    expect(b.look).toBe('golem');
    expect(content.LEVELS.kieu_1!.dungeon!.waves.at(-1)!.mons[0]!.id).toBe('boss_thach_tuong');
    // Kiều Thủ vẫn là boss thế giới của Thiên Lộ Giới.
    expect(content.LEVELS.cuu_kieu!.spawns.map((s) => s.mon)).toContain('boss_kieu_thu');
  });

  it('Đạo Linh: ba hình thái khác hành, mỗi pha một hình', () => {
    const b = content.MONSTER.get('boss_dao_linh')!;
    expect(b.phases).toHaveLength(2);
    expect(new Set(b.dao!.forms).size).toBe(3);
    expect([0, 1, 2].map((ph) => daoForm(b.dao!, ph))).toEqual(b.dao!.forms);
    expect(b.look).toBe('wisp');
  });

  it('Lộ Linh: pha 1 gọi bóng, pha 2 lật mặt, pha 3 kháng nguồn và dồn vùng nổ', () => {
    const b = content.MONSTER.get('boss_lo_linh')!;
    expect(b.ai!.summon!.mon).toBe('mon_lo_anh');
    expect(b.phases![0]!.ai!.faces).toBeTruthy();
    expect(b.phases![1]!.ai!.faces).toBeNull();
    expect(daoForm(b.dao!, 0)).toBe('');
    expect(daoForm(b.dao!, 1)).toBe('');
    expect(daoForm(b.dao!, 2)).not.toBe('');
    expect(b.look).toBe('road');
  });
});

describe('kháng theo Bản Nguyên ở server', () => {
  let acc = 91000;
  function setup() {
    const levelId = 'kieu_6';
    // Phòng giả tối thiểu: chỉ cần sim để dựng quái và đánh.
    const room = {
      broadcast: () => undefined,
      clock: { setTimeout: () => undefined, setInterval: () => undefined },
    } as unknown as InstanceType<Rooms['GameRoom']>;
    const spawn = { x: 2040, z: 2040 };
    const sim = new GameSim(new WorldState(), room as never, {
      levelId: 'cuu_kieu',
      roomName: levelId,
      spawn,
      respawn: spawn,
      persistPosition: false,
    });
    return sim;
  }
  function player(sim: InstanceType<typeof GameSim>, root: string, dao?: string): Ent {
    const char = Character.create(acc++, 'dao' + acc);
    char.level = 46;
    char.root = root as never;
    if (dao) char.meta.dao = dao;
    char.recalc();
    char.hp = char.mhp;
    char.save();
    const c = { sessionId: 'sid' + acc++, send: () => undefined };
    return sim.addPlayer(c as never, char, true, 's') as Ent;
  }
  it('cùng hành hình thái: sát thương nhỏ hơn rõ; hành khắc: lớn hơn; Đạo thay linh căn', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const sim = setup();
    const def = content.MONSTER.get('boss_dao_linh')!;
    expect(def.dao!.forms[0]).toBe('hoa');
    const dealt = (root: string, dao?: string) => {
      const p = player(sim, root, dao);
      const m = sim.spawnMonster(def, 46, p.move.x + 3, p.move.z, null)!;
      const hp0 = m.s.hp;
      (sim as unknown as { monSys: { hitMonster(p: Ent, m: unknown, power: number): boolean } }).monSys.hitMonster(p, m, 1);
      return hp0 - m.s.hp;
    };
    const base = dealt('moc'); // mộc không cùng hành cũng không khắc hỏa
    const same = dealt('hoa');
    const beat = dealt('thuy'); // thủy khắc hỏa
    expect(same).toBeLessThan(base * 0.5);
    expect(beat).toBeGreaterThan(base * 1.2);
    // Đạo ưu tiên linh căn: linh căn mộc nhưng Đạo hỏa thì bị kháng.
    expect(dealt('moc', 'hoa')).toBeLessThan(base * 0.5);
  });
});
