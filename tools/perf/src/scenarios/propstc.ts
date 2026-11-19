// Ảnh trước/sau + đo hiệu năng cho bộ prop PROP-1 "Thiên Công Khai Vật": mỗi level, mỗi nhóm một góc nhìn vào cụm dày nhất.
//   pnpm shots propstc --out <thư mục> [--levels van_lam,doan_mach,...] [--groups tong_mon,...] [--size 1280x720]
// "Trước" = cùng bản build với `?tc=0` (ẩn prop PROP-1), "sau" = mặc định. Ảnh `<level>-<nhóm>-<truoc|sau>.png`; `perf.json` ghi draw call/tam giác/ms khung mỗi cảnh.
import fs from 'node:fs';
import path from 'node:path';
import { THIEN_CONG_PROPS } from '@dtl/shared';
import { list, opt, size } from '../lib/env';
import { cam, enterLevel, gm, perfSample, tp } from '../lib/game';
import { requireLevel } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';
import { settleMs, snap, writeJson } from '../lib/shot';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../../..');
const ITEMS = JSON.parse(fs.readFileSync(path.join(root, 'tools/blender/prop_tc_items.json'), 'utf8')).groups as Record<
  string,
  { name: string }[]
>;
const groupOf = new Map<string, string>();
for (const [g, l] of Object.entries(ITEMS)) for (const it of l) groupOf.set(it.name, g);
const nameOf = (id: string) => id.replace(/^prop_tc_/, '').replace(/_2$/, '');

interface View {
  name: string;
  x: number;
  z: number;
  yaw: number;
  n: number;
}

/** Cụm dày nhất của một nhóm trong level: chọn tâm (số prop cùng nhóm trong 22 m nhiều nhất) rồi hướng nhìn có nhiều prop nhất phía trước. */
/** Góc nhìn đặt tay theo cụm điểm nhấn đã duyệt (cổng sân, kiếm đài, đường chính, trước Chính điện của Lạc Kiếm Tông). */
const EXTRA: Record<string, { group: string; view: View }[]> = {
  van_lam: [
    { group: 'hoang_da', view: { name: 'van_lam-hoang_da-rung', x: 2455, z: 2022, yaw: Math.PI / 2, n: 1 } },
    { group: 'hoang_da', view: { name: 'van_lam-hoang_da-suoi', x: 2390, z: 2478, yaw: 0, n: 1 } },
    { group: 'cho_lang', view: { name: 'van_lam-cho_lang-cho', x: 2048, z: 2172, yaw: 0, n: 1 } },
    { group: 'cho_lang', view: { name: 'van_lam-cho_lang-cho_xa', x: 2060, z: 2185, yaw: 0.35, n: 1 } },
    { group: 'tong_mon', view: { name: 'van_lam-tong_mon-cong', x: 2048, z: 2092, yaw: Math.PI, n: 1 } },
    { group: 'tong_mon', view: { name: 'van_lam-tong_mon-kiemdai', x: 2048, z: 2096, yaw: 0, n: 1 } },
    { group: 'tong_mon', view: { name: 'van_lam-tong_mon-chinhdien', x: 2048, z: 2050, yaw: Math.PI, n: 1 } },
  ],
};

function viewFor(level: string, group: string): View | null {
  const ps = (THIEN_CONG_PROPS[level] ?? []).filter((p) => groupOf.get(nameOf(p.id)) === group);
  if (!ps.length) return null;
  let best = ps[0]!;
  let bestN = -1;
  for (const p of ps) {
    const n = ps.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 22).length;
    if (n > bestN) [best, bestN] = [p, n];
  }
  const near = ps.filter((q) => Math.hypot(q.x - best.x, q.z - best.z) < 26);
  const cx = near.reduce((a, q) => a + q.x, 0) / near.length;
  const cz = near.reduce((a, q) => a + q.z, 0) / near.length;
  let bestYaw = 0;
  let bestCount = -1;
  for (let k = 0; k < 16; k++) {
    const yaw = (k / 16) * Math.PI * 2;
    const px = cx - Math.sin(yaw) * 8;
    const pz = cz - Math.cos(yaw) * 8;
    const cnt = near.filter((q) => {
      const dx = q.x - px;
      const dz = q.z - pz;
      const d = Math.hypot(dx, dz);
      return d > 3 && d < 30 && Math.cos(Math.atan2(dx, dz) - yaw) > 0.8;
    }).length;
    if (cnt > bestCount) [bestYaw, bestCount] = [yaw, cnt];
  }
  return { name: `${level}-${group}`, x: cx - Math.sin(bestYaw) * 8, z: cz - Math.cos(bestYaw) * 8, yaw: bestYaw, n: bestCount };
}

export default {
  name: 'propstc',
  desc: 'Ảnh trước/sau + đo draw call/tam giác cho bộ prop PROP-1 (mỗi level × nhóm)',
  usage:
    '[--levels van_lam,doan_mach,van_hai,thien_khuyet,bac_hoang] [--groups tong_mon,cho_lang,hoang_da,tran_phap,di_vuc] [--size 1280x720] [--renderer webgpu|webgl2]',
  dry() {
    return false;
  },
  async run(r) {
    const levels = list('--levels', 'van_lam,doan_mach,van_hai,thien_khuyet,bac_hoang');
    const groups = list('--groups', Object.keys(ITEMS).join(','));
    const [w, h] = size('1280x720');
    const perf: Record<string, unknown> = {};
    for (const level of levels) {
      const lv = requireLevel(level);
      const views = [
        ...groups.map((g) => viewFor(level, g)).filter((v): v is View => !!v && v.n > 0),
        ...(EXTRA[level] ?? []).filter((e) => groups.includes(e.group)).map((e) => e.view),
      ];
      if (!views.length) continue;
      for (const mode of ['truoc', 'sau'] as const) {
        const { ctx, page } = await r.open({
          name: `Tc${mode}`,
          renderer: opt('--renderer', 'webgpu'),
          quality: 'high',
          viewport: [w, h],
          extra: mode === 'truoc' ? 'tc=0' : '',
          warnings: true,
        });
        await gm(page, `level ${level === 'van_lam' ? 15 : Math.max(27, lv.minLevel ?? 0)}`);
        await gm(page, 'god on');
        if (level !== 'van_lam') await enterLevel(page, level);
        for (const v of views) {
          await tp(page, v.x, v.z);
          await gm(page, 'killall', 1200);
          await cam(page, { yaw: v.yaw, pitch: 0.22, dist: 11 });
          await snap(page, r.out, `${v.name}-${mode}-${w}x${h}.png`, { wait: settleMs() });
          perf[`${v.name}-${mode}`] = await perfSample(page);
        }
        await ctx.close();
      }
    }
    writeJson(r.out, `perf-${w}x${h}.json`, perf);
  },
} satisfies Scenario;
