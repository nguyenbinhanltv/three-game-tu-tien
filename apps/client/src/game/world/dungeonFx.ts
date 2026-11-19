import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, float, mix, positionWorld, sin, smoothstep, texture, time, vec2, vec3 } from 'three/tsl';
import { hash01 } from '@dtl/shared';
import { heightAt } from '../../base/levelCtx';
import { createWorldMaterial } from '../../render/materials/world';
import { getCloudNoise } from '../../render/noiseTex';

/**
 * Hiệu ứng nền dùng chung cho các bí cảnh làm lại ở DUN-1 (chỉ để nhìn, không va chạm, tất định theo `seed`):
 *  - khe nứt lõm có gờ đá nổi hai bên và ánh sáng mềm ở đáy (không viền đen, không dải phẳng);
 *  - sương thấp đọng quanh vành;
 *  - vòng trận cổng ra có hạt bay lên.
 * Mỗi bí cảnh truyền màu/vị trí qua `DungeonFxConfig`; vùng cấm (đài chiến, lối vào) qua `keepOut`.
 */

export interface DungeonFxConfig {
  cx: number;
  cz: number;
  exit: { x: number; z: number };
  seed: number;
  /** true = (x, z) nằm trong vùng không đặt gì (đệm `r` m). */
  keepOut: (x: number, z: number, r: number) => boolean;
  cracks?: {
    count: number;
    rMin: number;
    rMax: number;
    floor: [number, number, number];
    halo: [number, number, number];
    rock: [number, number, number];
    /** Nửa rộng khe (m): `w0` + `w1` × dạng chuông theo chiều dài (mặc định 0,35 + 0,9). */
    w0?: number;
    w1?: number;
    /** Bề rộng vùng phát sáng ở đáy theo `|across|` (mặc định 0,7). */
    glowW?: number;
  };
  mist?: { a: [number, number, number]; b: [number, number, number]; innerR: number; outerR: number; opacity: number };
  ring?: { rgb: string; mote: number };
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Mặt cắt ngang khe: vị trí ngang (đơn vị nửa rộng w) và độ nhô so với đất. Giữa là lòng khe, hai bên là gờ đá nổi rồi tan ra đất. */
const PROFILE: [number, number][] = [
  [-1.35, 0.0],
  [-1.12, 0.17],
  [-0.9, 0.2],
  [-0.78, 0.04],
  [0, 0.02],
  [0.78, 0.04],
  [0.9, 0.2],
  [1.12, 0.17],
  [1.35, 0.0],
];

export class DungeonFx {
  readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private motes: THREE.Points | null = null;
  private readonly moteSeed: number[] = [];
  private t = 0;

  constructor(private readonly cfg: DungeonFxConfig) {
    this.group.name = 'dungeon-fx';
    if (cfg.cracks) this.addCracks(cfg.cracks);
    if (cfg.mist) this.addMist(cfg.mist);
    if (cfg.ring) this.addExitRing(cfg.ring);
  }

  private addCracks(k: NonNullable<DungeonFxConfig['cracks']>): void {
    const { cx, cz, keepOut } = this.cfg;
    const rand = rng(this.cfg.seed + 31);
    const pos: number[] = [];
    const across: number[] = [];
    const idx: number[] = [];
    const P = PROFILE.length;
    let made = 0;
    for (let tries = 0; tries < 500 && made < k.count; tries++) {
      const a = rand() * Math.PI * 2;
      const r = k.rMin + rand() * (k.rMax - k.rMin);
      let x = cx + Math.cos(a) * r;
      let z = cz + Math.sin(a) * r;
      if (keepOut(x, z, k.rMin - 2)) continue;
      let dir = rand() * Math.PI * 2;
      const len = 14 + rand() * 38;
      const steps = Math.round(len / 2.2);
      const rows: number[][] = [];
      let ok = true;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const w = (k.w0 ?? 0.35) + (k.w1 ?? 0.9) * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (0.6 + 0.4 * rand());
        const nx = -Math.sin(dir);
        const nz = Math.cos(dir);
        if (keepOut(x, z, k.rMin - 6)) {
          ok = false;
          break;
        }
        const row: number[] = [];
        for (const [u, h] of PROFILE) {
          const px = x + nx * w * u;
          const pz = z + nz * w * u;
          row.push(px, heightAt(px, pz) + 0.05 + h * Math.min(1, w * 1.4), pz);
        }
        rows.push(row);
        dir += (rand() - 0.5) * 0.9;
        x += Math.cos(dir) * 2.2;
        z += Math.sin(dir) * 2.2;
      }
      if (!ok || rows.length < 3) continue;
      const base = pos.length / 3;
      for (const row of rows) {
        for (let j = 0; j < P; j++) {
          pos.push(row[j * 3]!, row[j * 3 + 1]!, row[j * 3 + 2]!);
          across.push(PROFILE[j]![0]);
        }
      }
      for (let v = 0; v + 1 < rows.length; v++) {
        for (let j = 0; j + 1 < P; j++) {
          const o = base + v * P + j;
          idx.push(o, o + P, o + 1, o + 1, o + P, o + P + 1);
        }
      }
      made++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('across', new THREE.Float32BufferAttribute(across, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const u = attribute('across', 'float').abs();
    const pulse = float(0.88).add(sin(time.mul(0.8).add(positionWorld.x.mul(0.05))).mul(0.12));
    const isLip = smoothstep(0.7, 0.88, u);
    const rock = vec3(...k.rock);
    // thân khe PBR có đổ sáng thật (gờ nổi bắt nắng, lòng khe tối), đáy phát sáng mềm bằng emissive; mép ngoài tan mềm
    const mat = createWorldMaterial({ transparent: true, depthWrite: false, roughness: 0.9, side: THREE.DoubleSide });
    mat.colorNode = mix(vec3(0.02, 0.025, 0.035), rock, isLip);
    const gw = k.glowW ?? 0.7;
    mat.emissiveNode = vec3(...k.floor)
      .mul(smoothstep(gw, 0.0, u))
      .mul(smoothstep(gw, 0.0, u))
      .mul(pulse);
    // gần camera (< ~14–34 m) khe mờ dần: không bao giờ thành dải to chắn khung hình khi camera sát mặt đất
    const nearFade = smoothstep(14, 34, positionWorld.sub(cameraPosition).length());
    mat.opacityNode = smoothstep(1.35, 1.05, u).mul(nearFade);
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -3;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'dungeon-cracks';
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const halo = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      side: THREE.DoubleSide,
    });
    halo.colorNode = vec3(...k.halo).mul(pulse);
    halo.opacityNode = smoothstep(1.2, 0.0, u).mul(0.3).mul(nearFade);
    const mesh2 = new THREE.Mesh(geo, halo);
    mesh2.name = 'dungeon-cracks-glow';
    mesh2.frustumCulled = false;
    mesh2.renderOrder = 2;
    this.group.add(mesh2);
    this.disposables.push(geo, mat, halo);
  }

  private addMist(m: NonNullable<DungeonFxConfig['mist']>): void {
    const { cx, cz } = this.cfg;
    const geo = new THREE.RingGeometry(18, m.outerR, 96, 48).rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(cx + p.getX(i), cz + p.getZ(i)) + 1.1);
    geo.computeBoundingSphere();
    const nz = getCloudNoise();
    const w = positionWorld.xz;
    const wind = vec2(time.mul(0.012), time.mul(0.006));
    const a = texture(nz, w.mul(1 / 83).add(wind)).a;
    const b = texture(nz, w.mul(1 / 31).sub(wind.mul(1.7))).g;
    const dens = smoothstep(0.38, 0.8, a.mul(0.65).add(b.mul(0.45)));
    const rr = w.sub(vec2(cx, cz)).length();
    const ring = smoothstep(m.innerR, m.innerR + 46, rr).mul(float(1).sub(smoothstep(m.outerR - 40, m.outerR, rr).mul(0.6)));
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    mat.colorNode = mix(vec3(...m.a), vec3(...m.b), b);
    mat.opacityNode = dens.mul(ring).mul(m.opacity);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'dungeon-mist';
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    this.group.add(mesh);
    this.disposables.push(geo, mat);
  }

  /** Vòng trận cổng ra: viền kép, 16 nét triện, vòng giữa mờ, cộng sáng nhẹ + 36 hạt linh quang bay lên. */
  private addExitRing(r: NonNullable<DungeonFxConfig['ring']>): void {
    const ex = this.cfg.exit;
    const N = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const g = cv.getContext('2d')!;
    const h = N / 2;
    const rg = g.createRadialGradient(h, h, 0, h, h, h);
    rg.addColorStop(0, `rgba(${r.rgb},0.16)`);
    rg.addColorStop(0.7, `rgba(${r.rgb},0.06)`);
    rg.addColorStop(1, `rgba(${r.rgb},0)`);
    g.fillStyle = rg;
    g.fillRect(0, 0, N, N);
    const ring = (rad: number, w: number, a: number) => {
      g.strokeStyle = `rgba(${r.rgb},${a})`;
      g.lineWidth = w;
      g.beginPath();
      g.arc(h, h, rad, 0, Math.PI * 2);
      g.stroke();
    };
    ring(h * 0.94, 5, 0.7);
    ring(h * 0.84, 2, 0.5);
    ring(h * 0.5, 2, 0.35);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.strokeStyle = `rgba(${r.rgb},0.6)`;
      g.lineWidth = i % 2 ? 2 : 4;
      g.beginPath();
      g.moveTo(h + Math.cos(a) * h * (i % 2 ? 0.86 : 0.7), h + Math.sin(a) * h * (i % 2 ? 0.86 : 0.7));
      g.lineTo(h + Math.cos(a) * h * 0.93, h + Math.sin(a) * h * 0.93);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const R = 5.4;
    const geo = new THREE.RingGeometry(0.01, R, 48, 6).rotateX(-Math.PI / 2);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, heightAt(ex.x + p.getX(i), ex.z + p.getZ(i)) + 0.14);
      uv.setXY(i, 0.5 + p.getX(i) / (2 * R), 0.5 + p.getZ(i) / (2 * R));
    }
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ex.x, 0, ex.z);
    mesh.name = 'dungeon-exit-ring';
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    this.disposables.push(geo, mat, tex);
    const n = 36;
    for (let i = 0; i < n; i++) this.moteSeed.push(hash01(i, 1, 6601), hash01(i, 2, 6601), hash01(i, 3, 6601));
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(ex.x, heightAt(ex.x, ex.z) + 3, ex.z), 12);
    const pm = new THREE.PointsMaterial({
      color: r.mote,
      size: 0.28,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.motes = new THREE.Points(pg, pm);
    this.motes.name = 'dungeon-exit-motes';
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
    this.disposables.push(pg, pm);
    this.updateMotes();
  }

  private updateMotes(): void {
    if (!this.motes) return;
    const ex = this.cfg.exit;
    const a = this.motes.geometry.attributes.position as THREE.BufferAttribute;
    const gy = heightAt(ex.x, ex.z);
    for (let i = 0; i < a.count; i++) {
      const s0 = this.moteSeed[i * 3]!;
      const s1 = this.moteSeed[i * 3 + 1]!;
      const s2 = this.moteSeed[i * 3 + 2]!;
      const ph = (this.t * (0.12 + 0.1 * s2) + s0) % 1;
      const ang = s1 * Math.PI * 2 + this.t * 0.2;
      const rad = 1.2 + 3.6 * s2;
      a.setXYZ(i, ex.x + Math.cos(ang) * rad, gy + 0.3 + ph * 5.5, ex.z + Math.sin(ang) * rad);
    }
    a.needsUpdate = true;
  }

  update(dt: number): void {
    this.t += dt;
    this.updateMotes();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
