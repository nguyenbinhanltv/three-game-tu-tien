// Hoa Trúc (bước 1): bảng Nhân vật với tranh vẽ. Quay webm + ảnh: rê chuột (parallax), thở, đổi bộ (vệt mực), đổi kiếm, mặc đủ bộ, nữ.
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

export default {
  name: 'hoatruc',
  desc: 'Hoa Trúc: bảng Nhân vật tranh vẽ (parallax chuột, thở, đổi bộ có vệt mực, đổi kiếm); --gender m|f, --video 1',
  usage: '[--size 1920x1080] [--gender m|f] [--video 1] [--level 12]',
  async run(r) {
    const [w, h] = opt('--size', '1920x1080').split('x').map(Number) as [number, number];
    const g = opt('--gender', 'm');
    const { page } = await r.open({
      name: 'Ht',
      quality: 'high',
      viewport: [w, h],
      seenIntro: true,
      look: { g },
      query: { realm: opt('--level', '12') === '12' ? 'nk12' : opt('--level', '12'), at: 'tong_mon', god: 1, quiet: 1 },
      video: opt('--video', '') ? r.out : undefined,
    });
    const tag = g === 'f' ? 'nu' : 'nam';
    const shot = (n: string, wait = 500) => snap(page, r.out, `${n}-${tag}.jpg`, { wait });
    await gm(page, 'set off');
    await gm(page, 'weapon itm_thanh_phong_kiem').catch(() => undefined);
    await sleep(800);
    await page.keyboard.press('KeyC');
    await sleep(1500);
    await shot('01-do-de-tu');
    // rê chuột qua khung tranh: parallax
    const box = await page.locator('.hoatruc').boundingBox();
    if (box) {
      for (const fx of [0.1, 0.5, 0.9, 0.5]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * 0.5, { steps: 18 });
        await sleep(450);
        if (fx === 0.1) await shot('02-parallax-trai', 100);
        if (fx === 0.9) await shot('03-parallax-phai', 100);
      }
    }
    await sleep(1200);
    await shot('04-tho', 0);
    // đổi bộ: 2 món Lạc Kiếm → vệt mực + dấu triện
    await gm(page, 'set set_lac_kiem 2', 120);
    await sleep(250);
    await shot('05-vet-muc', 0);
    await sleep(900);
    await shot('06-lac-kiem-2-mon', 600);
    await gm(page, 'set set_lac_kiem 4');
    await sleep(1500);
    await shot('07-lac-kiem-du-bo', 600);
    // đổi kiếm: lớp kiếm vẽ riêng đổi theo
    await gm(page, 'weapon itm_han_quang_kiem', 150).catch(() => undefined);
    await sleep(700);
    await shot('08-doi-kiem-han-quang', 500);
    await sleep(1500);
    await page.context().close();
  },
} satisfies Scenario;
