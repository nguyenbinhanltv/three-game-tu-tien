import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { MONSTER } from '@dtl/content';
import type { AssetCache, AssetHandle } from '../core/assets';
import { MonsterSkins } from './monsterSkins';

const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeCache(): { cache: AssetCache; released: () => number } {
  let released = 0;
  const cache = {
    acquire: async (id: string): Promise<AssetHandle> => {
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
      return { id, scene, animations: [], release: () => void released++ };
    },
  } as unknown as AssetCache;
  return { cache, released: () => released };
}

describe('MonsterSkins.warm (T5)', () => {
  const def = MONSTER.get('mon_soi_xam')!;

  it('quái còn "pending" (model khối) cho tới khi biên dịch trước xong', async () => {
    const { cache } = fakeCache();
    const skins = new MonsterSkins(cache, false);
    const waits: (() => void)[] = [];
    const done = () => waits.splice(0).forEach((r) => r());
    let calls = 0;
    skins.warm = () => {
      calls++;
      return new Promise<void>((r) => waits.push(r));
    };
    skins.preload();
    expect(skins.pending(def)).toBe(true);
    await flush();
    await flush();
    expect(calls).toBeGreaterThan(0);
    expect(skins.pending(def)).toBe(true);
    done();
    for (let i = 0; i < 10 && skins.pending(def); i++) {
      await flush();
      done();
    }
    expect(skins.pending(def)).toBe(false);
  });

  it('không có warm hoặc warm lỗi thì nhả ngay', async () => {
    const a = new MonsterSkins(fakeCache().cache, false);
    a.preload();
    expect(a.pending(def)).toBe(true);
    await flush();
    await flush();
    expect(a.pending(def)).toBe(false);

    const b = new MonsterSkins(fakeCache().cache, false);
    b.warm = () => Promise.reject(new Error('x'));
    b.preload();
    expect(b.pending(def)).toBe(true);
    for (let i = 0; i < 10 && b.pending(def); i++) await flush();
    expect(b.pending(def)).toBe(false);
  });

  it('dispose khi đang biên dịch thì trả handle', async () => {
    const { cache, released } = fakeCache();
    const skins = new MonsterSkins(cache, false);
    const waits: (() => void)[] = [];
    const done = () => waits.splice(0).forEach((r) => r());
    skins.warm = () => new Promise<void>((r) => waits.push(r));
    skins.preload();
    await flush();
    await flush();
    skins.dispose();
    done();
    for (let i = 0; i < 10 && released() === 0; i++) await flush();
    expect(released()).toBeGreaterThanOrEqual(1); // mỗi asset đang biên dịch trả đúng một handle
  });
});
