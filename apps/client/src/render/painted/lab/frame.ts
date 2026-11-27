import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { createPaintedWide, paintedOutput } from '../frame';

/**
 * Khung hình của cảnh thử: cảnh HDR (MSAA 4) qua `paintedOutput` (render/painted/frame.ts, dịch từ painted-valley/src/lib/frame.js).
 * Bloom bỏ qua (ngưỡng 1,5 không chạm cỏ/hoa); viền mực chỉ cho nhân vật (bước P7).
 */
export interface FrameOpts {
  paint: number;
  exposure: number;
  vignette: number;
  samples: number;
}

export function createFrame(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, o: FrameOpts) {
  const post = new THREE.PostProcessing(renderer);
  post.outputColorTransform = false;
  const scenePass = pass(scene, camera, { samples: o.samples });
  // Bút rộng ở pass riêng như game (B6).
  const wide = o.paint >= 1.5 ? createPaintedWide(scenePass) : null;
  post.outputNode = paintedOutput(scenePass, wide ? { ...o, wide: (uv) => wide.sample(uv) } : o);
  return {
    render(): void {
      wide?.resize(renderer);
      post.render();
    },
    /** Vẽ khung cuối vào một render target (để đọc ảnh bằng readback thay vì chụp màn hình: chụp treo khi khung nặng). */
    renderTo(target: THREE.RenderTarget): void {
      wide?.resize(renderer);
      renderer.setRenderTarget(target);
      post.render();
      renderer.setRenderTarget(null);
    },
    dispose(): void {
      wide?.dispose();
      post.dispose?.();
    },
  };
}
