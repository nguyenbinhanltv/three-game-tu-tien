import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import dracoJsUrl from 'three/addons/libs/draco/draco_wasm_wrapper.js?url';
import dracoWasmUrl from 'three/addons/libs/draco/draco_decoder.wasm?url';
import { POSES } from '@dtl/content';
import { POSE_FLY, POSE_SWORD_DRAW, POSE_SWORD_SHEATHE, POSE_SWORD_SWAP } from '@dtl/shared';
import {
  type HiresApplied,
  type Manifest,
  assetBaseUrl,
  createGltfLoader,
  createKtx2Loader,
  detectKtx2Support,
  localLibsManager,
  revertHiresApplied,
  swapHiresTexture,
} from '../game/core/assets';
import { mergeClips, retargetClips } from '../game/character/animLib';
import { pelvisScaledClips } from '../game/character/mannequinMonster';
import { bakePose, formatProbe, IkRig, poseClipName } from '../game/character/ikpose';
import { isSkillViewer } from '../game/core/testParams';
import { buildFixtureSword, buildMixamoFixture } from '../game/character/mixamoFixture';
import { partExtras, stripPartTracks, SwordSocket, swordSocketDef } from '../game/character/sword';
import { BoneLines, makeGrid } from './helpers';
import { collectStats, type ModelStats } from './stats';
import { currentSearch, urlParams } from '../base/flags';

/** Chiều cao người chuẩn để so tỉ lệ (m). */
export const HUMAN_HEIGHT = 1.7;
/** Khoảng cách từ người chuẩn tới mép model (m). */
const GAP = 0.8;

export interface LoadedInfo {
  name: string;
  fileBytes: number;
  clips: { name: string; duration: number }[];
  extensions: string[];
  stats: ModelStats;
}

export interface FrameInfo {
  drawCalls: number;
  triangles: number;
  fps: number;
  backend: string;
}

/** Clip pose có kiếm trong tay (viewer): mọi pose trừ ngự kiếm và tĩnh tọa (rút/tra xét riêng theo thời điểm). */
const SWORD_IN_HAND = new Set(POSES.filter((p) => p.id !== POSE_FLY && p.id !== 'tam_thien').map((p) => poseClipName(p.id)));

/**
 * Cảnh xem asset: sân lát đá, người chuẩn 1,7m, ánh sáng trung tính, OrbitControls.
 * Không phụ thuộc engine game; chỉ được nạp qua dynamic import từ main.tsx.
 */
export class ViewerScene {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 2000);
  private controls!: OrbitControls;
  private loader!: GLTFLoader;
  private ktx2!: ReturnType<typeof createKtx2Loader>;
  private hiresApplied: HiresApplied[] = [];
  private sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  private human = buildHuman();
  private ground = new THREE.Group();
  private model: THREE.Object3D | null = null;
  private skeleton: BoneLines | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private clips: THREE.AnimationClip[] = [];
  private action: THREE.AnimationAction | null = null;
  private clock = new THREE.Clock();
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 0;
  private wireframe = false;
  /** Kiếm tách sang xương riêng (M3-2) của asset đang xem: đổi lưng ↔ tay theo clip đang phát. */
  private sword: SwordSocket | null = null;
  /** Socket của model đang nạp (tạo lúc nướng pose, gán sau khi `show` dọn model cũ). */
  private nextSword: SwordSocket | null = null;
  /** Rig IK của model đang xem (chỉ ở chế độ pose), dùng cho đầu dò số. */
  private ikRig: IkRig | null = null;
  private nextRig: IkRig | null = null;
  speed = 1;
  paused = false;
  /** Tịnh tiến model theo travelDir (mặc định hướng mặt +Z) theo thời gian clip, m/s (K-3: đúng tốc độ nền của clip đi lại thì chân trụ đứng yên so với đất). */
  travel = 0;
  travelDir = new THREE.Vector3(0, 0, 1);
  private travelBase = new THREE.Vector3();
  private marks = new THREE.Group();

  constructor(private host: HTMLElement) {
    const params = urlParams();
    this.renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: params.get('renderer') === 'webgl2' });
  }

  async init(): Promise<void> {
    const r = this.renderer;
    await r.init();
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.domElement.className = 'viewer-canvas';
    this.host.appendChild(r.domElement);

    this.scene.background = new THREE.Color(0xc9d3d8);
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x5a5048, 1.1));
    this.sun.position.set(6, 10, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target, this.human, this.ground);
    this.buildGround(12);

    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    // Giữ camera trên mặt sân; nhìn từ dưới lên chỉ thấy mặt sau của sàn.
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.frameBounds(new THREE.Box3().setFromObject(this.human));

    // Cùng cấu hình loader với game (Meshopt + KTX2, transcoder cục bộ). Viewer thêm Draco để mở GLB ngoài pipeline.
    // Decoder/transcoder lấy từ node_modules qua URL do Vite sinh, không chép vào public/.
    const manager = localLibsManager({ 'draco_wasm_wrapper.js': dracoJsUrl, 'draco_decoder.wasm': dracoWasmUrl });
    const ktx2 = createKtx2Loader(manager);
    await detectKtx2Support(ktx2, r);
    this.ktx2 = ktx2;
    const draco = new DRACOLoader(manager).setDecoderPath('/libs/').setDecoderConfig({ type: 'wasm' });
    this.loader = createGltfLoader(ktx2).setDRACOLoader(draco);

    window.addEventListener('resize', this.onResize);
    this.onResize();
    r.setAnimationLoop(() => this.frame());
  }

  get backend(): string {
    const b = (this.renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
    return b?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  }

  /**
   * Công cụ so ảnh texture tải dần (kịch bản `hires`, nay ở `tools/perf/archive/scenarios/`): bật/tắt bậc texture cao của asset `id` (mục `hires` trong manifest)
   * trên model đang xem. Trả số texture đã thay.
   */
  async setHires(id: string, on: boolean): Promise<number> {
    for (const a of this.hiresApplied) revertHiresApplied(a);
    this.hiresApplied = [];
    if (!on || !this.model) return 0;
    const res = await fetch(`${assetBaseUrl()}manifest.json`, { cache: 'no-cache' });
    const list = ((await res.json()) as Manifest).assets[id]?.hires ?? [];
    for (const h of list) {
      const tex = await this.ktx2.loadAsync(assetBaseUrl() + h.file);
      const a = swapHiresTexture(this.model, h, tex);
      if (a) this.hiresApplied.push(a);
      else tex.dispose();
    }
    return this.hiresApplied.length;
  }

  /** Nạp GLB/GLTF theo URL (cùng origin). Đường dẫn texture ngoài tính theo thư mục của URL. */
  async loadUrl(url: string, libUrls: string[] = []): Promise<LoadedInfo> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    const buf = await res.arrayBuffer();
    return this.loadBuffer(buf, url.slice(url.lastIndexOf('/') + 1), url.slice(0, url.lastIndexOf('/') + 1), libUrls);
  }

  /** `libUrls`: thư viện clip chung (anim_human_base, anim_human_k3; `native:` + anim_ual_native cho model Mannequin); clip retarget sang model, clip riêng của model thắng khi trùng tên. */
  async loadBuffer(buf: ArrayBuffer, name: string, path = '', libUrls: string[] = []): Promise<LoadedInfo> {
    const gltf: GLTF = await this.loader.parseAsync(buf, path);
    let lib: THREE.AnimationClip[] = [];
    for (const spec of libUrls) {
      // `native:<url>`: thư viện cùng tên xương với model (UAL/Mannequin): phát thẳng, chỉ chỉnh độ cao hông, không retarget.
      const native = spec.startsWith('native:');
      const libUrl = native ? spec.slice(7) : spec;
      const r = await fetch(libUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status} ${libUrl}`);
      const libGltf = await this.loader.parseAsync(await r.arrayBuffer(), libUrl.slice(0, libUrl.lastIndexOf('/') + 1));
      lib = lib.concat(
        native
          ? pelvisScaledClips(gltf.scene, libGltf.scene, libGltf.animations)
          : retargetClips(libGltf.scene, libGltf.animations, gltf.scene),
      );
    }
    const json = (gltf.parser as unknown as { json: { extensionsUsed?: string[] } }).json;
    // ?pose=…: nướng thêm các key pose IK nếu model có rig người Mixamo.
    const own = mergeClips(gltf.animations.map(stripPartTracks), lib);
    const clips = this.poseMode ? [...this.bakePoses(gltf.scene), ...own] : own;
    return this.show(gltf.scene, clips, { name, fileBytes: buf.byteLength, extensions: json.extensionsUsed ?? [] });
  }

  /** Rig Mixamo mẫu sinh bằng code + kiếm ở tay phải, chạy các key pose IK (khi chưa có model người có xương). */
  loadPoseFixture(): LoadedInfo {
    const root = buildMixamoFixture({ mesh: true });
    const clips = this.bakePoses(root);
    return this.show(root, clips, { name: 'mixamo_fixture', fileBytes: 0, extensions: [] });
  }

  /** Đang ở chế độ xem pose (?pose=…). */
  get poseMode(): boolean {
    return urlParams().has('pose') || isSkillViewer(currentSearch());
  }

  /** Thời điểm (giây) và độ dài của clip đang phát; 0 nếu không có. */
  get clipTime(): number {
    return this.action?.time ?? 0;
  }
  get clipDuration(): number {
    return this.action?.getClip().duration ?? 0;
  }
  get clipName(): string {
    return this.action?.getClip().name ?? '';
  }

  private applyTravel(): void {
    if (this.model && this.travel) this.model.position.copy(this.travelBase).addScaledVector(this.travelDir, this.travel * this.clipTime);
  }

  /** Vị trí thế giới hai bàn chân [trái, phải] (xương *leftfoot/*rightfoot); rỗng nếu model không có. */
  footsWorld(): number[][] {
    if (!this.model) return [];
    this.model.updateMatrixWorld(true);
    const out: number[][] = [];
    for (const side of ['left', 'right']) {
      let b: THREE.Object3D | undefined;
      this.model.traverse((o) => {
        if (o.name.toLowerCase().endsWith(`${side}foot`)) b = o;
      });
      if (b) out.push(b.getWorldPosition(new THREE.Vector3()).toArray());
    }
    return out;
  }

  /** Đánh dấu một điểm trên đất (đĩa đỏ): chứng minh chân trụ không trượt. */
  markGround(x: number, z: number, color = 0xd85a46): void {
    if (!this.marks.parent) this.scene.add(this.marks);
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), new THREE.MeshBasicMaterial({ color }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.004, z);
    this.marks.add(m);
  }

  clearMarks(): void {
    this.marks.clear();
  }

  /** Đầu dò số ở khung hiện tại (tay, chân, mũi kiếm); rỗng nếu model không có rig IK. */
  probeText(): string {
    if (!this.ikRig) return '';
    try {
      return formatProbe(this.ikRig.probe());
    } catch {
      return '';
    }
  }

  setAutoRotate(on: boolean): void {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 2.5;
  }

  /** Đặt camera nhìn quanh model theo hướng cố định: trước (+Z), bên phải nhân vật (-X), sau, chéo. */
  setView(view: 'front' | 'side' | 'back' | 'iso'): void {
    if (!this.model) return;
    const box = new THREE.Box3().setFromObject(this.model, true);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = (Math.max(sphere.radius, 1) / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 0.8;
    const dirs = { front: [0, 0.18, 1], side: [-1, 0.18, 0], back: [0, 0.18, -1], iso: [0.9, 0.55, 1.4] } as const;
    const d = new THREE.Vector3(...dirs[view]).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(d, dist);
    this.controls.target.copy(sphere.center);
    this.controls.update();
  }

  /** Dừng và đặt clip ở thời điểm t, vẽ lại một khung (cho thanh kéo và bước khung). */
  scrub(t: number): void {
    this.seek(t);
  }

  /** Dừng clip đang chạy ở thời điểm t (giây) để chụp ảnh một khung. */
  seek(t: number): void {
    if (!this.mixer || !this.action) return;
    this.paused = true;
    // Bỏ crossfade đang dở (đang dừng thì fade không bao giờ chạy hết): chỉ còn clip này, trọng số đầy.
    const act = this.action;
    this.mixer.stopAllAction();
    act.play().setEffectiveWeight(1);
    act.time = Math.min(t, act.getClip().duration - 1e-4);
    this.mixer.update(0);
    this.applyTravel();
    this.placeSword();
  }

  /**
   * Chỗ kiếm theo clip đang phát: rút kiếm thì sang tay sau lúc nắm chuôi, tra kiếm thì về lưng sau lúc tra; pose
   * đòn, thế thủ, niệm chú: ở tay; còn lại (clip của asset như idle/chạy, ngự kiếm, thiền): trên lưng. Giống luật trong game, nhưng
   * theo clip thay vì thời gian rảnh.
   */
  private placeSword(): void {
    if (!this.sword || !this.action) return;
    const name = this.action.getClip().name;
    const t = this.action.time;
    if (name === poseClipName(POSE_SWORD_DRAW)) this.sword.set(t >= POSE_SWORD_SWAP[POSE_SWORD_DRAW]!);
    else if (name === poseClipName(POSE_SWORD_SHEATHE)) this.sword.set(t < POSE_SWORD_SWAP[POSE_SWORD_SHEATHE]!);
    else this.sword.set(SWORD_IN_HAND.has(name));
  }

  private bakePoses(root: THREE.Object3D): THREE.AnimationClip[] {
    const rig = IkRig.from(root);
    if (!rig) return [];
    this.nextRig = rig;
    // Asset có kiếm riêng (extras dtl.sword): dùng kiếm của asset, tính socket ở tư thế nghỉ trước khi nướng.
    const ex = partExtras(root).sword;
    const def = ex ? swordSocketDef(root, ex) : null;
    const clips = POSES.map((p) => bakePose(p, rig));
    if (def) {
      this.nextSword = SwordSocket.create(root, def);
      return clips;
    }
    const sword = buildFixtureSword();
    const mount = rig.swordMount();
    sword.position.copy(mount.position);
    sword.quaternion.copy(mount.quaternion);
    sword.scale.setScalar(1 / (rig.bones.handR!.getWorldScale(new THREE.Vector3()).x || 1));
    rig.bones.handR!.add(sword);
    return clips;
  }

  private show(
    root: THREE.Object3D,
    clips: THREE.AnimationClip[],
    meta: { name: string; fileBytes: number; extensions: string[] },
  ): LoadedInfo {
    this.clear();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
    });

    // Đặt model đứng trên sân, bên phải người chuẩn. Không đổi tỉ lệ: mục đích là thấy kích thước thật.
    const box = new THREE.Box3().setFromObject(root, true);
    if (!box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3());
      root.position.set(GAP + 0.25 - box.min.x, -box.min.y, -c.z);
    }
    this.model = root;
    this.travelBase.copy(root.position);
    this.sword = this.nextSword;
    this.nextSword = null;
    this.ikRig = this.nextRig;
    this.nextRig = null;
    this.scene.add(root);
    this.applyWireframe();

    let hasSkin = false;
    root.traverse((o) => (hasSkin ||= !!(o as THREE.SkinnedMesh).isSkinnedMesh));
    if (hasSkin) {
      this.skeleton = new BoneLines(root);
      this.skeleton.visible = false;
      this.scene.add(this.skeleton);
    }

    this.clips = clips;
    if (this.clips.length) {
      this.mixer = new THREE.AnimationMixer(root);
      this.playClip(0);
    }

    const stats = collectStats(root);
    const all = new THREE.Box3().setFromObject(root, true).union(new THREE.Box3().setFromObject(this.human));
    const span = Math.max(all.max.x - all.min.x, all.max.z - all.min.z);
    this.buildGround(Math.max(12, Math.ceil(span * 1.4)));
    // Xem pose: khung cận cảnh vào model (nhìn chéo từ trước), không lùi ra cho cả người chuẩn.
    this.frameBounds(this.poseMode ? new THREE.Box3().setFromObject(root, true) : all);

    return {
      ...meta,
      clips: this.clips.map((c) => ({ name: c.name, duration: c.duration })),
      stats,
    };
  }

  playClip(i: number): void {
    if (!this.mixer) return;
    const clip = this.clips[i];
    if (!clip) return;
    const next = this.mixer.clipAction(clip);
    next.reset().play();
    if (this.action && this.action !== next) this.action.crossFadeTo(next, 0.2, false);
    this.action = next;
  }

  setWireframe(on: boolean): void {
    this.wireframe = on;
    this.applyWireframe();
  }

  setSkeleton(on: boolean): void {
    if (this.skeleton) this.skeleton.visible = on;
  }

  setHuman(on: boolean): void {
    this.human.visible = on;
  }

  frameInfo(): FrameInfo {
    const info = this.renderer.info.render as unknown as { drawCalls?: number; calls?: number; triangles: number };
    return { drawCalls: info.drawCalls ?? info.calls ?? 0, triangles: info.triangles, fps: this.fps, backend: this.backend };
  }

  /** Vẽ một khung (dùng khi rAF không chạy, ví dụ khung trình duyệt bị ẩn lúc chụp ảnh). */
  frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    if (this.mixer && !this.paused) this.mixer.update(dt * this.speed);
    this.applyTravel();
    this.placeSword();
    if (this.skeleton?.visible) {
      this.model?.updateMatrixWorld(true);
      this.skeleton.update();
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.setAnimationLoop(null);
    this.clear();
    this.controls.dispose();
    this.renderer.dispose();
  }

  private onResize = (): void => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private applyWireframe(): void {
    this.model?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        (mat as THREE.MeshStandardMaterial).wireframe = this.wireframe;
      }
    });
  }

  private clear(): void {
    this.sword = null;
    this.ikRig = null;
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.action = null;
    this.clips = [];
    if (this.skeleton) {
      this.scene.remove(this.skeleton);
      this.skeleton.dispose();
      this.skeleton = null;
    }
    if (!this.model) return;
    this.scene.remove(this.model);
    disposeTree(this.model);
    this.model = null;
  }

  private buildGround(size: number): void {
    for (const c of [...this.ground.children]) {
      this.ground.remove(c);
      disposeTree(c);
    }
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x9a9384, roughness: 0.95 }),
    );
    floor.receiveShadow = true;
    const grid = makeGrid(size, Math.min(size, 400), 0x7a7367);
    grid.position.y = 0.002;
    // Bậc thềm đá cao 0,15m sau lưng người chuẩn để so độ cao bậc/chân.
    const step = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 0.6), new THREE.MeshStandardMaterial({ color: 0x7d776c, roughness: 0.9 }));
    step.position.set(0, 0.075, -1.2);
    step.castShadow = true;
    step.receiveShadow = true;
    this.ground.add(floor, grid, step);

    const half = size / 2;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -half;
    cam.right = cam.top = half;
    cam.near = 0.5;
    cam.far = size * 3;
    cam.updateProjectionMatrix();
    this.sun.position.set(half * 0.6, size, half * 0.4);
  }

  private frameBounds(box: THREE.Box3): void {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 1);
    const dist = (r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.05;
    const dir = new THREE.Vector3(0.9, 0.55, 1.4).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.near = Math.max(0.02, dist / 500);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(sphere.center);
    this.controls.maxDistance = dist * 6;
    this.controls.update();
  }
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.geometry) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (!mat) continue;
      for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
      mat.dispose();
    }
  });
}

/** Người chuẩn cao đúng 1,70m (đỉnh đầu) kèm thước vạch 0,5m bên cạnh. */
function buildHuman(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x5f7f9a, roughness: 0.7 });
  const add = (geo: THREE.BufferGeometry, x: number, y: number, mat: THREE.Material = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0);
    m.castShadow = true;
    g.add(m);
  };
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.075, 0.065, 0.8, 10), s * 0.1, 0.4); // chân 0–0,8
    add(new THREE.CylinderGeometry(0.05, 0.045, 0.62, 8), s * 0.245, 1.07); // tay 0,76–1,38
  }
  add(new THREE.BoxGeometry(0.38, 0.6, 0.22), 0, 1.1); // thân 0,8–1,4
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), 0, 1.44); // cổ 1,4–1,48
  add(new THREE.SphereGeometry(0.11, 16, 12), 0, 1.59); // đầu 1,48–1,70
  // Thước: đoạn 0,5m xen kẽ đỏ/trắng, đoạn cuối 0,2m, tổng 1,7m.
  const red = new THREE.MeshStandardMaterial({ color: 0xb8433a, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 });
  let y = 0;
  for (const [i, h] of [0.5, 0.5, 0.5, 0.2].entries()) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.03), i % 2 ? white : red);
    m.position.set(-0.45, y + h / 2, 0);
    m.castShadow = true;
    g.add(m);
    y += h;
  }
  return g;
}
