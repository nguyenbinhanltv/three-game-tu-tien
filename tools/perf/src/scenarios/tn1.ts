// TN-1 (Bản Nguyên): ảnh giao diện chọn nguồn.
//   tao: màn tạo nhân vật (đăng nhập thử) với sáu nguồn mở, đang chọn Lôi, và dải tám nguồn khóa theo chương.
//   npc: tab đổi Bản Nguyên ở Lạc Vân chân nhân của một nhân vật mang Lôi; kèm bảng Nhân vật (thẻ Bản Nguyên).
import { list } from '../lib/env';
import { gameUrl } from '../lib/browser';
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, snapSizes, UI_SIZES, writeJson } from '../lib/shot';

async function stepCreate(r: Run, sizes: string[]): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  for (const tag of sizes) {
    const [width, height] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
    const ctx = await r.browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await page.goto(gameUrl(r.clientPort, {}, { renderer: r.renderer }));
    const picker = page.locator('.root-picker').first();
    await picker.waitFor({ timeout: 30_000 });
    await sleep(3000);
    await picker.locator('.root-opt[data-root="loi"]').click();
    await sleep(400);
    log[tag] = {
      open: await picker.locator('.root-opt[data-root]').evaluateAll((els) => els.map((e) => e.getAttribute('data-root'))),
      selected: await picker.locator('.root-opt.sel').getAttribute('data-root'),
      desc: await picker.locator('.root-pick-desc').innerText(),
      locked: await picker.locator('.root-lock').evaluateAll((els) => els.map((e) => e.getAttribute('data-origin'))),
    };
    await snap(page, r.out, `tao-nhan-vat-${tag}.jpg`);
    await ctx.close();
  }
  return log;
}

async function stepNpc(r: Run, sizes: string[]): Promise<Record<string, unknown>> {
  const { ctx, page } = await r.open({
    name: 'Tn1loi',
    viewport: [1920, 1080],
    seenIntro: true,
    query: { realm: 'nk6', at: 'tong_mon', root: 'loi' },
  });
  await sleep(2500);
  await gm(page, 'gold 5000');
  const log: Record<string, unknown> = {};
  await page.keyboard.press('c');
  await sleep(1200);
  // Thẻ Bản Nguyên nằm ở tab thứ ba (Bộ trang bị · Tu luyện).
  await page.locator('.win-host [role=tab]').nth(2).click();
  await sleep(700);
  log.card = await page
    .locator('.root-card')
    .first()
    .getAttribute('data-root')
    .catch(() => null);
  await snapSizes(page, r.out, 'nhan-vat-loi', sizes, 900);
  await page.keyboard.press('Escape');
  await sleep(400);
  await tp(page, 2048, 2034);
  await sleep(2000);
  await page.evaluate(() => window.__game!.interact());
  await sleep(900);
  await page.locator('.win-host [role=tab], .npc [role=tab]').last().click();
  await sleep(900);
  log.rows = await page.locator('.shop-row[data-root]').evaluateAll((els) => els.map((e) => e.getAttribute('data-root')));
  log.locked = await page.locator('.root-lock').count();
  await snapSizes(page, r.out, 'npc-doi-ban-nguyen', sizes, 900);
  // Cuối danh sách: hàng Lôi (đang mang) và dải tám nguồn khóa.
  for (const tag of sizes) {
    const [width, height] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
    await page.setViewportSize({ width, height });
    await sleep(900);
    await page.evaluate(() =>
      document.querySelector('.npc [data-testid="root-locked"], .win-host [data-testid="root-locked"]')?.scrollIntoView({ block: 'end' }),
    );
    await sleep(500);
    await snap(page, r.out, `npc-doi-ban-nguyen-cuoi-${tag}.jpg`);
  }
  await ctx.close();
  return log;
}

export default {
  name: 'tn1',
  desc: 'TN-1 Bản Nguyên: màn tạo nhân vật chọn Lôi + tám nguồn khóa, tab đổi Bản Nguyên ở NPC, thẻ nhân vật; 1080p + 720p',
  usage: '[--step tao,npc] [--sizes 1080p,720p]',
  async run(r) {
    const sizes = list('--sizes', '1080p,720p');
    const steps = list('--step', 'tao,npc');
    const log: Record<string, unknown> = {};
    if (steps.includes('tao')) log.tao = await stepCreate(r, sizes);
    if (steps.includes('npc')) log.npc = await stepNpc(r, sizes);
    writeJson(r.out, 'tn1.json', log);
  },
} satisfies Scenario;
