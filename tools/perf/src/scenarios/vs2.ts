// VS-2 (hệ kỹ năng mới): ảnh HUD của ba công pháp ở vài cỡ màn hình. Mỗi bước `--step` chụp phần giao diện của một PR.
//   res: thanh tài nguyên riêng (Kiếm ý / Huyết khí / Đan hỏa) lúc rỗng, đang tích và đầy, kèm tooltip.
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, snapSizes, UI_SIZES, writeJson } from '../lib/shot';

const METHODS = [
  { id: 'lac_kiem_quyet', tag: 'kiem-tu', half: 3 },
  { id: 'bat_dong_kim_than', tag: 'ho-phap', half: 55 },
  { id: 'thanh_moc_dan_kinh', tag: 'dan-su', half: 40 },
] as const;

/** Khung cắt quanh cụm chiêu (góc dưới phải) theo cỡ màn hình, để ảnh cận đọc được thanh tài nguyên. */
const clipOf = (w: number, h: number) => ({
  x: Math.round(w * 0.5),
  y: Math.round(h * 0.52),
  width: Math.round(w * 0.5),
  height: Math.round(h * 0.48),
});

async function stepRes(r: Run, sizes: string[]): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  for (const m of METHODS) {
    const { ctx, page } = await r.open({
      name: 'Vs2' + m.tag.replace('-', ''),
      viewport: [1920, 1080],
      seenIntro: true,
      query: { realm: 'nk12', at: 'tong_mon', god: 1 },
    });
    await sleep(2500);
    await gm(page, `method ${m.id}`);
    await sleep(800);
    const bar = page.locator('[data-testid="res-bar"]');
    const read = async () => ({
      res: await bar.getAttribute('data-res'),
      now: await bar.getAttribute('aria-valuenow'),
      max: await bar.getAttribute('aria-valuemax'),
      full: await bar.getAttribute('data-full'),
    });
    await gm(page, 'res 0');
    log[`${m.tag}-rong`] = await read();
    await gm(page, `res ${m.half}`);
    log[`${m.tag}-nua`] = await read();
    await snapSizes(page, r.out, `a-res-${m.tag}-dang-tich`, sizes);
    await gm(page, 'res');
    log[`${m.tag}-day`] = await read();
    await snapSizes(page, r.out, `a-res-${m.tag}-day`, sizes);
    // Ảnh cận cụm chiêu + tooltip ở từng cỡ.
    for (const tag of sizes) {
      const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      await page.setViewportSize({ width: w, height: h });
      await gm(page, 'res', 300);
      await bar.hover();
      await sleep(700);
      await snap(page, r.out, `a-res-${m.tag}-tooltip-${tag}.jpg`, { clip: clipOf(w, h), wait: 200 });
      await page.mouse.move(8, 8);
    }
    await ctx.close();
  }
  return log;
}

export default {
  name: 'vs2',
  desc: 'VS-2 hệ kỹ năng mới: ảnh HUD ba công pháp (thanh tài nguyên riêng…) ở 1080p + 720p',
  usage: '[--step res] [--sizes 1080p,720p]',
  async run(r) {
    const sizes = list('--sizes', '1080p,720p');
    const steps = list('--step', 'res');
    const log: Record<string, unknown> = {};
    if (steps.includes('res')) log.res = await stepRes(r, sizes);
    writeJson(r.out, 'vs2.json', log);
  },
} satisfies Scenario;
