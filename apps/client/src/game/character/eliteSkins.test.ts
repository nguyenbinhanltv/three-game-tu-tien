import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ELITE_SKINS_NEW } from './eliteSkins';
import { MONSTER_SKINS } from './monsterSkins';

const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
interface Entry {
  class: string;
  skinned: boolean;
  triangles: number;
  bones: number;
  animations?: string[];
  file: string;
}
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as { assets: Record<string, Entry> };

const IN_GAME = ['elite_huyet_nha_lang', 'elite_xich_dien_ho', 'elite_cu_nham_vien'];

describe('12 tinh anh Tripo (E-1b)', () => {
  const ids = [...IN_GAME, ...Object.keys(ELITE_SKINS_NEW)];

  it('đủ 12 asset, lớp elite, có xương, đủ clip cơ bản, trong trần tam giác', () => {
    expect(new Set(ids).size).toBe(12);
    for (const id of ids) {
      const a = MANIFEST.assets[id];
      expect(a, id).toBeDefined();
      expect(a.class, id).toBe('elite');
      expect(a.skinned, id).toBe(true);
      expect(a.triangles, id).toBeGreaterThanOrEqual(10000);
      expect(a.triangles, id).toBeLessThanOrEqual(15000);
      expect(a.bones, id).toBeLessThanOrEqual(60);
      for (const clip of ['idle', 'run', 'attack', 'hit_light', 'death']) expect(a.animations, `${id}.${clip}`).toContain(clip);
      expect(fs.existsSync(path.join(PUBLIC_ASSETS, a.file)), a.file).toBe(true);
    }
  });

  it('ba tinh anh Vân Lam có skin nạp lười theo màn (không vào tải đầu), chín con mới chưa nằm trong bảng skin', () => {
    for (const id of IN_GAME) {
      expect(MONSTER_SKINS[id]?.lazy, id).toBe(true);
      expect(MONSTER_SKINS[id].level, id).toBe('van_lam');
    }
    for (const [id, s] of Object.entries(ELITE_SKINS_NEW)) {
      expect(MONSTER_SKINS[id], id).toBeUndefined();
      expect(s.lazy, id).toBe(true);
      for (const clip of Object.values(s.clips)) expect(MANIFEST.assets[s.asset].animations, `${id}: ${clip}`).toContain(clip);
    }
  });
});
