import * as THREE from 'three/webgpu';
import { texture, positionWorld, vertexColor, mix as tmix } from 'three/tsl';
import { getCloudNoise } from '../../render/noiseTex';
import { createWorldMaterial } from '../../render/materials/world';
import {
  applyGroundShader,
  clearGroundShader,
  setGroundRedStrata,
  setGroundCliff,
  setGroundStrata,
  setGroundNoSnow,
  setGroundTileBreak,
  type GroundLevel,
} from '../../render/materials/ground';
import type { GroundTextures } from '../../base/groundTextures';
import { FLAGS } from '../../base/flags';
import { logger } from '../../base/log';
import { levelId, levelTerrain } from '../../base/levelCtx';
import { COLLIDERS_LAYOUT, featureWeight, FOREST, hash01, LAKE, trailsOf, WATER_Y } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import type { TileReq, TileRes } from './terrainBuild.worker';
import { withSightFade } from './occlusion';
import {
  TILE, NEAR_R, NEAR_R_ISO, VEG_FAR_R, VEG_FAR_R_ISO, VD_SKIRT, COARSE_CELL, VEG_NEAR_R, CLIFF_SKIP,
  T, ASH, XICH, KT, PM, heightAt, isVanLam, onPlayWall, onIslandBevel, quadSpan, buildTileGeometry, buildVegetation,
  initTerrainBuild, terrainColor, unpackGeometry,
} from './terrainBuild';
/** Nạp trước theo hướng đi (B3): điểm dẫn = vận tốc × LEAD_SEC (≤ LEAD_MAX m) khi chạy nhanh hơn LEAD_MIN m/s; trễ hủy thêm HYST ô. */
const LEAD_SEC = 4;
const LEAD_MAX = 420;
const LEAD_MIN = 6;
const HYST = 1;

// ---------- quản lý ô ----------

interface TileRec {
  key: number;
  tx: number;
  tz: number;
  res: number;
  mesh: THREE.Mesh | null;
  veg: THREE.Mesh | null;
  vegFar: boolean | null;
  /** Độ mịn / kiểu cây đang chờ worker (-1 / null: không chờ). */
  reqRes: number;
  reqVeg: boolean | null;
}

const terrainLog = logger('terrain');
/** Số việc tối đa gửi worker cùng lúc (giữ tuyến ưu tiên: ô gần gửi trước) và số kết quả áp vào cảnh mỗi khung. */
const MAX_INFLIGHT = 3;
const APPLY_PER_FRAME = 2;
interface Job {
  t: TileRec;
  kind: 'tile' | 'veg';
  res: number;
  far: boolean;
}

export class Terrain {
  group = new THREE.Group();
  material = createWorldMaterial({ vertexColors: true });
  /** Cây, bụi: làm mờ khi đứng chắn giữa camera và nhân vật. */
  vegMaterial = withSightFade(createWorldMaterial({ vertexColors: true }));
  private tiles = new Map<number, TileRec>();
  private coarse: THREE.Mesh;
  private coarseIndex: THREE.BufferAttribute;
  private coarseDirty = true;
  private ctx = -999;
  private ctz = -999;
  shadows = false;
  /** Số ô đã dựng xong (để màn hình loading biết khi nào vào game). */
  ready = false;

  /** Cạnh thế giới của level lúc dựng (m) và số ô/lưới thô theo đó; mỗi level một đối tượng Terrain. */
  readonly size = levelTerrain().size;
  private readonly NT = this.size / TILE;
  private readonly COARSE_N = this.size / COARSE_CELL;

  constructor() {
    initTerrainBuild();
    const COARSE_N = this.COARSE_N;
    const g = buildTileGeometry(0, 0, this.size, COARSE_N, 0);
    this.coarseIndex = new THREE.BufferAttribute(new Uint16Array(COARSE_N * COARSE_N * 6), 1);
    g.setIndex(this.coarseIndex);
    if (T.def.islands) {
      // Đảo nổi (E3-I): màu đỉnh chỉ có độ phân giải ~4 m nên mặt đảo trông phẳng như thảm; nhân thêm hai tầng nhiễu theo tọa độ thế giới (mảng ~40 m và vân ~6 m,
      // từ texture nhiễu dùng chung của trời/mây) cho đất có đốm, vệt sáng tối. Chỉ vài phép lấy mẫu mỗi điểm ảnh.
      const nz = getCloudNoise();
      const big = texture(nz, positionWorld.xz.mul(1 / 71));
      const mid = texture(nz, positionWorld.xz.mul(1 / 9.7));
      const fine = texture(nz, positionWorld.xz.mul(1 / 2.3));
      this.material.colorNode = vertexColor().mul(
        tmix(0.86, 1.16, big.g)
          .mul(tmix(0.9, 1.1, mid.b))
          .mul(tmix(0.94, 1.06, fine.b)),
      );
    }
    this.coarse = new THREE.Mesh(g, this.material);
    this.coarse.frustumCulled = false;
    this.coarse.receiveShadow = false;
    this.group.add(this.coarse);
  }

  // Level đảo nổi: viền rủ ngắn (1,2 m: đủ che khe nứt giữa ô khác LOD trên mặt đảo phẳng); viền dài 17 m thò ra khỏi thân đá của váy thành các tam giác dán trên vách (POLISH-1).
  private voidTile = new Map<number, boolean>();
  /** Ô chỉ gồm sàn mây (mọi mẫu độ cao bằng `voidFloor`, không có đảo/cầu): chỉ ở level đảo nổi. */
  private isVoidTile(tx: number, tz: number): boolean {
    const floor = T.def.voidFloor;
    if (floor === undefined || !T.def.islands) return false;
    const key = tz * this.NT + tx;
    const have = this.voidTile.get(key);
    if (have !== undefined) return have;
    let v = true;
    const N = 16;
    for (let j = 0; j <= N && v; j++)
      for (let i = 0; i <= N && v; i++) if (heightAt(tx * TILE + (i / N) * TILE, tz * TILE + (j / N) * TILE) > floor + 0.5) v = false;
    this.voidTile.set(key, v);
    return v;
  }

  /** Bán kính ô (số ô) dựng lưới mịn / cây xa; đổi theo camera chéo. */
  private nearR = NEAR_R;
  private vegFarR = VEG_FAR_R;
  setIso(on: boolean): void {
    this.nearR = on ? NEAR_R_ISO : NEAR_R;
    this.vegFarR = on ? VEG_FAR_R_ISO : VEG_FAR_R;
    this.ctx = NaN; // ép duyệt lại để dọn ô ngoài bán kính mới
  }

  private desiredRes(d: number): number {
    return d <= 1 ? 64 : 32;
  }

  // Nạp trước theo hướng đi (B3): vận tốc làm mượt từ các lần gọi `update`; điểm dẫn = vị trí + vận tốc × LEAD_SEC (tối đa LEAD_MAX m).
  private lastX = NaN;
  private lastZ = NaN;
  private lastT = 0;
  private vx = 0;
  private vz = 0;
  private ltx = -999;
  private ltz = -999;
  private ensureTile(tx: number, tz: number, ring: number): boolean {
    if (tx < 0 || tz < 0 || tx >= this.NT || tz >= this.NT) return false;
    const key = tz * this.NT + tx;
    let t = this.tiles.get(key);
    if (!t) {
      t = { key, tx, tz, res: 0, mesh: null, veg: null, vegFar: null, reqRes: -1, reqVeg: null };
      this.tiles.set(key, t);
    }
    if (ring <= this.nearR) {
      const res = this.desiredRes(ring);
      if (t.res !== res && this.isVoidTile(tx, tz)) {
        // Level đảo nổi: ô chỉ có sàn mây phẳng không dựng lưới mịn (lưới thô đã vẽ sàn; mặt sàn lại bị mặt vực/mây che): bớt ~nửa số draw call địa hình.
        t.res = res;
        return false;
      }
      if (t.res !== res) {
        const skirt = T.def.islands ? 1.2 : T.id === 'van_dinh' ? VD_SKIRT : (TILE / res) * 1.5 + 5;
        if (this.async) {
          if (t.reqRes === res || this.inflight >= MAX_INFLIGHT) return false;
          t.reqRes = res;
          this.submit({ type: 'tile', id: this.nextId, tx, tz, tile: TILE, res, skirt }, { t, kind: 'tile', res, far: false });
          return true;
        }
        this.setTileMesh(t, buildTileGeometry(tx * TILE, tz * TILE, TILE, res, skirt), res);
        return true;
      }
    }
    const wantFar = ring > VEG_NEAR_R;
    if (ring <= this.vegFarR && t.vegFar !== wantFar) {
      if (this.async) {
        if (t.reqVeg === wantFar || this.inflight >= MAX_INFLIGHT) return false;
        t.reqVeg = wantFar;
        this.submit({ type: 'veg', id: this.nextId, tx, tz, far: wantFar }, { t, kind: 'veg', res: 0, far: wantFar });
        return true;
      }
      this.setTileVeg(t, buildVegetation(tx, tz, wantFar), wantFar);
      return true;
    }
    return false;
  }

  private setTileMesh(t: TileRec, geo: THREE.BufferGeometry, res: number): void {
    if (t.mesh) {
      this.group.remove(t.mesh);
      t.mesh.geometry.dispose();
    }
    t.mesh = new THREE.Mesh(geo, this.material);
    t.mesh.receiveShadow = this.shadows;
    this.group.add(t.mesh);
    t.res = res;
    this.coarseDirty = true;
  }

  private setTileVeg(t: TileRec, geo: THREE.BufferGeometry | null, wantFar: boolean): void {
    if (t.veg) {
      this.group.remove(t.veg);
      t.veg.geometry.dispose();
      t.veg = null;
    }
    if (geo) {
      t.veg = new THREE.Mesh(geo, this.vegMaterial);
      t.veg.castShadow = this.shadows && !wantFar;
      this.group.add(t.veg);
    }
    t.vegFar = wantFar;
  }

  // ----- worker dựng ô (B3) -----
  private workerTried = false;
  private worker: Worker | null = null;
  private workerReady = false;
  private async = false;
  private inflight = 0;
  private nextId = 1;
  private jobs = new Map<number, Job>();
  private results: TileRes[] = [];

  private startWorker(): void {
    // Cờ `tc=0` đổi bộ cây trong propScatter mà worker không thấy (worker không có chuỗi truy vấn): dựng đồng bộ như cũ.
    if (typeof Worker === 'undefined' || !FLAGS.tcProps) return;
    try {
      const w = new Worker(new URL('./terrainBuild.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<TileRes>) => {
        if (e.data.type === 'ready') this.workerReady = true;
        else if (e.data.type === 'error') this.failWorker(e.data.message);
        else this.results.push(e.data);
      };
      w.onerror = (e) => this.failWorker(String(e.message ?? e));
      w.postMessage({ type: 'init', level: levelId() } satisfies TileReq);
      this.worker = w;
    } catch (err) {
      this.failWorker(String(err));
    }
  }

  /** Worker lỗi/không khởi động được: quay về dựng đồng bộ trên luồng chính (hình giống hệt), việc đang chờ dựng lại. */
  private failWorker(why: string): void {
    terrainLog.warn('worker dựng ô lỗi, dựng đồng bộ:', why);
    this.worker?.terminate();
    this.worker = null;
    this.workerReady = false;
    this.async = false;
    this.jobs.clear();
    this.results.length = 0;
    this.inflight = 0;
    for (const t of this.tiles.values()) {
      t.reqRes = -1;
      t.reqVeg = null;
    }
  }

  private submit(m: TileReq, job: Job): void {
    this.jobs.set(this.nextId++, job);
    this.inflight++;
    this.worker!.postMessage(m);
  }

  private applyResults(max: number): void {
    for (let n = 0; n < max && this.results.length > 0; ) {
      const r = this.results.shift()!;
      if (r.type !== 'tile' && r.type !== 'veg') continue;
      const job = this.jobs.get(r.id);
      this.jobs.delete(r.id);
      this.inflight = Math.max(0, this.inflight - 1);
      if (!job) continue;
      const t = job.t;
      const alive = this.tiles.get(t.key) === t;
      if (job.kind === 'tile') {
        if (t.reqRes === job.res) t.reqRes = -1;
        if (!alive || !r.geo || t.res === job.res) continue;
        this.setTileMesh(t, unpackGeometry(r.geo), job.res);
      } else {
        if (t.reqVeg === job.far) t.reqVeg = null;
        if (!alive || t.vegFar === job.far) continue;
        this.setTileVeg(t, r.geo ? unpackGeometry(r.geo) : null, job.far);
      }
      n++;
    }
  }

  /** Gọi mỗi khung hình. Dựng tối đa `budget` ô mỗi lần để không giật. */
  update(px: number, pz: number, budget = 1): void {
    // Khi đã vào game (budget 1) và worker sẵn sàng: dựng ngoài luồng chính; lúc nạp màn hình (budget lớn) vẫn dựng đồng bộ cho nhanh và chắc.
    // Worker (tải thêm ~0,7 MB nén) chỉ khởi động sau khi màn hình nạp xong: không nằm trên đường găng của lần tải đầu.
    if (budget <= 1 && this.ready && !this.workerTried) {
      this.workerTried = true;
      this.startWorker();
    }
    this.async = this.worker !== null && this.workerReady && budget <= 1;
    if (this.async) {
      this.applyResults(APPLY_PER_FRAME);
      budget = MAX_INFLIGHT;
    }
    const now = performance.now();
    if (Number.isFinite(this.lastX)) {
      const dt = (now - this.lastT) / 1000;
      if (dt > 0.001 && dt < 0.5) {
        const k = Math.min(1, dt * 3);
        this.vx += ((px - this.lastX) / dt - this.vx) * k;
        this.vz += ((pz - this.lastZ) / dt - this.vz) * k;
      } else if (dt >= 0.5) {
        this.vx = 0;
        this.vz = 0; // dịch chuyển tức thời / tạm dừng: bỏ vận tốc cũ
      }
    }
    this.lastX = px;
    this.lastZ = pz;
    this.lastT = now;
    const ctx = Math.floor(px / TILE);
    const ctz = Math.floor(pz / TILE);
    // Điểm dẫn chỉ khi chạy nhanh (> LEAD_MIN m/s): đi bộ không nạp thêm.
    const sp = Math.hypot(this.vx, this.vz);
    let ltx = ctx;
    let ltz = ctz;
    if (sp > LEAD_MIN) {
      const lead = Math.min(LEAD_MAX, sp * LEAD_SEC) / sp;
      ltx = Math.min(this.NT - 1, Math.max(0, Math.floor((px + this.vx * lead) / TILE)));
      ltz = Math.min(this.NT - 1, Math.max(0, Math.floor((pz + this.vz * lead) / TILE)));
    }
    if (ctx !== this.ctx || ctz !== this.ctz || ltx !== this.ltx || ltz !== this.ltz) {
      this.ctx = ctx;
      this.ctz = ctz;
      this.ltx = ltx;
      this.ltz = ltz;
      // Trễ hủy: ô chỉ bị bỏ khi xa cả người lẫn điểm dẫn hơn nearR + 1 + HYST (hết nạp–hủy lặp ở ranh ô).
      const lim = this.nearR + 1 + HYST;
      for (const [key, t] of this.tiles) {
        const d = Math.min(Math.max(Math.abs(t.tx - ctx), Math.abs(t.tz - ctz)), Math.max(Math.abs(t.tx - ltx), Math.abs(t.tz - ltz)));
        if (d > lim) {
          this.disposeTile(t);
          this.tiles.delete(key);
          this.coarseDirty = true;
        }
      }
    }
    let pending = 0;
    const R = Math.max(this.nearR, this.vegFarR);
    // Duyệt từ gần ra xa quanh người (ô dưới chân có trước), rồi quanh điểm dẫn (độ mịn tính theo khoảng cách tới người HOẶC điểm dẫn).
    const centers: [number, number][] = [[ctx, ctz]];
    if (ltx !== ctx || ltz !== ctz) centers.push([ltx, ltz]);
    for (const [cx, cz] of centers) {
      for (let ring = 0; ring <= R && budget > 0; ring++) {
        for (let dz = -ring; dz <= ring && budget > 0; dz++) {
          for (let dx = -ring; dx <= ring && budget > 0; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            const tx = cx + dx;
            const tz = cz + dz;
            if (this.ensureTile(tx, tz, Math.min(ring, Math.max(Math.abs(tx - ctx), Math.abs(tz - ctz))))) {
              budget--;
              pending++;
            }
          }
        }
      }
    }
    if (pending === 0 && this.inflight === 0) this.ready = true;
    if (this.coarseDirty) this.rebuildCoarseIndex();
  }

  /** Khoét lỗ trên lưới thô ở những ô đã có lưới mịn. */
  private rebuildCoarseIndex(): void {
    this.coarseDirty = false;
    const per = TILE / COARSE_CELL;
    const COARSE_N = this.COARSE_N;
    const n1 = COARSE_N + 1;
    // Giữ nguyên một buffer chỉ số, chỉ ghi lại nội dung và đổi draw range
    // (thay buffer mới giữa chừng làm WebGPU báo lỗi).
    const idx = this.coarseIndex.array as Uint16Array;
    const cpos = T.def.islands ? (this.coarse.geometry.attributes.position!.array as Float32Array) : null;
    let o = 0;
    for (let j = 0; j < COARSE_N; j++) {
      const tz = (j / per) | 0;
      for (let i = 0; i < COARSE_N; i++) {
        const tx = (i / per) | 0;
        const t = this.tiles.get(tz * this.NT + tx);
        if (t && t.mesh) continue;
        const a = j * n1 + i;
        const b = a + 1;
        const c = a + n1;
        const d = c + 1;
        if (
          cpos &&
          !onPlayWall(cpos, a, d) &&
          (quadSpan(cpos, a, b, c, d) > CLIFF_SKIP ||
            onIslandBevel((cpos[a * 3]! + cpos[d * 3]!) / 2, (cpos[a * 3 + 2]! + cpos[d * 3 + 2]!) / 2))
        )
          continue;
        idx[o++] = a;
        idx[o++] = c;
        idx[o++] = b;
        idx[o++] = b;
        idx[o++] = c;
        idx[o++] = d;
      }
    }
    this.coarseIndex.needsUpdate = true;
    this.coarse.geometry.setDrawRange(0, o);
  }

  private disposeTile(t: TileRec): void {
    if (t.mesh) {
      this.group.remove(t.mesh);
      t.mesh.geometry.dispose();
    }
    if (t.veg) {
      this.group.remove(t.veg);
      t.veg.geometry.dispose();
    }
  }

  /** Bật shader mặt đất PBR khi bộ texture đã nạp; gọi lại khi đổi preset. */
  setGround(tex: GroundTextures | null, level: GroundLevel): void {
    setGroundTileBreak(XICH || ASH);
    setGroundStrata(isVanLam());
    setGroundNoSnow(KT || PM || T.id === 'van_dinh');
    setGroundCliff(T.id === 'cuu_kieu' ? 42 : 11, T.id === 'cuu_kieu');
    setGroundRedStrata(
      T.id === 'doan_mach' || T.id === 'thien_khuyet' || T.id === 'van_dinh' || KT || PM,
      // Thiên Khuyết (MAP-4): vách xám ấm ↔ nâu cát, khe nứt có vỉa vàng kim; vân từ nhiễu theo tọa độ dọc vách (hết ô caro).
      T.id === 'doan_mach'
        ? // Đoạn Mạch (POLISH-1): vách đá PBR thật nhuộm đỏ nâu, không dùng nhiễu tạo sọc.
          { lo: [0.3, 0.14, 0.1], hi: [0.62, 0.4, 0.28], pbr: true }
        : T.id === 'thien_khuyet'
          ? { lo: [0.2, 0.18, 0.17], hi: [0.5, 0.45, 0.4], vein: [0.85, 0.6, 0.18], blocks: true }
          : T.id === 'van_dinh'
            ? // Vấn Đỉnh (TN-3): khối đá xếp lệch xám trung tính (mood hai mặt tự ngả lam lạnh hoặc vàng đồng), vỉa sáng ngọc lam nhạt ở khe.
              {
                // Mặt Âm: đá phiến tím lạnh; mặt Dương (`duong`): đá nung vàng đồng.
                lo: [0.1, 0.09, 0.13],
                hi: [0.4, 0.37, 0.46],
                duong: { lo: [0.16, 0.1, 0.06], hi: [0.64, 0.45, 0.28] },
                vein: [0.55, 0.78, 0.8],
                tri: true,
                center: T.def.play ? [T.def.play.cx, T.def.play.cz] : undefined,
              }
            : // Kiếm Trủng (DUN-1): vách xám lam lạnh, khe nứt có vỉa thép sáng.
              KT
              ? { lo: [0.05, 0.06, 0.08], hi: [0.17, 0.19, 0.23], vein: [0.45, 0.65, 0.8] }
              : // Phục Mạch (DUN-1 PR2): vách sa thạch nâu đỏ sẫm, khe nứt có vỉa mạch tinh lục.
                PM
                ? { lo: [0.1, 0.07, 0.05], hi: [0.3, 0.2, 0.13], vein: [0.25, 0.7, 0.55] }
                : undefined,
    );
    if (tex) applyGroundShader(this.material, tex, level);
    else clearGroundShader(this.material);
  }

  tileCount(): number {
    let n = 0;
    for (const t of this.tiles.values()) if (t.mesh) n++;
    return n;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const t of this.tiles.values()) this.disposeTile(t);
    this.tiles.clear();
    this.coarse.geometry.dispose();
    this.material.dispose();
    this.vegMaterial.dispose();
  }
}

/** Ảnh bản đồ thu nhỏ: mỗi pixel một màu địa hình. */
export function renderMinimap(size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(size, size);
  const step = levelTerrain().size / size;
  const c = new THREE.Color();
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) * step;
      const z = (j + 0.5) * step;
      const h = heightAt(x, z);
      const hx = heightAt(x + step, z);
      const hz = heightAt(x, z + step);
      const ny = 1 / Math.sqrt(1 + ((hx - h) / step) ** 2 + ((hz - h) / step) ** 2);
      terrainColor(x, z, h, ny, c);
      // Đổ bóng theo hướng dốc cho nổi khối.
      const shade = 0.82 + Math.max(-0.3, Math.min(0.3, (h - hx + (h - hz)) / (step * 1.6)));
      let r = c.r * shade;
      let gg = c.g * shade;
      let bb = c.b * shade;
      const wy = levelTerrain().def.water?.y;
      if (isVanLam() ? h < WATER_Y && featureWeight(LAKE, x, z) > 0 : wy !== undefined && h < wy) {
        r = 0.25;
        gg = 0.5;
        bb = 0.66;
      }
      const o = (j * size + i) * 4;
      // Chuyển gần đúng từ tuyến tính sang sRGB.
      img.data[o] = Math.min(255, Math.sqrt(r) * 255);
      img.data[o + 1] = Math.min(255, Math.sqrt(gg) * 255);
      img.data[o + 2] = Math.min(255, Math.sqrt(bb) * 255);
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** Bộ dựng bản đồ thủy mặc (U2-7): dựng một lần theo từng lát thời gian, không chặn khung. */
export interface InkBuilder {
  canvas: HTMLCanvasElement;
  /** Cạnh phủ (m): ảnh phủ vuông từ (0,0). */
  size: number;
  done: boolean;
  /** Chạy tối đa `budgetMs` ms; false nếu level đã đổi giữa chừng (bỏ bộ dựng này). */
  step(budgetMs: number): boolean;
}

const INK_PAPER: [number, number, number] = [239, 230, 208];
const INK_BLACK: [number, number, number] = [42, 40, 36];
const INK_JADE_LO: [number, number, number] = [47, 143, 127];
const INK_JADE_HI: [number, number, number] = [111, 214, 193];

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Làm mượt hộp (trung bình cửa sổ 2r+1) theo hàng rồi theo cột, tại chỗ; mép giữ nguyên giá trị gần nhất.
 * Chạy chia lát: `step(end)` làm từng hàng/cột cho tới khi hết giờ (`performance.now() >= end`), trả true khi xong cả hai lượt.
 */
class BoxBlurJob {
  private tmp: Float32Array;
  private k = 0;
  private cols = false;
  constructor(
    private a: Float32Array,
    private stride: number,
    private r: number,
  ) {
    this.tmp = new Float32Array(stride);
  }
  step(end: number): boolean {
    const { a, stride, r, tmp } = this;
    const w = 2 * r + 1;
    const at = (i: number): number => Math.max(0, Math.min(stride - 1, i));
    while (performance.now() < end) {
      if (!this.cols) {
        const o = this.k * stride;
        let sum = 0;
        for (let q = -r; q <= r; q++) sum += a[o + at(q)]!;
        for (let i = 0; i < stride; i++) {
          tmp[i] = sum / w;
          sum += a[o + at(i + r + 1)]! - a[o + at(i - r)]!;
        }
        for (let i = 0; i < stride; i++) a[o + i] = tmp[i]!;
      } else {
        const i = this.k;
        let sum = 0;
        for (let q = -r; q <= r; q++) sum += a[at(q) * stride + i]!;
        for (let j = 0; j < stride; j++) {
          tmp[j] = sum / w;
          sum += a[at(j + r + 1) * stride + i]! - a[at(j - r) * stride + i]!;
        }
        for (let j = 0; j < stride; j++) a[j * stride + i] = tmp[j]!;
      }
      if (++this.k >= stride) {
        this.k = 0;
        if (this.cols) return true;
        this.cols = true;
      }
    }
    return false;
  }
}

/**
 * Đọc được địa hình trong thủy mặc: núi nét cọ (độ dốc đã làm mượt) có viền chân núi, đồng mức mảnh, sông hồ ngọc thanh viền mực mềm
 * (mặt nạ nước làm nhòe rồi ngưỡng mềm nên mép không răng cưa), đường mòn nét mực, kiến trúc là khối mực, rừng là chấm mực.
 * Mọi thứ sinh từ độ cao địa hình (`surfaceAt`) và dữ liệu level; ảnh `n`×`n` điểm ảnh, dựng chia lát.
 */
export function createInkMap(n = 1536): InkBuilder {
  const t0 = levelTerrain();
  const size = t0.size;
  const cell = size / n;
  const stride = n + 2;
  const H = new Float32Array(stride * stride);
  const water = new Float32Array(n * n);
  const wy = t0.def.water?.y;
  const vl = isVanLam();
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(n, n);
  let row = 0;
  /** 0 lấy mẫu độ cao · 1 làm mượt (chia lát) · 2 tô màu · 3 đưa lên canvas theo dải · 4 đường/kiến trúc · 5 rừng theo dải z. */
  let phase: 0 | 1 | 2 | 3 | 4 | 5 = 0;
  let jobs: BoxBlurJob[] = [];
  let hMin = Infinity;
  let hMax = -Infinity;
  const PUT_STRIP = 128;
  const b: InkBuilder = {
    canvas: cv,
    size,
    done: false,
    step(budgetMs) {
      if (levelTerrain() !== t0) return false;
      const end = performance.now() + budgetMs;
      // Mọi phase đều kiểm giờ giữa các hàng/dải nhỏ: không có bước nào chạy liền cả ảnh trong một khung.
      while (!b.done && performance.now() < end) {
        if (phase === 0) {
          // Lấy mẫu độ cao (có viền 1 ô để tính độ dốc) và mặt nạ nước.
          const j = row;
          const z = (j - 1 + 0.5) * cell;
          for (let i = 0; i < stride; i++) {
            const x = (i - 1 + 0.5) * cell;
            const h = heightAt(x, z);
            H[j * stride + i] = h;
            if (i >= 1 && i <= n && j >= 1 && j <= n) {
              if (h < hMin) hMin = h;
              if (h > hMax) hMax = h;
              const w = vl ? h < WATER_Y && featureWeight(LAKE, x, z) > 0 : wy !== undefined && h < wy;
              water[(j - 1) * n + (i - 1)] = w ? 1 : 0;
            }
          }
          if (++row >= stride) {
            row = 0;
            phase = 1;
            // Làm mượt độ cao trước khi tính độ dốc (bỏ gợn nhỏ, còn khối núi) và làm nhòe mặt nạ nước (mép mềm, không răng cưa).
            jobs = [
              new BoxBlurJob(H, stride, 4),
              new BoxBlurJob(H, stride, 4),
              new BoxBlurJob(H, stride, 4),
              new BoxBlurJob(water, n, 2),
              new BoxBlurJob(water, n, 2),
            ];
          }
        } else if (phase === 1) {
          if (jobs[0]!.step(end)) jobs.shift();
          if (!jobs.length) phase = 2;
        } else if (phase === 2) {
          shadeRow(row);
          if (++row >= n) {
            row = 0;
            phase = 3;
          }
        } else if (phase === 3) {
          const h = Math.min(PUT_STRIP, n - row);
          g.putImageData(img, 0, 0, 0, row, n, h);
          row += h;
          if (row >= n) {
            row = 0;
            phase = 4;
          }
        } else if (phase === 4) {
          overlayBase();
          row = 0;
          if (vl) phase = 5;
          else b.done = true;
        } else {
          // Rừng: từng hàng z (mỗi hàng ~190 mẫu).
          if (!treeRow(row)) b.done = true;
          row++;
        }
      }
      return true;
    },
  };

  function shadeRow(j: number): void {
    const range = Math.max(1, hMax - hMin);
    const waterY = vl ? WATER_Y : (wy ?? -1e9);
    for (let i = 0; i < n; i++) {
      const c = (j + 1) * stride + (i + 1);
      const h = H[c]!;
      const dx = (H[c + 1]! - H[c - 1]!) / (2 * cell);
      const dz = (H[c + stride]! - H[c - stride]!) / (2 * cell);
      const slope = Math.hypot(dx, dz);
      // Vân loang của giấy: hai sóng sin chồng nhau, biên độ nhỏ.
      const wash = Math.sin(i * 0.031 + Math.sin(j * 0.017) * 2) * 0.012 + Math.sin(j * 0.043 + i * 0.011) * 0.012;
      let r = INK_PAPER[0] * (1 + wash);
      let gg = INK_PAPER[1] * (1 + wash);
      let bb = INK_PAPER[2] * (1 + wash);
      const wi = j * n + i;
      // Đất: thân núi theo độ dốc + đổ bóng Tây Bắc + viền chân núi (dải hẹp ở độ dốc trung bình) + đồng mức mảnh + cao hơn thì đậm hơn.
      let ink = smooth(0.04, 0.8, slope) * 0.6 + Math.max(0, -(dx + dz) * 0.8) * 0.28;
      ink += smooth(0.16, 0.26, slope) * (1 - smooth(0.34, 0.46, slope)) * 0.36;
      const w8 = Math.max(0.03, (slope * cell) / 8);
      const f8 = (h / 8) % 1;
      if (slope < 0.3 && f8 < Math.min(0.14, w8)) ink += (h / 40) % 1 < Math.min(0.14, w8 / 5) ? 0.24 : 0.12;
      ink += ((h - hMin) / range) * 0.18;
      // Nước: alpha theo mặt nạ đã nhòe (ngưỡng mềm), đậm dần theo độ sâu; viền mực mềm ở chỗ chuyển tiếp.
      const wf = water[wi]!;
      const wa = smooth(0.3, 0.7, wf);
      if (wa > 0) {
        const d = smooth(0, 7, waterY - h);
        const jr = INK_JADE_HI[0] + (INK_JADE_LO[0] - INK_JADE_HI[0]) * d;
        const jg = INK_JADE_HI[1] + (INK_JADE_LO[1] - INK_JADE_HI[1]) * d;
        const jb = INK_JADE_HI[2] + (INK_JADE_LO[2] - INK_JADE_HI[2]) * d;
        r += (jr - r) * wa;
        gg += (jg - gg) * wa;
        bb += (jb - bb) * wa;
        ink *= 1 - wa;
      }
      ink += (1 - smooth(0, 0.2, Math.abs(wf - 0.5))) * 0.5;
      ink = Math.min(0.9, ink);
      const o = wi * 4;
      img.data[o] = r + (INK_BLACK[0] - r) * ink;
      img.data[o + 1] = gg + (INK_BLACK[1] - gg) * ink;
      img.data[o + 2] = bb + (INK_BLACK[2] - bb) * ink;
      img.data[o + 3] = 255;
    }
  }

  /** Đường mòn và kiến trúc (va chạm tĩnh, Vân Lam): vẽ chồng lên nền đã tô (vài trăm nét, rất nhẹ). */
  function overlayBase(): void {
    const k = n / size;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const zones = LEVELS[t0.id]?.zones ?? [];
    const play = t0.def.play;
    g.strokeStyle = 'rgba(56, 40, 28, 0.78)';
    g.lineWidth = Math.max(1.6, 5 * k);
    for (const tr of trailsOf(t0.id, zones, play ? { cx: play.cx, cz: play.cz } : undefined)) {
      g.beginPath();
      for (let s = 0; s + 1 < tr.length; s++) {
        const [a, c] = [tr[s]!, tr[s + 1]!];
        const mx = (a[0] + c[0]) / 2 + (hash01(a[0], c[1], 4182) - 0.5) * 30;
        const mz = (a[1] + c[1]) / 2 + (hash01(a[1], c[0], 4183) - 0.5) * 30;
        if (s === 0) g.moveTo(a[0] * k, a[1] * k);
        g.quadraticCurveTo(mx * k, mz * k, c[0] * k, c[1] * k);
      }
      g.stroke();
    }
    if (!vl) return;
    // Kiến trúc: khối mực đặc có viền, to nhỏ theo bán kính va chạm (chính điện, đan phòng, tàng kiếm các, cổng…).
    g.fillStyle = 'rgba(46, 38, 30, 0.82)';
    g.strokeStyle = 'rgba(46, 38, 30, 0.95)';
    g.lineWidth = Math.max(1, 2 * k);
    for (const c of COLLIDERS_LAYOUT) {
      g.beginPath();
      g.arc(c.x * k, c.z * k, Math.max(2.2, c.r * k * 1.25), 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  /** Rừng: một hàng z của lưới mẫu 22 m (chấm mực theo mật độ rừng, tránh nước). Trả false khi hết hàng. */
  function treeRow(zi: number): boolean {
    const step = 22;
    const z = step / 2 + zi * step;
    if (z >= size) return false;
    const k = n / size;
    g.fillStyle = 'rgba(52, 62, 44, 0.62)';
    for (let x = step / 2; x < size; x += step) {
      const w = featureWeight(FOREST, x, z);
      if (w < 0.45) continue;
      if (hash01(x, z, 4191) > 0.28 + w * 0.3) continue;
      const px = (x + (hash01(z, x, 4192) - 0.5) * step) * k;
      const pz = (z + (hash01(x, z, 4193) - 0.5) * step) * k;
      if (water[Math.min(n - 1, Math.floor(pz)) * n + Math.min(n - 1, Math.floor(px))]! > 0.4) continue;
      g.beginPath();
      g.arc(px, pz, Math.max(0.9, 3.2 * k), 0, Math.PI * 2);
      g.fill();
    }
    return true;
  }
  return b;
}
