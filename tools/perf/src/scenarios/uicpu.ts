// Chân Cảnh U13: CPU của UI mỗi khung (ms) với HUD + bảng Nhân vật + Túi đồ mở. Đo bằng CDP `Performance.getMetrics`:
// LayoutDuration + RecalcStyleDuration (UI/CSS) và ScriptDuration (gồm cả vòng game) trên cửa sổ 6 s, chia số khung. Ngưỡng UI: ≤ 0,3 ms/khung.
import type { CDPSession } from 'playwright';
import { sleep } from '../lib/devserver';
import type { Run, Scenario } from '../lib/scenario';
import { writeJson } from '../lib/shot';

type Metrics = Record<string, number>;

async function metrics(cdp: CDPSession): Promise<Metrics> {
  const r = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(r.metrics.map((m) => [m.name, m.value]));
}

export default {
  name: 'uicpu',
  desc: 'CPU UI mỗi khung (layout + style + script) với Nhân vật + Túi mở, 6 s',
  usage: '[--tag truoc|sau]',
  async run(r: Run) {
    const tag = process.argv.includes('--tag') ? process.argv[process.argv.indexOf('--tag') + 1]! : 'sau';
    const { ctx, page } = await r.open({
      name: 'UiCpu',
      viewport: [1920, 1080],
      seenIntro: true,
      query: { realm: 'nk12', at: 'tong_mon', god: 1 },
    });
    await sleep(3000);
    await page.keyboard.press('KeyC');
    await page.keyboard.press('KeyB');
    await sleep(2000);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    const out: Record<string, number> = {};
    await page.evaluate('window.__uiN = 0; (function loop() { window.__uiN++; requestAnimationFrame(loop); })()');
    for (let run = 0; run < 3; run++) {
      const n0 = (await page.evaluate('window.__uiN')) as number;
      const a = await metrics(cdp);
      await sleep(6000);
      const b = await metrics(cdp);
      const frames = ((await page.evaluate('window.__uiN')) as number) - n0;
      const d = (k: string) => ((b[k] ?? 0) - (a[k] ?? 0)) * 1000;
      out[`ui_ms_per_frame_run${run}`] = (d('LayoutDuration') + d('RecalcStyleDuration')) / Math.max(1, frames);
      out[`script_ms_per_frame_run${run}`] = d('ScriptDuration') / Math.max(1, frames);
      out[`frames_run${run}`] = frames;
    }
    const uis = [0, 1, 2].map((i) => out[`ui_ms_per_frame_run${i}`]!).sort((x, y) => x - y);
    out.ui_ms_per_frame_median = uis[1]!;
    writeJson(r.out, `uicpu-${tag}.json`, out);
    console.log('[uicpu]', tag, JSON.stringify(out));
    await ctx.close();
  },
} satisfies Scenario;
