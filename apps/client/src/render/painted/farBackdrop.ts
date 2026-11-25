import * as THREE from 'three/webgpu';
import {
  Fn,
  asin,
  atan,
  clamp,
  dot,
  float,
  mix,
  normalize,
  pow,
  positionLocal,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { LIGHT } from './fieldShared';
import { bakeFarHeight } from './lab/farHeightBake';
import { FAR_SPAN } from './lab/farHeight';
import { farPaint } from './lab/farPaint';
import type { N } from './lab/field';

/**
 * Vùng xa Họa Cảnh (P3, `?style=painted`): dải sơn nướng MỘT lần (độ cao nướng trên CPU float32 chính xác, rồi pass bức tranh dịch từ painted-valley/src/
 * valley/backdrop.js; MIT, © 2026 Patch; xem assets/LICENSES.md) và một vòm vẽ phủ lên bầu trời, trộn màu sáng/tối/không khí theo ánh sáng của giờ
 * (cùng `LIGHT` với cỏ và đất), như painted-valley/src/valley/sky.js. Đổi giờ không phải nướng lại. Một draw call.
 */
const TAU = 6.28318531;
const EL: [number, number] = [(-2.6 * Math.PI) / 180, (21.4 * Math.PI) / 180];
const DOME_RADIUS = 4100;

export interface FarBackdropOptions {
  /** Hướng thung lũng (vector đơn vị trên mặt phẳng xz của bản đồ). */
  hero: [number, number];
  /** Hướng (nằm ngang) phía có nắng chiều: núi được chiếu sáng từ bên này. */
  side: [number, number];
  /** Số texel quanh chân trời (nguồn: 8192). */
  width?: number;
  /** Cạnh bản đồ độ cao (texel). */
  ground?: number;
}

export class FarBackdrop {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicNodeMaterial;
  private readonly targets: THREE.RenderTarget[] = [];
  private baked = false;
  /** Thời gian nướng (ms): độ cao CPU, rồi toàn bộ (kể cả chờ khung). Để đo/chẩn đoán. */
  bakeMs = { cpu: 0, total: 0 };
  /** Bộ nhớ ba dải RGB + ba dải alpha (byte). */
  get bytes(): number {
    return this.targets.reduce((a, t) => a + t.width * t.height * 4, 0);
  }
  private disposed = false;
  private readonly o: Required<FarBackdropOptions>;

  constructor(
    private readonly renderer: THREE.WebGPURenderer,
    opts: FarBackdropOptions,
  ) {
    this.o = { width: 2048, ground: 1024, ...opts };
    this.material = new THREE.MeshBasicNodeMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      depthTest: false,
      transparent: true,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 20), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -9; // ngay sau vòm trời (-10)
    this.mesh.visible = false;
    this.mesh.name = 'paintedFarBackdrop';
  }

  /** Bám theo camera (vòm vô cực). */
  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }

  get ready(): boolean {
    return this.baked;
  }

  /** Nướng độ cao (worker CPU) rồi dải bức tranh (GPU, chia dải đứng qua nhiều khung để không giữ GPU lâu). */
  async bake(): Promise<void> {
    const t0 = performance.now();
    const { width: W, ground: G, hero, side } = this.o;
    const H = Math.round((W * (EL[1] - EL[0])) / TAU);
    const data = await bakeFarHeight(G, FAR_SPAN, hero, 9);
    this.bakeMs.cpu = performance.now() - t0;
    if (this.disposed) return;
    const half = new Uint16Array(G * G * 4);
    for (let i = 0; i < G * G; i++) half[i * 4] = THREE.DataUtils.toHalfFloat(data[i]!);
    const tHeight = new THREE.DataTexture(half, G, G, THREE.RGBAFormat, THREE.HalfFloatType);
    tHeight.minFilter = tHeight.magFilter = THREE.LinearFilter;
    tHeight.wrapS = tHeight.wrapT = THREE.ClampToEdgeWrapping;
    tHeight.needsUpdate = true;

    const s = Math.hypot(side[0], side[1]) || 1;
    const uOut = uniform(0);
    const pm = new THREE.MeshBasicNodeMaterial();
    pm.colorNode = farPaint(uv().x, uv().y, {
      tHeight,
      uTexel: float(FAR_SPAN / G),
      uSide: vec2(side[0] / s, side[1] / s),
      uHero: vec2(hero[0], hero[1]),
      uEl: vec2(EL[0], EL[1]),
      uEye: float(0.06),
      uOut,
    });
    const quad = new THREE.QuadMesh(pm);
    const strips = 16;
    const step = Math.ceil(W / strips);
    for (let k = 0; k < 6; k++) {
      uOut.value = k;
      const rt = new THREE.RenderTarget(W, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false });
      rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
      rt.texture.wrapS = THREE.RepeatWrapping;
      rt.texture.wrapT = THREE.ClampToEdgeWrapping;
      rt.texture.generateMipmaps = false;
      this.targets.push(rt);
      rt.scissorTest = true;
      for (let i = 0; i < strips; i++) {
        if (this.disposed) return;
        rt.scissor.set(i * step, 0, step, H);
        const prev = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(rt);
        quad.render(this.renderer);
        this.renderer.setRenderTarget(prev);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      rt.scissorTest = false;
    }
    pm.dispose();
    tHeight.dispose();
    this.material.colorNode = this.domeColor();
    this.material.needsUpdate = true;
    this.bakeMs.total = performance.now() - t0;
    this.baked = true;
    this.mesh.visible = true;
  }

  /** Vòm: trộn ba lớp nướng với ánh sáng của giờ (port từ sky.js; màu tối/sáng/không khí/dải mây). */
  private domeColor(): N {
    const [t0, t1, t2, a0, a1, a2] = this.targets.map((t) => t.texture);
    const L = LIGHT;
    const sunDir = vec3(...(L.sunDir as [number, number, number])).normalize();
    const sunColor = vec3(...(L.sunColor as [number, number, number]));
    const skyColor = vec3(...(L.skyColor as [number, number, number]));
    const fogColor = vec3(...(L.fogColor as [number, number, number]));
    const fogSun = vec3(...(L.fogSunColor as [number, number, number]));
    const bankLit = vec3(1.26, 1.2, 1.08);
    const bankShade = vec3(0.4575, 0.5905, 0.756);
    return Fn(() => {
      const d: N = normalize(positionLocal);
      const sd: N = dot(d, sunDir).max(0);
      const v: N = asin(clamp(d.y, -1, 1))
        .sub(EL[0])
        .div(EL[1] - EL[0]);
      const u: N = vec2(atan(d.z, d.x).div(TAU).add(0.5), v.max(0));
      const rgb = (t: THREE.Texture): N => texture(t, u).level(float(0)).rgb;
      const al = (t: THREE.Texture): N => texture(t, u).level(float(0)).r;
      const b0: N = vec4(rgb(t0!), al(a0!));
      const b1: N = vec4(rgb(t1!), al(a1!));
      const b2: N = vec4(rgb(t2!), al(a2!));
      const inv: N = float(1).div(b0.a.max(0.002));
      const bank: N = clamp(b2.b.mul(inv), 0, 1);
      const w: N = inv.div(float(1).sub(bank).max(1e-3));
      const ambient: N = skyColor.mul(0.6).add(dot(skyColor, vec3(0.38)));
      const inLight: N = b0.rgb.mul(w);
      const inShade: N = b1.rgb.mul(w);
      let land: N = mix(
        inShade.mul(inShade).mul(ambient),
        inLight.mul(inLight).mul(sunColor.mul(0.42).add(skyColor.mul(0.35))),
        clamp(b1.a.mul(w), 0, 1),
      ).toVar();
      const air: N = mix(fogColor, fogSun, pow(sd, 6).mul(0.45));
      land = mix(land, air, float(1).sub(pow(float(1).sub(clamp(b2.r.mul(w), 0, 0.996)), L.fogDensity / 0.00015))).toVar();
      land = mix(land, vec3(0.86, 0.92, 1).mul(skyColor.mul(0.5).add(sunColor.mul(0.26))), clamp(b2.g.mul(w), 0, 1)).toVar();
      const cloud: N = mix(
        bankShade,
        bankLit,
        clamp(b2.a.mul(inv).div(bank.max(1e-3)), 0, 1).mul(smoothstep(0.04, 0.4, sunDir.y).mul(0.8).add(0.2)),
      );
      land = mix(land, mix(cloud, air, 0.18), bank).toVar();
      const alpha: N = b0.a
        .greaterThan(0.002)
        .select(b0.a, float(0))
        .mul(v.lessThan(1).select(float(1), float(0)));
      return vec4(land, alpha);
    })();
  }

  dispose(): void {
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    for (const t of this.targets) t.dispose();
    this.targets.length = 0;
  }
}
