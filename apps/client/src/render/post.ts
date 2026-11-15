import * as THREE from 'three/webgpu';
import {
  clamp,
  float,
  fract,
  length,
  luminance,
  mix,
  mrt,
  normalView,
  output,
  pass,
  renderOutput,
  rtt,
  screenUV,
  sin,
  smoothstep,
  time,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import type { Node } from 'three/webgpu';
import { BLOOM, GRAIN, VIGNETTE, type GradingPreset } from './grading';

/**
 * Post-processing điện ảnh, một chuỗi cho cả 3 preset:
 *   cảnh HDR → (bloom chọn lọc) → ACES + sRGB → chỉnh màu (tách tông bóng lạnh/sáng ấm, nâng đen,
 *   đường cong S, bão hòa) → hiệu ứng trúng đòn (uHit) / chớp (uFlash) → (FXAA) → vignette → hạt
 *   phim + dither chống vệt bậc.
 *
 * Bloom chọn lọc: chỉ material đã gọi `markBloom()` ghi vào đích MRT `bloom` (8 bit); đích này được
 * blur Gauss 2 pass ở 1/4 độ phân giải rồi cộng vào ảnh HDR. MRT chỉ gắn vào material khi pipeline
 * có bloom đang chạy (preset Vừa/Cao); preset Thấp gỡ ra, vì không có MRT của renderer thì
 * `mrtNode` của material sẽ thay luôn đầu ra màu và vẽ sai.
 *
 * Khử răng cưa theo preset (canvas không MSAA, renderer tạo với `antialias: false`):
 *   Thấp: không. Vừa: FXAA. Cao: pixelRatio 2 (tối đa 8M điểm ảnh) + FXAA. Không dùng MSAA 4x ở Cao
 *   vì nó nhân 4 cả màu HalfFloat, đích bloom lẫn depth (89 so với 33 B/px), vượt ngân sách VRAM.
 *   Vẫn hỗ trợ `msaa: 4` nếu cần. WebGPU chỉ có 1 hoặc 4 mẫu, không có 2x.
 * Màu cảnh HalfFloat vì ACES cần giá trị > 1; đích bloom và buffer FXAA 8 bit.
 */
export const postParams = {
  exposure: uniform(1),
  bloomStrength: uniform(1.0),
  bloomSigma: 5,
  bloomScale: 0.25,
  shadowTint: uniform(new THREE.Color()),
  highlightTint: uniform(new THREE.Color()),
  /** Mức nhuộm sắc ở vùng tối / vùng sáng. */
  shadowTintAmount: uniform(0.5),
  highlightTintAmount: uniform(0.1),
  splitBalance: uniform(0),
  blackLift: uniform(new THREE.Color()),
  contrast: uniform(1.08),
  saturation: uniform(1.05),
  vignette: uniform(VIGNETTE.amount),
  vignetteInner: uniform(VIGNETTE.inner),
  vignetteOuter: uniform(VIGNETTE.outer),
  grain: uniform(GRAIN.amount),
  /** Mức che sáng môi trường (GTAO) áp vào ảnh, 0..1. */
  aoStrength: uniform(0.8),
  /** 0..1: mình vừa trúng đòn nặng (viền đỏ + quang sai màu), tự giảm dần. */
  hit: uniform(0),
  /** 0..1: chớp sáng toàn màn hình (sấm độ kiếp...), tự giảm dần. */
  flash: uniform(0),
};

/** Nạp số của một preset chỉnh màu (grading.ts) vào uniform. */
export function applyGrading(p: GradingPreset): void {
  // Sắc màu dùng ở không gian hiển thị (sau sRGB) nên giữ nguyên giá trị hex, không tuyến tính hóa.
  const disp = (c: THREE.Color, hex: number) => c.setHex(hex, THREE.LinearSRGBColorSpace);
  disp(postParams.shadowTint.value, p.shadowTint);
  disp(postParams.highlightTint.value, p.highlightTint);
  disp(postParams.blackLift.value, p.blackLift);
  postParams.shadowTintAmount.value = p.shadowAmount ?? 0.5;
  postParams.highlightTintAmount.value = p.highlightAmount ?? 0.1;
  postParams.splitBalance.value = p.splitBalance;
  postParams.contrast.value = p.contrast;
  postParams.saturation.value = p.saturation;
  postParams.exposure.value = p.exposure;
}

// ---------- bloom chọn lọc ----------

/** Đích bloom 8 bit: lưu giá trị / BLOOM_RANGE, khi ghép nhân lại. */
const BLOOM_RANGE = 4;
const bloomMaterials = new Map<THREE.Material, number>();
let bloomActive = false;

type WithMrt = { mrtNode: Node | null };

function attachBloom(m: THREE.Material, strength: number): void {
  const s = Math.min(strength, BLOOM.maxHdr) / BLOOM_RANGE;
  (m as unknown as WithMrt).mrtNode = mrt({ bloom: vec4(output.rgb.mul(s), output.a) });
  m.needsUpdate = true;
}

function setBloomActive(on: boolean): void {
  if (bloomActive === on) return;
  bloomActive = on;
  for (const [m, s] of bloomMaterials) {
    if (on) attachBloom(m, s);
    else {
      (m as unknown as WithMrt).mrtNode = null;
      m.needsUpdate = true;
    }
  }
}

/**
 * Đánh dấu material được phát quang khi có bloom (VFX, linh quang, cổng, đèn). Gọi được bất cứ lúc
 * nào; MRT chỉ được gắn khi pipeline có bloom. `strength` bị chặn ở BLOOM.maxHdr (2,5).
 */
export function markBloom(material: THREE.Material, strength = 1): void {
  if (!bloomMaterials.has(material)) material.addEventListener('dispose', () => bloomMaterials.delete(material));
  bloomMaterials.set(material, strength);
  if (bloomActive) attachBloom(material, strength);
}

// ---------- pipeline ----------

export interface PostOptions {
  bloom: boolean;
  /** Số mẫu MSAA của pass cảnh: 0 hoặc 4. */
  msaa: number;
  fxaa: boolean;
  /** GTAO nửa độ phân giải (preset Vừa/Cao). Cần thêm đích pháp tuyến (view space) vào MRT của pass cảnh. */
  ao?: boolean;
}

const _size = new THREE.Vector2();

export class PostPipeline {
  readonly bloom: boolean;
  private readonly key: string;
  private post: THREE.PostProcessing;
  private scenePass: ReturnType<typeof pass>;
  private blurNode: ReturnType<typeof gaussianBlur> | null = null;
  private aoNode: ReturnType<typeof ao> | null = null;
  /** Đích LDR cho FXAA: RTTNode không tự giải phóng render target, dispose() phải làm. */
  private fxaaInput: ReturnType<typeof rtt> | null = null;

  constructor(
    private renderer: THREE.WebGPURenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    opts: PostOptions,
  ) {
    this.bloom = opts.bloom;
    this.key = PostPipeline.keyOf(opts);
    setBloomActive(opts.bloom);

    this.post = new THREE.PostProcessing(renderer);
    this.post.outputColorTransform = false;
    const scenePass = pass(scene, camera, { samples: opts.msaa });
    this.scenePass = scenePass;
    if (opts.bloom || opts.ao) {
      const targets: Record<string, Node> = { output };
      if (opts.bloom) targets.bloom = vec4(0, 0, 0, output.a);
      if (opts.ao) targets.normal = normalView;
      scenePass.setMRT(mrt(targets));
      if (opts.bloom) scenePass.getTexture('bloom').type = THREE.UnsignedByteType;
    }
    const colorTex = scenePass.getTextureNode('output');

    // Quang sai màu khi trúng đòn: tách kênh R/B theo hướng ra mép (độ lệch 0 khi uHit = 0).
    const fromCenter = screenUV.sub(0.5);
    const ca = fromCenter.mul(postParams.hit.mul(0.012));
    let hdr = vec3(colorTex.sample(screenUV.add(ca)).r, colorTex.g, colorTex.sample(screenUV.sub(ca)).b).mul(postParams.exposure);
    if (opts.ao) {
      // GTAO ở nửa độ phân giải: bán kính 1,3 m (nếp gấp, chân tường, gốc cây), tắt dần theo khoảng cách để không bẩn nền xa.
      const aoPass = ao(scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'), this.camera);
      aoPass.resolutionScale = 0.5;
      aoPass.radius.value = 1.3;
      aoPass.thickness.value = 1.2;
      aoPass.scale.value = 1.1;
      this.aoNode = aoPass;
      hdr = hdr.mul(mix(float(1), aoPass.getTextureNode().r, postParams.aoStrength));
    }
    if (opts.bloom) {
      this.blurNode = gaussianBlur(scenePass.getTextureNode('bloom'), null, postParams.bloomSigma);
      this.blurNode.resolution.setScalar(postParams.bloomScale);
      hdr = hdr.add(this.blurNode.rgb.mul(postParams.bloomStrength.mul(BLOOM_RANGE)));
    }

    // ACES + sRGB theo cài đặt renderer, rồi chỉnh màu ở không gian hiển thị.
    const toned = renderOutput(vec4(hdr, 1)).rgb;
    const l = luminance(toned);
    const shadowW = float(1).sub(smoothstep(0, float(0.55).add(postParams.splitBalance), l));
    const highW = smoothstep(float(0.35).add(postParams.splitBalance), 1, l);
    const tintN = (t: typeof postParams.shadowTint) => vec3(t).div(luminance(vec3(t)).max(0.01));
    let g = vec3(mix(toned, toned.mul(tintN(postParams.shadowTint)), shadowW.mul(postParams.shadowTintAmount)));
    g = vec3(mix(g, g.mul(tintN(postParams.highlightTint)), highW.mul(postParams.highlightTintAmount)));
    // Nâng đen: không có đen tuyền, vùng tối ngả ngọc lam.
    g = vec3(postParams.blackLift).add(g.mul(vec3(1).sub(vec3(postParams.blackLift))));
    // Đường cong S nhẹ quanh 0,5 theo `contrast`.
    const gc = clamp(g, 0, 1);
    g = vec3(mix(gc, gc.mul(gc).mul(vec3(3).sub(gc.mul(2))), postParams.contrast.sub(1).mul(2.5)));
    g = vec3(mix(vec3(luminance(g)), g, postParams.saturation));
    // Trúng đòn: viền đỏ ở mép. Chớp: sáng trắng cả màn.
    const edge = smoothstep(0.3, 0.75, length(fromCenter));
    g = vec3(mix(g, vec3(0.75, 0.05, 0.04), edge.mul(postParams.hit).mul(0.55)));
    g = vec3(mix(g, vec3(1, 0.98, 0.94), postParams.flash.mul(0.75)));

    const graded = vec4(g, 1);
    let ldrRgb = graded.rgb;
    if (opts.fxaa) {
      this.fxaaInput = rtt(graded, null, null, { type: THREE.UnsignedByteType });
      ldrRgb = vec4(fxaa(this.fxaaInput)).rgb;
    }

    const vig = mix(float(1), float(1).sub(postParams.vignette), smoothstep(postParams.vignetteInner, postParams.vignetteOuter, length(fromCenter).mul(1.414)));
    // Hạt phim + dither (±0,5/255) chống vệt bậc ở trời và sương.
    const seed = screenUV.mul(vec2(1973.1, 2711.7)).add(fract(time.mul(0.37)).mul(101.3));
    const noise = fract(sin(seed.x.mul(12.9898).add(seed.y.mul(78.233))).mul(43758.5453)).sub(0.5);
    const out = ldrRgb.mul(vig).add(noise.mul(postParams.grain.add(1 / 255)));
    this.post.outputNode = vec4(out, 1);
  }

  private static keyOf(o: PostOptions): string {
    return `${o.bloom ? 'b' : 'n'}${o.msaa}${o.fxaa ? 'f' : ''}${o.ao ? 'a' : ''}`;
  }

  /** Pipeline hiện tại có đúng cấu hình `opts` không (để biết có cần dựng lại khi đổi preset). */
  matches(opts: PostOptions): boolean {
    return this.key === PostPipeline.keyOf(opts);
  }

  /** Mình trúng đòn: `frac` = sát thương / máu tối đa. Chỉ đòn nặng (≥ 8% hoặc chí mạng) mới hiện. */
  hit(frac: number, crit = false): void {
    if (frac < 0.08 && !crit) return;
    postParams.hit.value = Math.max(postParams.hit.value, Math.min(1, 0.35 + frac * 3));
  }

  /** Chớp sáng toàn màn hình (0..1), dùng cho sấm độ kiếp, đòn lớn. */
  flash(amount: number): void {
    postParams.flash.value = Math.max(postParams.flash.value, Math.min(1, amount));
  }

  update(dt: number): void {
    if (postParams.hit.value > 0) postParams.hit.value = Math.max(0, postParams.hit.value - dt * 2.2);
    if (postParams.flash.value > 0) postParams.flash.value = Math.max(0, postParams.flash.value - dt * 4);
  }

  render(): void {
    this.post.render();
  }

  /**
   * Biên dịch trước (M6-1) mọi material đang có trong cảnh cho đúng đích của pass cảnh (render target,
   * số mẫu MSAA, MRT bloom), như `PassNode.updateBefore` sẽ vẽ, để khung đầu và lần đầu thấy hiệu ứng
   * không phải biên dịch đồng bộ. Tạm tắt frustum culling để gồm cả vật ngoài khung nhìn hiện tại.
   * WebGPU: `createRenderPipelineAsync`; WebGL2: `KHR_parallel_shader_compile` nếu có.
   *
   * Luôn biên dịch cả cảnh: khóa cache của three gồm cả scene (sương, môi trường), biên dịch riêng một
   * cây con chưa nằm trong cảnh cho ra shader khác, vô ích. Người gọi KHÔNG được vẽ cho tới khi promise
   * xong: three r178 không chặn lệnh vẽ dùng pipeline WebGPU còn đang biên dịch dở (lỗi `setPipeline`).
   * Hậu kỳ (quad chỉnh màu, bloom, FXAA) không có đường biên dịch trước, vẫn dựng ở khung đầu.
   */
  async compileScene(): Promise<void> {
    const r = this.renderer;
    const root = this.scene;
    const culled: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
    });
    const prevTarget = r.getRenderTarget();
    const prevMrt = r.getMRT();
    // Cỡ đích như lúc vẽ thật (PassNode.updateBefore): đổi cỡ sau khi biên dịch sẽ làm mất cache.
    r.getSize(_size);
    this.scenePass.setPixelRatio(r.getPixelRatio());
    this.scenePass.setSize(_size.x, _size.y);
    r.setRenderTarget(this.scenePass.renderTarget);
    r.setMRT(this.scenePass.getMRT());
    let done: Promise<unknown>;
    try {
      // Phần dựng node + gửi lệnh biên dịch chạy đồng bộ trong lời gọi; chỉ chờ biên dịch xong là bất đồng bộ.
      // Khôi phục ngay để khung vẽ chen vào lúc chờ không bị sai đích.
      done = r.compileAsync(root, this.camera);
    } finally {
      r.setRenderTarget(prevTarget);
      r.setMRT(prevMrt);
      for (const o of culled) o.frustumCulled = true;
    }
    await done;
  }

  dispose(): void {
    if (this.fxaaInput) {
      this.fxaaInput.renderTarget?.dispose();
      (this.fxaaInput as unknown as { _quadMesh?: { material: THREE.Material } })._quadMesh?.material.dispose();
      this.fxaaInput.dispose();
    }
    this.blurNode?.dispose();
    this.aoNode?.dispose();
    this.scenePass.dispose();
    this.post.dispose();
  }
}

/** pixelRatio theo ngân sách điểm ảnh nội bộ của preset: màn hình lớn thì hạ để giữ VRAM/fill rate. */
export function budgetPixelRatio(width: number, height: number, maxRatio: number, maxPixels: number): number {
  const dpr = Math.min(window.devicePixelRatio || 1, maxRatio);
  const fit = Math.sqrt(maxPixels / Math.max(1, width * height));
  return Math.max(0.5, Math.min(dpr, fit));
}
