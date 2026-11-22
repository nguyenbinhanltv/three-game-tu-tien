import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { dyeWeights, hexToLinear, V3_DYE_REF } from '@dtl/shared';
import { V3_MODELS, V3_OWN_SETS, V3_SKINS, v3AssetOf } from './mannequin';
import { createWorldMaterial } from '../../render/materials/world';
import {
  addDyeMask,
  applyV3Dye,
  DYE_MASK_ATTR,
  isUndyedBone,
  v3DyeColors,
  type V3DyeRef,
  v3DyeRefOf,
  type V3DyeUniforms,
  v3DyeValues,
  v3RegionValues,
} from './v3Dye';

const DYES = new Map([
  ['attire_sect', { hex: '#3B6584' }],
  ['wood_cinnabar', { hex: '#9D392E' }],
]);

describe('v3DyeColors (N-7: màu đạo bào và nhuộm 3 kênh Tủ ngoại trang trên model v3)', () => {
  it('đồ khởi đầu: màu đạo bào khác mặc định thì nhuộm, mặc định thì giữ màu gốc', () => {
    expect(v3DyeColors({ dye: 'wood_cinnabar' }, DYES, 'attire_sect')).toEqual({ main: '#9D392E' });
    expect(v3DyeColors({ dye: 'attire_sect' }, DYES, 'attire_sect')).toBeNull();
    expect(v3DyeColors({ dye: 'khong_co' }, DYES, 'attire_sect')).toBeNull();
  });

  it('mặc bộ: model của bộ giữ màu riêng, trừ khi có nhuộm Tủ ngoại trang', () => {
    expect(v3DyeColors({ dye: 'wood_cinnabar', set: 'set_dan_tam' }, DYES, 'attire_sect')).toBeNull();
    expect(v3DyeColors({ dye: 'attire_sect', set: 'set_dan_tam', tint: { hex: '#55475F' } }, DYES, 'attire_sect')).toEqual({
      main: '#55475F',
    });
    expect(v3DyeColors({ dye: 'wood_cinnabar', tint: { hex: '#55475F' } }, DYES, 'attire_sect')).toEqual({ main: '#55475F' });
  });

  it('bộ ba màu của Tủ ngoại trang: kênh 2 và 3 đi cùng kênh 1', () => {
    const tint = { hex: '#55475F', trim: '#9D392E', accent: '#E6DDCB' };
    expect(v3DyeColors({ dye: 'attire_sect', set: 'set_dan_tam', tint }, DYES, 'attire_sect')).toEqual({
      main: '#55475F',
      trim: '#9D392E',
      accent: '#E6DDCB',
    });
  });

  it('skin toàn thân không nhuộm', () => {
    expect(v3DyeColors({ dye: 'wood_cinnabar', skin: 'set_skin_varkessa', tint: { hex: '#55475F' } }, DYES, 'attire_sect')).toBeNull();
  });
});

describe('V3_DYE_REF', () => {
  it('mọi model theo bộ và model khởi đầu đều có màu vải tham chiếu, cả nam lẫn nữ', () => {
    const ids = new Set<string>([V3_MODELS.m, V3_MODELS.f]);
    for (const set of [undefined, ...Object.keys(V3_OWN_SETS)]) for (const g of ['m', 'f']) ids.add(v3AssetOf(g, undefined, set));
    for (const id of ids) expect(v3DyeRefOf(id), id).not.toBeNull();
  });

  it('skin toàn thân không có (không nhuộm)', () => {
    for (const id of Object.values(V3_SKINS)) expect(v3DyeRefOf(id), id).toBeNull();
  });
});

describe('mặt nạ nhuộm theo xương', () => {
  it('đầu, cổ, bàn tay, ngón, tóc không nhuộm; thân, tay áo, vạt, chân thì có', () => {
    for (const n of [
      'Head',
      'neck_01',
      'neck_02',
      'dtl_head_acc',
      'hand_l',
      'hand_r',
      'index_01_l',
      'thumb_04_leaf_r',
      'pinky_02_l',
      'dtl_o_hair_3_1',
    ])
      expect(isUndyedBone(n), n).toBe(true);
    for (const n of [
      'spine_03',
      'clavicle_l',
      'upperarm_l',
      'lowerarm_twist_r',
      'pelvis',
      'thigh_l',
      'foot_r',
      'dtl_o_skirt_2_1',
      'dtl_o_sleeve_veil_l_1',
    ])
      expect(isUndyedBone(n), n).toBe(false);
  });

  it('addDyeMask: 1 − tổng trọng số trên xương không nhuộm, một lần mỗi hình học', () => {
    const bones = ['spine_01', 'Head', 'hand_l'].map((n) => {
      const b = new THREE.Bone();
      b.name = n;
      return b;
    });
    const g = new THREE.BufferGeometry();
    // Gốc xương Head ở y = 0 (không có neck_01: ngưỡng = y Head): đỉnh 0 và 2 ở y = −1 (dưới đầu), đỉnh 1 ở y = 0,5 (trên đầu: luôn 0 dù bám xương thân).
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 0, 0.5, 0, 0, -1, 0, 0.3, 0.5, 0]), 3));
    // Đỉnh 0: toàn thân; đỉnh 1: toàn thân nhưng nằm trên đầu (mặt, tóc bám xương thân vẫn không nhuộm); đỉnh 2: 25% tay, 75% thân.
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0]), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 0.25, 0.75, 0, 0, 1, 0, 0, 0]), 4));
    const mesh = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial());
    mesh.bind(new THREE.Skeleton(bones), new THREE.Matrix4());
    const scene = new THREE.Group();
    scene.add(mesh);
    addDyeMask(scene);
    const a = g.getAttribute(DYE_MASK_ATTR);
    // Đỉnh 3 ở y = 0,5 nhưng cách trục cổ 0,3 m (vai giáp, cổ áo đứng): vẫn nhuộm được.
    expect([a.getX(0), a.getX(1), a.getX(2), a.getX(3)]).toEqual([1, 0, 0.75, 1]);
    addDyeMask(scene);
    expect(g.getAttribute(DYE_MASK_ATTR)).toBe(a);
  });
});

describe('applyV3Dye: tham số là uniform, không nướng hằng số vào shader', () => {
  type N = { type: string; isConstNode?: boolean; isUniformNode?: boolean; value?: unknown; getChildren(): Iterable<N> };
  /** Chữ ký cấu trúc đồ thị node: loại node và giá trị HẰNG SỐ theo thứ tự duyệt; giá trị uniform không tính (không vào mã shader). */
  function signature(root: unknown): string {
    const out: string[] = [];
    const seen = new Set<N>();
    const walk = (n: N) => {
      if (seen.has(n)) return void out.push('^');
      seen.add(n);
      out.push(n.isUniformNode ? `U:${n.type}` : n.isConstNode ? `C:${JSON.stringify(n.value)}` : n.type);
      for (const c of n.getChildren()) walk(c);
    };
    walk(root as N);
    return out.join('|');
  }
  const dyed = (ref: V3DyeRef, hex: string) => applyV3Dye(createWorldMaterial({ map: new THREE.Texture() }), ref, hex);

  it('hai màu, hai vải tham chiếu, hai chế độ: cùng một cấu trúc node (một chương trình shader), chỉ khác giá trị uniform', () => {
    const a = dyed({ mode: 'chroma', ref: '#435466' }, '#9D392E');
    const b = dyed({ mode: 'chroma', ref: '#41574b' }, '#E6DDCB');
    const c = dyed({ mode: 'neutral', ref: '#a7a6a3' }, '#3B6584');
    const sig = signature(a.colorNode);
    expect(sig).toContain('U:');
    expect(signature(b.colorNode)).toBe(sig);
    expect(signature(c.colorNode)).toBe(sig);
    const ua = a.userData.v3Dye as V3DyeUniforms;
    const ub = b.userData.v3Dye as V3DyeUniforms;
    const uc = c.userData.v3Dye as V3DyeUniforms;
    const flat = (u: object): unknown[] => Object.values(u).flatMap((x) => ((x as N).isUniformNode ? [x] : flat(x as object)));
    for (const u of flat(ua)) expect((u as N).isUniformNode).toBe(true);
    expect(ua.target.value.getHex()).not.toBe(ub.target.value.getHex());
    expect([ua.neutral.value, uc.neutral.value]).toEqual([0, 1]);
  });

  it('v3DyeValues: màu sáng hơn vải gốc thì nén tương phản; vải tham chiếu xám vẫn có hướng hợp lệ', () => {
    expect(v3DyeValues({ mode: 'chroma', ref: '#435466' }, '#E6DDCB').gamma).toBe(0.6);
    expect(v3DyeValues({ mode: 'chroma', ref: '#435466' }, '#29292C').gamma).toBe(1);
    const grey = v3DyeValues({ mode: 'neutral', ref: '#808080' }, '#3B6584');
    expect(grey.dir.length()).toBeCloseTo(1);
    expect(grey.neutral).toBe(1);
  });
});

describe('nhuộm 3 kênh (kênh 2: viền/lót/đai, kênh 3: tua/kim loại)', () => {
  const REF: V3DyeRef = {
    mode: 'chroma',
    ref: '#435466',
    trim: { ref: '#2c2f38', r: 0.11 },
    accent: { ref: '#dec399', r: 0.14 },
  };
  const w = (hex: string) => dyeWeights(hexToLinear(hex), REF);

  it('trọng số: vải chính → kênh 1, lót tối → kênh 2, vàng → kênh 3, da → không kênh nào', () => {
    expect(w('#435466').main).toBeGreaterThan(0.9);
    expect(w('#2c2f38').trim).toBeGreaterThan(0.9);
    expect(w('#2c2f38').main).toBeLessThan(0.1);
    expect(w('#dec399').accent).toBeGreaterThan(0.9);
    const skin = w('#d09f8d');
    expect(skin.main + skin.trim + skin.accent).toBeLessThan(0.1);
  });

  it('kênh nhường nhau: tổng trọng số không vượt 1', () => {
    for (const hex of ['#435466', '#2c2f38', '#dec399', '#808080', '#a59b80']) {
      const x = w(hex);
      expect(x.main + x.trim + x.accent).toBeLessThanOrEqual(1.0001);
    }
  });

  it('model không có vùng thì kênh đó vô hiệu', () => {
    const x = dyeWeights(hexToLinear('#2c2f38'), { mode: 'chroma', ref: '#435466' });
    expect(x.trim).toBe(0);
    expect(x.accent).toBe(0);
  });

  it('v3RegionValues: thiếu màu hoặc thiếu vùng thì tắt; có cả hai thì bật', () => {
    expect(v3RegionValues({ ref: '#dec399', r: 0.14 }, undefined).on).toBe(0);
    expect(v3RegionValues(undefined, '#9D392E').on).toBe(0);
    const v = v3RegionValues({ ref: '#dec399', r: 0.14 }, '#9D392E');
    expect([v.on, v.r]).toEqual([1, 0.14]);
  });

  it('thêm kênh 2/3 không đổi cấu trúc shader: cùng chương trình với nhuộm một kênh, dù model có hay không có vùng', () => {
    const sig = (m: THREE.MeshStandardNodeMaterial) => {
      const out: string[] = [];
      const seen = new Set<unknown>();
      const walk = (n: {
        type: string;
        isUniformNode?: boolean;
        isConstNode?: boolean;
        value?: unknown;
        getChildren(): Iterable<never>;
      }): void => {
        if (seen.has(n)) return void out.push('^');
        seen.add(n);
        out.push(n.isUniformNode ? 'U' : n.isConstNode ? `C:${JSON.stringify(n.value)}` : n.type);
        for (const c of n.getChildren()) walk(c);
      };
      walk(m.colorNode as never);
      return out.join('|');
    };
    const mk = (ref: V3DyeRef, d: string | { main: string; trim?: string; accent?: string }) =>
      applyV3Dye(createWorldMaterial({ map: new THREE.Texture() }), ref, d);
    const one = mk({ mode: 'chroma', ref: '#435466' }, '#9D392E');
    const three = mk(REF, { main: '#9D392E', trim: '#E6DDCB', accent: '#3B6584' });
    expect(sig(three)).toBe(sig(one));
  });

  it('mọi model có ít nhất vùng viền hoặc kim loại, bán kính hợp lý', () => {
    for (const [id, ref] of Object.entries(V3_DYE_REF)) {
      expect(ref.trim || ref.accent, id).toBeTruthy();
      for (const z of [ref.trim, ref.accent]) if (z) expect(z.r, id).toBeGreaterThanOrEqual(0.05);
      for (const z of [ref.trim, ref.accent]) if (z) expect(z.r, id).toBeLessThan(0.2);
    }
  });

  it('wide: vải tông đất ít bão hòa được phủ liền vùng, chuẩn thì bỏ sót (nguyên nhân vết loang)', () => {
    const std: V3DyeRef = { mode: 'chroma', ref: '#ae937b' };
    const wide: V3DyeRef = { ...std, wide: true };
    // Texel xám be nhạt (gần trung tính) lẫn giữa vải tan.
    const pale = hexToLinear('#d0cdc5');
    expect(dyeWeights(pale, std).main).toBeLessThan(0.2);
    expect(dyeWeights(pale, wide).main).toBeGreaterThan(0.8);
    // Vải chính vẫn được phủ như cũ.
    expect(dyeWeights(hexToLinear('#ae937b'), wide).main).toBeGreaterThan(0.9);
  });
});
