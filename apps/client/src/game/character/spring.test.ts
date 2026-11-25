import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { pinGradient, pushOutCapsule, SpringBones, type SpringDef } from './spring';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('pushOutCapsule (va chạm vạt với đùi)', () => {
  const a = v(0, 1, 0);
  const b = v(0, 0.5, 0);
  it('điểm ngoài viên nang giữ nguyên', () => {
    const p = v(0.2, 0.8, 0);
    expect(pushOutCapsule(p, a, b, 0.1, v(1, 0, 0))).toBe(false);
    expect(p.x).toBeCloseTo(0.2);
  });
  it('điểm trong thân bị đẩy ra đúng bán kính theo phương vuông góc', () => {
    const p = v(0.03, 0.8, 0);
    expect(pushOutCapsule(p, a, b, 0.1, v(1, 0, 0))).toBe(true);
    expect(p.x).toBeCloseTo(0.1, 5);
    expect(p.y).toBeCloseTo(0.8, 5);
  });
  it('điểm gần đầu mút được đẩy theo hình cầu, và trên trục đúng thì dùng hướng dự phòng', () => {
    const q = v(0, 1.05, 0.02);
    pushOutCapsule(q, a, b, 0.1, v(1, 0, 0));
    expect(q.distanceTo(a)).toBeCloseTo(0.1, 5);
    const onAxis = v(0, 0.75, 0);
    pushOutCapsule(onAxis, a, b, 0.1, v(0, 0, -1));
    expect(onAxis.z).toBeCloseTo(-0.1, 5);
  });
});

const def = (bone: string): SpringDef => ({ bone, tailLocal: v(0, -0.3, 0) });

describe('pinGradient (ghim gốc, thả ngọn)', () => {
  const chain = ['dtl_o_hair_0_0', 'dtl_o_hair_0_1', 'dtl_o_hair_0_2', 'dtl_o_hair_0_3'].map(def);
  it('nội suy tuyến tính theo chỉ số đốt từ gốc tới ngọn', () => {
    const out = pinGradient(chain, { stiff: [2, 0.5], angle: [0.5, 1.5] });
    expect(out.map((d) => d.stiff)).toEqual([2, 1.5, 1, 0.5]);
    expect(out.map((d) => d.angle)).toEqual([0.5, 5 / 6, 7 / 6, 1.5].map((x, i) => (i === 0 ? 0.5 : i === 3 ? 1.5 : expect.closeTo(x, 5))));
    expect(out[0]!.drag).toBeUndefined();
  });
  it('nhân lên hệ số có sẵn (gấu vạt cứng hơn) thay vì ghi đè', () => {
    const [a, b] = pinGradient(
      [
        { ...def('dtl_o_skirt_1_0'), stiff: 2 },
        { ...def('dtl_o_skirt_1_1'), stiff: 2 },
      ],
      { stiff: [1, 0.5] },
    );
    expect(a!.stiff).toBe(2);
    expect(b!.stiff).toBe(1);
  });
  it('mỗi chuỗi một thang riêng; chuỗi một đốt và xương lạ tên giữ nguyên', () => {
    const defs = [def('dtl_o_hair_0_0'), def('dtl_o_hair_0_1'), def('dtl_o_tassel_3_0'), def('khac_xuong')];
    const out = pinGradient(defs, { drag: [2, 1] });
    expect(out[0]!.drag).toBe(2);
    expect(out[1]!.drag).toBe(1);
    expect(out[2]).toBe(defs[2]); // chuỗi một đốt
    expect(out[3]).toBe(defs[3]);
  });
  it('không có gradient thì không đổi gì (bản sao cùng giá trị)', () => {
    const out = pinGradient(chain, {});
    expect(out).toEqual(chain);
  });
});

describe('SpringBones: hệ số góc theo xương', () => {
  const build = (angle: number) => {
    const root = new THREE.Object3D();
    const parent = new THREE.Bone();
    const bone = new THREE.Bone();
    bone.name = 'dtl_o_hair_0_0';
    parent.add(bone);
    bone.position.set(0, 0, 0);
    root.add(parent);
    const tip = new THREE.Bone();
    tip.position.set(0, -0.3, 0);
    bone.add(tip);
    root.updateMatrixWorld(true);
    const sb = new SpringBones(root, [{ bone: bone.name, tailLocal: v(0, -0.3, 0), angle }], {
      stiffness: 20,
      drag: 2,
      maxAngle: 40,
      maxInward: 40,
    });
    let worst = 0;
    for (let i = 0; i < 60; i++) {
      parent.position.x = Math.sin(i * 0.5) * 0.4; // lắc ngang mạnh
      root.updateMatrixWorld(true);
      sb.update(1 / 60, new THREE.Matrix4());
      worst = Math.max(worst, bone.quaternion.angleTo(new THREE.Quaternion()));
    }
    return worst;
  };
  it('góc hẹp (0,5×) lệch ít hơn góc gốc (1×) và không vượt giới hạn nhân', () => {
    const narrow = build(0.5);
    const wide = build(1);
    expect(narrow).toBeLessThan(wide);
    expect(narrow).toBeLessThanOrEqual((20 * Math.PI) / 180 + 1e-3);
  });
});
