// Nhiệm vụ chương 5 Bắc Hoang (DV3-H): thẻ chương, hội thoại Tô Vãn Ngư / bia Mặc Chiếu / Cố Bất Dịch ở Vọng Bắc Trạm, theo dõi nhiệm vụ.
import { NPC } from '@dtl/content';
import { sleep } from '../lib/devserver';
import { gm, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

export default {
  name: 'quest5',
  desc: 'Chương 5 Bắc Hoang: thẻ chương, hội thoại Tô Vãn Ngư/bia Mặc Chiếu/Cố Bất Dịch (nhận, đang làm, trả), theo dõi nhiệm vụ',
  async run(r) {
    const { ctx, page, errors } = await r.open({ name: 'Q5', viewport: [1600, 900], query: { god: 1, realm: 28 }, seenIntro: true });
    await gm(page, 'tele all');
    await gm(page, 'qdone q4_hoa_than');
    await gm(page, 'tp bh_tram', 800);
    await page
      .getByText('Chương năm')
      .first()
      .waitFor({ timeout: 60_000 })
      .catch(() => {});
    await sleep(1500);
    await snap(page, r.out, '01-the-chuong-5.jpg', { wait: 0 });
    await sleep(4500);

    const near = async (id: string) => {
      const n = NPC.get(id)!;
      await tp(page, n.x + 1.5, n.z + 1.5);
      await sleep(700);
    };
    const talk = (id: string) =>
      page.evaluate((v) => (window as unknown as { __game: { openNpc(i: string): void } }).__game.openNpc(v), id);
    const close = () => page.keyboard.press('Escape');
    const accept = () =>
      page
        .getByRole('button', { name: /nhận/i })
        .first()
        .click()
        .catch(() => {});

    await gm(page, 'qdone q5_bac_hanh');
    await near('npc_to_van_ngu_bh');
    await talk('npc_to_van_ngu_bh');
    await sleep(1200);
    await snap(page, r.out, '02-to-van-ngu-tro-lanh.jpg', { wait: 0 });
    await accept();
    await sleep(1200);
    await close();
    await snap(page, r.out, '03-theo-doi-nhiem-vu.jpg');

    await gm(page, 'qdone q5_tro_lanh');
    await near('npc_mac_chieu_bia');
    await talk('npc_mac_chieu_bia');
    await sleep(1200);
    await snap(page, r.out, '04-bia-mac-chieu-then-cai.jpg', { wait: 0 });
    await accept();
    await sleep(900);
    await close();

    await near('npc_co_bat_dich');
    await talk('npc_co_bat_dich');
    await sleep(1200);
    await snap(page, r.out, '05-co-bat-dich.jpg', { wait: 0 });
    await close();

    await gm(page, 'qdone q5_then_cai');
    await near('npc_mac_chieu_bia');
    await talk('npc_mac_chieu_bia');
    await sleep(1200);
    await snap(page, r.out, '06-bia-mac-chieu-tra.jpg', { wait: 0 });
    await close();
    if (errors.length) console.log('lỗi console:', errors.slice(0, 5));
    await ctx.close();
  },
} satisfies Scenario;
