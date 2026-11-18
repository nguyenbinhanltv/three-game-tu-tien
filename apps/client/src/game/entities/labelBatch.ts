import * as THREE from 'three/webgpu';
import { cameraProjectionMatrix, cameraViewMatrix, instancedBufferAttribute, positionGeometry, texture, uv, vec2, vec3, vec4 } from 'three/tsl';

/**
 * Nhãn tên trên đầu (T8): một atlas chữ dùng chung + **một** `InstancedMesh` (1 draw call cho mọi nhãn),
 * thay cho mỗi nhãn một `CanvasTexture` + một `Sprite`.
 *
 * `Label` là một `Object3D` rỗng (không vẽ gì) giữ vị trí/tỉ lệ trong cây cảnh, nên code gắn nhãn vào model,
 * đổi `visible`, `scale`, `material.opacity` giữ nguyên như khi còn là `Sprite`. Mỗi khung `LABELS.update()` gom các nhãn
 * đang hiện vào instance; ô atlas cấp theo nội dung chữ (nhiều quái cùng tên chung một ô), ô lâu không dùng bị thay.
 */

const CELL_W = 512;
const CELL_H = 128;
const COLS = 4;
const ROWS = 8;
const CAPACITY = 96;

interface LabelSpec {
  text: string;
  color: string;
  sub: string;
  subColor: string;
}

const keyOf = (s: LabelSpec) => `${s.text}\u0001${s.color}\u0001${s.sub}\u0001${s.subColor}`;

export class Label extends THREE.Object3D {
  /** Giữ cùng dạng với `SpriteMaterial` để chỗ gọi cũ (`label.material.opacity`) không phải đổi. */
  readonly material = { opacity: 1 };
  readonly key: string;
  constructor(readonly spec: LabelSpec) {
    super();
    this.key = keyOf(spec);
    this.scale.set(3.6, 0.9, 1);
    this.renderOrder = 5;
  }
}

interface Cell {
  idx: number;
  last: number;
}

const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();

class LabelBatch {
  readonly mesh: THREE.InstancedMesh;
  private labels = new Set<Label>();
  private cells = new Map<string, Cell>();
  private free: number[] = [];
  private a = new Float32Array(CAPACITY * 4);
  private b = new Float32Array(CAPACITY * 4);
  private attrA = new THREE.InstancedBufferAttribute(this.a, 4);
  private attrB = new THREE.InstancedBufferAttribute(this.b, 4);
  private cv: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private tex: THREE.CanvasTexture | null = null;
  private frame = 0;
  /** Số lần vẽ lại ô atlas (đo, kiểm thử). */
  redraws = 0;

  constructor() {
    for (let i = ROWS * COLS - 1; i >= 0; i--) this.free.push(i);
    const A = instancedBufferAttribute(this.attrA, 'vec4'); // tâm xyz (thế giới), rộng (m)
    const B = instancedBufferAttribute(this.attrB, 'vec4'); // u0, v0 của ô, độ mờ
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    const w = A.w;
    const h = w.mul(CELL_H / CELL_W);
    const viewCenter = cameraViewMatrix.mul(vec4(A.xyz, 1)).xyz;
    const corner = positionGeometry.xy; // −0,5..0,5
    mat.vertexNode = cameraProjectionMatrix.mul(vec4(viewCenter.add(vec3(corner.x.mul(w), corner.y.mul(h), 0)), 1));
    // Atlas được dựng lười ở lần `update()` đầu có canvas; trước đó dùng texture rỗng 1×1.
    const placeholder = new THREE.Texture();
    this.texNode = texture(placeholder);
    const cellUv = vec2(B.x.add(uv().x.mul(CELL_W / (COLS * CELL_W))), B.y.add(uv().y.mul(CELL_H / (ROWS * CELL_H))));
    const sample = this.texNode.sample(cellUv);
    mat.colorNode = sample.rgb;
    mat.opacityNode = sample.a.mul(B.z);
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, CAPACITY);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.raycast = () => {};
    this.mesh.visible = false;
  }

  private texNode: ReturnType<typeof texture>;

  add(l: Label): void {
    this.labels.add(l);
  }

  remove(l: Label): void {
    this.labels.delete(l);
  }

  private ensureCanvas(): boolean {
    if (this.cv) return !!this.g;
    if (typeof document === 'undefined') return false;
    const cv = document.createElement('canvas');
    cv.width = COLS * CELL_W;
    cv.height = ROWS * CELL_H;
    const g = cv.getContext('2d');
    this.cv = cv;
    this.g = g;
    if (!g) return false;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.tex = tex;
    this.texNode.value = tex;
    return true;
  }

  private draw(spec: LabelSpec, idx: number): void {
    const g = this.g!;
    const ox = (idx % COLS) * CELL_W;
    const oy = Math.floor(idx / COLS) * CELL_H;
    g.save();
    g.clearRect(ox, oy, CELL_W, CELL_H);
    g.beginPath();
    g.rect(ox, oy, CELL_W, CELL_H);
    g.clip();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const cx = ox + 256;
    const put = (t: string, y: number, font: string, fill: string) => {
      g.font = font;
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(8,12,20,0.85)';
      g.strokeText(t, cx, oy + y);
      g.fillStyle = fill;
      g.fillText(t, cx, oy + y);
    };
    if (spec.sub) {
      put(spec.sub, 34, '600 30px "Segoe UI", Arial, sans-serif', spec.subColor);
      put(spec.text, 88, '700 42px "Segoe UI", Arial, sans-serif', spec.color);
    } else put(spec.text, 72, '700 42px "Segoe UI", Arial, sans-serif', spec.color);
    g.restore();
    this.redraws++;
  }

  /** Ô atlas của nhãn (vẽ nếu chưa có); −1 nếu atlas đầy toàn ô đang dùng khung này. */
  private cellFor(l: Label): number {
    let c = this.cells.get(l.key);
    if (c) {
      c.last = this.frame;
      return c.idx;
    }
    let idx = this.free.pop();
    if (idx === undefined) {
      let oldest: string | null = null;
      let t = this.frame;
      for (const [k, v] of this.cells) {
        if (v.last < t) {
          t = v.last;
          oldest = k;
        }
      }
      if (oldest === null) return -1;
      idx = this.cells.get(oldest)!.idx;
      this.cells.delete(oldest);
    }
    c = { idx, last: this.frame };
    this.cells.set(l.key, c);
    this.draw(l.spec, idx);
    return idx;
  }

  /** Gom nhãn đang hiện vào instance. Gọi mỗi khung sau khi `visible`/`scale`/`opacity` của nhãn đã được đặt. */
  update(): void {
    this.frame++;
    let n = 0;
    let drew = false;
    const before = this.redraws;
    const canDraw = this.ensureCanvas();
    if (canDraw) {
      for (const l of this.labels) {
        if (n >= CAPACITY) break;
        if (!l.visible || l.material.opacity <= 0.02) continue;
        // Sprite không vẽ khi một mức cha bị ẩn (model ngoài tầm, đã bỏ khỏi cảnh).
        let vis = true;
        let root: THREE.Object3D | null = l;
        for (; root && vis; root = root.parent) vis = root.visible;
        if (!vis || !l.parent) continue;
        const idx = this.cellFor(l);
        if (idx < 0) continue;
        l.updateWorldMatrix(true, false);
        l.matrixWorld.decompose(_v, _q, _s);
        const i = n++ * 4;
        this.a[i] = _v.x;
        this.a[i + 1] = _v.y;
        this.a[i + 2] = _v.z;
        this.a[i + 3] = _s.x;
        this.b[i] = (idx % COLS) / COLS;
        // CanvasTexture lật trục V: hàng 0 nằm ở đỉnh ảnh.
        this.b[i + 1] = 1 - (Math.floor(idx / COLS) + 1) / ROWS;
        this.b[i + 2] = l.material.opacity;
      }
      drew = this.redraws !== before;
    }
    if (drew && this.tex) this.tex.needsUpdate = true;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    const len = n * 4;
    this.attrA.clearUpdateRanges();
    this.attrA.addUpdateRange(0, len);
    this.attrA.needsUpdate = true;
    this.attrB.clearUpdateRanges();
    this.attrB.addUpdateRange(0, len);
    this.attrB.needsUpdate = true;
  }
}

export const LABELS = new LabelBatch();

/** Nhãn mới (chưa gắn vào cảnh). Thay cho `makeLabel` dựng `Sprite` cũ. */
export function createLabel(text: string, color = '#ffffff', sub = '', subColor = '#ffd98a'): Label {
  const l = new Label({ text, color, sub, subColor });
  LABELS.add(l);
  return l;
}

export function releaseLabel(l: Label): void {
  LABELS.remove(l);
}
