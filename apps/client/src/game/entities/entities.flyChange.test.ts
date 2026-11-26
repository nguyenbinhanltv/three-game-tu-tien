import * as THREE from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { APPEARANCE } from '@dtl/content';
import { PF_FLYING } from '@dtl/shared';
import type { EntityManager as EM, PState, WorldView } from './entities';

// `onFlyChange` (V-P10 ngự kiếm) chỉ báo lúc cờ bay ĐỔI. Người mới vào tầm nhìn đã đang bay không phải là "vừa cất cánh".
function stubCanvas(): void {
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => ({ width: 10 })),
    set: (t, k, v) => ((t[k] = v), true),
  });
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

const player = (fl: number): PState => ({
  name: 'Bay',
  x: 5,
  y: 0,
  z: 5,
  yaw: 0,
  vy: 0,
  gr: true,
  fl,
  lv: 15,
  hp: 100,
  mhp: 100,
  mp: 10,
  mmp: 10,
  seq: 0,
  wp: '',
  g: 'm',
  dye: APPEARANCE.defaultDye,
});

let EntityManager: typeof EM;
beforeAll(async () => {
  stubCanvas();
  ({ EntityManager } = await import('./entities'));
});

describe('EntityManager.onFlyChange', () => {
  it('người mới thấy đã có PF_FLYING không gọi; đổi cờ về sau mới gọi, đúng chiều', () => {
    const em = new EntityManager(new THREE.Scene(), 'me', 'kiem_trung');
    const calls: [string, boolean][] = [];
    em.onFlyChange = (sid, flying) => calls.push([sid, flying]);
    const view: WorldView = {
      level: 'kiem_trung',
      players: new Map([
        ['me', player(0)],
        ['ban', player(PF_FLYING)],
      ]),
      monsters: new Map(),
      nodes: new Map(),
    };
    const local = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, airborne: false };
    em.update(1 / 60, view, local, '', 1);
    em.update(1 / 60, view, local, '', 1);
    expect(calls, 'đã bay sẵn khi vào tầm nhìn: không phải cất cánh').toEqual([]);
    view.players.get('ban')!.fl = 0;
    em.update(1 / 60, view, local, '', 1);
    expect(calls).toEqual([['ban', false]]);
    view.players.get('ban')!.fl = PF_FLYING;
    em.update(1 / 60, view, local, '', 1);
    expect(calls).toEqual([
      ['ban', false],
      ['ban', true],
    ]);
    em.dispose();
  });
});
