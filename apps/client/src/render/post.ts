import * as THREE from 'three/webgpu';
import { float, length, mix, mrt, output, pass, renderOutput, rtt, screenUV, smoothstep, uniform, vec4 } from 'three/tsl';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import type { Node } from 'three/webgpu';

/**
 * Post-processing chung: cảnh (HDR) → bloom chọn lọc → tone mapping + sRGB → vignette nhẹ.
 *
 * Bloom chọn lọc: cảnh ghi thêm một đích MRT `bloom` (8 bit). Vật thường ghi 0 (và che những gì sau
 * nó); material đã gọi `markBloom()` (VFX, linh quang, cổng) ghi màu × cường độ. Đích này được blur
 * Gauss 2 pass ở 1/4 độ phân giải rồi cộng vào ảnh HDR, nên chỉ những vật đó phát quang, cả cảnh
 * không nhòe. Chi phí: thêm 3 pass toàn màn hình (blur ngang, blur dọc, ghép). Không dùng `BloomNode`
 * của three vì chuỗi mip của nó tốn 12 pass, vượt ngân sách draw call ở cảnh ít vật.
 *
 * Preset Thấp không dùng post-processing: vẽ thẳng ra canvas như trước (tone mapping của renderer,
 * không bloom, không vignette), không tốn thêm render target hay pass nào.
 *
 * Khử răng cưa nằm trong pipeline, không ở canvas (renderer tạo với `antialias: false`, vì ở chế độ
 * post canvas chỉ nhận một quad toàn màn hình):
 * - Vừa: pass cảnh không MSAA, FXAA trên ảnh đã tone map (thêm 1 pass, buffer trung gian 8 bit).
 * - Cao: pass cảnh MSAA 4x. WebGPU chỉ có 1 hoặc 4 mẫu (three tự nâng 2 lên 4), nên không có mức 2x.
 * Màu cảnh giữ HalfFloat vì ACES cần giá trị > 1 trước tone mapping; đích bloom là 8 bit.
 * Bộ nhớ ước tính theo preset: xem mô tả PR #9 và skill perf-budget.
 */
export const postParams = {
  bloomStrength: uniform(1.6),
  /** Độ rộng kernel Gauss (texel ở 1/4 độ phân giải). Đổi sau khi tạo pipeline không có tác dụng. */
  bloomSigma: 5,
  bloomScale: 0.25,
  /** Độ tối ở góc (0 = tắt). */
  vignette: uniform(0.16),
  /** Bán kính (theo UV, tâm 0,5) bắt đầu và kết thúc vùng tối. */
  vignetteInner: uniform(0.38),
  vignetteOuter: uniform(0.85),
};

/** Đích bloom là 8 bit để đỡ bộ nhớ (MSAA nhân 4): lưu giá trị / BLOOM_RANGE, ghép thì nhân lại. */
const BLOOM_RANGE = 4;

/**
 * Đánh dấu material được phát quang khi có bloom. Gọi trước lần vẽ đầu tiên của material.
 * Với vật cộng sáng, giữ màu gốc ≤ 1; độ lóa do `strength` (0..4, khuyến nghị 0.5–2.5) quyết định.
 */
export function markBloom(material: THREE.Material, strength = 1): void {
  (material as unknown as { mrtNode: Node }).mrtNode = mrt({ bloom: vec4(output.rgb.mul(strength / BLOOM_RANGE), output.a) });
}

export interface PostOptions {
  /** false = không post-processing (preset Thấp). */
  bloom: boolean;
  /** Số mẫu MSAA của pass cảnh: 0 hoặc 4. */
  msaa: number;
  /** FXAA ở pass cuối (dùng khi msaa = 0). */
  fxaa: boolean;
}

export class PostPipeline {
  readonly bloom: boolean;
  private readonly key: string;
  private renderer: THREE.WebGPURenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private post: THREE.PostProcessing | null = null;
  private scenePass: ReturnType<typeof pass> | null = null;
  private blurNode: ReturnType<typeof gaussianBlur> | null = null;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, opts: PostOptions) {
    this.bloom = opts.bloom;
    this.key = PostPipeline.keyOf(opts);
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    if (!opts.bloom) return;

    this.post = new THREE.PostProcessing(renderer);
    this.post.outputColorTransform = false;
    const scenePass = pass(scene, camera, { samples: opts.msaa });
    this.scenePass = scenePass;
    scenePass.setMRT(mrt({ output, bloom: vec4(0, 0, 0, output.a) }));
    scenePass.getTexture('bloom').type = THREE.UnsignedByteType;
    const color = scenePass.getTextureNode('output');
    this.blurNode = gaussianBlur(scenePass.getTextureNode('bloom'), null, postParams.bloomSigma);
    this.blurNode.resolution.setScalar(postParams.bloomScale);
    const hdr = color.add(vec4(this.blurNode.rgb.mul(postParams.bloomStrength.mul(BLOOM_RANGE)), 0));

    // Tone mapping + chuyển sRGB theo cài đặt của renderer, rồi vignette trên ảnh đã hiển thị.
    const toned = renderOutput(hdr);
    const ldr = opts.fxaa ? vec4(fxaa(rtt(toned, null, null, { type: THREE.UnsignedByteType }))) : vec4(toned);
    const d = length(screenUV.sub(0.5));
    const shade = mix(float(1), float(1).sub(postParams.vignette), smoothstep(postParams.vignetteInner, postParams.vignetteOuter, d));
    this.post.outputNode = vec4(ldr.rgb.mul(shade), ldr.a);
  }

  private static keyOf(o: PostOptions): string {
    return o.bloom ? `b${o.msaa}${o.fxaa ? 'f' : ''}` : 'off';
  }

  /** Pipeline hiện tại có đúng cấu hình `opts` không (để biết có cần dựng lại khi đổi preset). */
  matches(opts: PostOptions): boolean {
    return this.key === PostPipeline.keyOf(opts);
  }

  render(): void {
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.blurNode?.dispose();
    this.scenePass?.dispose();
    this.post?.dispose();
  }
}
