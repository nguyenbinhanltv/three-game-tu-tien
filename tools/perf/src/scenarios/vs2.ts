// VS-2 (hệ kỹ năng mới): ảnh HUD của ba công pháp ở vài cỡ màn hình. Mỗi bước `--step` chụp phần giao diện của một PR.
//   res: thanh tài nguyên riêng (Kiếm ý / Huyết khí / Đan hỏa) lúc rỗng, đang tích và đầy, kèm tooltip.
//   chain: ô chiêu sáng viền khi cửa sổ chuỗi mở + tooltip báo thưởng chuỗi (mỗi phái một chuỗi mở đầu).
//   branch: thẻ nhắc chọn nhánh trên HUD, cây nhánh trong bảng Công pháp lúc chưa chọn và sau khi chọn hai mốc.
//   marks: ấn trên mục tiêu: Kiếm ấn trên thủ lĩnh (thẻ trong thanh thủ lĩnh), Trấn ấn trên đầu bầy quái, Mộc ấn trên người chơi.
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { snap, snapSizes, UI_SIZES, writeJson } from '../lib/shot';

/** `--only kiem-tu,ho-phap,dan-su`: chỉ chụp các phái này (mặc định cả ba). */
const ONLY = list('--only', '');
const want = (tag: string) => !ONLY.length || ONLY.includes(tag);

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
  for (const m of METHODS.filter((x) => want(x.tag))) {
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

/** Mỗi phái một chuỗi mở đầu chơi được ở Ngưng Khí 12: phím chiêu mở, có cần mục tiêu không. */
const CHAINS = [
  { id: 'lac_kiem_quyet', tag: 'kiem-tu', at: 'boss', target: true, open: 'Digit2' },
  { id: 'bat_dong_kim_than', tag: 'ho-phap', at: 'tong_mon', target: false, open: 'Digit7' },
  { id: 'thanh_moc_dan_kinh', tag: 'dan-su', at: 'tong_mon', target: false, open: 'Digit7' },
] as const;

async function stepChain(r: Run, sizes: string[]): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  for (const m of CHAINS.filter((x) => want(x.tag))) {
    const { ctx, page } = await r.open({
      name: 'Vs2c' + m.tag.replace('-', ''),
      viewport: [1920, 1080],
      seenIntro: true,
      query: { realm: 'nk12', at: m.at, god: 1 },
    });
    await sleep(2500);
    await gm(page, `method ${m.id}`);
    await sleep(800);
    for (const tag of sizes) {
      const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      await page.setViewportSize({ width: w, height: h });
      await gm(page, 'cd', 400);
      await gm(page, 'heal', 400);
      // Chiêu cần mục tiêu: đứng trong tầm thủ lĩnh Hàn Giao (máu dày, không chết giữa hai lượt chụp) rồi Tab chọn nó.
      if (m.target) {
        await tp(page, 1640, 2252);
        await sleep(2500);
        await page.keyboard.press('Tab', { delay: 80 });
        await page.keyboard.press('Tab', { delay: 80 });
      }
      await sleep(250);
      await page.keyboard.press(m.open, { delay: 60 });
      // Chờ đòn áp (hitAt ≤ 0,5 s) rồi chụp trong cửa sổ chuỗi (3–4 s).
      await sleep(900);
      const lit = page.locator('.u2h-skill.empowered');
      const n = await lit.count();
      log[`${m.tag}-${tag}`] = {
        lit: n,
        ids: await lit.evaluateAll((els) => els.map((e) => e.getAttribute('data-skill') ?? e.getAttribute('aria-label') ?? '')),
      };
      if (n > 0) await lit.first().hover();
      await sleep(350);
      await snap(page, r.out, `b-chain-${m.tag}-${tag}.jpg`, { clip: clipOf(w, h), wait: 100 });
      await page.mouse.move(8, 8);
      await sleep(4500);
    }
    await ctx.close();
  }
  return log;
}

/** Mỗi phái một cảnh đặt ấn: chỗ đứng, các phím bấm (xóa hồi chiêu giữa các lần), có Tab chọn thủ lĩnh không. */
const MARK_SCENES = [
  { id: 'lac_kiem_quyet', tag: 'kiem-tu', at: 'boss', boss: true, spawn: '', keys: ['Digit2', 'Digit2', 'Digit2'] },
  { id: 'bat_dong_kim_than', tag: 'ho-phap', at: 'rung', boss: false, spawn: 'mon_thiet_boi_tru 3', keys: ['Digit7'] },
  { id: 'thanh_moc_dan_kinh', tag: 'dan-su', at: 'tong_mon', boss: false, spawn: '', keys: ['Digit7'] },
] as const;

async function stepMarks(r: Run, sizes: string[]): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  for (const m of MARK_SCENES.filter((x) => want(x.tag))) {
    const { ctx, page } = await r.open({
      name: 'Vs2m' + m.tag.replace('-', ''),
      viewport: [1920, 1080],
      seenIntro: true,
      query: { realm: 'nk12', at: m.at, god: 1 },
    });
    await sleep(2500);
    await gm(page, `method ${m.id}`);
    await sleep(800);
    if (m.boss) {
      await tp(page, 1640, 2252);
      await sleep(2500);
    }
    for (const tag of sizes) {
      const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      await page.setViewportSize({ width: w, height: h });
      if (m.boss) {
        await page.keyboard.press('Tab', { delay: 80 });
        await page.keyboard.press('Tab', { delay: 80 });
      }
      // Chiêu quanh mình cần quái trong tầm: gọi vài con ngang cấp ngay trước mặt (dọn lượt trước).
      // Lệnh GM đi qua chat nên phải cách nhau hơn 1 giây (server giãn chat), không thì bị bỏ.
      if (m.spawn) {
        await gm(page, 'spawn clear', 1400);
        await gm(page, `spawn ${m.spawn}`, 1800);
      }
      for (const k of m.keys) {
        await gm(page, 'cd', 1300);
        await page.keyboard.press(k, { delay: 60 });
        await sleep(750);
      }
      // Gói bit `mk` server vừa đồng bộ (đọc từ state của client) + số thẻ ấn trên HUD.
      log[`${m.tag}-${tag}`] = await page.evaluate(() => {
        const g = window.__game as unknown as { view: { monsters: Map<string, { mk?: number }>; players: Map<string, { mk?: number }> } };
        const mons = [...g.view.monsters.values()].filter((x) => (x.mk ?? 0) > 0).length;
        const players = [...g.view.players.values()].filter((x) => (x.mk ?? 0) > 0).length;
        return { mons, players, chips: document.querySelectorAll('[data-testid="mark-chips"] .mark-chip').length };
      });
      await page.mouse.move(8, 8);
      // Chờ thông báo GM giữa màn hình tan (nó che thẻ ấn trong thanh thủ lĩnh); ấn ngắn nhất còn hơn 2 giây.
      await sleep(2600);
      await snap(page, r.out, `c-marks-${m.tag}-${tag}.jpg`, { wait: 150 });
      await sleep(m.boss ? 9000 : 11000);
    }
    await ctx.close();
  }
  return log;
}

async function stepBranch(r: Run, sizes: string[]): Promise<Record<string, unknown>> {
  const log: Record<string, unknown> = {};
  for (const m of METHODS.filter((x) => want(x.tag))) {
    const { ctx, page } = await r.open({
      name: 'Vs2b' + m.tag.replace('-', ''),
      viewport: [1920, 1080],
      seenIntro: true,
      query: { realm: 'nk12', at: 'tong_mon', god: 1 },
    });
    await sleep(2500);
    // Lệnh GM đi qua chat: cách nhau hơn 1 giây.
    await gm(page, `method ${m.id}`, 1400);
    await gm(page, 'level 28', 1600);
    await gm(page, 'gold 50000', 1400);
    await gm(page, 'branch reset', 1400);
    log[`${m.tag}-chip`] = await page.locator('[data-testid="branch-chip"]').count();
    await sleep(2800);
    await snapSizes(page, r.out, `d-branch-${m.tag}-hud-nhac`, sizes);
    await page.keyboard.press('k');
    await sleep(900);
    const tree = page.locator('[data-testid="branch-tree"]');
    // Chụp từng cỡ: cuộn cây nhánh vào khung (bảng thấp ở 720p) rồi mới chụp.
    const shots = async (stem: string) => {
      for (const tag of sizes) {
        const [w, h] = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
        await page.setViewportSize({ width: w, height: h });
        await sleep(500);
        await tree.evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await snap(page, r.out, `${stem}-${tag}.jpg`, { wait: 400 });
      }
      const [w0, h0] = UI_SIZES[sizes[0] ?? '1080p'] ?? UI_SIZES['1080p']!;
      await page.setViewportSize({ width: w0, height: h0 });
    };
    await shots(`d-branch-${m.tag}-chua-chon`);
    // Chọn bằng nút thật: nhánh đầu ở mốc 16, nhánh thứ hai ở mốc 20, để thấy "đã chọn" và nhánh kia mờ đi.
    await page.locator('[data-testid^="branch-16-"]').first().locator('button.u2-btn, button').last().click();
    await sleep(900);
    await page.locator('[data-testid^="branch-20-"]').nth(1).locator('button.u2-btn, button').last().click();
    await sleep(900);
    log[`${m.tag}-picked`] = await page.locator('.br-card[data-state="picked"]').count();
    await page.mouse.move(8, 8);
    await sleep(2600);
    await shots(`d-branch-${m.tag}-da-chon`);
    await ctx.close();
  }
  return log;
}

export default {
  name: 'vs2',
  desc: 'VS-2 hệ kỹ năng mới: ảnh HUD ba công pháp (thanh tài nguyên riêng…) ở 1080p + 720p',
  usage: '[--step res,chain,marks,branch] [--sizes 1080p,720p] [--only kiem-tu,ho-phap,dan-su]',
  async run(r) {
    const sizes = list('--sizes', '1080p,720p');
    const steps = list('--step', 'res,chain,marks,branch');
    const log: Record<string, unknown> = {};
    if (steps.includes('res')) log.res = await stepRes(r, sizes);
    if (steps.includes('chain')) log.chain = await stepChain(r, sizes);
    if (steps.includes('marks')) log.marks = await stepMarks(r, sizes);
    if (steps.includes('branch')) log.branch = await stepBranch(r, sizes);
    writeJson(r.out, 'vs2.json', log);
  },
} satisfies Scenario;
