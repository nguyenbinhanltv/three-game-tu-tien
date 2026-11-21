// TN-2 (Hồn tu): ảnh giao diện và hồn phiên trong game, mỗi bước `--step` một phần.
//   learn: bảng Công pháp lúc chưa lĩnh ngộ (nút "Lĩnh ngộ" + điều kiện), bấm lĩnh ngộ thật ở chỗ Lạc Vân chân nhân, sau khi lĩnh ngộ.
//   hud:   đeo hồn phiên (mesh thủ tục sau lưng), thanh Hồn lực, Phệ Hồn đặt Hồn ấn lên quái, Nhiếp Hồn (phiên bay ra phất).
// Mọi thao tác đi đường người chơi thật (bấm nút, phím chiêu); lệnh GM chỉ để dựng cảnh (cảnh giới, linh thạch, gọi quái).
import { NPC, PATH, t } from '@dtl/content';
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, snapSizes, UI_SIZES, writeJson } from '../lib/shot';

const HON = 'dan_hon_kinh';

type Page = Awaited<ReturnType<Run['open']>>['page'];

const state = (page: Page) =>
  page.evaluate(() => {
    const g = window.__game as unknown as {
      view: { monsters: Map<string, { mk?: number }> };
    };
    const bar = document.querySelector('[data-testid="res-bar"]');
    const pick = document.querySelector('[data-testid="mp-pick"]') as HTMLButtonElement | null;
    return {
      res: bar?.getAttribute('data-res') ?? null,
      now: bar?.getAttribute('aria-valuenow') ?? null,
      marked: [...g.view.monsters.values()].filter((x) => (x.mk ?? 0) > 0).length,
      pick: pick ? { text: pick.textContent, disabled: pick.disabled } : null,
      note: document.querySelector('[data-testid="mp-learn-note"]')?.textContent ?? null,
    };
  });

async function openHonCard(page: Page): Promise<void> {
  if (!(await page.locator('.mp-cards').count())) await page.keyboard.press('KeyK', { delay: 60 });
  await sleep(600);
  await page.getByRole('tab', { name: new RegExp(t(`method.${HON}.name`)) }).click();
  await sleep(500);
}

async function stepLearn(r: Run, sizes: string[]): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  const u = PATH.get('hon_tu')!.unlock!;
  const { ctx, page } = await r.open({
    name: 'HonLearn',
    viewport: [1920, 1080],
    seenIntro: true,
    query: { realm: 'nk12', at: 'tong_mon' },
  });
  await sleep(2500);
  await gm(page, 'method lac_kiem_quyet', 1300);
  // Thiếu linh thạch: nút khóa, dòng điều kiện hiện.
  await openHonCard(page);
  log.chua = await state(page);
  await snapSizes(page, r.out, 'a-learn-chua-linh-ngo', sizes);
  // Đủ linh thạch, tới chỗ người truyền công pháp rồi bấm nút thật.
  await page.keyboard.press('KeyK', { delay: 60 });
  await gm(page, `gold ${u.gold + 500}`, 1300);
  const npc = NPC.get('npc_chuong_mon')!;
  await tp(page, npc.x + 1.5, npc.z + 2.5);
  await sleep(1500);
  await openHonCard(page);
  log.du = await state(page);
  await snapSizes(page, r.out, 'b-learn-du-dieu-kien', sizes);
  await page.locator('[data-testid="mp-pick"]').click();
  await sleep(1800);
  log.sau = await state(page);
  await snapSizes(page, r.out, 'c-learn-da-linh-ngo', sizes);
  await ctx.close();
  return log;
}

async function stepHud(r: Run, sizes: string[]): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  const { ctx, page } = await r.open({
    name: 'HonHud',
    viewport: [1920, 1080],
    seenIntro: true,
    query: { realm: 'nk12', at: 'rung', god: 1 },
  });
  await sleep(2500);
  await gm(page, `method ${HON} 3`, 1300);
  await gm(page, 'art itm_hon_phien 1', 1300);
  await sleep(1200);
  for (const tag of sizes) {
    const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
    await page.setViewportSize({ width: w, height: h });
    await gm(page, 'spawn clear', 1400);
    await gm(page, 'res 0', 1300);
    await sleep(600);
    // Lúc nghỉ: hồn phiên cắm chéo sau lưng, thanh Hồn lực rỗng.
    await snap(page, r.out, `d-hud-nghi-${tag}.jpg`, { wait: 300 });
    await gm(page, 'spawn mon_thiet_boi_tru 4', 1800);
    await page.keyboard.press('Tab', { delay: 80 });
    await sleep(300);
    // Phệ Hồn (ô 7): đặt Hồn ấn, tích Hồn lực.
    await gm(page, 'cd', 1300);
    await page.keyboard.press('Digit7', { delay: 60 });
    await sleep(900);
    log[`phe-hon-${tag}`] = await state(page);
    await snap(page, r.out, `e-hud-phe-hon-${tag}.jpg`, { wait: 100 });
    // Nhiếp Hồn (ô 9, pháp bảo): phiên bay ra phất, quái quanh mình nhận ấn.
    await page.keyboard.press('Digit9', { delay: 60 });
    await sleep(650);
    await snap(page, r.out, `f-hud-nhiep-hon-${tag}.jpg`, { wait: 50 });
    await sleep(500);
    log[`nhiep-hon-${tag}`] = await state(page);
    // Tooltip thanh Hồn lực.
    await page.locator('[data-testid="res-bar"]').hover();
    await sleep(700);
    await snap(page, r.out, `g-hud-tooltip-${tag}.jpg`, {
      clip: { x: Math.round(w * 0.5), y: Math.round(h * 0.52), width: Math.round(w * 0.5), height: Math.round(h * 0.48) },
      wait: 200,
    });
    await page.mouse.move(8, 8);
    await sleep(31_000);
  }
  await ctx.close();
  return log;
}

export default {
  name: 'hontu',
  desc: 'TN-2 Hồn tu: bảng lĩnh ngộ, thanh Hồn lực, Hồn ấn, hồn phiên (mesh thủ tục) ở 1080p + 720p',
  usage: '[--step learn,hud] [--sizes 1080p,720p]',
  async run(r) {
    const sizes = list('--sizes', '1080p,720p');
    const steps = list('--step', 'learn,hud');
    const log: Record<string, unknown> = {};
    if (steps.includes('learn')) log.learn = await stepLearn(r, sizes);
    if (steps.includes('hud')) log.hud = await stepHud(r, sizes);
    writeJson(r.out, 'hontu.json', log);
  },
} satisfies Scenario;
