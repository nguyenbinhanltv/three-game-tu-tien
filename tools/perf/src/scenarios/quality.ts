// Preset Cực cao (hạng mục 1): kiểm đầu-cuối trong game thật.
//  1. Gợi ý theo GPU hiện ở Cài đặt (mặc định vẫn Vừa, không tự đổi) và nút "Dùng mức này" áp dụng + lưu `dtl.quality`.
//  2. Đổi Cao ↔ Cực cao lúc chạy: bản đồ bóng 2048² ↔ 4096² (`__game.env`), không lỗi console.
//  3. Tự hạ: bóp CPU bằng CDP (`--throttle 6`) thì sau ~10 s Cực cao → Cao, rồi Cao → Vừa; có toast; ảnh trước/sau.
//  4. Khóa preset: cùng cách bóp CPU nhưng bật `dtl.qualityLock` thì không hạ.
// `--throttle 6` (hệ số làm chậm CPU), `--wait 70` (giây chờ tự hạ). Ghi `quality.json` + ảnh.
import { num } from '../lib/env';
import { sleep } from '../lib/devserver';
import { openGame } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

type W = { __game?: { env?: { sun?: { shadow: { mapSize: { x: number }; camera: { right: number } } } }; setQuality(q: string): void; setQualityLock(on: boolean): void } };

export default {
  name: 'quality',
  desc: 'Preset Cực cao: gợi ý GPU ở Cài đặt, đổi Cao/Cực cao lúc chạy (bóng 4096), tự hạ khi nghẽn CPU, khóa preset',
  usage: '[--throttle 6] [--wait 70]',
  async run(r) {
    const throttle = num('--throttle', 6);
    const wait = num('--wait', 70) * 1000;
    const out: Record<string, unknown> = {};
    const q = (page: import('playwright').Page) => page.evaluate(() => localStorage.getItem('dtl.quality'));
    const shadow = (page: import('playwright').Page) =>
      page.evaluate(() => {
        const s = (window as unknown as W).__game?.env?.sun?.shadow;
        return s ? { map: s.mapSize.x, half: s.camera.right } : null;
      });

    // 1 + 2: mặc định, gợi ý, đổi preset lúc chạy.
    {
      const g = await openGame(r.browser, { clientPort: r.clientPort, name: 'QHint', renderer: r.renderer, errors: r.errors });
      const { page } = g;
      out.machine = await page.evaluate(() => ({ gpu: (window as unknown as { __game?: { gpuInfo: string } }).__game?.gpuInfo, mem: (navigator as unknown as { deviceMemory?: number }).deviceMemory, cores: navigator.hardwareConcurrency }));
      out.defaultQuality = (await q(page)) ?? 'medium (chưa lưu)';
      await page.keyboard.press('o'); // mở Cài đặt
      await sleep(1200);
      const hint = await page.evaluate(() => document.querySelector('[data-testid="quality-hint"]')?.textContent ?? null);
      out.hint = hint;
      await snap(page, r.out, 'cai-dat-goi-y.png', { wait: 300 });
      if (hint) {
        await page.getByText('Dùng mức này').first().click();
        await sleep(800);
      }
      out.afterApply = await q(page);
      await g.ctx.close();
    }

    // 2: đổi Cao ↔ Cực cao lúc chạy (vào game ở Cao để có bóng đổ).
    {
      const g = await openGame(r.browser, { clientPort: r.clientPort, name: 'QShad', renderer: r.renderer, errors: r.errors, quality: 'high' });
      const { page } = g;
      await page.evaluate(() => (window as unknown as W).__game!.setQuality('high'));
      await sleep(1500);
      out.shadowHigh = await shadow(page);
      await page.evaluate(() => (window as unknown as W).__game!.setQuality('ultra'));
      await sleep(2500);
      out.shadowUltra = await shadow(page);
      await snap(page, r.out, 'cuc-cao.png', { wait: 300 });
      await page.evaluate(() => (window as unknown as W).__game!.setQuality('high'));
      await sleep(1500);
      out.shadowBack = await shadow(page);
      await g.ctx.close();
    }

    // 3: tự hạ khi nghẽn.
    {
      const g = await openGame(r.browser, { clientPort: r.clientPort, name: 'QAuto', renderer: r.renderer, errors: r.errors });
      const { page, ctx } = g;
      await page.evaluate(() => {
        localStorage.setItem('dtl.qualityLock', '0');
        (window as unknown as W).__game!.setQualityLock(false);
        (window as unknown as W).__game!.setQuality('ultra');
      });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      const t0 = Date.now();
      const steps: { t: number; q: string | null }[] = [];
      let last = 'ultra';
      while (Date.now() - t0 < wait) {
        await sleep(1000);
        const cur = (await q(page)) ?? '';
        if (cur !== last) {
          steps.push({ t: Math.round((Date.now() - t0) / 1000), q: cur });
          last = cur;
          await snap(page, r.out, `tu-ha-${cur}.png`, { wait: 200 });
        }
        if (cur === 'medium') break;
      }
      out.autoDowngrade = { throttle, steps };
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await ctx.close();
    }

    // 4: khóa preset.
    {
      const g = await openGame(r.browser, { clientPort: r.clientPort, name: 'QLock', renderer: r.renderer, errors: r.errors });
      const { page, ctx } = g;
      await page.evaluate(() => {
        (window as unknown as W).__game!.setQuality('ultra');
        (window as unknown as W).__game!.setQualityLock(true);
      });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await sleep(Math.min(wait, 30_000));
      out.locked = { quality: await q(page), lock: await page.evaluate(() => localStorage.getItem('dtl.qualityLock')) };
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await ctx.close();
    }

    writeJson(r.out, 'quality.json', out);
    console.log(JSON.stringify(out, null, 1));
  },
} satisfies Scenario;
