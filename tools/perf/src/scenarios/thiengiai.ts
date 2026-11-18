// Thiên Giai Hoa Trúc (thử: bộ Liệt Mạch): cùng một tranh qua các tầng Trúc Cơ → Kết Đan → Nguyên Anh → Hóa Thần (kiếm tu). Ảnh từng tầng + video tăng dần.
import { opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

export default {
  name: 'thiengiai',
  desc: 'Thiên Giai Hoa Trúc: bộ Liệt Mạch qua tầng Kết Đan/Nguyên Anh/Hóa Thần (kiếm tu); --gender m|f, --video 1',
  usage:
    '[--size 1920x1080] [--gender m|f] [--video 1] [--set set_<id>] [--levels 20,24] [--ui 0.8|1|1.4: cỡ giao diện ở Cài đặt] [--method lac_kiem_quyet|bat_dong_kim_than|thanh_moc_dan_kinh] [--only 20|24|28|32: chỉ một tầng, quay ~9 s để ghép video chia ba màn]',
  async run(r) {
    const [w, h] = opt('--size', '1920x1080').split('x').map(Number) as [number, number];
    const g = opt('--gender', 'm');
    const { page } = await r.open({
      name: 'Tg',
      quality: 'high',
      viewport: [w, h],
      seenIntro: true,
      store: opt('--ui', '') ? { 'dtl.uiScale': opt('--ui', '1') } : undefined,
      look: { g },
      query: { realm: 'tc', at: 'tong_mon', god: 1, quiet: 1 },
      video: opt('--video', '') ? r.out : undefined,
    });
    const tag = g === 'f' ? 'nu' : 'nam';
    await gm(page, `method ${opt('--method', 'lac_kiem_quyet')}`).catch(() => undefined);
    const setId = opt('--set', 'set_liet_mach');
    const pre = (setId === 'set_liet_mach' ? '' : setId.replace('set_', '') + '-') + (opt('--ui', '') ? `ui${opt('--ui', '')}-` : '');
    await gm(page, `set ${setId}`);
    await gm(page, 'weapon itm_han_quang_kiem').catch(() => undefined);
    await sleep(800);
    await page.keyboard.press('KeyC');
    await sleep(2200);
    const box = await page.locator('.hoatruc').boundingBox();
    const sweep = async () => {
      if (!box) return;
      for (const fx of [0.2, 0.8, 0.5]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * 0.5, { steps: 14 });
        await sleep(350);
      }
    };
    const tiers: Array<[number, string]> = [
      [16, '1-truc-co'],
      [20, '2-ket-dan'],
      [24, '3-nguyen-anh'],
      [28, '4-hoa-than'],
      [32, '5-di-bien'],
    ];
    const only = opt('--only', '');
    if (only) {
      await gm(page, `level ${only}`, 900);
      await sleep(1500);
      for (let i = 0; i < 3; i++) await sweep();
      await snap(page, r.out, `${pre}only-${only}-${tag}.jpg`, { wait: 300 });
      await page.context().close();
      return;
    }
    const want = opt('--levels', '').split(',').filter(Boolean).map(Number);
    for (const [lv, name] of tiers.filter(([l]) => !want.length || want.includes(l))) {
      await gm(page, `level ${lv}`, 900);
      await sleep(1800);
      await sweep();
      await snap(page, r.out, `${pre}${name}-${tag}.jpg`, { wait: 500 });
      await sleep(1500);
    }
    await page.context().close();
  },
} satisfies Scenario;
