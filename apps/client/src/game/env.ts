import * as THREE from 'three/webgpu';
import { FOREST, hash01, heightAt, LAKE, LAKE_WATER_R, SECT, VALLEY, WATER_Y, WORLD_SIZE } from '@dtl/shared';
import { col, G, GeoBuilder, mat } from './geo';

export const SKY_HORIZON = 0xcfe0ea;
export const SKY_TOP = 0x2f7fd0;

/** Bầu trời, ánh sáng, mây, mặt hồ. */
export class Environment {
  group = new THREE.Group();
  sky: THREE.Mesh;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  cloudsHigh: THREE.Mesh;
  cloudSea: THREE.Mesh;
  water: THREE.Mesh;
  private t = 0;

  constructor(scene: THREE.Scene, shadows: boolean) {
    scene.fog = new THREE.FogExp2(SKY_HORIZON, 0.00068);
    scene.background = new THREE.Color(SKY_HORIZON);

    // Vòm trời tô chuyển màu theo độ cao.
    const skyGeo = new THREE.SphereGeometry(4200, 24, 16);
    const p = skyGeo.getAttribute('position');
    const colors = new Float32Array(p.count * 3);
    const top = col(SKY_TOP);
    const hor = col(SKY_HORIZON);
    const glow = col(0xf4e9d2);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const h = Math.max(0, p.getY(i) / 4200);
      c.copy(hor).lerp(top, Math.min(1, Math.pow(h * 1.6, 0.5)));
      if (h < 0.08) c.lerp(glow, (0.08 - h) * 4);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xe4f0ff, 0x6f7a58, 1.25);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.4);
    this.sun.position.set(120, 220, 90);
    if (shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const cam = this.sun.shadow.camera;
      cam.left = -70;
      cam.right = 70;
      cam.top = 70;
      cam.bottom = -70;
      cam.near = 10;
      cam.far = 600;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.6;
    }
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    // Mây cao trôi khắp bản đồ.
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9fb2c6, emissiveIntensity: 0.55, transparent: true, opacity: 0.93 });
    const white = col(0xffffff);
    const hb = new GeoBuilder();
    for (let i = 0; i < 46; i++) {
      const cx = hash01(i, 1, 901) * WORLD_SIZE;
      const cz = hash01(i, 2, 901) * WORLD_SIZE;
      const cy = 380 + hash01(i, 3, 901) * 170;
      const s = 34 + hash01(i, 4, 901) * 46;
      const puffs = 4 + ((hash01(i, 5, 901) * 4) | 0);
      for (let k = 0; k < puffs; k++) {
        const ox = (hash01(i, k, 911) - 0.5) * s * 2.6;
        const oz = (hash01(i, k, 913) - 0.5) * s * 1.6;
        const ps = s * (0.55 + hash01(i, k, 917) * 0.6);
        hb.add(G.ico1, mat(cx + ox, cy + (hash01(i, k, 919) - 0.5) * s * 0.3, cz + oz, 0, hash01(i, k, 921) * 6, 0, ps, ps * 0.38, ps * 0.8), white);
      }
    }
    this.cloudsHigh = new THREE.Mesh(hb.build(), cloudMat);
    this.cloudsHigh.frustumCulled = false;
    this.group.add(this.cloudsHigh);

    // Biển mây quanh sườn núi tông môn: thấp hơn sân tông môn, cao hơn thung lũng.
    const sb = new GeoBuilder();
    for (let i = 0; i < 150; i++) {
      const a = hash01(i, 7, 931) * Math.PI * 2;
      const r = 230 + hash01(i, 8, 931) * 1250;
      const cx = SECT.x + Math.cos(a) * r;
      const cz = SECT.z + Math.sin(a) * r;
      // Không phủ lên các khu chơi chính để nhìn rõ mặt đất.
      if (Math.hypot(cx - VALLEY.x, cz - VALLEY.z) < 420) continue;
      if (Math.hypot(cx - FOREST.x, cz - FOREST.z) < 440) continue;
      if (Math.hypot(cx - LAKE.x, cz - LAKE.z) < 330) continue;
      const ground = heightAt(cx, cz);
      const cy = Math.max(ground + 14, 104 + hash01(i, 9, 931) * 22);
      if (cy > 200) continue;
      const s = 30 + hash01(i, 10, 931) * 44;
      for (let k = 0; k < 4; k++) {
        const ox = (hash01(i, k, 941) - 0.5) * s * 2.4;
        const oz = (hash01(i, k, 943) - 0.5) * s * 2.4;
        const ps = s * (0.6 + hash01(i, k, 947) * 0.5);
        sb.add(G.ico1, mat(cx + ox, cy, cz + oz, 0, hash01(i, k, 949) * 6, 0, ps, ps * 0.2, ps), white);
      }
    }
    const seaMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xaebccc, emissiveIntensity: 0.6, transparent: true, opacity: 0.86 });
    this.cloudSea = new THREE.Mesh(sb.build(), seaMat);
    this.cloudSea.frustumCulled = false;
    this.group.add(this.cloudSea);

    const waterGeo = new THREE.CircleGeometry(LAKE_WATER_R, 64);
    waterGeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(
      waterGeo,
      new THREE.MeshLambertMaterial({ color: 0x3d86ad, emissive: 0x16384c, emissiveIntensity: 0.6, transparent: true, opacity: 0.8 }),
    );
    this.water.position.set(LAKE.x, WATER_Y, LAKE.z);
    this.group.add(this.water);

    scene.add(this.group);
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3): void {
    this.t += dt;
    this.sky.position.copy(camera.position);
    // Bóng đổ bám theo người chơi.
    this.sun.target.position.copy(focus);
    this.sun.position.set(focus.x + 120, focus.y + 220, focus.z + 90);
    this.cloudsHigh.position.x = Math.sin(this.t * 0.012) * 160;
    this.cloudsHigh.position.z = Math.cos(this.t * 0.009) * 120;
    this.cloudSea.position.x = Math.sin(this.t * 0.02) * 26;
    this.cloudSea.position.y = Math.sin(this.t * 0.11) * 1.4;
    this.water.position.y = WATER_Y + Math.sin(this.t * 0.6) * 0.06;
  }
}
