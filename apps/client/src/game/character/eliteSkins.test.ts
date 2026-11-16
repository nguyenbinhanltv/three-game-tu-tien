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

const DOAN_MACH = ['elite_liet_cot_bao', 'elite_ho_mach_khoi_tuong', 'elite_xich_sa_ngo_cong'];

const VAN_HAI = ['elite_van_hac_vuong', 'elite_loi_van_su_vuong'];

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

  it('ba tinh anh Vân Lam có skin nạp lười theo màn (không vào tải đầu), ba con Đoạn Mạch (E2-B), Kính Diện Ma Quân (E3-M) và hai con Vân Hải (E3-B) đã gộp vào bảng, các con còn lại chưa', () => {
    for (const id of IN_GAME) {
      expect(MONSTER_SKINS[id]?.lazy, id).toBe(true);
      expect(MONSTER_SKINS[id].level, id).toBe('van_lam');
    }
    for (const [id, s] of Object.entries(ELITE_SKINS_NEW)) {
      if (DOAN_MACH.includes(id)) {
        expect(MONSTER_SKINS[id]?.level, id).toBe('doan_mach');
        expect(MONSTER_SKINS[id].lazy, id).toBe(true);
      } else if (VAN_HAI.includes(id)) {
        expect(MONSTER_SKINS[id]?.level, id).toBe('van_hai');
        expect(MONSTER_SKINS[id].lazy, id).toBe(true);
      } else if (id === 'elite_kinh_dien_ma_quan') {
        // Kính Nguyệt Cung (E3-M) đã gộp vào bảng.
        expect(MONSTER_SKINS[id]?.level, id).toBe('kinh_nguyet');
        expect(MONSTER_SKINS[id].lazy, id).toBe(true);
      } else expect(MONSTER_SKINS[id], id).toBeUndefined();
      expect(s.lazy, id).toBe(true);
      for (const clip of Object.values(s.clips)) expect(MANIFEST.assets[s.asset].animations, `${id}: ${clip}`).toContain(clip);
    }
  });
});
