import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { hideRenderables } from './post';

/** Như `Renderer._projectObject`: bỏ cả cây con ẩn, ghi lại đèn và mesh thấy được. */
function visibleSet(root: THREE.Object3D) {
  const lights: THREE.Object3D[] = [];
  const meshes: THREE.Object3D[] = [];
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    if ((o as THREE.Light).isLight) lights.push(o);
    if ((o as THREE.Mesh).isMesh) meshes.push(o);
    o.children.forEach(walk);
  };
  walk(root);
  return { lights, meshes };
}

describe('hideRenderables (T5)', () => {
  it('giữ đèn nằm trong Group, chỉ ẩn vật vẽ khác, và khôi phục', () => {
    const scene = new THREE.Scene();
    const env = new THREE.Group();
    const sun = new THREE.DirectionalLight();
    env.add(sun, new THREE.HemisphereLight());
    const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const nested = new THREE.Group();
    const lantern = new THREE.PointLight();
    const inner = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    nested.add(lantern, inner);
    const tmp = new THREE.Group();
    const warmMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    tmp.add(warmMesh);
    scene.add(env, other, nested, tmp);

    const restore = hideRenderables(scene, tmp);
    const v = visibleSet(scene);
    expect(v.lights).toContain(sun);
    expect(v.lights).toContain(lantern);
    expect(v.lights).toHaveLength(3);
    expect(v.meshes).toEqual([warmMesh]);

    restore();
    expect(visibleSet(scene).meshes).toHaveLength(3);
  });
});
