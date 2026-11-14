import * as THREE from 'three/webgpu';
import { DUNGEON_EXIT, groundAt, MS_ATTACK, MS_DEAD, PF_CASTING, PF_DEAD, PF_FLYING, PF_MEDITATING, PORTAL_POS } from '@dtl/shared';
import { MONSTER, monsterName, NPCS, QUESTS, realmName, t } from '@dtl/content';
import type { QuestView } from '@dtl/shared';
import { buildNode, disposeLabel, Humanoid, makeLabel, MonsterModel } from './models';
import { hitStopFor } from './hitreact';

export interface PState {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vy: number;
  gr: boolean;
  fl: number;
  lv: number;
  hp: number;
  mhp: number;
  mp: number;
  mmp: number;
  seq: number;
  wp: string;
}
export interface MState {
  t: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  mhp: number;
  lv: number;
  st: number;
  /** Cờ MF_* và thời điểm server (ms) hết trạng thái đó. */
  mf?: number;
  ce?: number;
}
export interface NState {
  t: string;
  x: number;
  y: number;
  z: number;
  on: boolean;
}
export interface WorldView {
  level: string;
  players: Map<string, PState>;
  monsters: Map<string, MState>;
  nodes: Map<string, NState>;
}

const ROBES: [number, number][] = [
  [0xe9eef4, 0x3b6ea8],
  [0x9fd3d0, 0x1f6f78],
  [0xcdbbe8, 0x5b3f96],
  [0xb23b3b, 0xe2c27a],
  [0x7fb58a, 0x2f6b45],
  [0xe8d9a8, 0x8a6a2a],
  [0x39414f, 0x9fb6d0],
  [0x8fc3ec, 0xf2f6fa],
];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function angleLerp(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

const BAR_BG = new THREE.SpriteMaterial({ color: 0x10141c, transparent: true, opacity: 0.7, depthWrite: false, fog: false });
const BAR_RED = new THREE.SpriteMaterial({ color: 0xe0483e, depthWrite: false, fog: false });
const BAR_GREEN = new THREE.SpriteMaterial({ color: 0x58c36a, depthWrite: false, fog: false });

class HpBar {
  group = new THREE.Group();
  private fg: THREE.Sprite;
  constructor(green: boolean, private width = 1.5) {
    const bg = new THREE.Sprite(BAR_BG);
    bg.scale.set(width + 0.08, 0.2, 1);
    this.fg = new THREE.Sprite(green ? BAR_GREEN : BAR_RED);
    this.fg.scale.set(width, 0.13, 1);
    this.fg.renderOrder = 7;
    bg.renderOrder = 6;
    this.group.add(bg, this.fg);
  }
  set(frac: number) {
    const f = Math.max(0.02, Math.min(1, frac));
    this.fg.scale.x = this.width * f;
    // Sprite luôn quay về camera nên phải neo mép trái bằng tâm quay, không dời vị trí được.
    this.fg.center.x = 0.5 / f;
  }
}

export class PlayerVis {
  model: Humanoid;
  label: THREE.Sprite;
  bar: HpBar;
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  speed = 0;
  fl = 0;
  lv = 0;
  constructor(
    public sid: string,
    public s: PState,
    public local: boolean,
  ) {
    const [robe, trim] = ROBES[hashStr(s.name) % ROBES.length];
    this.model = new Humanoid({ robe, trim, sword: true });
    this.label = makeLabel(s.name, local ? '#bfe8ff' : '#ffffff', realmName(s.lv));
    this.lv = s.lv;
    this.label.position.y = 2.55;
    this.model.root.add(this.label);
    this.bar = new HpBar(true, 1.3);
    this.bar.group.position.y = 2.12;
    this.model.root.add(this.bar.group);
    this.x = s.x;
    this.y = s.y;
    this.z = s.z;
    this.yaw = s.yaw;
  }
  refreshLabel() {
    this.model.root.remove(this.label);
    disposeLabel(this.label);
    this.label = makeLabel(this.s.name, this.local ? '#bfe8ff' : '#ffffff', realmName(this.s.lv));
    this.label.position.y = 2.55;
    this.model.root.add(this.label);
    this.lv = this.s.lv;
  }
  dispose() {
    disposeLabel(this.label);
    this.model.dispose();
  }
}

export class MonVis {
  model: MonsterModel;
  label: THREE.Sprite | null = null;
  bar: HpBar;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed = 0;
  lv = -1;
  wasAttack = false;
  constructor(
    public id: string,
    public s: MState,
  ) {
    const def = MONSTER.get(s.t)!;
    this.model = new MonsterModel(def);
    this.bar = new HpBar(false, def.boss ? 3 : 1.5);
    this.bar.group.position.y = this.model.height / def.scale + 0.35;
    this.bar.group.scale.setScalar(1 / def.scale);
    this.model.root.add(this.bar.group);
    this.x = s.x;
    this.y = s.y;
    this.z = s.z;
    this.yaw = s.yaw;
  }
  refreshLabel(myLevel: number) {
    if (this.label) {
      this.model.root.remove(this.label);
      disposeLabel(this.label);
    }
    const def = this.model.def;
    const d = this.s.lv - myLevel;
    const color = def.boss ? '#ffb347' : d >= 3 ? '#ff6b5e' : d >= 1 ? '#ffd166' : d <= -5 ? '#9aa3ad' : '#f2f2f2';
    this.label = makeLabel(monsterName(def.id), color, t('ui.level_short', { n: this.s.lv }), '#c9d4de');
    this.label.position.y = this.model.height / def.scale + 0.95;
    this.label.scale.multiplyScalar(1 / def.scale);
    if (def.boss) this.label.scale.multiplyScalar(1.8);
    this.model.root.add(this.label);
    this.lv = this.s.lv;
  }
  dispose() {
    if (this.label) disposeLabel(this.label);
  }
}

interface NpcVis {
  id: string;
  model: Humanoid;
  label: THREE.Sprite;
  marker: THREE.Sprite;
  x: number;
  y: number;
  z: number;
}

function makeMarker(ch: string, color: string): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.font = '900 110px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(20,14,4,0.9)';
  g.strokeText(ch, 64, 68);
  g.fillStyle = color;
  g.fillText(ch, 64, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type PickResult = { kind: 'mon' | 'npc' | 'node' | 'player'; id: string } | null;

const _v = new THREE.Vector3();

export class EntityManager {
  group = new THREE.Group();
  players = new Map<string, PlayerVis>();
  monsters = new Map<string, MonVis>();
  nodes = new Map<string, THREE.Group>();
  npcs: NpcVis[] = [];
  ring: THREE.Mesh;
  private markerNew = makeMarker('!', '#ffd84a');
  private markerDone = makeMarker('?', '#ffd84a');
  private markerWait = makeMarker('?', '#9aa3ad');
  private time = 0;
  hasNpcs: boolean;

  constructor(
    scene: THREE.Scene,
    public mySid: string,
    levelId: string,
  ) {
    scene.add(this.group);
    this.hasNpcs = levelId === 'van_lam';
    if (this.hasNpcs) {
      for (const n of NPCS) {
        const model = new Humanoid({ robe: n.color, trim: n.id === 'npc_chuong_mon' ? 0x3b6ea8 : 0x4a3a2a, hair: n.id === 'npc_duoc_su' ? 0x2a2026 : 0xb9bcc2, elder: n.id !== 'npc_duoc_su', sword: n.id === 'npc_chuong_mon', scale: 1.06 });
        const y = groundAt(n.x, n.z);
        model.root.position.set(n.x, y, n.z);
        model.root.rotation.y = n.yaw;
        const label = makeLabel(t(`npc.${n.id}.name`), '#ffe9a8', t(`npc.${n.id}.title`), '#e8d6a0');
        label.position.y = 2.6;
        model.root.add(label);
        const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerNew, transparent: true, depthWrite: false, fog: false }));
        marker.scale.set(0.9, 0.9, 1);
        marker.position.y = 3.5;
        marker.visible = false;
        model.root.add(marker);
        this.group.add(model.root);
        this.npcs.push({ id: n.id, model, label, marker, x: n.x, y, z: n.z });
      }
    }
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.05, 40),
      new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    this.group.add(this.ring);
  }

  /** Dấu ! / ? trên đầu NPC theo trạng thái nhiệm vụ. */
  updateQuestMarkers(q: QuestView, level: number): void {
    for (const n of this.npcs) {
      let state = 0;
      for (const def of QUESTS) {
        if (q.done.includes(def.id)) continue;
        const prog = q.active[def.id];
        if (prog) {
          if (def.turnin === n.id) {
            const complete = def.objectives.every((o, i) => (prog[i] ?? 0) >= o.count || (o.type === 'talk' && o.target === n.id));
            state = Math.max(state, complete ? 3 : 1);
          }
        } else if (def.giver === n.id && (!def.requires || q.done.includes(def.requires)) && (def.minLevel ?? 1) <= level) {
          state = Math.max(state, 2);
        }
      }
      n.marker.visible = state > 0;
      if (state > 0) {
        n.marker.material.map = state === 3 ? this.markerDone : state === 2 ? this.markerNew : this.markerWait;
        n.marker.material.needsUpdate = true;
      }
    }
  }

  update(dt: number, view: WorldView, local: { x: number; y: number; z: number; yaw: number; speed: number; airborne: boolean }, targetId: string, myLevel: number): void {
    this.time += dt;
    const k = Math.min(1, dt * 12);

    // ----- người chơi -----
    view.players.forEach((s, sid) => {
      const isLocal = sid === this.mySid;
      let v = this.players.get(sid);
      if (!v) {
        if (!isLocal) {
          const d2 = (s.x - local.x) ** 2 + (s.z - local.z) ** 2;
          if (d2 > 260 * 260) return;
        }
        v = new PlayerVis(sid, s, isLocal);
        this.players.set(sid, v);
        this.group.add(v.model.root);
      }
      v.s = s;
      if (v.lv !== s.lv) v.refreshLabel();
      if (isLocal) {
        v.x = local.x;
        v.y = local.y;
        v.z = local.z;
        v.yaw = local.yaw;
        v.speed = local.speed;
      } else if (!v.model.hit.stopped) {
        // Đang hit-stop thì giữ nguyên hình (chỉ lớp hiển thị); hết khựng sẽ bắt kịp vị trí server.
        const ox = v.x;
        const oz = v.z;
        if (Math.abs(s.x - v.x) + Math.abs(s.z - v.z) + Math.abs(s.y - v.y) > 40) {
          v.x = s.x;
          v.y = s.y;
          v.z = s.z;
        } else {
          v.x += (s.x - v.x) * k;
          v.y += (s.y - v.y) * k;
          v.z += (s.z - v.z) * k;
        }
        v.yaw = angleLerp(v.yaw, s.yaw, k);
        const sp = Math.hypot(v.x - ox, v.z - oz) / Math.max(dt, 1e-3);
        v.speed += (sp - v.speed) * Math.min(1, dt * 8);
      }
      v.fl = s.fl;
      // Giật lùi là độ lệch hiển thị cộng vào root, không ghi vào v.x/z hay trạng thái server.
      v.model.root.position.set(v.x + v.model.hit.kx, v.y, v.z + v.model.hit.kz);
      v.model.root.rotation.y = v.yaw;
      const dead = (s.fl & PF_DEAD) !== 0;
      v.model.update(dt, {
        speed: v.speed,
        flying: (s.fl & PF_FLYING) !== 0,
        meditating: (s.fl & PF_MEDITATING) !== 0,
        dead,
        casting: (s.fl & PF_CASTING) !== 0,
        airborne: isLocal ? local.airborne : !s.gr,
      });
      v.bar.group.visible = !dead && s.hp < s.mhp && !isLocal;
      if (v.bar.group.visible) v.bar.set(s.hp / s.mhp);
    });
    for (const [sid, v] of this.players) {
      const s = view.players.get(sid);
      const far = s && sid !== this.mySid && (s.x - local.x) ** 2 + (s.z - local.z) ** 2 > 300 * 300;
      if (!s || far) {
        this.group.remove(v.model.root);
        v.dispose();
        this.players.delete(sid);
      }
    }

    // ----- quái -----
    view.monsters.forEach((s, id) => {
      let v = this.monsters.get(id);
      const d2 = (s.x - local.x) ** 2 + (s.z - local.z) ** 2;
      if (!v) {
        if (d2 > 240 * 240 || !MONSTER.has(s.t)) return;
        v = new MonVis(id, s);
        this.monsters.set(id, v);
        this.group.add(v.model.root);
      } else if (d2 > 280 * 280) {
        this.group.remove(v.model.root);
        v.dispose();
        this.monsters.delete(id);
        return;
      }
      v.s = s;
      if (v.lv !== s.lv) v.refreshLabel(myLevel);
      const ox = v.x;
      const oz = v.z;
      if (Math.abs(s.x - v.x) + Math.abs(s.z - v.z) > 30) {
        v.x = s.x;
        v.y = s.y;
        v.z = s.z;
      } else if (!v.model.hit.stopped) {
        // Đang hit-stop thì giữ nguyên hình (chỉ lớp hiển thị); hết khựng sẽ bắt kịp vị trí server.
        v.x += (s.x - v.x) * k;
        v.y += (s.y - v.y) * k;
        v.z += (s.z - v.z) * k;
      }
      if (!v.model.hit.stopped) {
        v.yaw = angleLerp(v.yaw, s.yaw, k);
        const sp = Math.hypot(v.x - ox, v.z - oz) / Math.max(dt, 1e-3);
        v.speed += (sp - v.speed) * Math.min(1, dt * 8);
      }
      const dead = s.st === MS_DEAD;
      v.model.root.position.set(v.x + v.model.hit.kx, v.y, v.z + v.model.hit.kz);
      v.model.root.rotation.y = v.yaw;
      v.model.update(dt, v.speed, dead);
      v.model.root.visible = !(dead && (v as MonVis & { deadFor?: number }).deadFor! > 3);
      const vv = v as MonVis & { deadFor?: number };
      vv.deadFor = dead ? (vv.deadFor ?? 0) + dt : 0;
      const showBar = !dead && (s.hp < s.mhp || id === targetId);
      v.bar.group.visible = showBar;
      if (showBar) v.bar.set(s.hp / s.mhp);
      if (v.label) v.label.visible = !dead && d2 < 70 * 70;
      v.wasAttack = s.st === MS_ATTACK;
    });
    for (const [id, v] of this.monsters) {
      if (!view.monsters.has(id)) {
        this.group.remove(v.model.root);
        v.dispose();
        this.monsters.delete(id);
      }
    }

    // ----- điểm hái thuốc -----
    view.nodes.forEach((s, id) => {
      let g = this.nodes.get(id);
      const d2 = (s.x - local.x) ** 2 + (s.z - local.z) ** 2;
      if (!g) {
        if (d2 > 200 * 200) return;
        g = buildNode(s.t);
        g.position.set(s.x, s.y, s.z);
        g.rotation.y = hashStr(id) % 6;
        this.nodes.set(id, g);
        this.group.add(g);
      } else if (d2 > 240 * 240) {
        this.group.remove(g);
        this.nodes.delete(id);
        return;
      }
      g.visible = s.on;
      if (s.on) {
        const glow = g.children[1];
        const pulse = 1 + Math.sin(this.time * 3 + s.x) * 0.18;
        glow.scale.set(0.55 * pulse, 0.75 * pulse, 0.55 * pulse);
      }
    });

    // ----- NPC -----
    for (const n of this.npcs) {
      n.model.update(dt, { speed: 0, flying: false, meditating: false, dead: false, casting: false, airborne: false });
      if (n.marker.visible) n.marker.position.y = 3.5 + Math.sin(this.time * 3) * 0.12;
    }

    // ----- vòng chọn mục tiêu -----
    const tm = this.monsters.get(targetId);
    const tp = this.players.get(targetId);
    const tn = this.npcs.find((n) => n.id === targetId);
    if (tm && tm.s.st !== MS_DEAD) {
      this.ring.visible = true;
      const sc = tm.model.def.scale * (tm.model.def.boss ? 1.6 : 1.1);
      this.ring.scale.setScalar(sc * (1 + Math.sin(this.time * 5) * 0.05));
      this.ring.position.set(tm.x, tm.y + 0.15, tm.z);
      (this.ring.material as THREE.MeshBasicMaterial).color.set(0xff5a4a);
    } else if (tp || tn) {
      const p = tp ?? tn!;
      this.ring.visible = true;
      this.ring.scale.setScalar(0.8);
      this.ring.position.set(p.x, p.y + 0.12, p.z);
      (this.ring.material as THREE.MeshBasicMaterial).color.set(tn ? 0xffd84a : 0x6fd0ff);
    } else {
      this.ring.visible = false;
    }
  }

  /**
   * Phản ứng trúng đòn khi nhận S.DMG (chỉ hiển thị). `delay` để khớp lúc đạn bay tới.
   * Người ra đòn là mình thì mình cũng khựng.
   */
  hitReact(dst: string, src: string | undefined, crit: boolean, delay: number, heavy = false): void {
    const vd = this.players.get(dst) ?? this.monsters.get(dst);
    if (!vd) return;
    const vs = src && src !== dst ? (this.players.get(src) ?? this.monsters.get(src)) : undefined;
    // Chỉ khựng khi đòn liên quan tới mình, để boss bị nhiều người đánh không đứng hình liên tục.
    const noStop = src !== this.mySid && dst !== this.mySid;
    vd.model.hitReact({ crit, heavy, delay, noStop, dirX: vs ? vd.x - vs.x : 0, dirZ: vs ? vd.z - vs.z : 0 });
    if (src && src === this.mySid && vs) vs.model.hit.hitStop(hitStopFor(crit, heavy), delay);
  }

  /** Vị trí ngực của một thực thể (để bắn hiệu ứng tới). */
  chestOf(id: string, out: THREE.Vector3): boolean {
    const p = this.players.get(id);
    if (p) {
      out.set(p.x, p.y + 1.2, p.z);
      return true;
    }
    const m = this.monsters.get(id);
    if (m) {
      out.set(m.x, m.y + m.model.height * 0.55, m.z);
      return true;
    }
    return false;
  }

  topOf(id: string, out: THREE.Vector3): boolean {
    const p = this.players.get(id);
    if (p) {
      out.set(p.x, p.y + 2.2, p.z);
      return true;
    }
    const m = this.monsters.get(id);
    if (m) {
      out.set(m.x, m.y + m.model.height + 0.4, m.z);
      return true;
    }
    return false;
  }

  /** Chọn thực thể gần con trỏ nhất trên màn hình. */
  /** `aim`: bán kính bắt tối thiểu (px). Tâm ngắm kiểu FPS dùng bán kính rộng để chọn thứ gần tâm nhất. */
  pick(mx: number, my: number, w: number, h: number, camera: THREE.Camera, aim = 26): PickResult {
    let best: PickResult = null;
    let bestScore = 1e9;
    const test = (kind: 'mon' | 'npc' | 'node' | 'player', id: string, x: number, y: number, z: number, radius: number) => {
      _v.set(x, y, z).project(camera);
      if (_v.z > 1 || _v.z < -1) return;
      const sx = (_v.x * 0.5 + 0.5) * w;
      const sy = (-_v.y * 0.5 + 0.5) * h;
      const dist = _v.set(x, y, z).distanceTo(camera.position);
      // Bán kính bắt chuột tính theo pixel, lớn hơn khi ở gần.
      const pr = Math.max(aim, (radius / Math.max(1, dist)) * h * 0.9);
      const d = Math.hypot(sx - mx, sy - my);
      if (d > pr) return;
      const score = d + dist * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = { kind, id };
      }
    };
    for (const [id, m] of this.monsters) {
      if (m.s.st === MS_DEAD) continue;
      test('mon', id, m.x, m.y + m.model.height * 0.5, m.z, m.model.height * 0.6);
    }
    for (const n of this.npcs) test('npc', n.id, n.x, n.y + 1.1, n.z, 1.1);
    for (const [id, g] of this.nodes) if (g.visible) test('node', id, g.position.x, g.position.y + 0.5, g.position.z, 0.7);
    for (const [sid, p] of this.players) {
      if (sid === this.mySid) continue;
      test('player', sid, p.x, p.y + 1.1, p.z, 1.0);
    }
    return best;
  }

  /** Thứ có thể tương tác gần nhất (NPC, cây thuốc, cổng bí cảnh). */
  nearestInteractable(x: number, y: number, z: number): { kind: 'npc' | 'node' | 'portal'; id: string; dist: number } | null {
    let best: { kind: 'npc' | 'node' | 'portal'; id: string; dist: number } | null = null;
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < 7 && (!best || d < best.dist)) best = { kind: 'npc', id: n.id, dist: d };
    }
    for (const [id, g] of this.nodes) {
      if (!g.visible) continue;
      const d = Math.hypot(g.position.x - x, g.position.z - z);
      if (d < 4.2 && Math.abs(g.position.y - y) < 5 && (!best || d < best.dist)) best = { kind: 'node', id, dist: d };
    }
    const gate = this.hasNpcs ? PORTAL_POS : DUNGEON_EXIT;
    const dg = Math.hypot(gate.x - x, gate.z - z);
    if (dg < 11 && (!best || dg < best.dist)) best = { kind: 'portal', id: this.hasNpcs ? 'portal' : 'exit', dist: dg };
    return best;
  }

  /** Tab: chuyển sang quái còn sống kế tiếp theo khoảng cách. */
  nextTarget(current: string, x: number, z: number): string {
    const list: { id: string; d: number }[] = [];
    for (const [id, m] of this.monsters) {
      if (m.s.st === MS_DEAD) continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d < 45) list.push({ id, d });
    }
    if (!list.length) return '';
    list.sort((a, b) => a.d - b.d);
    const i = list.findIndex((e) => e.id === current);
    return list[(i + 1) % list.length].id;
  }

  dispose(): void {
    for (const v of this.players.values()) v.dispose();
    for (const v of this.monsters.values()) v.dispose();
    for (const n of this.npcs) {
      disposeLabel(n.label);
      n.marker.material.dispose();
      n.model.dispose();
    }
    this.markerNew.dispose();
    this.markerDone.dispose();
    this.markerWait.dispose();
    this.group.removeFromParent();
  }
}
