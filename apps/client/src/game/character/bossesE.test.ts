import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { AssetCache, type Manifest } from '../core/assets';
import { MONSTER_SKINS, MonsterSkins } from './monsterSkins';
import { nodeGltfLoader } from '../core/gltfTestLoader';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;

/** 7 boss mở rộng (E-2/E-3/E-4) nhập từ Tripo: asset, loại bộ xương, clip bắt buộc. */
const NEW_BOSSES: Record<string, { kind: 'quad' | 'serpent' | 'biped'; level: string }> = {
  boss_dia_mach_long: { kind: 'quad', level: 'doan_mach' },
  boss_thon_mach_ngo_cong_vuong: { kind: 'serpent', level: 'phuc_mach' },
  boss_thach_tam_khoi_vuong: { kind: 'biped', level: 'phuc_mach' },
  boss_van_hai_kinh_vuong: { kind: 'serpent', level: 'van_hai' },
  boss_kinh_nguyet_chan_quan: { kind: 'biped', level: 'kinh_nguyet' },
  boss_thien_khuyet_thu_linh: { kind: 'biped', level: 'thien_khuyet' },
  boss_vo_dien_than_quan: { kind: 'biped', level: 'than_tang' },
};

type Entry = { file: string; animations?: string[]; skinned?: boolean; bones?: number; triangles?: number; class?: string; textures?: { width: number; height: number }[] };
const entry = (id: string) => MANIFEST.assets[id] as unknown as Entry;

describe('boss mở rộng (asset Tripo nhập E-2/E-3/E-4)', () => {
  it('manifest: có xương, đủ clip nền và đòn lớn, trong ngân sách lớp boss', () => {
    for (const [id, spec] of Object.entries(NEW_BOSSES)) {
      const e = entry(id);
      expect(e, id).toBeTruthy();
      expect(e.class, id).toBe('boss');
      expect(e.skinned, id).toBe(true);
      expect(e.bones ?? 0, id).toBeLessThanOrEqual(80);
      expect(e.triangles ?? 0, id).toBeLessThanOrEqual(20000);
      for (const t of e.textures ?? []) expect(Math.max(t.width, t.height), id).toBeLessThanOrEqual(2048);
      const anims = e.animations ?? [];
      for (const c of ['idle', 'run', 'attack', 'hit_light', 'death', 'stun', 'slam', 'sweep']) expect(anims, `${id}:${c}`).toContain(c);
      if (spec.kind !== 'quad') expect(anims, id).toContain('chant');
    }
  });

  it('MONSTER_SKINS: nạp lười, khớp clip đòn lớn, đúng màn', () => {
    for (const [id, spec] of Object.entries(NEW_BOSSES)) {
      const s = MONSTER_SKINS[id];
      expect(s, id).toBeTruthy();
      expect(s.lazy, id).toBe(true);
      expect(s.level, id).toBe(spec.level);
      expect(s.legs, id).toBe(spec.kind === 'quad' ? 'quad' : spec.kind === 'serpent' ? 'none' : 'biped');
      const anims = entry(s.asset).animations ?? [];
      expect(anims, id).toContain(s.moves!.slam!.clip);
      expect(anims, id).toContain(s.moves!.sweep!.clip);
    }
  });

  it('không nạp lúc vào thế giới hay màn khác; nạp trước đúng màn', async () => {
    const loaded: string[] = [];
    const cache = new AssetCache({
      base: '',
      fetchManifest: async () => MANIFEST,
      load: async (url) => {
        loaded.push(url);
        const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
        const loader = nodeGltfLoader();
        return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
      },
    });
    const skins = new MonsterSkins(cache, false);
    skins.preload();
    skins.preloadLazy('van_lam');
    await new Promise((r) => setTimeout(r, 100));
    for (const id of Object.keys(NEW_BOSSES)) expect(loaded, id).not.toContain(entry(id).file);
    skins.preloadLazy('phuc_mach');
    await new Promise((r) => setTimeout(r, 400));
    expect(loaded).toContain(entry('boss_thon_mach_ngo_cong_vuong').file);
    expect(loaded).toContain(entry('boss_thach_tam_khoi_vuong').file);
    expect(loaded).not.toContain(entry('boss_dia_mach_long').file);
    skins.dispose();
  });
});
