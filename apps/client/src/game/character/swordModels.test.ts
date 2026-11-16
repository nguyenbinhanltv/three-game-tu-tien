import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { APPEARANCE, ITEMS, SWORD_MODELS, SWORD_MODELS_TIER, swordModelOf } from '@dtl/content';
import { AssetCache, createGltfLoader, createKtx2Loader, type Manifest } from '../assets';
import { PlayerSkins, SkinnedPlayer } from './playerSkins';
import { bladeLocal, bladeScale, glowDims } from './swordModel';
import type { AnimState } from './view';

// Kiếm riêng theo trang bị: 5 model Tripo web (prop_kiem_*) thay kiếm nướng trong lưới nhân vật, trên model nam và nữ thật.
const PUBLIC_ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/assets');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS, 'manifest.json'), 'utf8')) as Manifest;
const anim = (o: Partial<AnimState> = {}): AnimState => ({ speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false, ...o });
const DT = 1 / 60;

function cache() {
  return new AssetCache({
    base: '',
    fetchManifest: async () => MANIFEST,
    load: async (url) => {
      const buf = fs.readFileSync(path.join(PUBLIC_ASSETS, url));
      const loader = createGltfLoader(createKtx2Loader());
      loader.register(() => ({ name: 'test_stub_texture', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
      return loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    },
  });
}

async function ready(s: PlayerSkins, look: { g: string; dye: string; w?: string }): Promise<void> {
  s.create(look).dispose(); // kích hoạt nạp lười (nhân vật giới tính khác, kiếm riêng)
  for (let i = 0; i < 300 && s.pending(look); i++) await new Promise((r) => setTimeout(r, 10));
  expect(s.pending(look)).toBe(false);
}

type Priv = { blade: THREE.Mesh | null; sword: { drawn: boolean; boneWorld: THREE.Matrix4 }; bladeHolder: THREE.Group };

describe('model kiếm theo trang bị', () => {
  it('map item → model: kiếm có model riêng, kiếm còn lại theo phẩm, không phải vũ khí thì mặc định', () => {
    expect(swordModelOf('itm_thanh_phong_kiem')).toBe('prop_kiem_thanh_phong');
    expect(swordModelOf('itm_thiet_kiem')).toBe('prop_kiem_thiet');
    expect(swordModelOf('itm_han_quang_kiem')).toBe('prop_kiem_han_quang');
    expect(swordModelOf('itm_hgl_kiem')).toBe('prop_kiem_han_giao');
    expect(swordModelOf('itm_tram_ta_kiem')).toBe('prop_kiem_tram_ta');
    expect(swordModelOf('itm_moc_kiem')).toBe('prop_kiem_thiet');
    expect(swordModelOf('')).toBe('prop_kiem_thanh_phong');
    expect(swordModelOf('itm_khong_co')).toBe('prop_kiem_thanh_phong');
    for (const it of ITEMS.filter((i) => i.kind === 'weapon')) {
      expect(MANIFEST.assets[swordModelOf(it.id)], it.id).toBeTruthy();
    }
    for (const id of SWORD_MODELS) expect((MANIFEST.assets[id] as unknown as { class: string }).class, id).toBe('weapon');
  });

  it('toán gắn: tâm chuôi trùng khung chuôi, mũi theo hướng mũi, kiếm mới dài bằng kiếm cũ (kẹp)', () => {
    const info = { len: 0.95, grip: 0.11, guard: 0.22, bladeStart: 0.25 };
    const old = { minS: -0.12, maxS: 0.9 };
    const m = bladeLocal(new THREE.Matrix4(), info, old);
    const k = bladeScale(info, old);
    expect(new THREE.Vector3(0, info.grip, 0).applyMatrix4(m).length()).toBeLessThan(1e-6);
    const tip = new THREE.Vector3(0, info.len, 0).applyMatrix4(m);
    expect(tip.z).toBeCloseTo((info.len - info.grip) * k, 5);
    expect(tip.z).toBeLessThanOrEqual(old.maxS + 1e-9);
    expect(Math.abs(tip.x) + Math.abs(tip.y)).toBeLessThan(1e-6);
    const d = glowDims(info, old);
    expect(d.start).toBeCloseTo((info.bladeStart - info.grip) * k, 6);
    expect(bladeScale(info, { minS: 0, maxS: 10 })).toBe(1.3);
    expect(bladeScale(info, { minS: 0, maxS: 0.1 })).toBe(0.75);
  });

  for (const g of ['m', 'f'] as const) {
    it(`nhân vật ${g}: 5 kiếm đều thay kiếm cũ, rút/tra kiếm đưa kiếm mới giữa lưng và tay phải`, async () => {
      const s = new PlayerSkins(cache());
      s.preload();
      const dye = APPEARANCE.defaultDye;
      const hand = (m: SkinnedPlayer) => {
        let b: THREE.Object3D | null = null;
        m.rig.traverse((o) => {
          if (!b && /righthand$/i.test(o.name)) b = o;
        });
        return b!;
      };
      for (const w of SWORD_MODELS) {
        const look = { g, dye, w };
        await ready(s, look);
        const m = s.create(look) as SkinnedPlayer;
        expect(m).toBeInstanceOf(SkinnedPlayer);
        m.setViewDistance(0);
        const p = m as unknown as Priv;
        expect(p.blade, `${g}/${w}`).toBeTruthy();
        for (let i = 0; i < 5; i++) m.update(DT, anim());
        // Trên lưng: kiếm nằm sau lưng (z âm theo hướng mặt trước +Z của model), mũi vượt qua vai.
        m.root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(p.blade!);
        expect(box.isEmpty()).toBe(false);
        const back = box.getCenter(new THREE.Vector3());
        const len = box.getSize(new THREE.Vector3()).length();
        expect(len).toBeGreaterThan(0.7);
        // Kiếm bậc mới dài hơn theo thiết kế (1,1–1,2 m so với 0,95 m), nên trần cao hơn.
        expect(len).toBeLessThan(SWORD_MODELS_TIER.includes(w) ? 1.75 : 1.4);
        // Rút kiếm: ra chiêu → kiếm vào tay phải, tâm kiếm gần bàn tay.
        m.hitReact({});
        for (let i = 0; i < 120 && !m.swordDrawn; i++) m.update(DT, anim());
        for (let i = 0; i < 30; i++) m.update(DT, anim());
        expect(m.swordDrawn).toBe(true);
        m.root.updateMatrixWorld(true);
        const near = new THREE.Vector3().setFromMatrixPosition(p.bladeHolder.matrixWorld).distanceTo(new THREE.Vector3().setFromMatrixPosition(hand(m).matrixWorld));
        expect(near, `${g}/${w} tâm chuôi cách bàn tay`).toBeLessThan(0.2);
        expect(back.distanceTo(new THREE.Box3().setFromObject(p.blade!).getCenter(new THREE.Vector3()))).toBeGreaterThan(0.05);
        // Vỏ sáng +10 chạy trên model mới.
        m.setWeaponGlow(2);
        for (let i = 0; i < 5; i++) m.update(DT, anim());
        m.dispose();
      }
      s.dispose();
    });
  }

  it('kiếm cũ đã bị cắt khỏi lưới (không còn hai thanh kiếm)', async () => {
    const s = new PlayerSkins(cache());
    s.preload();
    const look = { g: 'm', dye: APPEARANCE.defaultDye };
    await ready(s, look);
    const m = s.create(look) as SkinnedPlayer;
    const tpl = (s as unknown as { templates: Map<string, { oldSword: { minS: number; maxS: number } | null }> }).templates.get('chr_kiem_tu_nam')!;
    expect(tpl.oldSword).toBeTruthy();
    expect(tpl.oldSword!.maxS - tpl.oldSword!.minS).toBeGreaterThan(0.5);
    console.info(`[kiếm] kiếm cũ dài ${(tpl.oldSword!.maxS - tpl.oldSword!.minS).toFixed(3)} m, đầu chuôi ${tpl.oldSword!.minS.toFixed(3)}, mũi ${tpl.oldSword!.maxS.toFixed(3)}`);
    m.dispose();
    s.dispose();
  });
});
