// Boss `mirror` đứng ở room thế giới mở (Kim Dạ Ma Hậu, DV-2 đợt 3): chat ở xa hay boss không có `echo` không bị nhại; tin tách bóng chỉ gửi người trong tầm.
import { describe, expect, it } from 'vitest';
import { MS_CHASE, type FxMsg } from '@dtl/shared';
import { MONSTER } from '@dtl/content';
import { ECHO_CHAT_RANGE, MirrorSystem, SPLIT_NOTICE_RANGE, type MirrorHost } from './mirror';
import type { MonEnt, PlayerEnt } from './sim';

const player = (id: string, x: number, z: number) => ({ sid: id, move: { x, z, y: 0 } }) as unknown as PlayerEnt;
const boss = (id: string, defId: string) =>
  ({ id, def: MONSTER.get(defId)!, state: MS_CHASE, phase: 0, level: 31, atk: 100, s: { x: 0, y: 0, z: 0, yaw: 0, mf: 0 } }) as unknown as MonEnt;

function mk(mons: MonEnt[], players: PlayerEnt[]) {
  const sys: string[] = [];
  let all = 0;
  const host = {
    now: () => 1000,
    players: () => players,
    monsters: () => mons,
    monsterDef: (id: string) => MONSTER.get(id),
    spawnMinion: (_d: unknown, _l: number, x: number, z: number, o: MonEnt) => ({ id: 'd' + mons.length, def: MONSTER.get('mon_kim_da_bong')!, state: MS_CHASE, minionOf: o.id, s: { x, z, y: 0, yaw: 0, mf: 0 } }) as unknown as MonEnt,
    markReal: () => {},
    fx: (_m: FxMsg) => {},
    sys: (p: PlayerEnt, k: string) => sys.push(`${p.sid}:${k}`),
    sysAll: () => void all++,
  } as unknown as MirrorHost;
  return { sys, all: () => all, ms: new MirrorSystem(host) };
}

describe('boss gương ở room thế giới', () => {
  it('Ma Hậu (không có `echo`) không nhại chat, kể cả người đứng sát', () => {
    const ma = boss('ma', 'boss_kim_da_ma_hau');
    const near = player('a', 5, 0);
    const { ms } = mk([ma], [near]);
    ms.tick();
    expect(ma.def.mirror?.echo).toBeUndefined();
    expect(ms.echoLine('xin chào', near)).toBeNull();
  });

  it('boss có `echo`: chỉ nhại người chat trong tầm', () => {
    const kn = boss('kn', 'boss_kinh_nguyet_chan_quan');
    const near = player('a', 5, 0);
    const far = player('b', ECHO_CHAT_RANGE + 40, 0);
    const { ms } = mk([kn], [near, far]);
    ms.tick();
    expect(ms.echoLine('Ngươi là ai?', near)?.line).toBe('Ngươi là ai.');
    expect(ms.echoLine('Ngươi là ai?', far)).toBeNull();
  });

  it('tin tách bóng chỉ gửi người trong tầm boss, không sysAll', () => {
    const ma = boss('ma', 'boss_kim_da_ma_hau');
    ma.phase = 1;
    const a = player('a', 10, 0);
    const b = player('b', SPLIT_NOTICE_RANGE + 50, 0);
    const { ms, sys, all } = mk([ma], [a, b]);
    ms.tick();
    expect(sys).toEqual(['a:sys.mirror_split']);
    expect(all()).toBe(0);
  });
});
