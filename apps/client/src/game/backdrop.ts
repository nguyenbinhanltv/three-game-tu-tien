import * as THREE from 'three/webgpu';
import { heightAt, SECT } from '@dtl/shared';
import { type AssetHandle, assets } from './assets';
import { Environment } from './env';
import { MODEL_MAT } from './models';
import { buildSect } from './sect';
import { Terrain } from './terrain';

/**
 * Cảnh nền màn tiêu đề: thế giới thủ tục sẵn có (trời, mây, địa hình, Lạc Kiếm Tông dựng bằng
 * code) với camera lượn chậm quanh sơn môn. Không chờ GLB; `arch_sect` nạp song song qua
 * AssetCache và giữ handle tới lúc dispose để Game dùng lại bản đã nạp.
 *
 * Renderer riêng, sống từ màn đăng nhập tới khi vào game. Không dispose MODEL_MAT (dùng chung).
 */
export class TitleBackdrop {
  private renderer: THREE.WebGPURenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
  private terrain: Terrain | null = null;
  private env: Environment | null = null;
  private sectMesh: THREE.Mesh | null = null;
  private sectAsset: { handle: AssetHandle; mat: THREE.Material } | null = null;
  private focus = new THREE.Vector3(SECT.x, SECT.y + 24, SECT.z);
  private angle = 2.3;
  private last = 0;
  private frames = 0;
  private disposed = false;
  private onResize = () => this.resize();

  /** `onReady` gọi một lần khi địa hình quanh sơn môn đã dựng xong và đã vẽ vài khung. */
  constructor(
    private container: HTMLElement,
    private onReady: () => void,
  ) {}

  async start(): Promise<void> {
    const forceWebGL = new URLSearchParams(location.search).get('renderer') === 'webgl2';
    const r = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
    await r.init();
    if (this.disposed) {
      r.dispose();
      return;
    }
    this.renderer = r;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
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
    this.resize();
    window.addEventListener('resize', this.onResize);
    this.last = performance.now();
    this.resume();
    void this.loadSectModel();
  }

  /** Ngừng vẽ (giữ khung cuối trên canvas), ví dụ khi Game đang dựng thế giới. */
  pause(): void {
    this.renderer?.setAnimationLoop(null);
  }

  resume(): void {
    if (!this.renderer || this.disposed) return;
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
    this.sectAsset?.handle.release();
    this.sectAsset?.mat.dispose();
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
      const mat = MODEL_MAT.clone();
      mat.side = THREE.DoubleSide;
      this.sectAsset = { handle, mat };
      handle.scene.position.set(SECT.x, SECT.y, SECT.z);
      handle.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = mat;
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
    this.renderer!.render(this.scene, this.camera);
    if (this.terrain!.ready && ++this.frames === 4) this.onReady();
  }
}
