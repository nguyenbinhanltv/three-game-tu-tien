import type { Page } from 'playwright';

export interface DrawGroup {
  key: string;
  dc: number;
  tris: number;
  shadow: number;
  culledOff: number;
}

/**
 * Nguồn draw call của khung hiện tại (chẩn đoán, `--draws 1` ở các kịch bản chụp; số thật lấy từ `perfSample`): duyệt mọi Mesh/Points/Line nhìn thấy,
 * bỏ mesh có `frustumCulled` mà tâm cầu bao nằm ngoài khung nhìn camera, gộp theo (tên nhóm cha gần nhất có tên + tên mesh + loại vật liệu).
 * Mỗi mesh = 1 draw call; `castShadow` = thêm 1 lượt đổ bóng (đếm riêng). `culledOff` = số mesh `frustumCulled:false` (luôn vẽ dù ngoài khung nhìn: ứng viên để bật cắt).
 */
export async function drawSources(page: Page, top = 24): Promise<{ total: number; shadowTotal: number; groups: DrawGroup[] }> {
  const code = `(() => {
    const g = window.__game; const cam = g.camera; cam.updateMatrixWorld(true);
    const P = cam.projectionMatrix.elements, V = cam.matrixWorldInverse.elements;
    const inView = (x, y, z, r) => {
      const vx = V[0]*x + V[4]*y + V[8]*z + V[12], vy = V[1]*x + V[5]*y + V[9]*z + V[13], vz = V[2]*x + V[6]*y + V[10]*z + V[14], vw = 1;
      const cx = P[0]*vx + P[4]*vy + P[8]*vz + P[12]*vw, cy = P[1]*vx + P[5]*vy + P[9]*vz + P[13]*vw, cw = P[3]*vx + P[7]*vy + P[11]*vz + P[15]*vw;
      const k = Math.max(r * Math.max(Math.abs(P[0]), Math.abs(P[5])), 0);
      return !(cw < -r || Math.abs(cx) > cw + k + r * 0.5 || Math.abs(cy) > cw + k + r * 0.5 || vz > r);
    };
    const groups = new Map(); let total = 0, shadowTotal = 0;
    const walk = (o, label) => {
      if (!o.visible) return;
      const nm = o.name ? o.name : label;
      if ((o.isMesh || o.isPoints || o.isLine) && o.geometry) {
        let on = true;
        if (o.frustumCulled) {
          if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
          const bs = o.geometry.boundingSphere; o.updateWorldMatrix(true, false);
          const e = o.matrixWorld.elements; const c = bs.center;
          const sc = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
          on = inView(e[0]*c.x + e[4]*c.y + e[8]*c.z + e[12], e[1]*c.x + e[5]*c.y + e[9]*c.z + e[13], e[2]*c.x + e[6]*c.y + e[10]*c.z + e[14], bs.radius * sc);
        }
        if (on) {
          const idx = o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position ? o.geometry.attributes.position.count : 0);
          const inst = o.isInstancedMesh ? o.count : 1;
          const mat = Array.isArray(o.material) ? o.material[0] : o.material;
          const key = nm + ' | ' + (o.name || '·') + ' | ' + (mat ? mat.type : '?') + (o.isInstancedMesh ? ' ×inst' : '');
          const gr = groups.get(key) || { key, dc: 0, tris: 0, shadow: 0, culledOff: 0 };
          gr.dc += 1; gr.tris += Math.round(idx / 3) * inst; if (o.castShadow) { gr.shadow += 1; shadowTotal += 1; }
          if (!o.frustumCulled) gr.culledOff += 1;
          groups.set(key, gr); total += 1;
        }
      }
      for (const ch of o.children) walk(ch, nm);
    };
    walk(g.scene, 'scene');
    return { total, shadowTotal, groups: [...groups.values()].sort((a, b) => b.dc - a.dc) };
  })()`;
  const r = (await page.evaluate(code)) as { total: number; shadowTotal: number; groups: DrawGroup[] };
  return { total: r.total, shadowTotal: r.shadowTotal, groups: r.groups.slice(0, top) };
}

/** Số mesh theo cây con trực tiếp của scene (chẩn đoán nhanh nhóm nào chiếm nhiều draw call). */
export async function topLevelCounts(page: Page): Promise<{ name: string; type: string; meshes: number; visible: boolean }[]> {
  return page.evaluate(`(() => {
    const g = window.__game; const out = [];
    for (const ch of g.scene.children) {
      let n = 0; ch.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine) && o.visible) n++; });
      out.push({ name: ch.name || ch.type, type: ch.type, meshes: n, visible: ch.visible });
    }
    return out.sort((a, b) => b.meshes - a.meshes);
  })()`) as never;
}
