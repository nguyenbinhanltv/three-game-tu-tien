import { beforeAll, describe, expect, it } from 'vitest';
import { groundAt, type GmReply } from '@dtl/shared';

// Soát từng lệnh /gm qua kênh có cấu trúc: thành công thì ok + `d` đúng khóa; tham số rác thì `usage`; đích không có thì `fail`; lệnh lạ thì `unknown`.
// Bảng chạy tuần tự trên MỘT nhân vật (trạng thái nối tiếp: build trước rồi mới có công pháp cho res/branch).
process.env.DB_FILE = ':memory:';

type Sim = import('./sim').GameSim;
let GameSim: typeof import('./sim').GameSim;
let WorldState: typeof import('../state').WorldState;
let Character: typeof import('./character').Character;

beforeAll(async () => {
  ({ GameSim } = await import('./sim'));
  ({ WorldState } = await import('../state'));
  ({ Character } = await import('./character'));
});

const X = 2040;
const Z = 2040;
let nextAcc = 98500;

function setup(levelId: string) {
  const sim: Sim = new GameSim(new WorldState(), { broadcast: () => {} } as never, {
    levelId,
    roomName: 'audit',
    spawn: { x: X, z: Z },
    respawn: { x: X, z: Z },
    persistPosition: false,
  });
  const char = Character.create(nextAcc++, 'Ad' + nextAcc);
  char.level = 20;
  char.recalc();
  char.hp = char.mhp;
  const p = sim.addPlayer({ sessionId: 'ad' + nextAcc, send: () => {} } as never, char, true, 's' + nextAcc);
  p.move.x = X;
  p.move.z = Z;
  p.move.y = groundAt(X, Z);
  const exec = (line: string): Omit<GmReply, 'r' | 'st'> => {
    sim.now += 100;
    return sim.gmSys.exec(p, line.split(' ').filter(Boolean));
  };
  return { sim, p, exec };
}

/** [lệnh, kết quả mong đợi, khóa của d]. 'ok' phải có d với các khóa đó; mã lỗi thì d không bắt buộc. */
type Row = [string, 'ok' | 'usage' | 'fail' | 'unknown', string[]?];

const OPEN: Row[] = [
  ['help', 'ok', ['groups']],
  ['help level', 'ok', ['cmd', 'help']],
  ['help zz', 'unknown'],
  ['level 12', 'ok', ['level']],
  ['level abc', 'usage'],
  ['level 0', 'ok', ['level']],
  ['realm nk5', 'ok', ['level']],
  ['realm zz', 'usage'],
  ['realm', 'usage'],
  ['xp 100', 'ok', ['added', 'level', 'xp']],
  ['xp abc', 'usage'],
  ['xp -5', 'usage'],
  ['gold 500', 'ok', ['gold', 'added']],
  ['gold abc', 'usage'],
  ['god on', 'ok', ['god']],
  ['god off', 'ok', ['god']],
  ['heal', 'ok', ['hp', 'mp']],
  ['cd', 'ok'],
  ['free on', 'ok', ['free']],
  ['free off', 'ok', ['free']],
  ['charge 50', 'ok', ['charge']],
  ['charge abc', 'usage'],
  ['build lac_kiem_quyet 20', 'ok', ['method', 'level', 'free']],
  ['build zz', 'usage'],
  ['build', 'usage'],
  ['build lac_kiem_quyet abc', 'usage'],
  ['res 10', 'ok', ['id', 'value', 'max']],
  ['res abc', 'usage'],
  ['branch reset', 'ok', ['picks']],
  ['dao hoa', 'ok', ['dao']],
  ['dao zz', 'usage'],
  ['stars 3', 'ok', ['stars']],
  ['stars abc', 'usage'],
  ['kieu 3', 'ok', ['kieu', 'levelCap']],
  ['kieu zz', 'usage'],
  ['trib zzz', 'usage'],
  ['dye zz', 'usage'],
  ['skills list', 'ok', ['method', 'skills']],
  ['skills max', 'ok', ['n', 'skillLevel']],
  ['skills zz', 'usage'],
  ['learn skl_phi_kiem 3', 'ok', ['id', 'skillLevel']],
  ['learn skl_phi_kiem abc', 'usage'],
  ['learn zz', 'fail'],
  ['method thanh_moc_dan_kinh 2', 'ok', ['method', 'skillLevel']],
  ['method zz', 'usage'],
  ['method', 'usage'],
  ['variant zz', 'usage'],
  ['kit 1 kiem', 'ok', ['branch', 'tier', 'set', 'pieces', 'level']],
  ['kit 9 kiem', 'usage'],
  ['kit 1 zz', 'usage'],
  ['kit', 'usage'],
  ['roll itm_thanh_phong_kiem 0 12', 'ok', ['id', 'quality', 'ilvl']],
  ['roll zz', 'usage'],
  ['roll itm_thanh_phong_kiem abc', 'usage'],
  ['set list', 'ok', ['sets']],
  ['set zz', 'usage'],
  ['set', 'usage'],
  ['set off', 'ok', ['worn']],
  ['weapon itm_moc_kiem +5', 'ok', ['id', 'plus']],
  ['plus 5', 'ok', ['slot', 'plus']],
  ['plus abc', 'usage'],
  ['plus 5 zz', 'usage'],
  ['art itm_tu_kim_ho_lo 5', 'ok', ['id', 'level']],
  ['art zz', 'usage'],
  ['art off', 'ok', ['artifact']],
  ['give itm_moc_kiem 2', 'ok', ['id', 'n']],
  ['give itm_moc_kiem abc', 'usage'],
  ['give zz', 'fail'],
  ['give', 'usage'],
  ['bag sort', 'ok', ['sorted']],
  ['bag clear', 'ok', ['cleared']],
  ['bag zz', 'usage'],
  ['outfit list', 'ok', ['outfits']],
  ['outfit set_lac_kiem', 'ok', ['id', 'pieces']],
  ['outfit zz', 'fail'],
  ['skin list', 'ok', ['skins', 'worn']],
  ['skin zz', 'fail'],
  ['skin off', 'fail'],
  ['weapon list', 'ok', ['weapons']],
  ['weapon zz', 'fail'],
  ['tp tong_mon', 'ok', ['place', 'level', 'x', 'z']],
  ['tp 2040 2040', 'ok', ['x', 'z']],
  ['tp abc def', 'usage'],
  ['tp', 'usage'],
  ['tele zz', 'usage'],
  ['tele', 'usage'],
  ['qdone zz', 'usage'],
  ['qdone', 'usage'],
  ['qev zz', 'usage'],
  ['qev', 'usage'],
  ['qev kill mon_soi_xam 1', 'ok', ['type', 'target', 'n']],
  ['spawn mon_soi_xam 2', 'ok', ['def', 'n', 'ids']],
  ['spawn zz', 'fail'],
  ['spawn', 'usage'],
  ['spawn mon_soi_xam abc', 'usage'],
  ['hurt 50', 'ok', ['n', 'pct']],
  ['hurt abc', 'usage'],
  ['hp 60', 'ok', ['pct', 'n']],
  ['hp 0', 'usage'],
  ['hp abc', 'usage'],
  ['state break', 'ok', ['kind', 'n']],
  ['state zz', 'usage'],
  ['state', 'usage'],
  ['freeze on', 'ok', ['freeze']],
  ['lockhp off', 'ok', ['lockhp']],
  ['phase zz', 'usage'],
  ['phase off', 'ok', ['lock']],
  ['cast zz', 'usage'],
  ['cast off', 'ok', ['loop']],
  ['scene zz', 'usage'],
  ['scene save', 'ok', ['scene']],
  ['labreset', 'ok', ['reset']],
  ['dps', 'ok', ['active']],
  ['dps stop', 'ok', ['hits']],
  ['find hoi', 'ok', ['hits']],
  ['find z', 'fail'],
  ['tick', 'ok', ['p95', 'players', 'monsters']],
  ['khong_co_lenh', 'unknown'],
  ['dvt zz!', 'fail'],
  ['preset zz 10', 'usage'],
  ['preset dansu 16', 'ok', ['branch', 'level']],
  ['die', 'ok', ['dead']],
];

describe('soát lệnh /gm: ok / mã lỗi / d', () => {
  let ctx: ReturnType<typeof setup>;
  beforeAll(() => {
    ctx = setup('van_lam');
  });
  for (const [line, want, keys] of OPEN) {
    it(`/gm ${line} → ${want}${keys ? ' + d{' + keys.join(',') + '}' : ''}`, () => {
      const r = ctx.exec(line);
      if (want === 'ok') {
        expect(r.ok, JSON.stringify(r)).toBe(true);
        expect(r.e).toBeUndefined();
        if (keys) {
          expect(r.d, 'thiếu d').toBeDefined();
          for (const k of keys) expect(r.d as object, `d thiếu khóa ${k}`).toHaveProperty(k);
        }
      } else {
        expect(r.ok, JSON.stringify(r)).toBe(false);
        expect(r.e).toBe(want);
        expect(r.m.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('soát lệnh /gm: giá trị trong d khớp trạng thái thật', () => {
  it('level / gold / give / spawn', () => {
    const { p, exec } = setup('van_lam');
    expect((exec('level 17').d as { level: number }).level).toBe(17);
    expect(p.char.level).toBe(17);
    const g0 = p.char.gold;
    exec('gold 123');
    expect(p.char.gold).toBe(g0 + 123);
    const r = exec('give itm_moc_kiem 1');
    expect(r.ok).toBe(true);
    const sp = exec('spawn mon_soi_xam 3').d as { ids: string[]; n: number };
    expect(sp.ids).toHaveLength(3);
    expect(sp.n).toBe(3);
  });

  it('tp địa điểm đưa người tới đúng toạ độ trong d', () => {
    const { p, exec } = setup('van_lam');
    const d = exec('tp tong_mon').d as { x: number; z: number };
    expect(Math.hypot(p.move.x - d.x, p.move.z - d.z)).toBeLessThan(1);
  });

  it('lệnh lạ không đổi trạng thái; tham số rác không chạy dở (không đổi cấp)', () => {
    const { p, exec } = setup('van_lam');
    const lv = p.char.level;
    exec('level abc');
    exec('level');
    expect(p.char.level).toBe(lv);
  });

  it('hp/state/phase/hurt khi không có quái trong 40 m → fail, không phải ok', () => {
    const { exec } = setup('van_lam');
    for (const l of ['hp 50', 'state break', 'phase 1']) {
      const r = exec(l);
      expect(r.ok, l).toBe(false);
      expect(r.e, l).toBe('fail');
    }
  });
});

describe('soát lệnh /gm: phòng tập (Diễn Võ Trường)', () => {
  it('boss / dummy / cast / hp / phase / face trả d có cấu trúc', () => {
    const { sim, p, exec } = setup('dien_vo');
    const b = exec('boss boss_han_giao 30');
    expect(b.ok, JSON.stringify(b)).toBe(true);
    expect(b.d).toMatchObject({ def: 'boss_han_giao', level: 30 });
    // Boss đứng ở hố boss, xa chỗ người chơi: đứng sát nó thì lệnh quanh mình mới có đích.
    const boss = sim.monsters.find((m) => m.def.id === 'boss_han_giao')!;
    p.move.x = boss.s.x;
    p.move.z = boss.s.z;
    expect(exec('hp 40').d).toMatchObject({ pct: 40 });
    expect(exec('phase 1').d).toMatchObject({ phase: 1, lock: true });
    expect(exec('phase off').d).toMatchObject({ lock: false });
    expect(exec('face 90').d).toMatchObject({ deg: 90, freeze: true });
    expect(exec('face abc').e).toBe('usage');
    const dm = exec('dummy mon_soi_xam 20');
    expect(dm.ok).toBe(true);
    expect(dm.d).toMatchObject({ def: 'mon_soi_xam', level: 20 });
    expect(exec('dummy off').d).toMatchObject({ dummy: false });
    expect(exec('dummy mon_soi_xam abc').e).toBe('usage');
    expect(exec('boss zz').e).toBe('usage');
    expect(exec('boss boss_han_giao abc').e).toBe('usage');
  });
});
