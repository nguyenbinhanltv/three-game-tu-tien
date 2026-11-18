// Xem trước nhân vật 3D trong bảng nhân vật (TD-C): vẽ model người chơi (mặc đúng đồ) vào một render target nhỏ bằng
// renderer chính (không dựng thiết bị GPU thứ hai), đọc điểm ảnh về canvas 2D của bảng. Chỉ vẽ khi bảng mở và có
// canvas gắn vào (~30 khung/giây), đóng bảng thì giải phóng model và render target. Quá ngân sách CPU thì tự tắt
// để bảng lùi về hình bóng 2D (`onFail`).
import * as THREE from 'three/webgpu';
import type { CharacterView } from '../character/view';

/** Rộng phải là bội số của 64: WebGPU đọc texture theo hàng căn 256 byte (three không bù phần đệm). */
export const PREVIEW_W = 256;
export const PREVIEW_H = 352;
/** Khung hình/giây của xem trước. */
const PREVIEW_FPS = 30;
/** Quá mức này (ms CPU trung bình mỗi lần vẽ, tính trên cửa sổ `BUDGET_WINDOW` lần) thì lùi về chân dung 2D. */
const PREVIEW_BUDGET_MS = 3;
const BUDGET_WINDOW = 60;
const WARMUP = 6;
/** Tuyến tính → sRGB cho 8 bit: render target không có định dạng sRGB (three không đọc được lại), nên mã hóa lúc chép sang canvas. */
const SRGB = new Uint8ClampedArray(256).map((_, i) => {
  const c = i / 255;
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
});
const IDLE = { speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false } as const;

interface PreviewHost {
  renderer: THREE.WebGPURenderer;
  /** Dựng model theo ngoại hình hiện tại của mình. `key` đổi khi ngoại hình đổi; `pending` = asset còn nạp. */
  build(): { model: CharacterView; key: string; pending: boolean };
  /** Khóa ngoại hình hiện tại (rẻ), để biết có phải dựng lại không. */
  lookKey(): string;
  /** Bộ đệm đọc về đang ngược chiều dọc (backend WebGL2). */
  flipRead: boolean;
  /** Cấp phát sáng kiếm (0, 1, 2) theo cường hóa của pháp kiếm đang mặc. */
  weaponGlow(): number;
}

/** Số liệu đo lần vẽ gần nhất (cho bench). */
interface PreviewStats {
  frames: number;
  avgMs: number;
  drawCalls: number;
  triangles: number;
  textureBytes: number;
}

export class CharPreview {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, PREVIEW_W / PREVIEW_H, 0.1, 40);
  private rt: THREE.RenderTarget | null = null;
  private model: CharacterView | null = null;
  private key = '';
  private pending = false;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private img: ImageData | null = null;
  private acc = 0;
  private checkAcc = 0;
  private reading = false;
  private yaw = 0.5;
  private ms = 0;
  private n = 0;
  private failed = false;
  readonly stats: PreviewStats = { frames: 0, avgMs: 0, drawCalls: 0, triangles: 0, textureBytes: 0 };
  /** Gọi khi vượt ngân sách và đã tắt. */
  onFail: (() => void) | null = null;

  constructor(private host: PreviewHost) {
    const key = new THREE.DirectionalLight(0xfff0d6, 2.6);
    key.position.set(2.2, 3.2, 3.4);
    const rim = new THREE.DirectionalLight(0x8fd4ff, 1.5);
    rim.position.set(-3, 2, -2.5);
    const fill = new THREE.HemisphereLight(0xcfe3ff, 0x2a2420, 1.1);
    this.scene.add(key, rim, fill);
  }

  get active(): boolean {
    return !!this.canvas && !this.failed;
  }

  get hasFailed(): boolean {
    return this.failed;
  }

  /** Gắn canvas 2D của bảng; từ đây `tick` mới vẽ. */
  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    canvas.width = PREVIEW_W;
    canvas.height = PREVIEW_H;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false });
    this.img = this.ctx?.createImageData(PREVIEW_W, PREVIEW_H) ?? null;
    this.failed = false;
    this.ms = 0;
    this.n = 0;
    this.acc = 1;
  }

  /** Bảng đóng: bỏ model và render target. */
  detach(): void {
    this.canvas = null;
    this.ctx = null;
    this.img = null;
    this.dropModel();
    this.rt?.dispose();
    this.rt = null;
  }

  dispose(): void {
    this.detach();
  }

  /** Kéo chuột để xoay (px ngang). */
  rotate(dx: number): void {
    this.yaw += dx * 0.012;
    this.acc = 1; // vẽ ngay khung kế
  }

  private dropModel(): void {
    if (!this.model) return;
    this.scene.remove(this.model.root);
    this.model.dispose();
    this.model = null;
    this.key = '';
  }

  private rebuild(): void {
    this.dropModel();
    const b = this.host.build();
    this.model = b.model;
    this.key = b.key;
    this.pending = b.pending;
    this.model.root.rotation.y = this.yaw;
    this.scene.add(this.model.root);
    this.model.setView?.({ dist: 0, inView: true, allowLod0: true, self: true });
    const h = this.model.height;
    const fov = (this.camera.fov * Math.PI) / 180;
    const d = (h * 0.5) / Math.tan(fov / 2);
    this.camera.position.set(0, h * 0.54, d);
    this.camera.lookAt(0, h * 0.5, 0);
    this.camera.updateMatrixWorld();
  }

  /** Mỗi khung của game, sau khi cảnh chính đã vẽ xong. */
  tick(dt: number): void {
    if (!this.active || !this.canvas || !this.img || !this.ctx) return;
    this.acc += dt;
    this.checkAcc += dt;
    if (this.checkAcc > 0.5) {
      this.checkAcc = 0;
      if (!this.model || this.host.lookKey() !== this.key || (this.pending && this.host.lookKey() === this.key && this.stillPending()))
        this.rebuild();
    }
    if (!this.model) {
      this.rebuild();
    }
    if (this.acc < 1 / PREVIEW_FPS - 0.002) return;
    const step = Math.min(this.acc, 0.1);
    this.acc = 0;
    const t0 = performance.now();
    const m = this.model!;
    m.root.rotation.y = this.yaw;
    m.setWeaponGlow?.(this.host.weaponGlow());
    m.update(step, IDLE);
    this.scene.updateMatrixWorld();
    this.renderToTarget();
    const cost = performance.now() - t0;
    // Vài khung đầu biên dịch pipeline (một lần): không tính vào ngân sách.
    if (this.stats.frames <= WARMUP) return;
    this.ms += cost;
    if (++this.n >= BUDGET_WINDOW) {
      this.stats.avgMs = this.ms / this.n;
      if (this.stats.avgMs > PREVIEW_BUDGET_MS) {
        console.warn('[preview] vượt ngân sách CPU', this.stats.avgMs.toFixed(2), 'ms: lùi về hình 2D');
        this.failed = true;
        this.detach();
        this.onFail?.();
        return;
      }
      this.ms = 0;
      this.n = 0;
    }
  }

  private stillPending(): boolean {
    // `build` trả pending theo trạng thái lúc dựng; hỏi lại bằng cách dựng thử là tốn, nên chỉ dựng lại khi key đổi hoặc định kỳ khi còn pending.
    return this.pending;
  }

  private renderToTarget(): void {
    const r = this.host.renderer;
    if (!this.rt) {
      this.rt = new THREE.RenderTarget(PREVIEW_W, PREVIEW_H, { type: THREE.UnsignedByteType, depthBuffer: true, samples: 0 });
    }
    const prevRT = r.getRenderTarget();
    const prevAlpha = r.getClearAlpha();
    const prevColor = r.getClearColor(new THREE.Color() as never) as unknown as THREE.Color;
    const info = r.info.render;
    const dc0 = info.drawCalls ?? info.calls;
    const tri0 = info.triangles;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prevRT);
    r.setClearColor(prevColor, prevAlpha);
    this.stats.drawCalls = (info.drawCalls ?? info.calls) - dc0;
    this.stats.triangles = info.triangles - tri0;
    this.stats.textureBytes = PREVIEW_W * PREVIEW_H * 4 * 5; // màu MSAA 4x + resolve + độ sâu: ước lượng
    this.stats.frames++;
    this.readBack();
  }

  private readBack(): void {
    if (this.reading || !this.rt) return;
    this.reading = true;
    const rt = this.rt;
    void this.host.renderer
      .readRenderTargetPixelsAsync(rt, 0, 0, PREVIEW_W, PREVIEW_H)
      .then((buf) => {
        if (!this.canvas || !this.ctx || !this.img || this.rt !== rt) return;
        const src = buf as Uint8Array;
        const dst = this.img.data;
        const row = PREVIEW_W * 4;
        // WebGL đọc từ đáy lên, WebGPU từ đỉnh xuống.
        const flip = this.host.flipRead;
        for (let y = 0; y < PREVIEW_H; y++) {
          const sy = flip ? PREVIEW_H - 1 - y : y;
          const o = sy * row;
          const d = y * row;
          for (let x = 0; x < row; x += 4) {
            dst[d + x] = SRGB[src[o + x]];
            dst[d + x + 1] = SRGB[src[o + x + 1]];
            dst[d + x + 2] = SRGB[src[o + x + 2]];
            dst[d + x + 3] = src[o + x + 3];
          }
        }
        this.ctx.putImageData(this.img, 0, 0);
      })
      .catch((err) => {
        console.warn('[preview] đọc điểm ảnh lỗi: lùi về hình 2D', String((err as Error)?.message ?? err));
        this.failed = true;
        this.detach();
        this.onFail?.();
      })
      .finally(() => {
        this.reading = false;
      });
  }

  /** Số liệu cho bench / debug. */
  snapshot(): PreviewStats {
    return { ...this.stats };
  }
}
