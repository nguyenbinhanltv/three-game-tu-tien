import * as THREE from 'three/webgpu';
import type { MonsterDef } from '@dtl/shared';
import { col, flat, G, GeoBuilder, mat } from './geo';
import { createWorldMaterial } from '../render/materials/world';
import { markBloom } from '../render/post';
import { HitReact, type HitOpts } from './hitreact';

/** Material dùng chung cho mọi mô hình tô màu theo đỉnh. */
export const MODEL_MAT = createWorldMaterial({ vertexColors: true });
const GLOW_MAT = (color: number, opacity = 0.5) => {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  markBloom(m, 1.2);
  return m;
};

const T_ROBE = flat(new THREE.CylinderGeometry(0.2, 0.38, 0.98, 8));
const T_SLEEVE = flat(new THREE.CylinderGeometry(0.065, 0.115, 0.6, 6));
const T_LEG = flat(new THREE.CylinderGeometry(0.085, 0.07, 0.82, 6));

const C_SKIN = col(0xf0cfa8);
const C_HAIR = col(0x1c1a22);
const C_PANTS = col(0x3a3f4a);
const C_SHOE = col(0x22242a);
const C_STEEL = col(0xd5e3ec);
const C_GOLD = col(0xcaa24c);
const C_WOOD = col(0x5a3d2a);

const damp = (cur: number, target: number, k: number, dt: number) => cur + (target - cur) * Math.min(1, k * dt);

function buildSword(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.add(G.box, mat(0, 0.62, 0, 0, 0, 0, 0.075, 0.92, 0.02), C_STEEL);
  b.add(G.pyramid, mat(0, 1.14, 0, 0, 0, 0, 0.053, 0.14, 0.014), C_STEEL);
  b.add(G.box, mat(0, 0.14, 0, 0, 0, 0, 0.24, 0.045, 0.06), C_GOLD);
  b.add(G.cyl6, mat(0, 0.03, 0, 0, 0, 0, 0.024, 0.2, 0.024), C_WOOD);
  b.add(G.ico0, mat(0, -0.09, 0, 0, 0, 0, 0.04), C_GOLD);
  return b.build();
}
export const SWORD_GEO = buildSword();

export interface HumanoidOpts {
  robe: number | string;
  trim: number | string;
  hair?: number | string;
  elder?: boolean;
  sword?: boolean;
  scale?: number;
}

export interface AnimState {
  speed: number;
  flying: boolean;
  meditating: boolean;
  dead: boolean;
  casting: boolean;
  airborne: boolean;
}

export class Humanoid {
  root = new THREE.Group();
  pose = new THREE.Group();
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private backSword: THREE.Mesh | null = null;
  private flySword: THREE.Group | null = null;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private phase = Math.random() * 6;
  private attackT = 0;
  private time = Math.random() * 10;
  height = 1.9;
  /** Phản ứng trúng đòn (chỉ hiển thị). */
  hit: HitReact;

  constructor(o: HumanoidOpts) {
    const robe = col(o.robe);
    const trim = col(o.trim);
    const hair = col(o.hair ?? 0x1c1a22);
    const b = new GeoBuilder();
    b.add(T_ROBE, mat(0, 1.0, 0), robe, 0.07);
    b.add(G.cyl8, mat(0, 0.54, 0, 0, 0, 0, 0.385, 0.07, 0.385), trim);
    b.add(G.cyl8, mat(0, 1.04, 0, 0, 0, 0, 0.255, 0.09, 0.255), trim);
    b.add(G.box, mat(0, 1.32, 0.17, 0.25, 0, 0, 0.16, 0.34, 0.04), trim);
    b.add(G.cyl6, mat(0, 1.52, 0, 0, 0, 0, 0.065, 0.1, 0.065), C_SKIN);
    b.add(G.sphere, mat(0, 1.66, 0.01, 0, 0, 0, 0.155, 0.17, 0.155), C_SKIN);
    b.add(G.sphere, mat(0, 1.7, -0.035, 0, 0, 0, 0.168, 0.16, 0.165), hair);
    b.add(G.box, mat(0, 1.42, -0.17, 0.12, 0, 0, 0.22, 0.44, 0.06), hair);
    b.add(G.sphere, mat(0, 1.87, -0.03, 0, 0, 0, 0.075), hair);
    b.add(G.box, mat(0, 1.87, -0.03, 0, 0, 0, 0.3, 0.022, 0.022), o.elder ? C_GOLD : trim);
    if (o.elder) {
      b.add(G.cone6, mat(0, 1.5, 0.13, Math.PI, 0, 0, 0.07, 0.3, 0.05), col(0xdedede));
    }
    const bodyGeo = b.build();
    const body = new THREE.Mesh(bodyGeo, MODEL_MAT);

    const ab = new GeoBuilder();
    ab.add(T_SLEEVE, mat(0, -0.3, 0), robe, 0.06);
    ab.add(G.sphere, mat(0, -0.635, 0, 0, 0, 0, 0.055), C_SKIN);
    const armGeo = ab.build();
    const lb = new GeoBuilder();
    lb.add(T_LEG, mat(0, -0.41, 0), C_PANTS);
    lb.add(G.box, mat(0, -0.82, 0.045, 0, 0, 0, 0.12, 0.08, 0.24), C_SHOE);
    const legGeo = lb.build();
    this.geos.push(bodyGeo, armGeo, legGeo);

    this.armL = new THREE.Mesh(armGeo, MODEL_MAT);
    this.armR = new THREE.Mesh(armGeo, MODEL_MAT);
    this.armL.position.set(0.26, 1.42, 0);
    this.armR.position.set(-0.26, 1.42, 0);
    this.legL = new THREE.Mesh(legGeo, MODEL_MAT);
    this.legR = new THREE.Mesh(legGeo, MODEL_MAT);
    this.legL.position.set(0.11, 0.86, 0);
    this.legR.position.set(-0.11, 0.86, 0);
    this.pose.add(body, this.armL, this.armR, this.legL, this.legR);

    if (o.sword) {
      this.backSword = new THREE.Mesh(SWORD_GEO, MODEL_MAT);
      this.backSword.position.set(0.14, 0.86, -0.24);
      this.backSword.rotation.set(0, 0, -0.5);
      this.pose.add(this.backSword);

      this.flySword = new THREE.Group();
      const fs = new THREE.Mesh(SWORD_GEO, MODEL_MAT);
      fs.rotation.x = Math.PI / 2;
      fs.position.set(0, 0, -1.0);
      fs.scale.setScalar(2.0);
      const auraMat = GLOW_MAT(0x8fe4ff, 0.42);
      this.mats.push(auraMat);
      const aura = new THREE.Mesh(G.octa, auraMat);
      aura.scale.set(0.34, 0.07, 1.7);
      this.flySword.add(fs, aura);
      this.flySword.position.y = -0.1;
      this.flySword.visible = false;
      this.root.add(this.flySword);
    }
    this.root.add(this.pose);
    const s = o.scale ?? 1;
    this.root.scale.setScalar(s);
    this.height = 1.95 * s;
    for (const m of [body, this.armL, this.armR, this.legL, this.legR]) m.castShadow = true;
    this.hit = new HitReact(this.backSword ? [body, this.armL, this.armR, this.legL, this.legR, this.backSword] : [body, this.armL, this.armR, this.legL, this.legR]);
  }

  /** Số bước chân khi chạy (tăng mỗi lần một chân chạm đất); cho bụi chân (render/vfx/trail.ts). */
  steps = 0;
  /** Số lần ra đòn; cho chùm linh quang quanh kiếm. */
  attacks = 0;
  /** Đang đứng trên đất (không bay, không nhảy) ở khung gần nhất. */
  grounded = true;

  get hasSword(): boolean {
    return this.backSword !== null;
  }

  attack(): void {
    this.attackT = 0.32;
    this.attacks++;
  }

  hitReact(o: HitOpts): void {
    this.hit.react(o);
  }

  update(realDt: number, a: AnimState): void {
    // Đang hit-stop thì animation khựng (dt = 0).
    const dt = this.hit.update(realDt);
    this.time += dt;
    const { armL, armR, legL, legR, pose } = this;
    const running = !a.flying && !a.dead && !a.meditating && !a.airborne && a.speed > 0.6;
    this.grounded = !a.flying && !a.airborne;
    if (running) {
      // Mỗi nửa chu kỳ sin (một chân chạm đất) là một bước.
      const before = Math.floor(this.phase / Math.PI);
      this.phase += dt * 12 * Math.min(1.3, a.speed / 7);
      if (Math.floor(this.phase / Math.PI) !== before) this.steps++;
    }
    const sw = running ? Math.sin(this.phase) : 0;

    let legLx = sw * 0.85;
    let legRx = -sw * 0.85;
    let legZ = 0;
    let armLx = -sw * 0.7;
    let armRx = sw * 0.7;
    let armZ = 0.1 + Math.sin(this.time * 1.6) * 0.02;
    let poseY = running ? Math.abs(Math.sin(this.phase)) * 0.06 : 0;
    let poseRx = running ? 0.1 : 0;

    if (a.dead) {
      poseRx = -Math.PI / 2;
      poseY = 0.22;
      legLx = legRx = 0;
      armLx = armRx = 0;
      armZ = 0.5;
    } else if (a.meditating) {
      poseY = -0.5;
      legLx = legRx = -1.5;
      legZ = 0.6;
      armLx = armRx = -0.5;
      armZ = 0.22;
    } else if (a.flying) {
      legLx = 0.28;
      legRx = -0.22;
      armLx = armRx = 0.55;
      armZ = 0.4;
      poseRx = 0.2 * Math.min(1, a.speed / 14);
      poseY = Math.sin(this.time * 2.2) * 0.05;
    } else if (a.airborne) {
      legLx = 0.45;
      legRx = -0.3;
      armZ = 0.7;
    }
    if (a.casting && !a.dead) {
      armLx = armRx = -1.45;
      armZ = 0.25 + Math.sin(this.time * 14) * 0.05;
    }
    if (this.attackT > 0) {
      this.attackT -= dt;
      armRx = -2.3 * Math.sin((Math.PI * Math.max(0, this.attackT)) / 0.32);
    }

    const k = 14;
    legL.rotation.x = damp(legL.rotation.x, legLx, k, dt);
    legR.rotation.x = damp(legR.rotation.x, legRx, k, dt);
    legL.rotation.z = damp(legL.rotation.z, legZ, k, dt);
    legR.rotation.z = damp(legR.rotation.z, -legZ, k, dt);
    armL.rotation.x = damp(armL.rotation.x, armLx, k, dt);
    armR.rotation.x = damp(armR.rotation.x, armRx, this.attackT > 0 ? 40 : k, dt);
    armL.rotation.z = damp(armL.rotation.z, armZ, k, dt);
    armR.rotation.z = damp(armR.rotation.z, -armZ, k, dt);
    pose.position.y = damp(pose.position.y, poseY, 10, dt);
    pose.rotation.x = damp(pose.rotation.x, poseRx, 8, dt);
    pose.position.x = this.hit.shake;

    if (this.flySword && this.backSword) {
      const fly = a.flying && !a.dead;
      this.flySword.visible = fly;
      this.backSword.visible = !fly;
    }
  }

  dispose(): void {
    this.hit.reset();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// ---------- quái ----------

interface MonGeo {
  body: THREE.BufferGeometry;
  leg: THREE.BufferGeometry | null;
  arm: THREE.BufferGeometry | null;
  seg: THREE.BufferGeometry | null;
  head: THREE.BufferGeometry | null;
  legLen: number;
}
const MON_GEO = new Map<string, MonGeo>();

function monGeo(def: MonsterDef): MonGeo {
  let g = MON_GEO.get(def.id);
  if (g) return g;
  const main = col(def.color);
  const accent = col(def.accent);
  const dark = main.clone().multiplyScalar(0.6);
  const b = new GeoBuilder();
  g = { body: G.box, leg: null, arm: null, seg: null, head: null, legLen: 0.6 };
  if (def.model === 'wolf' || def.model === 'fox' || def.model === 'boar') {
    const boar = def.model === 'boar';
    const fox = def.model === 'fox';
    const L = boar ? 0.44 : 0.62;
    g.legLen = L;
    const by = L + (boar ? 0.3 : 0.14);
    b.add(G.ico1, mat(0, by, 0, 0, 0, 0, boar ? 0.44 : 0.3, boar ? 0.42 : 0.31, boar ? 0.78 : 0.72), main, 0.1);
    b.add(G.ico0, mat(0, by + 0.05, 0.42, 0.4, 0, 0, boar ? 0.42 : 0.33, boar ? 0.4 : 0.36, 0.36), main, 0.08);
    const hy = by + (boar ? 0.0 : 0.26);
    const hz = boar ? 0.92 : 0.8;
    b.add(G.ico1, mat(0, hy, hz, 0, 0, 0, boar ? 0.3 : 0.21, boar ? 0.28 : 0.21, 0.27), main, 0.08);
    b.add(G.cone6, mat(0, hy - 0.05, hz + 0.3, Math.PI / 2, 0, 0, boar ? 0.17 : 0.1, 0.34, boar ? 0.15 : 0.1), boar ? dark : accent);
    for (const sx of [-1, 1]) {
      b.add(G.cone5, mat(sx * 0.13, hy + (fox ? 0.3 : 0.24), hz - 0.08, -0.2, 0, sx * -0.25, fox ? 0.09 : 0.07, fox ? 0.3 : 0.2, 0.06), dark);
      b.add(G.ico0, mat(sx * 0.11, hy + 0.05, hz + 0.19, 0, 0, 0, 0.035), accent);
      if (boar) b.add(G.cone5, mat(sx * 0.16, hy - 0.1, hz + 0.3, 0.9, 0, sx * -0.4, 0.045, 0.26, 0.045), accent);
    }
    if (fox) {
      b.add(G.ico1, mat(0, by + 0.12, -0.95, 0.5, 0, 0, 0.19, 0.19, 0.46), main, 0.1);
      b.add(G.ico0, mat(0, by + 0.3, -1.3, 0.5, 0, 0, 0.13, 0.13, 0.2), accent);
    } else if (!boar) {
      b.add(G.cone6, mat(0, by + 0.02, -0.92, -2.1, 0, 0, 0.1, 0.62, 0.1), dark);
      // Bờm lưng.
      b.add(G.cone5, mat(0, by + 0.34, 0.2, -0.4, 0, 0, 0.1, 0.3, 0.3), dark);
    } else {
      // Gai sắt trên lưng Thiết Bối Trư.
      for (let i = 0; i < 4; i++) b.add(G.cone5, mat(0, by + 0.46, 0.4 - i * 0.28, -0.3, 0, 0, 0.09, 0.26, 0.09), accent);
    }
    g.body = b.build();
    const lb = new GeoBuilder();
    lb.add(G.cyl6, mat(0, -L / 2, 0, 0, 0, 0, boar ? 0.085 : 0.065, L, boar ? 0.085 : 0.065), dark);
    lb.add(G.box, mat(0, -L + 0.03, 0.03, 0, 0, 0, 0.13, 0.07, 0.17), dark);
    g.leg = lb.build();
  } else if (def.model === 'ape') {
    b.add(G.ico1, mat(0, 1.2, 0.02, 0.25, 0, 0, 0.56, 0.62, 0.44), main, 0.1);
    b.add(G.ico0, mat(0, 0.72, -0.02, 0, 0, 0, 0.42, 0.34, 0.36), dark);
    b.add(G.ico1, mat(0, 1.78, 0.24, 0, 0, 0, 0.27, 0.27, 0.27), main, 0.08);
    b.add(G.box, mat(0, 1.84, 0.44, 0.2, 0, 0, 0.4, 0.09, 0.14), dark);
    b.add(G.box, mat(0, 1.68, 0.47, 0, 0, 0, 0.22, 0.14, 0.12), dark);
    for (const sx of [-1, 1]) {
      b.add(G.ico0, mat(sx * 0.1, 1.79, 0.48, 0, 0, 0, 0.04), accent);
      b.add(G.ico0, mat(sx * 0.6, 1.58, 0, 0, 0.4, 0, 0.3, 0.24, 0.3), accent, 0.1);
    }
    b.add(G.ico0, mat(0.1, 1.72, -0.3, 0.3, 0.2, 0, 0.34, 0.2, 0.26), accent, 0.1);
    g.body = b.build();
    const ab = new GeoBuilder();
    ab.add(G.cyl6, mat(0, -0.5, 0, 0, 0, 0, 0.15, 1.0, 0.15), main, 0.08);
    ab.add(G.ico0, mat(0, -1.08, 0, 0, 0, 0, 0.22), dark);
    g.arm = ab.build();
    const lb = new GeoBuilder();
    lb.add(G.cyl6, mat(0, -0.36, 0, 0, 0, 0, 0.16, 0.74, 0.16), dark);
    lb.add(G.box, mat(0, -0.72, 0.06, 0, 0, 0, 0.3, 0.1, 0.4), dark);
    g.leg = lb.build();
    g.legLen = 0.76;
  } else {
    // Giao long: mỗi đốt thân một khối, đầu có sừng.
    const sb = new GeoBuilder();
    sb.add(G.ico1, mat(0, 0, 0, 0, 0, 0, 1, 0.9, 1.25), main, 0.12);
    sb.add(G.cone5, mat(0, 0.85, 0, 0, 0, 0, 0.3, 0.8, 0.5), accent);
    g.seg = sb.build();
    const hb = new GeoBuilder();
    hb.add(G.ico1, mat(0, 0, 0, 0, 0, 0, 0.95, 0.8, 1.2), main, 0.1);
    hb.add(G.box, mat(0, -0.15, 1.15, 0, 0, 0, 0.9, 0.5, 1.3), main);
    hb.add(G.box, mat(0, -0.52, 1.0, 0.18, 0, 0, 0.75, 0.2, 1.1), col(def.color).multiplyScalar(0.7));
    for (const sx of [-1, 1]) {
      hb.add(G.cone6, mat(sx * 0.5, 0.95, -0.3, -0.7, 0, sx * -0.3, 0.16, 1.5, 0.16), accent);
      hb.add(G.ico0, mat(sx * 0.48, 0.25, 0.9, 0, 0, 0, 0.14), col(0x66f0ff));
      hb.add(G.cone5, mat(sx * 0.3, -0.5, 1.6, Math.PI, 0, 0, 0.07, 0.34, 0.07), col(0xffffff));
    }
    g.head = hb.build();
  }
  MON_GEO.set(def.id, g);
  return g;
}

export class MonsterModel {
  root = new THREE.Group();
  private inner = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private arms: THREE.Mesh[] = [];
  private segs: THREE.Mesh[] = [];
  private phase = Math.random() * 6;
  private time = Math.random() * 10;
  private attackT = 0;
  private deadT = 0;
  height: number;
  /** Phản ứng trúng đòn (chỉ hiển thị). */
  hit: HitReact;

  constructor(public def: MonsterDef) {
    const g = monGeo(def);
    const s = def.scale;
    if (def.model === 'serpent') {
      const n = 15;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(i === 0 ? g.head! : g.seg!, MODEL_MAT);
        const r = i === 0 ? 0.62 : 0.56 * (1 - (i / n) * 0.72);
        m.scale.setScalar(r);
        this.segs.push(m);
        this.inner.add(m);
      }
      this.height = 4.6 * s;
    } else {
      const body = new THREE.Mesh(g.body, MODEL_MAT);
      body.castShadow = true;
      this.inner.add(body);
      if (def.model === 'ape') {
        for (const sx of [1, -1]) {
          const arm = new THREE.Mesh(g.arm!, MODEL_MAT);
          arm.position.set(sx * 0.66, 1.52, 0.05);
          this.arms.push(arm);
          const leg = new THREE.Mesh(g.leg!, MODEL_MAT);
          leg.position.set(sx * 0.26, g.legLen, 0);
          this.legs.push(leg);
          this.inner.add(arm, leg);
        }
        this.height = 2.25 * s;
      } else {
        const lx = def.model === 'boar' ? 0.26 : 0.19;
        for (const [sx, sz] of [
          [1, 1],
          [-1, -1],
          [-1, 1],
          [1, -1],
        ]) {
          const leg = new THREE.Mesh(g.leg!, MODEL_MAT);
          leg.position.set(sx * lx, g.legLen, sz * 0.46);
          this.legs.push(leg);
          this.inner.add(leg);
        }
        this.height = (g.legLen + 0.85) * s;
      }
    }
    this.root.add(this.inner);
    this.root.scale.setScalar(s);
    this.hit = new HitReact(this.inner.children as THREE.Mesh[]);
  }

  attack(): void {
    this.attackT = 0.4;
  }

  hitReact(o: HitOpts): void {
    // Quái to bị đẩy ít hơn.
    this.hit.react({ ...o, mass: (o.mass ?? 1) * (this.def.boss ? 0.3 : 1 / Math.max(1, this.def.scale)) });
  }

  /** `speed` m/s; `dead` chuyển sang nằm xuống rồi chìm dần. */
  update(realDt: number, speed: number, dead: boolean): void {
    const dt = this.hit.update(realDt);
    this.inner.position.x = this.hit.shake;
    this.time += dt;
    const moving = speed > 0.3 && !dead;
    if (moving) this.phase += dt * (5 + speed * 1.5);
    const sw = moving ? Math.sin(this.phase) : 0;
    let lunge = 0;
    if (this.attackT > 0) {
      this.attackT -= dt;
      lunge = Math.sin((Math.PI * Math.max(0, this.attackT)) / 0.4);
    }
    if (dead) this.deadT = Math.min(3, this.deadT + dt);
    else this.deadT = 0;
    const fall = Math.min(1, this.deadT / 0.45);

    if (this.def.model === 'serpent') {
      const n = this.segs.length;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const m = this.segs[i];
        const rise = Math.max(0, 1 - u * 3.4);
        const wave = Math.sin(u * 8 - this.time * 1.8) * 0.75 * (0.25 + u);
        m.position.set(
          wave * (1 - fall * 0.7),
          (0.45 + rise * rise * 3.3 + (i === 0 ? Math.sin(this.time * 1.3) * 0.15 : 0)) * (1 - fall * 0.85) - (i === 0 ? lunge * 0.9 : 0),
          -u * 6.4 + (i < 3 ? lunge * 1.6 * (1 - i / 3) : 0) + 1.2,
        );
        m.rotation.y = Math.cos(u * 8 - this.time * 1.8) * 0.5;
        m.rotation.x = i === 0 ? 0.25 + lunge * 0.5 : -rise * 0.9;
      }
      this.inner.position.y = -Math.max(0, this.deadT - 1.4) * 0.6;
      return;
    }
    if (this.def.model === 'ape') {
      this.legs[0].rotation.x = sw * 0.7;
      this.legs[1].rotation.x = -sw * 0.7;
      const smash = lunge * 2.4;
      this.arms[0].rotation.x = -sw * 0.6 - smash;
      this.arms[1].rotation.x = sw * 0.6 - smash;
      this.arms[0].rotation.z = 0.18;
      this.arms[1].rotation.z = -0.18;
      this.inner.rotation.x = lunge * 0.25 + (dead ? 0 : Math.sin(this.time * 1.4) * 0.02);
    } else {
      this.legs[0].rotation.x = sw * 0.75;
      this.legs[1].rotation.x = sw * 0.75;
      this.legs[2].rotation.x = -sw * 0.75;
      this.legs[3].rotation.x = -sw * 0.75;
      this.inner.rotation.x = -lunge * 0.3;
      this.inner.position.z = lunge * 0.55;
    }
    this.inner.rotation.z = fall * (Math.PI / 2) * 0.95;
    this.inner.position.y = (moving ? Math.abs(sw) * 0.05 : 0) + fall * 0.25 - Math.max(0, this.deadT - 1.4) * 0.5;
  }
}

// ---------- điểm hái thuốc ----------

const NODE_GEO = new Map<string, THREE.BufferGeometry>();

export function nodeGeometry(item: string): THREE.BufferGeometry {
  let g = NODE_GEO.get(item);
  if (g) return g;
  const b = new GeoBuilder();
  if (item === 'itm_huyet_linh_chi') {
    b.add(G.cyl6, mat(0, 0.2, 0, 0, 0, 0, 0.07, 0.4, 0.07), col(0xe8d9c0));
    b.add(G.cone7, mat(0, 0.5, 0, 0, 0, 0, 0.42, 0.24, 0.42), col(0xc02b3a));
    b.add(G.cyl6, mat(0.25, 0.12, 0.1, 0, 0, 0, 0.045, 0.24, 0.045), col(0xe8d9c0));
    b.add(G.cone7, mat(0.25, 0.3, 0.1, 0, 0, 0, 0.24, 0.15, 0.24), col(0xd8404a));
  } else {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.add(G.cone5, mat(Math.cos(a) * 0.12, 0.38, Math.sin(a) * 0.12, Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45, 0.07, 0.8, 0.03), col(i % 2 ? 0x58c98a : 0x7fe0a8));
    }
    b.add(G.ico0, mat(0, 0.86, 0, 0, 0, 0, 0.09), col(0xd8fff0));
  }
  g = b.build();
  NODE_GEO.set(item, g);
  return g;
}

const NODE_GLOW = { herb: GLOW_MAT(0x7fffc0, 0.4), chi: GLOW_MAT(0xff6070, 0.4) };

export function buildNode(item: string): THREE.Group {
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(nodeGeometry(item), MODEL_MAT));
  const glow = new THREE.Mesh(G.ico1, item === 'itm_huyet_linh_chi' ? NODE_GLOW.chi : NODE_GLOW.herb);
  glow.scale.set(0.55, 0.75, 0.55);
  glow.position.y = 0.5;
  grp.add(glow);
  return grp;
}

// ---------- nhãn tên ----------

export function makeLabel(text: string, color = '#ffffff', sub = '', subColor = '#ffd98a'): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const draw = (t: string, y: number, font: string, fill: string) => {
    g.font = font;
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(8,12,20,0.85)';
    g.strokeText(t, 256, y);
    g.fillStyle = fill;
    g.fillText(t, 256, y);
  };
  if (sub) {
    draw(sub, 34, '600 30px "Segoe UI", Arial, sans-serif', subColor);
    draw(text, 88, '700 42px "Segoe UI", Arial, sans-serif', color);
  } else {
    draw(text, 72, '700 42px "Segoe UI", Arial, sans-serif', color);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sp.scale.set(3.6, 0.9, 1);
  sp.renderOrder = 5;
  return sp;
}

export function disposeLabel(sp: THREE.Sprite): void {
  sp.material.map?.dispose();
  sp.material.dispose();
}
