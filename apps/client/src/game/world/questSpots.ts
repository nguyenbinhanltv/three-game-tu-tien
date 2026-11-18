// Mảnh gương nước (E3-H2): vật nhìn thấy được ở các điểm chạm `guong_nuoc_*` của nhiệm vụ `s3_guong_nuoc`. Chỉ là lớp trình diễn:
// server vẫn là bên chấm `touch`. Mảnh hiện khi nhiệm vụ đang làm và mục tiêu chưa xong, tắt ngay khi đã chạm (tiến độ lấy từ QuestView).
// Một mảnh = kim cương mảnh phát sáng lam nổi trên mặt đất + vòng sáng dưới chân + cột sáng mảnh (3 draw call mỗi mảnh, chỉ hiện trong SHOW m).

import * as THREE from 'three/webgpu';
import { LEVELS, QUEST } from '@dtl/content';
import type { QuestView } from '@dtl/shared';
import { groundAt } from '../core/levelCtx';

const SHOW = 220;
/** Tiền tố id điểm → màu: gương nước (E3-H2) lam, đèn trời (E4-H) hổ phách, môn phong ấn (E4-H) lục bích. */
const KINDS: Record<string, number> = { guong_nuoc_: 0x4fb0ff, den_troi_: 0xffb347, phong_an_mon_: 0x6fe3b0, xac_tho_san_: 0xd9d2c3, tran_gioi_bia_: 0x7fe0ff, mach_nhan_: 0x57e0c0 };

interface Shard {
  id: string;
  root: THREE.Group;
  gem: THREE.Mesh;
  ring: THREE.Mesh;
  /** Mục tiêu đang mở (nhiệm vụ đang làm và chưa chạm). */
  open: boolean;
}

const additive = (color: number, opacity: number, hdr = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(hdr), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });

export class QuestSpotVis {
  private shards: Shard[] = [];
  private geo = { gem: new THREE.OctahedronGeometry(0.5, 0), ring: new THREE.RingGeometry(0.9, 1.3, 28), beam: new THREE.CylinderGeometry(0.1, 0.16, 16, 8, 1, true) };
  /** Bộ vật liệu theo màu (mỗi màu một bộ, dựng khi có điểm dùng màu đó). */
  private mats = new Map<number, { gem: THREE.Material; ring: THREE.Material; beam: THREE.Material }>();
  private lastQuests: QuestView | null = null;

  constructor(private parent: THREE.Group, levelId: string | null) {
    const spots = (levelId && LEVELS[levelId]?.spots) || [];
    for (const sp of spots) {
      const color = Object.entries(KINDS).find(([pre]) => sp.id.startsWith(pre))?.[1];
      if (color === undefined) continue;
      let mat = this.mats.get(color);
      if (!mat) this.mats.set(color, (mat = { gem: additive(color, 0.9, 1.25), ring: additive(color, 0.7, 1.2), beam: additive(color, 0.2, 1.2) }));
      const root = new THREE.Group();
      root.position.set(sp.x, groundAt(sp.x, sp.z), sp.z);
      const gem = new THREE.Mesh(this.geo.gem, mat.gem);
      gem.scale.set(0.8, 1.7, 0.22);
      const ring = new THREE.Mesh(this.geo.ring, mat.ring);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      const beam = new THREE.Mesh(this.geo.beam, mat.beam);
      beam.position.y = 8;
      root.add(gem, ring, beam);
      root.visible = false;
      parent.add(root);
      this.shards.push({ id: sp.id, root, gem, ring, open: false });
    }
  }

  /** Mục tiêu `touch` của nhiệm vụ đang làm chỉ vào điểm này và chưa xong thì mảnh hiện. */
  setQuests(q: QuestView): void {
    if (q === this.lastQuests || !this.shards.length) return;
    this.lastQuests = q;
    for (const s of this.shards) {
      s.open = false;
      for (const [qid, prog] of Object.entries(q.active)) {
        const def = QUEST.get(qid);
        def?.objectives.forEach((o, i) => {
          if (o.type === 'touch' && o.target === s.id && (prog[i] ?? 0) < o.count) s.open = true;
        });
      }
    }
  }

  update(me: THREE.Vector3, now: number): void {
    const t = now * 0.001;
    for (const s of this.shards) {
      const near = s.open && Math.hypot(s.root.position.x - me.x, s.root.position.z - me.z) < SHOW;
      s.root.visible = near;
      if (!near) continue;
      // Địa hình level có thể chưa nạp xong lúc dựng mảnh: lấy độ cao mỗi khung.
      s.root.position.y = groundAt(s.root.position.x, s.root.position.z);
      s.gem.position.y = 1.8 + Math.sin(t * 1.6 + s.root.position.x) * 0.15;
      s.gem.rotation.y = t * 0.9;
      s.ring.rotation.z = -t * 0.5;
    }
  }

  dispose(): void {
    for (const s of this.shards) this.parent.remove(s.root);
    for (const g of Object.values(this.geo)) g.dispose();
    for (const set of this.mats.values()) for (const m of Object.values(set)) m.dispose();
    this.mats.clear();
    this.shards = [];
  }
}
