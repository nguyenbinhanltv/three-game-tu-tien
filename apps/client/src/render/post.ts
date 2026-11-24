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
  texture,
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
import { getCloudNoise } from './noiseTex';
import { FLAGS } from '../base/flags';
import { paintedOutput } from './painted/frame';
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
  /** 0..1: khung va chạm (V-P0): tương phản cao + ám màu `impactColor`, tự hết sau `impactFrames` khung hình. */
  impact: uniform(0),
  impactColor: uniform(new THREE.Color(0.8, 0.8, 0.8)),
  /** 0..1: chớp tối/sáng ở viền khung hình (VS-1 `vignette`), tự giảm dần; `punchLight` = 1 → viền sáng, 0 → viền tối. */
  punch: uniform(0),
  punchLight: uniform(0),
  /** 0..1: làm nhòe hướng tâm ở mép khung (cảnh boss xuất hiện, P2-B2); chỉ có khi pipeline dựng với `radial`. */
  radial: uniform(0),
  /** 0..1 và màu: nhuộm thoáng qua cả khung (chuyển pha boss, P2-B3), thay màu trời/sương trong một nhịp. */
  pulse: uniform(0),
  pulseColor: uniform(new THREE.Color(0.55, 0.78, 1)),
  /** 0..1: mực thủy mặc loang từ mép vào giữa (chết, P2-B5). 0 = không vẽ gì. */
  ink: uniform(0),
  /** 0..1: khử bão hòa và hạ sáng cả khung theo cảnh chết. */
  inkDesat: uniform(0),
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

interface PostOptions {
  bloom: boolean;
  /** Số mẫu MSAA của pass cảnh: 0 hoặc 4. */
  msaa: number;
  fxaa: boolean;
  /** GTAO nửa độ phân giải (preset Vừa/Cao). Cần thêm đích pháp tuyến (view space) vào MRT của pass cảnh. */
  ao?: boolean;
  /** Nhòe hướng tâm (4 lần lấy mẫu thêm). Preset Thấp bỏ. */
  radial?: boolean;
}

const _size = new THREE.Vector2();
/** Ép kiểu nút về vec3 để gán lại biến `hdr` (TSL gõ kiểu theo nút cuối chuỗi). */
const asVec3 = (n: unknown): ReturnType<typeof vec3> => n as ReturnType<typeof vec3>;

/**
 * Ẩn mọi vật vẽ được (mesh, sprite, đường, điểm) trong `root`, trừ cây con `keep`; Group và đèn giữ nguyên để
 * `compileAsync` (duyệt vật `visible`) vẫn thu đủ đèn. Trả hàm khôi phục.
 */
export function hideRenderables(root: THREE.Object3D, keep: THREE.Object3D): () => void {
  const hidden: THREE.Object3D[] = [];
  root.traverse((o) => {
    const d = o as THREE.Mesh & THREE.Sprite & THREE.Line & THREE.Points;
    if (o.visible && (d.isMesh || d.isSprite || d.isLine || d.isPoints)) {
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === keep) return;
      o.visible = false;
      hidden.push(o);
    }
  });
  return () => {
    for (const o of hidden) o.visible = true;
  };
}

/**
 * Lớp phản hồi chiến đấu ở không gian hiển thị (đọc uniform `postParams`): viền trúng đòn, chớp, khung va chạm, viền `punch`, nhuộm chuyển pha, mực khi chết.
 * Dùng chung cho chuỗi thường và cho Họa Cảnh (`?style=painted`), để `hit()/flash()/impactFrame()/punch()` không mất tác dụng.
 */
function feedbackLayers(rgb: Node, fromCenter: Node): Node {
  let g = rgb;
  // Trúng đòn: viền đỏ ở mép. Chớp: sáng trắng cả màn.
  const edge = smoothstep(0.3, 0.75, length(fromCenter));
  g = vec3(mix(g, vec3(0.75, 0.05, 0.04), edge.mul(postParams.hit).mul(0.55)));
  g = vec3(mix(g, vec3(1, 0.98, 0.94), postParams.flash.mul(0.75)));
  // Khung va chạm: bớt sắc, kéo tương phản mạnh quanh 0,5 rồi ám màu.
  const imp = vec3(mix(vec3(luminance(g)), g, 0.35))
    .sub(0.5)
    .mul(2.4)
    .add(0.5);
  g = vec3(mix(g, clamp(imp.mul(postParams.impactColor), 0, 1), postParams.impact.mul(0.9)));
  const punchEdge = smoothstep(0.22, 0.78, length(fromCenter));
  const punchTone = postParams.punchLight.mul(0.95).add(0.03);
  g = vec3(mix(g, vec3(punchTone, punchTone, punchTone.mul(0.97).add(0.01)), punchEdge.mul(postParams.punch).mul(2.4).min(0.9)));
  // Nhuộm thoáng qua (chuyển pha): giữ độ sáng, đổi sắc vùng tối nhiều hơn vùng sáng.
  const pl = luminance(g);
  g = vec3(mix(g, postParams.pulseColor.mul(pl.mul(1.15).add(0.06)), postParams.pulse.mul(0.65)));

  // Chết (P2-B5): cảnh nhạt màu, tối dần, rồi mực loang từ mép vào giữa theo vân nhiễu 3 tầng. Viền mực đậm hơn lõi.
  g = vec3(mix(g, vec3(luminance(g)).mul(float(1).sub(postParams.inkDesat.mul(0.3))), postParams.inkDesat.mul(0.88)));
  // Một lần lấy mẫu texture nhiễu dùng chung (R/G/B = ba tầng chi tiết) thay cho nhiễu hash 3 tầng mỗi điểm ảnh.
  const inkSample = texture(getCloudNoise(), screenUV.mul(vec2(1.05, 0.78)));
  const inkN = inkSample.r.mul(0.5).add(inkSample.g.mul(0.3)).add(inkSample.b.mul(0.2));
  const inkV = length(fromCenter).mul(1.414).add(inkN.sub(0.5).mul(0.62));
  const inkEdge = float(1.5).sub(postParams.ink.mul(1.75));
  const inkMask = smoothstep(inkEdge.sub(0.05), inkEdge.add(0.1), inkV);
  const inkRim = smoothstep(inkEdge.sub(0.05), inkEdge.add(0.02), inkV).mul(
    float(1).sub(smoothstep(inkEdge.add(0.02), inkEdge.add(0.16), inkV)),
  );
  const inkCol = mix(vec3(0.05, 0.055, 0.07), vec3(0.012, 0.014, 0.022), inkRim.add(inkV.mul(0.25)).min(1));
  // Lõi màn mỏng hơn để còn lờ mờ thấy nhân vật; mép dày đặc.
  const inkBody = mix(float(0.72), float(0.95), smoothstep(0.1, 0.85, length(fromCenter).mul(1.414)));
  g = vec3(mix(g, inkCol, inkMask.mul(inkBody)));
  return g;
}

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
    if (FLAGS.style === 'painted') {
      // Họa Cảnh: pass cuối của painted-valley (Kuwahara, vignette, đường cong họa sĩ, sRGB); không ACES, chỉnh màu, hạt phim, bloom, AO, FXAA
      setBloomActive(false);
      const fromCenterP = screenUV.sub(0.5);
      this.post.outputNode = paintedOutput(scenePass, {
        paint: FLAGS.paint ?? 3,
        exposure: 1,
        vignette: 0.14,
        // phản hồi chiến đấu giữ nguyên (hit/flash/impact/punch/pulse/mực chết); quang sai màu khi trúng đòn lấy mẫu lệch R/B của ảnh gốc
        aberration: postParams.hit.mul(0.012),
        overlay: (g) => feedbackLayers(g, fromCenterP),
      });
      return;
    }
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
    let hdr = vec3(vec3(colorTex.sample(screenUV.add(ca)).r, colorTex.g, colorTex.sample(screenUV.sub(ca)).b).mul(postParams.exposure));
    if (opts.radial) {
      // Nhòe hướng tâm nhẹ: kéo mẫu về phía tâm, mạnh dần ra mép; tâm khung (boss) vẫn nét.
      const dir = fromCenter.mul(postParams.radial.mul(0.07));
      let acc = hdr;
      for (let i = 1; i <= 4; i++) acc = asVec3(acc.add(colorTex.sample(screenUV.sub(dir.mul(i / 4))).rgb.mul(postParams.exposure)));
      const edgeW = smoothstep(0.1, 0.55, length(fromCenter)).mul(postParams.radial.mul(3).min(1));
      hdr = asVec3(mix(hdr, acc.div(5), edgeW));
    }
    if (opts.ao) {
      // GTAO ở nửa độ phân giải: bán kính 1,3 m (nếp gấp, chân tường, gốc cây), tắt dần theo khoảng cách để không bẩn nền xa.
      const aoPass = ao(scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'), this.camera);
      aoPass.resolutionScale = 0.5;
      aoPass.radius.value = 1.3;
      aoPass.thickness.value = 1.2;
      aoPass.scale.value = 1.1;
      this.aoNode = aoPass;
      // Xa quá 70 m GTAO nửa độ phân giải cho vân sọc/ô vuông (độ sâu thưa), nên tắt dần: AO chỉ cần ở gần.
      const aoNear = float(1).sub(smoothstep(60, 140, scenePass.getViewZNode().negate()));
      hdr = hdr.mul(mix(float(1), aoPass.getTextureNode().r, postParams.aoStrength.mul(aoNear)));
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
    g = vec3(feedbackLayers(g, fromCenter));

    const graded = vec4(g, 1);
    let ldrRgb = graded.rgb;
    if (opts.fxaa) {
      this.fxaaInput = rtt(graded, null, null, { type: THREE.UnsignedByteType });
      ldrRgb = vec4(fxaa(this.fxaaInput)).rgb;
    }

    const vig = mix(
      float(1),
      float(1).sub(postParams.vignette),
      smoothstep(postParams.vignetteInner, postParams.vignetteOuter, length(fromCenter).mul(1.414)),
    );
    // Hạt phim + dither (±0,5/255) chống vệt bậc ở trời và sương.
    const seed = screenUV.mul(vec2(1973.1, 2711.7)).add(fract(time.mul(0.37)).mul(101.3));
    const noise = fract(sin(seed.x.mul(12.9898).add(seed.y.mul(78.233))).mul(43758.5453)).sub(0.5);
    const out = ldrRgb.mul(vig).add(noise.mul(postParams.grain.add(1 / 255)));
    this.post.outputNode = vec4(out, 1);
  }

  private static keyOf(o: PostOptions): string {
    return `${o.bloom ? 'b' : 'n'}${o.msaa}${o.fxaa ? 'f' : ''}${o.ao ? 'a' : ''}${o.radial ? 'r' : ''}`;
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

  private impactLeft = 0;

  /** Khung va chạm (V-P0): `frames` khung hình (1–2) tương phản cao, ám `tint`. */
  impactFrame(frames: number, tint: 'ink' | 'warm' | 'cool'): void {
    postParams.impactColor.value.set(tint === 'warm' ? 0xfff0d0 : tint === 'cool' ? 0xd0e8ff : 0xdcdcdc);
    this.impactLeft = Math.max(this.impactLeft, Math.min(2, Math.max(1, Math.round(frames))) + 1);
  }

  /** Chớp tối/sáng ở viền khung hình (VS-1): `amount` 0..0,5 tự tan tuyến tính trong `ms`. */
  punch(amount: number, tone: 'dark' | 'light', ms: number): void {
    postParams.punch.value = Math.max(postParams.punch.value, Math.min(0.5, amount));
    postParams.punchLight.value = tone === 'light' ? 1 : 0;
    this.punchRate = postParams.punch.value / Math.max(0.05, ms / 1000);
  }

  private punchRate = 1;

  /** Mức chớp viền hiện tại (0..0,5), để kiểm tra/đo. */
  punchLevel(): number {
    return postParams.punch.value;
  }

  update(dt: number): void {
    // Đếm theo khung hình thật (không theo dt): đúng 1–2 khung kể cả khi chậm thời gian.
    postParams.impact.value = this.impactLeft > 1 ? 1 : 0;
    if (this.impactLeft > 0) this.impactLeft--;
    if (postParams.punch.value > 0) postParams.punch.value = Math.max(0, postParams.punch.value - dt * this.punchRate);
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
    await this.compileInScene();
  }

  /**
   * Biên dịch trước một nhóm tạm (T5, skin quái/boss vừa nạp): đưa vào cảnh chính đúng lúc phần đồng bộ của `compileAsync`
   * (duyệt cảnh, gửi lệnh biên dịch) chạy, rồi gỡ ra ngay, nên các khung vẽ trong lúc chờ không thấy nhóm tạm. Dùng đúng khóa
   * cache (sương, môi trường). Người gọi không được vẽ mesh dùng các pipeline này tới khi promise xong.
   */
  async compileObject(obj: THREE.Object3D): Promise<void> {
    // Chỉ biên dịch nhóm tạm: ẩn tạm mọi vật vẽ được khác, giữ nguyên Group và đèn (số đèn nằm trong khóa cache).
    const restore = hideRenderables(this.scene, obj);
    this.scene.add(obj);
    let done: Promise<void>;
    try {
      done = this.compileInScene();
    } finally {
      this.scene.remove(obj);
      restore();
    }
    await done;
  }

  private async compileInScene(): Promise<void> {
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
