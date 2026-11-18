// Texture tải dần (hạng mục 4): ảnh trước/sau CÙNG khung hình trong trang xem asset (`?show=<id>`): clip idle dừng ở khung 0,
// cùng camera, chỉ đổi bậc texture bằng `__viewer.setHires(id, bật/tắt)`. Mặc định 3 đối tượng: boss, tinh anh, quái; `--ids all` quét mọi asset có bậc cao (soát lệch màu).
// Ghi `<id>-truoc.png`, `<id>-sau.png` và `hires.json` (MB tải thêm từ manifest, GPU MB ước tính, thời gian áp xong, số texture).
// `--ids a,b,c`, `--zoom 0.8` (nhân khoảng cách camera: nhỏ hơn = gần hơn).
import { gameUrl, watchErrors } from '../lib/browser';
import { list, num } from '../lib/env';
import { sleep } from '../lib/devserver';
import type { Scenario } from '../lib/scenario';
import { writeJson } from '../lib/shot';

type V = { setView(v: string): void; setHuman(b: boolean): void; playClip(i: number): void; seek(t: number): void; setHires(id: string, on: boolean): Promise<number>; model: unknown; clips: { name: string }[]; camera: { position: { sub(v: unknown): { multiplyScalar(k: number): { add(v: unknown): void } } } }; controls: { target: unknown; autoRotate: boolean; update(): void } };

export default {
  name: 'hires',
  desc: 'Texture tải dần: ảnh trước/sau cùng khung (viewer, clip dừng) cho boss/tinh anh/quái (nhân vật không có bậc cao, xem hires.ts) + MB tải, GPU, thời gian áp',
  usage: '[--ids boss_han_giao,elite_huyet_nha_lang,mon_soi_xam|all] [--zoom 0.8]',
  async run(r) {
    const all = (await (await fetch(`http://localhost:${r.clientPort}/assets/manifest.json`)).json()) as { assets: Record<string, { hires?: unknown[] }> };
    const given = list('--ids', 'boss_han_giao,elite_huyet_nha_lang,mon_soi_xam');
    const ids = given[0] === 'all' ? Object.keys(all.assets).filter((k) => all.assets[k].hires?.length) : given;
    const zoom = num('--zoom', 0.8);
    const ctx = await r.browser.newContext({ viewport: { width: 960, height: 960 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    watchErrors(page, { into: r.errors });
    const manifest = (await (await fetch(`http://localhost:${r.clientPort}/assets/manifest.json`)).json()) as { assets: Record<string, { hires?: { bytes: number; gpuBytes: number; width: number }[] }> };
    const out: Record<string, unknown> = {};
    for (const id of ids) {
      await page.goto(gameUrl(r.clientPort, id.startsWith('boss_') ? { show: 'boss', id } : { show: id }, { renderer: r.renderer }), { waitUntil: 'load' });
      await page.waitForFunction(() => !!(window as unknown as { __viewer?: V }).__viewer?.model, undefined, { timeout: 60_000, polling: 250 });
      await page.addStyleTag({ content: '.viewer-panel,.viewer-hud,.panel,aside,header{display:none!important}.viewer-host{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important}' });
      await page.evaluate((k) => {
        const w = (window as unknown as { __viewer: V }).__viewer;
        w.setHuman(false);
        w.controls.autoRotate = false;
        window.dispatchEvent(new Event('resize'));
        const idle = w.clips.findIndex((c) => c.name === 'idle' || c.name === 'Idle_Loop');
        if (idle >= 0) {
          w.playClip(idle);
          w.seek(0);
        }
        w.setView('front');
        w.camera.position.sub(w.controls.target).multiplyScalar(k).add(w.controls.target);
        w.controls.update();
      }, zoom);
      await sleep(600);
      await page.evaluate((i) => (window as unknown as { __viewer: V }).__viewer.setHires(i, false), id);
      await sleep(800);
      await page.screenshot({ path: `${r.out}/${id}-truoc.png` });
      const t0 = Date.now();
      const n = await page.evaluate((i) => (window as unknown as { __viewer: V }).__viewer.setHires(i, true), id);
      await sleep(1200);
      const ms = Date.now() - t0 - 1200;
      await page.screenshot({ path: `${r.out}/${id}-sau.png` });
      const hs = manifest.assets[id]?.hires ?? [];
      out[id] = { textures: n, loadMs: ms, mbTai: +(hs.reduce((a, h) => a + h.bytes, 0) / 1048576).toFixed(2), gpuMB: +(hs.reduce((a, h) => a + h.gpuBytes, 0) / 1048576).toFixed(1), maxWidth: Math.max(0, ...hs.map((h) => h.width)) };
      console.log(`  ${id}:`, JSON.stringify(out[id]));
    }
    writeJson(r.out, 'hires.json', out);
    await ctx.close();
  },
} satisfies Scenario;
