import * as THREE from 'three/webgpu';
import { float, length, mix, mrt, output, pass, renderOutput, screenUV, smoothstep, uniform, vec4 } from 'three/tsl';
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
  bloom: boolean;
}

export class PostPipeline {
  readonly bloom: boolean;
  private renderer: THREE.WebGPURenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private post: THREE.PostProcessing | null = null;
  private scenePass: ReturnType<typeof pass> | null = null;
  private blurNode: ReturnType<typeof gaussianBlur> | null = null;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, opts: PostOptions) {
    this.bloom = opts.bloom;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    if (!opts.bloom) return;

    this.post = new THREE.PostProcessing(renderer);
    this.post.outputColorTransform = false;
    const scenePass = pass(scene, camera);
    this.scenePass = scenePass;
    scenePass.setMRT(mrt({ output, bloom: vec4(0, 0, 0, output.a) }));
    scenePass.getTexture('bloom').type = THREE.UnsignedByteType;
    const color = scenePass.getTextureNode('output');
    this.blurNode = gaussianBlur(scenePass.getTextureNode('bloom'), null, postParams.bloomSigma);
    this.blurNode.resolution.setScalar(postParams.bloomScale);
    const hdr = color.add(vec4(this.blurNode.rgb.mul(postParams.bloomStrength.mul(BLOOM_RANGE)), 0));

    // Tone mapping + chuyển sRGB theo cài đặt của renderer, rồi vignette trên ảnh đã hiển thị.
    const ldr = renderOutput(hdr);
    const d = length(screenUV.sub(0.5));
    const shade = mix(float(1), float(1).sub(postParams.vignette), smoothstep(postParams.vignetteInner, postParams.vignetteOuter, d));
    this.post.outputNode = vec4(ldr.rgb.mul(shade), ldr.a);
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
