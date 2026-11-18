// HUD bốn góc UI Kit 2.0 (U2-2): chơi thật ở 1920×1080 (?mute=1), quay webm và chụp các khoảnh khắc: cụm kỹ năng khi hồi chiêu,
// dải tên chiêu vệt mực, đánh boss (thanh boss), bật/tắt nhiệm vụ + chat, mở bảng từ Ngọc Đái, đổi bố cục kỹ năng sang thanh ngang.
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

export default {
  name: 'hudplay',
  desc: 'Chơi thật với HUD mới (U2-2): hồi chiêu, tên chiêu, boss, thu gọn nhiệm vụ/chat, bảng từ hub, thanh ngang; quay webm',
  usage: '[--size 1920x1080] [--video 1: quay webm vào --out]',
  async run(r) {
    const [w, h] = opt('--size', '1920x1080').split('x').map(Number) as [number, number];
    const { page } = await r.open({
      name: 'Hp',
      quality: 'high',
      viewport: [w, h],
      seenIntro: true,
      query: { realm: 'nk12', at: 'tong_mon', god: 1, quiet: 1 },
      video: opt('--video', '') ? r.out : undefined,
    });
    const shot = (name: string, wait = 400) => snap(page, r.out, `${name}.jpg`, { wait });
    const press = async (code: string, wait = 350) => {
      await page.keyboard.press(code);
      await sleep(wait);
    };
    const log: Record<string, unknown> = {};

    await gm(page, 'level 15');
    await gm(page, 'method kiem_tu').catch(() => undefined);
    await sleep(1200);
    await shot('01-san-tong-mon', 1200);
    // Nhận nhiệm vụ để khung theo dõi có chữ.
    await tp(page, 2048, 2034);
    await sleep(2000);
    await page.evaluate(() => window.__game!.send('q', { a: 'accept', id: 'q_dan_khi' }));
    await sleep(600);
    await tp(page, 2048, 2088);
    await sleep(600);
    // Đến boss, chọn mục tiêu, tung chiêu liên tục.
    await tp(page, 1640, 2252);
    await sleep(2500);
    await press('Tab');
    await press('Tab');
    await shot('02-boss-dung-yen', 800);
    for (const k of ['Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']) {
      await press(k, 220);
      if (k === 'Digit3') await shot('03-ten-chieu-vet-muc', 150);
    }
    await shot('04-hoi-chieu-quet-vang', 300);
    await press('KeyQ', 500);
    await shot('05-luot-q-hoi-chieu', 150);
    for (let i = 0; i < 6; i++) await press('Digit1', 450);
    await shot('06-danh-thuong-boss', 200);
    // Hub: mở các bảng bằng chuột thật.
    for (const [id, name] of [
      ['hub-bag', '07-hub-tui'],
      ['hub-char', '08-hub-nhan-vat'],
      ['hub-method', '09-hub-cong-phap'],
    ] as const) {
      await page.locator(`[data-testid="${id}"]`).click();
      await shot(name, 700);
      await page.locator(`[data-testid="${id}"]`).click();
      await sleep(300);
    }
    await page.locator('[data-testid="hub-bag"]').hover();
    await sleep(500);
    await shot('10-hub-tooltip', 200);
    // Thu gọn nhiệm vụ và chat bằng nút mũi tên trên đầu thẻ.
    await page.locator('.u2h-quest .u2h-fold').click();
    await page.locator('.u2h-chat .u2h-fold').click();
    await page.mouse.move(w / 2, h / 2);
    await shot('11-thu-gon-nhiem-vu-chat', 600);
    await page.locator('.u2h-quest .u2h-fold').click();
    await page.locator('.u2h-chat .u2h-fold').click();
    await sleep(300);
    // Cài đặt: kiểu cụm kỹ năng = thanh ngang.
    await page.locator('[data-testid="hub-settings"]').click();
    await sleep(500);
    await page.getByRole('radio', { name: /Thanh ngang/ }).click();
    await page.locator('[data-testid="hub-settings"]').click();
    await page.mouse.move(w / 2, h / 2);
    await shot('12-thanh-ngang', 700);
    await press('Digit2', 200);
    await shot('13-thanh-ngang-hoi-chieu', 250);
    log.skills = await page.evaluate(() => document.querySelectorAll('.u2h-skills .u2h-skill').length);
    writeJson(r.out, 'hudplay.json', log);
    await sleep(1500);
    await page.context().close(); // đóng context mới ghi xong webm
  },
} satisfies Scenario;
