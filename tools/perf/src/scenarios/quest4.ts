// Nhiệm vụ chương 4 Thiên Khuyết (E4-H): thẻ chương, hội thoại giao/trả ở Mặc Chiếu và Tô Vãn Ngư, bảng theo dõi nhiệm vụ.
import { NPC } from '@dtl/content';
import { sleep } from '../lib/devserver';
import { enterLevel, gm, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap } from '../lib/shot';

export default {
  name: 'quest4',
  desc: 'Chương 4 Thiên Khuyết: thẻ chương, hội thoại Mặc Chiếu/Tô Vãn Ngư (nhận, đang làm, trả), theo dõi nhiệm vụ',
  async run(r) {
    const { ctx, page, errors } = await r.open({ name: 'Q4', viewport: [1600, 900], query: { god: 1, realm: 24 }, seenIntro: true });
    await gm(page, 'tele all');
    await gm(page, 'qdone q3_nguyen_anh');
    await gm(page, 'tp tk_tram', 800);
    // Thẻ chương hiện 1,2 s sau khi tới nơi: chụp ngay khi chữ xuất hiện.
    await page.getByText('Chương bốn').first().waitFor({ timeout: 60_000 }).catch(() => {});
    await sleep(1500);
    await snap(page, r.out, '01-the-chuong-4.jpg', { wait: 0 });
    await sleep(4500);

    const near = async (id: string) => {
      const n = NPC.get(id)!;
      await tp(page, n.x + 1.5, n.z + 1.5);
      await sleep(700);
    };
    const talk = (id: string) => page.evaluate((v) => (window as unknown as { __game: { openNpc(i: string): void } }).__game.openNpc(v), id);
    const close = () => page.keyboard.press('Escape');

    // Mặc Chiếu: nhận q4_thach_tuong (đã xong q4_bac_len).
    await gm(page, 'qdone q4_bac_len');
    await near('npc_mac_chieu');
    await talk('npc_mac_chieu');
    await sleep(1200);
    await snap(page, r.out, '02-mac-chieu-nhan-nhiem-vu.jpg', { wait: 0 });
    await page.getByRole('button', { name: /nhận/i }).first().click().catch(() => {});
    await sleep(1200);
    await close();
    await snap(page, r.out, '03-theo-doi-nhiem-vu.jpg');

    // Tô Vãn Ngư: môn phong ấn (q4_xuat_khieu).
    await gm(page, 'qdone q4_thach_tuong');
    await gm(page, 'qdone q4_da_minh');
    await near('npc_to_van_ngu_tk');
    await talk('npc_to_van_ngu_tk');
    await sleep(1200);
    await snap(page, r.out, '04-to-van-ngu-phong-an.jpg', { wait: 0 });
    await close();

    // Mặc Chiếu: trả mạch (nhận, chạm Tinh Bái Đài bằng sự kiện giả, trả).
    for (const id of ['q4_xuat_khieu', 'q4_chien_ma', 'q4_thu_linh', 'q4_than_tang']) await gm(page, `qdone ${id}`, 900);
    await near('npc_mac_chieu');
    await talk('npc_mac_chieu');
    await sleep(1200);
    await page.getByRole('button', { name: /nhận/i }).first().click().catch(() => {});
    await sleep(900);
    await gm(page, 'qev touch tinh_bai_dai');
    await sleep(900);
    await talk('npc_mac_chieu');
    await sleep(1200);
    await snap(page, r.out, '05-mac-chieu-tra-mach.jpg', { wait: 0 });
    await close();
    if (errors.length) console.log('lỗi console:', errors.slice(0, 5));
    await ctx.close();
  },
} satisfies Scenario;
