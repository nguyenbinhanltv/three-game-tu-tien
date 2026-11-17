// Ảnh duyệt asset 3D trong trang xem (`?show=<id>`, boss qua `?show=boss&id=`): tấm xoay bốn hướng và tấm clip
// (mỗi clip N khung chia đều). Dùng sau khi nhập/sửa model Tripo, rig hay clip thủ tục (boss, tinh anh, quái, prop, pháp bảo).
import fs from 'node:fs';
import path from 'node:path';
import { gameUrl, watchErrors } from '../lib/browser';
import { ROOT, sleep } from '../lib/devserver';
import { list, num, opt } from '../lib/env';
import type { Scenario } from '../lib/scenario';
import { sheet, type SheetRow } from '../lib/shot';

/** Id asset theo `--ids a,b` hoặc `--group <tiền tố>` (vd. `boss_`, `elite_`, `prop_kiem`) đọc từ manifest đã build. */
function assetIds(): string[] {
  const ids = list('--ids', '');
  if (ids.length) return ids;
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/client/public/assets/manifest.json'), 'utf8')) as { assets: Record<string, unknown> };
  const prefix = opt('--group', 'boss_');
  return Object.keys(manifest.assets).filter((id) => id.startsWith(prefix));
}

export default {
  name: 'asset',
  desc: 'Tấm xoay 4 hướng + tấm clip của asset trong trang xem (duyệt model/rig/clip sau khi nhập)',
  usage: '[--ids a,b | --group boss_|elite_|mon_|prop_] [--clips idle,run,attack,death] [--frames 5]',
  async run(r) {
    const frames = num('--frames', 5);
    const want = list('--clips', '');
    const ctx = await r.browser.newContext({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    watchErrors(page, { into: r.errors });
    const shot = () => page.screenshot({ type: 'jpeg', quality: 86 });
    /** Đặt góc nhìn rồi lùi camera ra 1,35× để chiêu vung rộng không tràn khung. */
    const view = async (v: string) => {
      await page.evaluate((name) => {
        const w = window.__viewer!;
        w.setView(name);
        w.camera.position.sub(w.controls.target).multiplyScalar(1.35).add(w.controls.target);
        w.controls.update();
      }, v);
      await sleep(350);
    };
    for (const id of assetIds()) {
      await page.goto(gameUrl(r.clientPort, id.startsWith('boss_') ? { show: 'boss', id } : { show: id }, { renderer: r.renderer }), { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.__viewer?.model || !!window.__viewer?.clips?.length, undefined, { timeout: 60_000, polling: 250 });
      await page.addStyleTag({ content: '.viewer-panel,.viewer-hud,.panel,aside,header{display:none!important}.viewer-host{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}' });
      const clips = await page.evaluate(() => {
        const w = window.__viewer!;
        w.setHuman(false);
        w.controls.autoRotate = false;
        window.dispatchEvent(new Event('resize'));
        const idle = w.clips.findIndex((c) => c.name === 'idle');
        if (idle >= 0) {
          w.playClip(idle);
          w.seek(0);
        }
        return w.clips.map((c) => ({ name: c.name, duration: c.duration }));
      });
      await sleep(1500);
      const turn: Buffer[] = [];
      for (const v of ['front', 'side', 'back', 'iso']) {
        await view(v);
        turn.push(await shot());
      }
      await sheet(ctx, path.join(r.out, `${id}_turntable.jpg`), [{ label: `${id} · trước / nghiêng / sau / chéo`, cells: turn }], { cell: 320 });
      const rows: SheetRow[] = [];
      for (const [i, c] of clips.entries()) {
        if (want.length && !want.includes(c.name)) continue;
        const cells: Buffer[] = [];
        for (let k = 0; k < frames; k++) {
          await page.evaluate(([ci, t]) => (window.__viewer!.playClip(ci), window.__viewer!.seek(t)), [i, (c.duration * k) / (frames - 1) - (k === frames - 1 ? 1e-3 : 0)] as const);
          await sleep(220);
          cells.push(await shot());
        }
        rows.push({ label: `${c.name} · ${c.duration.toFixed(2)} s`, cells });
      }
      if (rows.length) await sheet(ctx, path.join(r.out, `${id}_clips.jpg`), rows, { cell: 200 });
      console.log(`[shots:asset] ${id}: ${clips.map((c) => c.name).join(', ') || 'không có clip'}`);
    }
    await ctx.close();
  },
} satisfies Scenario;
