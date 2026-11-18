import * as THREE from 'three/webgpu';
import { CloudSea } from '../../render/clouds';
import { createSky, setSkyQuality, setSunDirection } from '../../render/sky';
import { Lake } from '../../render/water';

const SKY_HORIZON = 0xcfe0ea;
const SKY_TOP = 0x2f7fd0;

/** Bầu trời, ánh sáng, mây, mặt hồ. */
export class Environment {
  group = new THREE.Group();
  sky: THREE.Mesh;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  cloudSea: CloudSea;
  lake: Lake;
  water: THREE.Mesh;
  /** Vector từ người chơi tới mặt trời (hướng + khoảng cách); applyAtmosphere đặt theo độ cao nắng của preset. */
  sunDir = new THREE.Vector3(120, 220, 90);
  private t = 0;

  constructor(scene: THREE.Scene, shadows: boolean) {
    scene.fog = new THREE.FogExp2(SKY_HORIZON, 0.00068);
    scene.background = new THREE.Color(SKY_HORIZON);

    // Vòm trời TSL (render/sky.ts): gradient, mặt trời, mây ti. Màu do applyAtmosphere nạp theo preset.
    this.sky = createSky();
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

    // Biển mây dưới núi (render/clouds.ts) và hồ sương (render/water.ts).
    this.cloudSea = new CloudSea();
    this.group.add(this.cloudSea.group);
    this.lake = new Lake();
    this.water = this.lake.water;
    this.group.add(this.lake.group);

    scene.add(this.group);
  }

  /** Mức chi tiết trời/mây/nước theo preset chất lượng ('low' | 'medium' | 'high'). */
  setQuality(preset: string): void {
    this.preset = preset;
    setSkyQuality(preset);
    this.cloudSea.setQuality(preset);
    this.lake.setQuality(preset);
  }

  private preset = 'medium';
  private seaFor = 'van_lam';

  /**
   * Đổi level (E1-D): biển mây nướng lại theo địa hình mới (dispose bản cũ, reset texture module), hồ chỉ hiện khi level có hồ.
   * Gọi sau `setActiveLevel`. Cùng địa hình thì không dựng lại.
   */
  setLevel(terrainId: string, f: { clouds: boolean; lake: boolean }): void {
    if (f.clouds && this.seaFor !== terrainId) {
      this.group.remove(this.cloudSea.group);
      this.cloudSea.dispose();
      this.cloudSea = new CloudSea();
      this.cloudSea.setQuality(this.preset);
      this.group.add(this.cloudSea.group);
      this.seaFor = terrainId;
    }
    this.cloudSea.group.visible = f.clouds;
    this.lake.group.visible = f.lake;
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3): void {
    this.t += dt;
    this.sky.position.copy(camera.position);
    // Bóng đổ bám theo người chơi.
    this.sun.target.position.copy(focus);
    this.sun.position.set(focus.x + this.sunDir.x, focus.y + this.sunDir.y, focus.z + this.sunDir.z);
    this.cloudSea.update(camera);
    this.lake.update(this.t);
    setSunDirection(this.sunDir.x, this.sunDir.y, this.sunDir.z);
  }
}
