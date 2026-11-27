import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { groundAt, methodLateMul } from '@dtl/shared';

// Hệ số sát thương cấp cao theo công pháp (`MethodDef.late`, cân bằng 28/11): server nhân vào đòn trực tiếp lên quái từ mốc cấp đã khai.
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
type Ent = import('./sim').PlayerEnt;
type Mon = import('./sim').MonEnt;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;
let MONSTER: typeof import('@dtl/content').MONSTER;
let METHOD: typeof import('@dtl/content').METHOD;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
  ({ MONSTER, METHOD } = await import('@dtl/content'));
});

afterEach(() => vi.restoreAllMocks());

const X = 2040;
const Z = 2040;
let acc = 97000;

/** Sát thương một đòn hệ số 1 (không bạo kích, roll cố định) của nhân vật công pháp `method`, chỉ số tính ở cấp 40, phán định ở cấp `at`. */
function oneHit(method: string, at: number): number {
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => undefined } as never, {
    levelId: 'van_lam',
    roomName: 'test',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const char = Character.create(acc++, 'late' + acc);
  char.level = 40;
  char.root = 'tho'; // linh căn ngẫu nhiên lúc tạo làm lệch chỉ số giữa hai nhân vật
  char.meta.method = method;
  char.recalc();
  const p: Ent = sim.addPlayer({ sessionId: 'l' + acc, send: () => undefined } as never, char, true, 's' + acc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  // Quái đứng xa (ngoài tầm nội tại cận chiến), máu lớn.
  const m: Mon = sim.spawnMonster(MONSTER.get('boss_han_giao')!, 40, X + 30, Z, null);
  char.level = at; // chỉ đổi cấp phán định, công kích giữ nguyên
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
  const hp = m.s.hp;
  (sim as unknown as { hitMonster(p: Ent, m: Mon, power: number): boolean }).hitMonster(p, m, 1);
  return hp - m.s.hp;
}

describe('hệ số sát thương cấp cao theo công pháp', () => {
  it('methodLateMul: 1 khi không khai hoặc chưa tới mốc', () => {
    expect(methodLateMul(undefined, 40)).toBe(1);
    expect(methodLateMul({}, 40)).toBe(1);
    expect(methodLateMul({ late: { level: 32, dmgMul: 0.85 } }, 31)).toBe(1);
    expect(methodLateMul({ late: { level: 32, dmgMul: 0.85 } }, 32)).toBe(0.85);
  });

  it('Kiếm tu và Đao tu: đòn lên quái giảm đúng hệ số từ mốc cấp, dưới mốc không đổi; hướng khác không đổi', () => {
    for (const id of ['lac_kiem_quyet', 'liet_nhan_dao_kinh']) {
      const late = METHOD.get(id)!.late!;
      expect(late.level).toBe(32);
      const below = oneHit(id, late.level - 1);
      const above = oneHit(id, late.level);
      expect(above / below).toBeCloseTo(late.dmgMul, 1);
      expect(above).toBeLessThan(below);
    }
    expect(METHOD.get('thanh_moc_dan_kinh')!.late).toBeUndefined();
    expect(oneHit('thanh_moc_dan_kinh', 32)).toBe(oneHit('thanh_moc_dan_kinh', 31));
  });
});
