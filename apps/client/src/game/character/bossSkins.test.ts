import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { MONSTER } from '@dtl/content';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from '../assets';
import { MonsterModel } from '../models';
import { MONSTER_SKINS, MonsterSkins } from './monsterSkins';
import { moveTiming, SkinnedMonster } from './skinned';
import { baseState } from './states';
import type { AnimState } from './view';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const BOSSES = ['boss_huyet_lang_vuong', 'boss_kiem_khoi', 'boss_thu_mo_tuong', 'boss_han_giao'];

const anim = (o: Partial<AnimState> = {}): AnimState => ({ speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, ...o });

async function bossSkins(loaded: string[] = []) {
  const cache = new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      loaded.push(url);
      const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
      const loader = createGltfLoader(createKtx2Loader());
      // node không giải mã ảnh: thay texture bằng Texture rỗng.
      loader.register(() => ({ name: 'test_stub_texture', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
      return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    },
  });
  return { cache, skins: new MonsterSkins(cache, false) };
}

async function ready(skins: MonsterSkins, id: string) {
  for (let i = 0; i < 200 && skins.pending(MONSTER.get(id)!); i++) await new Promise((r) => setTimeout(r, 10));
}

function run(m: SkinnedMonster, a: AnimState, sec: number) {
  for (let t = 0; t < sec - 1e-9; t += 1 / 60) m.update(1 / 60, a);
}

describe('đòn lớn của boss: khớp lúc chạm', () => {
  it('đổi tốc độ trong khoảng cho phép, dư thời gian thì chờ', () => {
    expect(moveTiming(0.85, 1.3)).toEqual({ rate: expect.closeTo(0.654, 3), wait: 0 });
    expect(moveTiming(1.0, 0.9)).toEqual({ rate: expect.closeTo(1.111, 3), wait: 0 });
    const slow = moveTiming(1.0, 2.5); // chậm nhất 0,6×: chờ rồi mới phát
    expect(slow.rate).toBe(0.6);
    expect(slow.wait + 1.0 / slow.rate).toBeCloseTo(2.5, 6);
    expect(moveTiming(1.0, 0.2).rate).toBe(1.5);
  });

  it('choáng ưu tiên sau chết, trước niệm chú/di chuyển', () => {
    expect(baseState(anim({ dead: true, stunned: true }), 3)).toBe('death');
    expect(baseState(anim({ stunned: true, casting: true, speed: 9 }), 3)).toBe('stun');
  });
});

describe('boss có xương (asset thật)', () => {
  it('GLB có đủ clip theo dữ liệu boss (thời điểm chạm nằm trong clip)', () => {
    for (const id of BOSSES) {
      const anims = (MANIFEST.assets[id] as { animations?: string[] } | undefined)?.animations ?? [];
      for (const c of ['idle', 'run', 'attack', 'hit_light', 'death', 'stun']) expect(anims, id).toContain(c);
      const def = MONSTER.get(id)!;
      const ai = [def.ai, ...(def.phases ?? []).map((p) => p.ai)];
      if (ai.some((a) => a?.slam)) expect(anims, id).toContain(MONSTER_SKINS[id].moves!.slam!.clip);
      if (ai.some((a) => a?.sweep)) expect(anims, id).toContain(MONSTER_SKINS[id].moves!.sweep!.clip);
      if (ai.some((a) => a?.chant)) expect(anims, id).toContain('chant');
    }
  });

  it('nạp lười: vào thế giới không tải boss, boss xuất hiện mới tải', async () => {
    const loaded: string[] = [];
    const { skins } = await bossSkins(loaded);
    skins.preload();
    await new Promise((r) => setTimeout(r, 20));
    expect(loaded.some((u) => u.startsWith('boss_'))).toBe(false);
    const def = MONSTER.get('boss_kiem_khoi')!;
    expect(skins.create(def)).toBeInstanceOf(MonsterModel); // chưa nạp: model khối tạm
    expect(skins.pending(def)).toBe(true);
    await ready(skins, def.id);
    const m = skins.create(def);
    expect(m).toBeInstanceOf(SkinnedMonster);
    expect(m.root.scale.x).toBeCloseTo(def.scale);
    // Cao bằng model khối 'ape' (2,25 m ở scale 1) để thanh máu/nhãn giữ chỗ cũ.
    expect(m.height).toBeCloseTo(2.25 * def.scale, 1);
    m.dispose();
    skins.dispose();
  });

  it('slam: động tác chạm đúng lúc vùng nổ; nhiều vùng cùng lúc chỉ phát một lần; trúng đòn không cắt ngang', async () => {
    const { skins } = await bossSkins();
    const def = MONSTER.get('boss_thu_mo_tuong')!;
    skins.pending(def);
    await ready(skins, def.id);
    const b = skins.create(def) as SkinnedMonster;
    const delay = def.ai!.slam!.delay;
    expect(b.bossMove('slam', delay)).toBe(true);
    expect(b.bossMove('slam', delay)).toBe(true); // vùng thứ hai cùng lúc: bỏ qua
    run(b, anim({ combat: true }), 0.2);
    expect(b.state).toBe('attack');
    b.hitReact({});
    run(b, anim({ combat: true }), delay - 0.2);
    const act = b.actionOf('slam')!;
    expect(act.time).toBeCloseTo(MONSTER_SKINS[def.id].moves!.slam!.impact, 1);
    expect(b.state).toBe('attack');
    run(b, anim({ combat: true }), 2);
    expect(b.state).toBe('combatIdle');
    b.dispose();
    skins.dispose();
  });

  it('cú đánh thường giữa đòn lớn (đang chờ hoặc đang phát) không cắt động tác, khung chạm vẫn đúng lúc', async () => {
    const { skins } = await bossSkins();
    const def = MONSTER.get('boss_thu_mo_tuong')!;
    skins.pending(def);
    await ready(skins, def.id);
    const impact = MONSTER_SKINS[def.id].moves!.slam!.impact;
    // Đang phát.
    const b = skins.create(def) as SkinnedMonster;
    const delay = def.ai!.slam!.delay;
    b.bossMove('slam', delay);
    run(b, anim({ combat: true }), 0.6);
    b.attack();
    run(b, anim({ combat: true }), delay - 0.6);
    expect(b.actionOf('attack')).toBeNull();
    expect(b.actionOf('slam')!.time).toBeCloseTo(impact, 1);
    // Đang chờ phát (delay dài hơn thời gian chạm ở tốc độ chậm nhất): cắn lúc chờ cũng bị bỏ.
    const c = skins.create(def) as SkinnedMonster;
    c.bossMove('slam', 2.5);
    c.attack();
    run(c, anim({ combat: true }), 2.5);
    expect(c.actionOf('attack')).toBeNull();
    expect(c.actionOf('slam')!.time).toBeCloseTo(impact, 1);
    b.dispose();
    c.dispose();
    skins.dispose();
  });

  it('niệm chú → chant, bị ngắt → stun; boss không có chant thì đứng thủ', async () => {
    const { skins } = await bossSkins();
    for (const id of ['boss_thu_mo_tuong', 'boss_kiem_khoi']) {
      skins.pending(MONSTER.get(id)!);
      await ready(skins, id);
    }
    const tm = skins.create(MONSTER.get('boss_thu_mo_tuong')!) as SkinnedMonster;
    // Vừa đánh thường (clip 2,2 s) thì vào niệm chú: tư thế niệm hiện ngay, không chờ hết cú đánh.
    tm.attack();
    run(tm, anim({ combat: true }), 0.2);
    expect(tm.state).toBe('attack');
    run(tm, anim({ combat: true, casting: true }), 0.4);
    expect(tm.state).toBe('cast');
    expect(tm.actionOf('chant')?.isRunning()).toBe(true);
    // Trúng đòn lúc niệm: không giật (giữ tư thế đọc được).
    tm.hitReact({});
    run(tm, anim({ combat: true, casting: true }), 0.1);
    expect(tm.state).toBe('cast');
    run(tm, anim({ combat: true, stunned: true }), 0.4);
    expect(tm.state).toBe('stun');
    expect(tm.actionOf('stun')?.isRunning()).toBe(true);
    const kk = skins.create(MONSTER.get('boss_kiem_khoi')!) as SkinnedMonster;
    run(kk, anim({ combat: true, casting: true }), 0.4);
    expect(kk.actionOf('chant')).toBeNull();
    expect(kk.actionOf('idle')?.isRunning()).toBe(true);
    expect(kk.bossMove('sweep', 1.3)).toBe(true);
    tm.dispose();
    kk.dispose();
    skins.dispose();
  });

  it('?models=legacy: boss vẫn là model khối, không nạp asset', async () => {
    const loaded: string[] = [];
    const cache = new AssetCache({ base: '', fetchManifest: async () => MANIFEST, load: async (u) => (loaded.push(u), Promise.reject(new Error('x'))) });
    const skins = new MonsterSkins(cache, true);
    const def = MONSTER.get('boss_huyet_lang_vuong')!;
    expect(skins.pending(def)).toBe(false);
    const m = skins.create(def);
    expect(m).toBeInstanceOf(MonsterModel);
    expect(m.bossMove).toBeUndefined();
    expect(loaded).toEqual([]);
    skins.dispose();
  });
});
