import * as THREE from 'three/webgpu';
import { heightAt, SECT } from '@dtl/shared';
import { applyAtmosphere, createLanternHalos, setHeightFog } from '../../render/atmosphere';
import { GRADING, GRADING_DEFAULT } from '../../render/grading';
import { adoptGltfMaterials } from '../../render/materials/world';
import { applyGrading, budgetPixelRatio, PostPipeline } from '../../render/post';
import { get } from '../../ui/store';
import { type AssetHandle, assets } from '../core/assets';
import { Environment } from './env';
import { MODEL_MAT } from '../core/models';
import { buildSect, SECT_LANTERNS } from './sect';
import { Terrain } from './terrain';
import { FLAGS } from '../../base/flags';

/**
 * Cảnh nền màn tiêu đề: thế giới thủ tục sẵn có (trời, mây, địa hình, Lạc Kiếm Tông dựng bằng
 * code) với camera lượn chậm quanh sơn môn. Không chờ GLB; `arch_sect` nạp song song qua
 * AssetCache và giữ handle tới lúc dispose để Game dùng lại bản đã nạp.
 *
 * Renderer riêng, sống từ màn đăng nhập tới khi vào game. Cùng chuỗi chỉnh màu/hậu kỳ với game
 * (M1-6) nhưng không đổ bóng; nhẹ hơn theo preset chất lượng. Không dispose MODEL_MAT (dùng chung).
 */
export class TitleBackdrop {
  private renderer: THREE.WebGPURenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
  private terrain: Terrain | null = null;
  private env: Environment | null = null;
  private post: PostPipeline | null = null;
  private halos: THREE.Mesh | null = null;
  /** Preset "thấp" thì bỏ bloom/FXAA/sương độ cao và giữ pixel ratio 1. */
  private low = get().quality === 'low';
  private sectMesh: THREE.Mesh | null = null;
  private sectAsset: { handle: AssetHandle; mats: THREE.Material[] } | null = null;
  private focus = new THREE.Vector3(SECT.x, SECT.y + 24, SECT.z);
  private angle = 2.3;
  private last = 0;
  private frames = 0;
  private disposed = false;
  /**
   * Trạng thái tạm dừng ghi nhận cả khi `start()` còn chờ `renderer.init()`: đăng nhập nhanh
   * (`?auto=`) có thể chuyển sang phase loading trước khi init xong, lúc đó không được chạy vòng vẽ.
   */
  private paused = false;
  private onResize = () => this.resize();

  /** `onReady` gọi một lần khi địa hình quanh sơn môn đã dựng xong và đã vẽ vài khung. */
  constructor(
    private container: HTMLElement,
    private onReady: () => void,
  ) {}

  async start(): Promise<void> {
    const forceWebGL = FLAGS.renderer === 'webgl2';
    // Khử răng cưa do PostPipeline lo (giống engine), MSAA ở canvas chỉ tốn bộ nhớ.
    const r = new THREE.WebGPURenderer({ antialias: false, forceWebGL });
    await r.init();
    if (this.disposed) {
      r.dispose();
      return;
    }
    this.renderer = r;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.domElement.className = 'ts-canvas';
    this.container.appendChild(r.domElement);

    this.env = new Environment(this.scene, false);
    this.terrain = new Terrain();
    this.scene.add(this.terrain.group);
    this.sectMesh = new THREE.Mesh(buildSect(), MODEL_MAT);
    this.sectMesh.frustumCulled = false;
    this.scene.add(this.sectMesh);
    applyAtmosphere(this.scene, this.env, GRADING[GRADING_DEFAULT], GRADING_DEFAULT);
    applyGrading(GRADING[GRADING_DEFAULT]);
    setHeightFog(!this.low);
    this.env.setQuality(this.low ? 'low' : 'medium');
    this.halos = createLanternHalos(SECT_LANTERNS);
    this.scene.add(this.halos);
    this.post = new PostPipeline(r, this.scene, this.camera, { bloom: !this.low, msaa: 0, fxaa: !this.low });
    this.resize();
    window.addEventListener('resize', this.onResize);
    if (!this.paused) this.resume();
    void this.loadSectModel();
  }

  /** Ngừng vẽ (giữ khung cuối trên canvas), ví dụ khi Game đang dựng thế giới. */
  pause(): void {
    this.paused = true;
    this.renderer?.setAnimationLoop(null);
  }

  /** Chạy lại vòng vẽ; gọi trước khi `start()` xong thì chỉ ghi nhận, `start()` sẽ tự chạy. */
  resume(): void {
    this.paused = false;
    if (!this.renderer || !this.post || this.disposed) return;
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    this.renderer?.setAnimationLoop(null);
    this.terrain?.dispose();
    this.sectMesh?.geometry.dispose();
    this.halos?.geometry.dispose();
    (this.halos?.material as THREE.Material | undefined)?.dispose();
    this.post?.dispose();
    this.post = null;
    this.sectAsset?.handle.release();
    for (const m of this.sectAsset?.mats ?? []) m.dispose();
    this.sectAsset = null;
    this.renderer?.domElement.remove();
    this.renderer?.dispose();
    this.renderer = null;
  }

  private async loadSectModel(): Promise<void> {
    try {
      await assets.attach(this.renderer!);
      const handle = await assets.acquire('arch_sect', { pos: { x: SECT.x, z: SECT.z } });
      if (this.disposed) {
        handle.release();
        return;
      }
      this.sectAsset = { handle, mats: adoptGltfMaterials(handle.scene) };
      handle.scene.position.set(SECT.x, SECT.y, SECT.z);
      handle.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.frustumCulled = false;
      });
      this.scene.add(handle.scene);
      if (this.sectMesh) {
        const old = this.sectMesh.geometry;
        this.sectMesh.geometry = buildSect(false);
        old.dispose();
      }
    } catch (e) {
      console.warn('[title] không tải được arch_sect, giữ kiến trúc dựng bằng code:', e);
    }
  }

  private resize(): void {
    if (!this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(budgetPixelRatio(w, h, this.low ? 1 : 1.5, this.low ? 2e6 : 4e6));
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Dời khung nhìn để sơn môn nằm giữa tiêu đề và thẻ đăng nhập (thẻ chiếm phần dưới màn hình).
    this.camera.setViewOffset(w, h, 0, h * 0.07, w, h);
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // Lượn rất chậm quanh sơn môn, hơi nhấp nhô như đang ngự kiếm ngắm cảnh.
    this.angle += dt * 0.018;
    const R = 205;
    const x = SECT.x + Math.cos(this.angle) * R;
    const z = SECT.z + Math.sin(this.angle) * R;
    const y = Math.max(heightAt(x, z) + 18, SECT.y + 30) + Math.sin(now * 0.00025) * 3;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.focus);
    this.terrain!.update(SECT.x, SECT.z, 4);
    this.env!.update(dt, this.camera, this.focus);
    this.post!.update(dt);
    this.post!.render();
    if (this.terrain!.ready && ++this.frames === 4) this.onReady();
  }
}
