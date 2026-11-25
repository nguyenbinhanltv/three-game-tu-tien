import * as THREE from 'three/webgpu';
import { tierRank, TC_ORIGIN, type HitTier } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';

/**
 * Vật thể vỡ (Chân Cảnh S1c): vò, bia, cọc vỡ khi trúng chiêu của MÌNH có cấp đòn từ `vừa` trở lên. Chỉ là hình ở client:
 * server không biết, không va chạm, không chọn được, không rơi đồ. Khung đơn giản cho M5 (phá cảnh): thêm một `BreakableSpec`
 * vào `BREAKABLES_BY_LEVEL` là có vật vỡ mới.
 *
 * - Hình thủ tục (lathe/hộp), không asset ngoài. Mỗi vật vài mesh; mảnh vỡ dùng MỘT InstancedMesh dùng chung (ẩn khi không có mảnh
 *   nào bay, nên không tốn draw call lúc yên).
 * - Vỡ: mảnh bay theo đạn đạo (trọng lực, nảy nhẹ trên đất), nhỏ dần rồi tan sau ~1,3 s. Hồi lại sau `respawn` giây (phóng to dần).
 * - Điểm va chạm do nơi gọi đưa vào (`hit(x, z, r, tier)`): đòn trúng quái thì tại quái; chiêu ra đòn thì tại điểm trước mặt người đánh.
 */

export type BreakKind = 'jar' | 'dummy' | 'stake' | 'rock';

export interface BreakKindDef {
  /** Bán kính thân (m) cộng vào bán kính đòn khi xét trúng. */
  radius: number;
  /** Cấp đòn tối thiểu làm vỡ. */
  minTier: HitTier;
  /** Giây rồi mọc lại. */
  respawn: number;
  /** Số mảnh vỡ. */
  debris: number;
  /** Màu mảnh (sRGB). */
  color: string;
}

export const BREAK_KINDS: Record<BreakKind, BreakKindDef> = {
  jar: { radius: 0.45, minTier: 'medium', respawn: 25, debris: 12, color: '#8a6a4a' },
  dummy: { radius: 0.6, minTier: 'medium', respawn: 30, debris: 16, color: '#6b4a30' },
  stake: { radius: 0.35, minTier: 'medium', respawn: 20, debris: 8, color: '#7a5a3a' },
  rock: { radius: 0.5, minTier: 'medium', respawn: 30, debris: 10, color: '#7d7a72' },
};

export interface BreakableSpec {
  id: string;
  kind: BreakKind;
  x: number;
  z: number;
  yaw: number;
}

/** Tọa độ thế giới từ tọa độ tương đối tâm tông môn (cùng hệ với `SCENE_GLB`). */
const rel = (x: number, z: number): { x: number; z: number } => ({ x: TC_ORIGIN.x + x, z: TC_ORIGIN.z + z });
const brk = (id: string, kind: BreakKind, x: number, z: number, yaw: number): BreakableSpec => ({ id, kind, ...rel(x, z), yaw });

/**
 * Vật vỡ theo level (M5: bố cục). Lạc Kiếm Tông: sân luyện võ phía đông bệ trung tâm (quanh điểm xuất hiện), rồi rải theo các tiểu cảnh
 * để chỗ nào đánh nhau cũng có thứ vỡ: vò bên đại lộ gần cổng bài, đá nhỏ bờ ao sen, cọc quanh kiếm bia, đá nhỏ thạch lâm, đá bên lối men vách.
 * Không va chạm (chỉ hình), nên đặt cách lối đi chính và prop ≥ 1,2 m cho khỏi chồng hình (test `breakables.test.ts`).
 */
export const BREAKABLES_BY_LEVEL: Record<string, BreakableSpec[]> = {
  van_lam: [
    { id: 'vl_jar_a', kind: 'jar', x: 2052.2, z: 2092.6, yaw: 0.4 },
    { id: 'vl_jar_b', kind: 'jar', x: 2053.3, z: 2093.4, yaw: 1.9 },
    { id: 'vl_jar_c', kind: 'jar', x: 2051.6, z: 2093.9, yaw: 3.1 },
    { id: 'vl_dummy', kind: 'dummy', x: 2044.2, z: 2092.8, yaw: 0.6 },
    { id: 'vl_stake', kind: 'stake', x: 2046.6, z: 2094.4, yaw: 0 },
    // cổng bài: vò bên ngoài hàng đèn đá (x = ±6,5)
    brk('vl_cb_jar_a', 'jar', -9.5, 106, 0.8),
    brk('vl_cb_jar_b', 'jar', -10.7, 107.3, 2.4),
    brk('vl_cb_jar_c', 'jar', 9.8, 104, 1.3),
    // ao sen: đá nhỏ bờ nam và vò bờ đông bắc
    brk('vl_as_rock_a', 'rock', -66, 80, 0.5),
    brk('vl_as_rock_b', 'rock', -58.5, 81, 2.2),
    brk('vl_as_jar', 'jar', -49.5, 53, 0.3),
    // kiếm bia: ba cọc tập và một bia người rơm quanh bãi kiếm gãy
    brk('vl_kb_stake_a', 'stake', 60, 54, 0),
    brk('vl_kb_stake_b', 'stake', 66.5, 50, 0),
    brk('vl_kb_stake_c', 'stake', 72.5, 52, 0),
    brk('vl_kb_dummy', 'dummy', 79, 59, 3.5),
    // thạch lâm: đá nhỏ lẫn giữa đá tảng
    brk('vl_tl_rock_a', 'rock', 91, -9.5, 0.2),
    brk('vl_tl_rock_b', 'rock', 99.5, -9.5, 1.7),
    brk('vl_tl_rock_c', 'rock', 94, 1, 4.1),
    // lối men vách
    brk('vl_lv_rock', 'rock', -101, 52, 2.9),
  ],
};

/** Chỉ số các vật còn nguyên bị đòn cấp `tier` ở (x, z) bán kính `r` làm vỡ. Hàm thuần để test. */
export function brokenBy(
  specs: readonly BreakableSpec[],
  alive: readonly boolean[],
  x: number,
  z: number,
  r: number,
  tier: HitTier,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i]!;
    if (!alive[i]) continue;
    const def = BREAK_KINDS[s.kind];
    if (tierRank(tier) < tierRank(def.minTier)) continue;
    if (Math.hypot(s.x - x, s.z - z) <= r + def.radius) out.push(i);
  }
  return out;
}

export interface Shard {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rvx: number;
  rvy: number;
  size: number;
  life: number;
  /** Màu mảnh (sRGB). */
  c: string;
}

export const SHARD_LIFE = 1.3;
const GRAVITY = 9.8;

/** Bước mảnh vỡ `dt` giây trên mặt đất cao `groundY`: trọng lực, nảy nhẹ (mất 55% vận tốc đứng, 40% ngang), nhỏ dần khi hết đời. */
export function stepShard(s: Shard, dt: number, groundY: number): void {
  s.life -= dt;
  s.vy -= GRAVITY * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;
  s.rx += s.rvx * dt;
  s.ry += s.rvy * dt;
  if (s.y < groundY + s.size * 0.5) {
    s.y = groundY + s.size * 0.5;
    if (s.vy < 0) s.vy = -s.vy * 0.45;
    s.vx *= 0.6;
    s.vz *= 0.6;
  }
}

/** Mảnh mới tung ra từ tâm vật, tản theo hướng đòn (`dirX`, `dirZ` đã chuẩn hóa hoặc 0) và ngẫu nhiên. `rnd` ∈ [0, 1). */
export function spawnShard(cx: number, cy: number, cz: number, dirX: number, dirZ: number, color: string, rnd: () => number): Shard {
  const a = rnd() * Math.PI * 2;
  const sp = 1.2 + rnd() * 2.2;
  return {
    x: cx + Math.cos(a) * 0.15,
    y: cy + rnd() * 0.4,
    z: cz + Math.sin(a) * 0.15,
    vx: Math.cos(a) * sp + dirX * 2.2,
    vy: 2.2 + rnd() * 2.6,
    vz: Math.sin(a) * sp + dirZ * 2.2,
    rx: rnd() * 6,
    ry: rnd() * 6,
    rvx: (rnd() - 0.5) * 14,
    rvy: (rnd() - 0.5) * 14,
    size: 0.08 + rnd() * 0.1,
    life: SHARD_LIFE * (0.75 + rnd() * 0.25),
    c: color,
  };
}

const MAX_SHARDS = 96;
const GROW = 0.5;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

interface Item {
  spec: BreakableSpec;
  group: THREE.Group;
  alive: boolean;
  /** Giây còn lại tới lúc mọc lại (khi đã vỡ). */
  respawnIn: number;
  /** Tiến độ phóng to sau khi mọc lại (0–1). */
  grow: number;
}

function jarGeometry(): THREE.BufferGeometry {
  // Hình vò: miệng nhỏ, bụng phình, đáy hẹp (lathe, 10 điểm).
  const pts = [
    [0.0, 0.0],
    [0.22, 0.0],
    [0.3, 0.12],
    [0.38, 0.32],
    [0.4, 0.5],
    [0.33, 0.7],
    [0.2, 0.82],
    [0.2, 0.9],
    [0.26, 0.94],
    [0.0, 0.94],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 14);
}

export class Breakables {
  readonly group = new THREE.Group();
  private items: Item[] = [];
  private shards: Shard[] = [];
  private shardMesh: THREE.InstancedMesh;
  private shardGeo = new THREE.BoxGeometry(1, 1, 1);
  private shardMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private rnd = Math.random;

  constructor(specs: readonly BreakableSpec[]) {
    this.group.name = 'breakables';
    const clay = new THREE.MeshStandardMaterial({ color: BREAK_KINDS.jar.color, roughness: 0.85 });
    const band = new THREE.MeshStandardMaterial({ color: '#5a3328', roughness: 0.8 });
    const wood = new THREE.MeshStandardMaterial({ color: BREAK_KINDS.dummy.color, roughness: 0.9 });
    const straw = new THREE.MeshStandardMaterial({ color: '#c9b27a', roughness: 1 });
    this.mats.push(clay, band, wood, straw);
    const jar = jarGeometry();
    const jarBand = new THREE.TorusGeometry(0.38, 0.03, 6, 16);
    const post = new THREE.CylinderGeometry(0.1, 0.12, 1.5, 8);
    const body = new THREE.CylinderGeometry(0.28, 0.32, 0.9, 10);
    const arm = new THREE.BoxGeometry(1.0, 0.1, 0.1);
    const stake = new THREE.CylinderGeometry(0.1, 0.14, 1.1, 8);
    const rock = new THREE.IcosahedronGeometry(0.42, 0);
    rock.scale(1, 0.7, 0.9);
    const stone = new THREE.MeshStandardMaterial({ color: BREAK_KINDS.rock.color, roughness: 0.95, flatShading: true });
    this.mats.push(stone);
    this.geos.push(jar, jarBand, post, body, arm, stake, rock, this.shardGeo);
    for (const spec of specs) {
      const g = new THREE.Group();
      g.position.set(spec.x, heightAt(spec.x, spec.z), spec.z);
      g.rotation.y = spec.yaw;
      if (spec.kind === 'jar') {
        g.add(new THREE.Mesh(jar, clay));
        const b = new THREE.Mesh(jarBand, band);
        b.rotation.x = Math.PI / 2;
        b.position.y = 0.5;
        g.add(b);
      } else if (spec.kind === 'dummy') {
        const p = new THREE.Mesh(post, wood);
        p.position.y = 0.75;
        g.add(p);
        const t = new THREE.Mesh(body, straw);
        t.position.y = 1.05;
        g.add(t);
        const a = new THREE.Mesh(arm, wood);
        a.position.y = 1.25;
        g.add(a);
      } else if (spec.kind === 'rock') {
        const r = new THREE.Mesh(rock, stone);
        r.position.y = 0.26;
        g.add(r);
      } else {
        const s = new THREE.Mesh(stake, wood);
        s.position.y = 0.55;
        g.add(s);
      }
      for (const c of g.children) c.castShadow = true;
      this.group.add(g);
      this.items.push({ spec, group: g, alive: true, respawnIn: 0, grow: 1 });
    }
    this.shardMesh = new THREE.InstancedMesh(this.shardGeo, this.shardMat, MAX_SHARDS);
    this.shardMesh.frustumCulled = false;
    this.shardMesh.visible = false;
    this.shardMesh.count = 0;
    this.group.add(this.shardMesh);
  }

  get specs(): BreakableSpec[] {
    return this.items.map((i) => i.spec);
  }

  /** Số vật còn nguyên. */
  get aliveCount(): number {
    return this.items.filter((i) => i.alive).length;
  }

  get shardCount(): number {
    return this.shards.length;
  }

  /** Đòn cấp `tier` rơi ở (x, z) bán kính `r`, từ hướng (`fromX`, `fromZ`) tới; trả số vật vỡ. */
  hit(x: number, z: number, r: number, tier: HitTier, fromX?: number, fromZ?: number): number {
    const idx = brokenBy(
      this.items.map((i) => i.spec),
      this.items.map((i) => i.alive),
      x,
      z,
      r,
      tier,
    );
    for (const i of idx) this.breakItem(this.items[i]!, fromX, fromZ);
    return idx.length;
  }

  private breakItem(it: Item, fromX?: number, fromZ?: number): void {
    const def = BREAK_KINDS[it.spec.kind];
    it.alive = false;
    it.respawnIn = def.respawn;
    it.group.visible = false;
    let dx = 0;
    let dz = 0;
    if (fromX !== undefined && fromZ !== undefined) {
      const l = Math.hypot(it.spec.x - fromX, it.spec.z - fromZ);
      if (l > 1e-3) {
        dx = (it.spec.x - fromX) / l;
        dz = (it.spec.z - fromZ) / l;
      }
    }
    const y = it.group.position.y + 0.5;
    for (let k = 0; k < def.debris && this.shards.length < MAX_SHARDS; k++) {
      this.shards.push(spawnShard(it.spec.x, y, it.spec.z, dx, dz, def.color, this.rnd));
    }
  }

  update(dt: number): void {
    for (const it of this.items) {
      if (it.alive) {
        if (it.grow < 1) {
          it.grow = Math.min(1, it.grow + dt / GROW);
          const k = 0.2 + 0.8 * it.grow;
          it.group.scale.setScalar(k);
        }
        continue;
      }
      it.respawnIn -= dt;
      if (it.respawnIn <= 0) {
        it.alive = true;
        it.grow = 0;
        it.group.scale.setScalar(0.2);
        it.group.visible = true;
      }
    }
    if (this.shards.length === 0) {
      this.shardMesh.visible = false;
      return;
    }
    let n = 0;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i]!;
      stepShard(s, dt, heightAt(s.x, s.z));
      if (s.life <= 0) this.shards.splice(i, 1);
    }
    for (const s of this.shards) {
      const k = Math.min(1, s.life / 0.35);
      _e.set(s.rx, s.ry, 0);
      _q.setFromEuler(_e);
      _p.set(s.x, s.y, s.z);
      const sz = s.size * k;
      _s.set(sz * 1.6, sz * 0.6, sz);
      _m.compose(_p, _q, _s);
      this.shardMesh.setMatrixAt(n, _m);
      this.shardMesh.setColorAt(n, _c.set(s.c));
      n++;
    }
    this.shardMesh.count = n;
    this.shardMesh.instanceMatrix.needsUpdate = true;
    if (this.shardMesh.instanceColor) this.shardMesh.instanceColor.needsUpdate = true;
    this.shardMesh.visible = n > 0;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.shardMat.dispose();
    this.shardMesh.dispose();
    this.items = [];
    this.shards = [];
  }
}
