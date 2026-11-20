import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { withOccluderFade } from './occlusion';
import { addSectSigns } from './sectSigns';

describe('addSectSigns', () => {
  it('mỗi biển là một tấm phẳng, vật liệu đi qua hàm bọc làm mờ vật che như vật liệu GLB', () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
    const root = new THREE.Group();
    const mats = addSectSigns(root, withOccluderFade);
    const signs = root.children.filter((o) => o.name === 'calli_sign') as THREE.Mesh[];
    expect(signs).toHaveLength(2);
    expect(mats).toHaveLength(2);
    for (const m of mats) expect((m as THREE.NodeMaterial).maskNode, 'có maskNode làm mờ vật che').toBeTruthy();
    // không bọc thì không có maskNode (nền màn tiêu đề)
    const bare = addSectSigns(new THREE.Group());
    for (const m of bare) expect((m as THREE.NodeMaterial).maskNode ?? null).toBeNull();
  });
});
