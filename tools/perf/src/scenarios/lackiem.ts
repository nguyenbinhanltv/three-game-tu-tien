// MAP-1 "Ngự Cảnh Thiên Địa": ảnh trước/sau Lạc Kiếm Tông, cùng góc máy, 4 thời điểm trong ngày, hai cỡ ảnh, kèm số đo hiệu năng.
//   pnpm shots lackiem --out <thư mục> [--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset high|ultra] [--perf 1] [--video 1]
// `?mood=` đổi thời điểm; level chưa có `dusk` riêng thì lấy sắc bình minh. `--video 1` quay một vòng bay quanh tông môn (webm, ~45 s).
import fs from 'node:fs';
import path from 'node:path';
import { SECT } from '@dtl/shared';
import { sleep } from '../lib/devserver';
import { flag, list, num, opt } from '../lib/env';
import { gm, hideUi, perfSample, skipCutscene, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { drawSources, topLevelCounts } from '../lib/drawsrc';
import { settleMs, snap, writeJson } from '../lib/shot';

interface View {
  name: string;
  /** Mắt máy (toạ độ thế giới; x/z tương đối tâm tông môn, y tương đối SECT.y) và điểm nhìn. */
  eye: [number, number, number];
  at: [number, number, number];
  fov?: number;
}

/** Sáu góc máy cố định (camera tự do `__game.freeCam`, chỉ có tác dụng khi URL có `?debug=1`): không bị địa hình đẩy camera. */
export const VIEWS: View[] = [
  { name: 'cong', eye: [0, 7, 112], at: [0, 8, 60], fov: 55 },
  { name: 'bienxa', eye: [0, 7, 128], at: [0, 7.5, 96], fov: 40 },
  { name: 'biengan', eye: [0, 7, 112], at: [0, 7.5, 96], fov: 42 },
  { name: 'san', eye: [0, 9, 62], at: [0, 8, -20], fov: 58 },
  { name: 'kiemdai', eye: [-62, 24, 76], at: [-170, 34, 150], fov: 60 },
  { name: 'dong', eye: [60, 42, 64], at: [235, 30, 30], fov: 60 },
  { name: 'trencao', eye: [270, 120, -240], at: [-60, 25, 70], fov: 56 },
  { name: 'phongxa', eye: [20, 26, -100], at: [-40, 80, -700], fov: 64 },
];

export default {
  name: 'lackiem',
  desc: 'MAP-1: ảnh trước/sau Lạc Kiếm Tông (6 góc × 4 thời điểm × 2 cỡ ảnh) + số đo hiệu năng + video bay quanh',
  usage:
    '[--moods dawn,day,dusk,night] [--sizes 1920x1080,1280x720] [--views a,b|all] [--preset low|medium|high|ultra] [--perf 1] [--video 1] [--secs 45] [--tag truoc|sau]',
  async run(r) {
    const tag = opt('--tag', 'sau');
    const preset = opt('--preset', 'high');
    const only = list('--views', 'all');
    const views = VIEWS.filter((v) => only.includes('all') || only.includes(v.name));
    const perf: Record<string, unknown> = {};
    for (const size of list('--sizes', '1920x1080,1280x720')) {
      const viewport = size.split('x').map(Number) as [number, number];
      for (const mood of list('--moods', 'dawn,day,dusk,night')) {
        const { ctx, page } = await r.open({
          name: `Lk${mood[0]}${viewport[1]}`,
          quality: preset,
          viewport,
          query: { mood },
          seenIntro: true,
          hide: 'hud',
          warnings: true,
        });
        await gm(page, 'level 15');
        await gm(page, 'god on');
        await gm(page, 'killall', 1200);
        for (const v of views) {
          await tp(page, SECT.x, SECT.z + 40);
          await gm(page, 'killall', 600);
          await page.evaluate(
            (a) => {
              window.__game!.freeCam = {
                x: (a.s[0] ?? 0) + a.v.eye[0],
                y: (a.s[1] ?? 0) + a.v.eye[1],
                z: (a.s[2] ?? 0) + a.v.eye[2],
                tx: (a.s[0] ?? 0) + a.v.at[0],
                ty: (a.s[1] ?? 0) + a.v.at[1],
                tz: (a.s[2] ?? 0) + a.v.at[2],
                fov: a.v.fov,
              };
            },
            { s: [SECT.x, SECT.y, SECT.z], v },
          );
          if (flag('--noshadow'))
            await page.evaluate(
              `(() => { const g = window.__game; const names = ${JSON.stringify(list('--noshadow', ''))}; g.scene.traverse((o) => { if (names.some((n) => o.name === n || o.name.startsWith(n))) o.castShadow = false; }); })()`,
            );
          if (flag('--shadowoff')) await page.evaluate('(() => { const g = window.__game; g.env.sun.castShadow = false; })()');
          if (flag('--hide'))
            await page.evaluate(
              `(() => { const g = window.__game; const names = ${JSON.stringify(list('--hide', ''))}; g.scene.traverse((o) => { if (names.some((n) => o.name === n || o.name.startsWith(n))) o.visible = false; }); if (names.includes('@props')) g.props.group.visible = false; if (names.includes('@cardforest')) g.cardForest.group.visible = false; if (names.includes('@sky')) g.lacKiemSky.group.visible = false; if (names.includes('@mapvis')) g.scene.children.forEach((c) => { if (c.name === 'mapVis') c.visible = false; }); })()`,
            );
          const stem = `${tag}-${viewport[1]}p-${mood}-${v.name}`;
          await snap(page, r.out, `${stem}.png`, { wait: settleMs() });
          if (flag('--perf') && viewport[1] === 1080) perf[stem] = await perfSample(page);
          if (flag('--props')) {
            const t = (await page.evaluate(
              `(() => { const g = window.__game; const m = new Map(); g.props.group.traverse((o) => { if (!o.isMesh || !o.visible) return; const k = (o.name || o.parent?.name || '?') + '|' + (o.material && o.material.name || '') + '|' + (o.count ?? 1); m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400); })()`,
            )) as [string, number][];
            for (const [k, n] of t) console.log(`PROP ${String(n).padStart(3)} ${k}`);
          }
          if (flag('--cells')) {
            const t = (await page.evaluate(
              `(() => { const g = window.__game; const by = {}; let dc = 0; const cp = g.camera.position; const bins = { '<80': 0, '80-150': 0, '150-250': 0, '250-400': 0, '>400': 0 }; for (const c of g.props.cells) { if (c.level < 0 || !c.meshes) continue; const n = c.meshes[c.level].length; dc += n; const dd = Math.hypot(c.cx - cp.x, c.cz - cp.z); bins[dd < 80 ? '<80' : dd < 150 ? '80-150' : dd < 250 ? '150-250' : dd < 400 ? '250-400' : '>400'] += n; const k = c.id + ' L' + c.level; const e = by[k] || (by[k] = { cells: 0, meshes: 0, items: 0 }); e.cells++; e.meshes += n; e.items += c.items.length; } return { dc, bins, by: Object.entries(by).sort((a, b) => b[1].meshes - a[1].meshes).slice(0, 30) }; })()`,
            )) as { dc: number; bins: Record<string, number>; by: [string, { cells: number; meshes: number; items: number }][] };
            console.log(`CELLS propdc=${t.dc} bins=${JSON.stringify(t.bins)}`);
            for (const [k, e] of t.by)
              console.log(
                `CELL ${String(e.meshes).padStart(3)} dc  ${String(e.cells).padStart(2)} ô  ${String(e.items).padStart(4)} vật  ${k}`,
              );
          }
          if (flag('--lodtri')) {
            const t = (await page.evaluate(
              `(() => { const g = window.__game; const out = []; const seen = new Set(); for (const c of g.props.cells) { if (c.level < 0 || !c.meshes || seen.has(c.id + c.level)) continue; seen.add(c.id + c.level); out.push(c.id + ' L' + c.level + ': ' + c.meshes[c.level].map((m) => (m.material.name || '?').replace('arch_sect_', '') + '=' + Math.round((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3)).join(' ')); } return out; })()`,
            )) as string[];
            for (const l of t) console.log('LODTRI ' + l);
          }
          if (flag('--tops'))
            for (const t of await topLevelCounts(page)) console.log(`TOP ${String(t.meshes).padStart(4)} ${t.type} ${t.name}`);
          if (flag('--draws') && viewport[1] === 1080) {
            const d = await drawSources(page, 30);
            console.log(`DRAWS ${stem} total=${d.total} shadow=${d.shadowTotal}`);
            for (const g of d.groups)
              console.log(`  ${String(g.dc).padStart(4)} dc ${String(g.tris).padStart(8)} tri sh${g.shadow} off${g.culledOff}  ${g.key}`);
          }
        }
        await ctx.close();
      }
    }
    if (flag('--perf')) writeJson(r.out, `perf-${tag}-${preset}.json`, perf);
    if (flag('--video')) {
      const dir = path.join(r.out, 'video');
      fs.mkdirSync(dir, { recursive: true });
      const { page, ctx } = await r.open({
        name: 'LkVid',
        quality: preset,
        viewport: [1920, 1080],
        query: { mood: opt('--vmood', 'dawn') },
        video: dir,
        seenIntro: true,
      });
      await gm(page, 'level 15');
      await gm(page, 'god on');
      await gm(page, 'killall', 1000);
      await skipCutscene(page, 10);
      await hideUi(page, 'hud');
      await tp(page, SECT.x, SECT.z + 40);
      const secs = num('--secs', 45);
      const t0 = Date.now();
      while ((Date.now() - t0) / 1000 < secs) {
        const u = (Date.now() - t0) / 1000 / secs;
        // Một vòng quanh tông môn: bán kính 120 → 330 → 150 m, độ cao 25 → 120 → 35 m, nhìn vào chính điện/cự kiếm.
        const R = 150 + 180 * Math.sin(u * Math.PI) - 30 * u;
        const h = 25 + 95 * Math.sin(u * Math.PI);
        const a = u * Math.PI * 2 + Math.PI;
        await page.evaluate(
          (c) => {
            window.__game!.freeCam = {
              x: c.x + Math.sin(c.a) * c.R,
              y: c.y + c.h,
              z: c.z + Math.cos(c.a) * c.R,
              tx: c.x,
              ty: c.y + 20,
              tz: c.z - 20,
              fov: 58,
            };
          },
          { x: SECT.x, y: SECT.y, z: SECT.z, a, R, h },
        );
        await sleep(100);
      }
      const video = page.video();
      await ctx.close();
      if (video) fs.renameSync(await video.path(), path.join(dir, `${tag}-bay-quanh.webm`));
    }
  },
} satisfies Scenario;
