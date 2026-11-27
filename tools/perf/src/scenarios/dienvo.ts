// Diễn Võ Trường (phòng tập GM): BỘ ẢNH CHUẨN. Vào phòng bằng `/gm dvt`, nạp lần lượt mọi cảnh mẫu (`/gm scene <id>`,
// dữ liệu ở packages/content/data/lab/scenes.json), chụp mỗi cảnh một ảnh cùng góc + số đo, rồi ra và kiểm nhân vật về nguyên trạng.
// Có `--base <thư mục bộ trước>` thì so từng cảnh bằng SSIM/ΔE (tools/painted-compare/compare.mjs) và dựng trang trước/sau `index.html`.
//   pnpm shots dienvo --out <thư mục> [--view 720p|1080p] [--query style=dahoa] [--base <thư mục>] [--ssim 0.9] [--only id1,id2]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LAB_SCENES } from '@dtl/content';
import { num, opt } from '../lib/env';
import { cam, gm, perfSample, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

interface Row {
  id: string;
  file: string;
  perf: unknown;
  ink?: unknown;
  ssim?: number;
  deltaE00?: number;
  diff?: string;
  base?: string;
  flag?: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function page(rows: Row[], view: string, style: string, limit: number): string {
  const tr = rows
    .map((r) => {
      const p = r.perf as { drawCalls?: number; triangles?: number; frameMs?: number } | undefined;
      const cmp =
        r.ssim === undefined
          ? '<td class="na" colspan="2">chưa có bộ trước</td>'
          : `<td><img src="${esc(r.base!)}"></td><td><img src="${esc(r.diff!)}"></td>`;
      const score = r.ssim === undefined ? '' : `<b class="${r.flag ? 'bad' : 'ok'}">SSIM ${r.ssim}</b> · ΔE ${r.deltaE00}`;
      return `<tr><th>${esc(r.id)}<br>${score}<br><small>${p?.drawCalls ?? '?'} draw · ${Math.round((p?.triangles ?? 0) / 1000)}k tam giác</small></th>${cmp}<td><img src="${esc(r.file)}"></td></tr>`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Diễn Võ Trường — bộ ảnh chuẩn ${view}</title>
<style>body{background:#14181f;color:#dfe6ee;font:14px system-ui;margin:16px}table{border-collapse:collapse;width:100%}
td,th{border:1px solid #2c3440;padding:6px;vertical-align:top}th{width:170px;text-align:left}img{width:100%;display:block}
.bad{color:#ff8a7a}.ok{color:#8fe0a8}.na{color:#7d8896;text-align:center}small{color:#9aa6b4}</style>
<h1>Diễn Võ Trường — bộ ảnh chuẩn (${esc(view)}, ${esc(style || 'mặc định')})</h1>
<p>Cột: bộ trước · bản đồ chênh (ΔE) · bộ này. Cảnh có SSIM dưới ${limit} được tô đỏ.</p>
<table><tr><th>Cảnh</th><th>Trước</th><th>Chênh</th><th>Sau</th></tr>
${tr}</table>`;
}

export default {
  name: 'dienvo',
  desc: 'Diễn Võ Trường: bộ ảnh chuẩn của mọi cảnh mẫu (lab/scenes.json) + số đo; --base thì so SSIM với bộ trước và dựng trang trước/sau',
  usage: '[--view 720p|1080p] [--query style=dahoa] [--base <thư mục bộ trước>] [--ssim 0.9] [--only id1,id2]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const view = opt('--view', '720p');
    const query = opt('--query', '');
    const base = opt('--base', '');
    const limit = num('--ssim', 0.9);
    const only = opt('--only', '')
      .split(',')
      .filter(Boolean);
    const scenes = LAB_SCENES.filter((s) => !only.length || only.includes(s.id));
    const { page: pg } = await r.open({
      name: 'DienVo',
      quality: 'high',
      viewport: view === '1080p' ? [1920, 1080] : [1280, 720],
      query: { cam: 'iso', quiet: 1 },
      extra: query,
      seenIntro: true,
      hide: 'hud',
    });
    await skipCutscene(pg, 20);
    await gm(pg, 'dvt');
    await waitLevel(pg, 'dien_vo');
    const rows: Row[] = [];
    const dflt = await pg.evaluate(() => ({ pitch: window.__game!.camPitch, dist: window.__game!.camDist }));
    for (const sc of scenes) {
      await gm(pg, `scene ${sc.id}`, 3500);
      await cam(pg, { ...dflt, ...sc.cam });
      const file = `${view}/${sc.id}.png`;
      await snap(pg, r.out, file, { wait: 1200 });
      // Chẩn đoán viền mực: số vỏ đang hiện và màu của chúng (trạng thái quái phải lên hình, không chỉ có ở state).
      const ink = await pg.evaluate(`(() => { var out = []; window.__game.scene.traverse(function (o) { if (o.userData && o.userData.inkHull && o.visible) out.push((o.userData.ink.color || 0).toString(16) + '@' + o.userData.ink.w.toFixed(3)); }); return out; })()`);
      if (opt('--diag', '')) {
        const d = await pg.evaluate(`(() => { var out = []; window.__game.scene.traverse(function (o) { if (!(o.userData && o.userData.inkHull)) return; var p = o.parent, sib = []; if (p) p.children.forEach(function (c) { sib.push((c.type || '?') + ':' + (c.name || '') + ':' + (c.visible ? 'v' : 'h') + ':' + (c.userData && c.userData.inkHull ? 'HULL' : '') + ':' + (c.geometry ? c.geometry.attributes.position.count : 0) + ':ro' + c.renderOrder + ':' + (c.material ? (c.material.type + '/t' + (c.material.transparent ? 1 : 0) + '/dw' + (c.material.depthWrite ? 1 : 0)) : '')); }); var w = new (o.position.constructor)(); o.getWorldPosition(w); var ws = new (o.position.constructor)(); o.getWorldScale(ws); var nA = o.geometry.attributes.normal, pA = o.geometry.attributes.position; out.push({ nrm: nA ? [nA.array.constructor.name, nA.normalized, nA.itemSize, Array.prototype.slice.call(nA.array, 0, 9)] : null, posA: [pA.array.constructor.name, pA.normalized, Array.prototype.slice.call(pA.array, 0, 6)], bind: Array.prototype.slice.call(o.bindMatrix.elements, 0, 16).map(function (v) { return +v.toFixed(3); }), inv0: o.skeleton ? Array.prototype.slice.call(o.skeleton.boneInverses[0].elements, 0, 16).map(function (v) { return +v.toFixed(4); }) : null, b0: o.skeleton ? [o.skeleton.bones[0].name].concat(Array.prototype.slice.call(o.skeleton.bones[0].matrixWorld.elements, 0, 16).map(function (v) { return +v.toFixed(3); })) : null, side: o.material.side, mvis: o.material.visible, sib: sib, pos: [w.x.toFixed(1), w.y.toFixed(1), w.z.toFixed(1)], scale: ws.x.toFixed(3), bones: o.skeleton ? o.skeleton.bones.length : -1, parentChain: (function () { var n = [], q = o.parent; while (q && n.length < 6) { n.push((q.type || '') + ':' + (q.name || '') + ':' + (q.visible ? 'v' : 'h')); q = q.parent; } return n; })() }); }); return out; })()`);
        console.log('[diag] ' + sc.id + ' ' + JSON.stringify(d, null, 1));
      }
      rows.push({ id: sc.id, file, perf: await perfSample(pg), ink });
    }
    await gm(pg, 'labreset', 1500);
    await gm(pg, 'dvt');
    await waitLevel(pg, 'van_lam');
    const back = await pg.evaluate(() => window.__game!.info());

    // So với bộ trước (nếu có): SSIM + ΔE + ảnh chênh, cảnh dưới ngưỡng được đánh dấu.
    if (base) {
      const tool = path.resolve(process.cwd(), '../painted-compare/compare.mjs');
      for (const row of rows) {
        const before = path.join(base, row.file);
        if (!fs.existsSync(before)) continue;
        const diff = `${view}/${row.id}.diff.png`;
        try {
          const res = JSON.parse(
            execFileSync('node', [tool, before, path.join(r.out, row.file), '--out', path.join(r.out, diff)], { encoding: 'utf8' })
              .trim()
              .split('\n')
              .pop()!,
          ) as { ssim: number; deltaE00: number };
          const copy = `${view}/${row.id}.truoc.png`;
          fs.copyFileSync(before, path.join(r.out, copy));
          Object.assign(row, { ssim: res.ssim, deltaE00: res.deltaE00, diff, base: copy, flag: res.ssim < limit });
        } catch (e) {
          console.log(`[shots:dienvo] không so được ${row.id}: ${(e as Error).message.split('\n')[0]}`);
        }
      }
      const bad = rows.filter((x) => x.flag);
      console.log(
        bad.length
          ? `[shots:dienvo] ${bad.length} cảnh lệch quá ngưỡng SSIM ${limit}: ${bad.map((x) => `${x.id} (${x.ssim})`).join(', ')}`
          : `[shots:dienvo] mọi cảnh có bộ trước đều ≥ SSIM ${limit}`,
      );
    }
    fs.writeFileSync(path.join(r.out, `index-${view}.html`), page(rows, view, query, limit));
    writeJson(r.out, `dienvo-${view}.json`, { view, query, base, limit, rows, back });
  },
} satisfies Scenario;
