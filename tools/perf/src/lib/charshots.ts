// Bộ góc chụp nhân vật dùng chung cho kịch bản trang phục và nhân vật nền: đứng yên ba hướng, rồi các tư thế dễ lòi lưới nhất
// (chạy ngang, ngự kiếm, đả tọa, chém, chết). Quy ước camera: yaw 0 = đứng trước mặt nhân vật, π = sau lưng.
import type { Page } from 'playwright';
import { sleep } from './devserver';
import { cam, gm } from './game';

type Shot = (view: string) => Promise<unknown>;

export async function stillViews(page: Page, shot: Shot, dist: number): Promise<void> {
  for (const [view, yaw] of [
    ['sau', Math.PI],
    ['truoc', 0],
    ['nghieng', Math.PI / 2],
  ] as const) {
    await cam(page, { yaw, pitch: 0.12, dist });
    await sleep(1100);
    await shot(view);
  }
}

export async function motionViews(page: Page, shot: Shot, dist: number, o: { die?: boolean; home?: string } = {}): Promise<void> {
  // Chạy ngang màn hình: thấy nghiêng khi dải lụa lắc, tay vung.
  await cam(page, { yaw: 0, pitch: 0.14, dist: dist + 1 });
  await page.keyboard.down('KeyD');
  await sleep(1500);
  await shot('chay');
  await page.keyboard.up('KeyD');
  await sleep(300);
  // Ngự kiếm (tư thế cúi, dải lụa bị gió thổi).
  await page.evaluate(() => window.__game!.toggleFly());
  await sleep(900);
  await cam(page, { yaw: 0.6, pitch: 0.1, dist: dist + 0.5 });
  await page.keyboard.down('KeyW');
  await sleep(1300);
  await shot('bay');
  await page.keyboard.up('KeyW');
  await page.evaluate(() => window.__game!.toggleFly());
  await sleep(1500);
  // Đả tọa (Z): ngồi xếp chân, tay đặt gối; bấm W để đứng dậy.
  await cam(page, { yaw: 0.5, pitch: 0.12, dist });
  await page.keyboard.press('KeyZ');
  await sleep(2200);
  await shot('datoa');
  await page.keyboard.press('KeyW');
  await sleep(700);
  // Chém: một con sói trước mặt, ra chiêu ô 1, chụp giữa động tác.
  await slash(page, shot, dist, 1, 'chem');
  await gm(page, 'killall', 1700);
  if (!o.die) return;
  // Chết (clip nằm dài: áo dễ lòi nhất) rồi hồi sinh, về chỗ chụp.
  await cam(page, { yaw: 0.7, pitch: 0.2, dist });
  await gm(page, 'die', 1300);
  await shot('chet');
  await page.evaluate(() => window.__game!.send('resp', {}));
  await sleep(3000);
  await gm(page, 'god on', 900);
  if (o.home) await gm(page, `tp ${o.home}`, 1600);
}

/** Ra chiêu ở ô `slot` (ô 1 thì gọi trước một con sói làm mục tiêu) và chụp giữa động tác. */
export async function slash(page: Page, shot: Shot, dist: number, slot: number, view: string): Promise<void> {
  if (slot === 1) await gm(page, 'spawn mon_soi_xam 1', 1700);
  await cam(page, { yaw: Math.PI * 0.8, pitch: 0.14, dist });
  await page.evaluate((n) => window.__game!.useSkill(n), slot);
  await sleep(280);
  await shot(view);
  await sleep(1000);
}
