// Ảnh duyệt boss hai mặt Âm/Dương (TN-3, Phủ Chủ trong Giới Trì Động Phủ): vào phó bản bằng cổng thật, gọi boss bằng GM, rồi chụp CÙNG một góc máy ở
// 720p + 1080p đúng các mốc của đồng hồ mặt: mặt Dương lộ, báo trước lật, ngay sau lật sang Âm (camFade), mặt Âm, rồi lật lại Dương.
// Mốc lấy từ cờ MF_FACE (256) của boss trong `view.monsters` (server quyết định), không đoán giờ. Chạy:
//   pnpm shots bossfaces --out <thư mục tuyệt đối> [--level gioi_tri] [--sizes 720p,1080p]
import { MF_FACE } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, enterLevel, gm, skipCutscene, tp, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snapSizes, writeJson } from '../lib/shot';

export default {
  name: 'bossfaces',
  desc: 'Boss hai mặt Âm/Dương: cùng góc máy 720p+1080p ở mặt Dương, báo trước, lật, mặt Âm (duyệt VFX lật mặt có camFade)',
  usage: '--out <thư mục tuyệt đối> [--level gioi_tri] [--sizes 720p,1080p] [--pitch 0.4] [--dist 26] [--yaw 0]',
  async run(r) {
    const id = opt('--level', 'gioi_tri');
    const dg = LEVELS[id]?.dungeon;
    const home = dg && LEVELS[dg.returnLevel];
    const portal = home?.portals?.find((p) => p.to === id);
    if (!dg || !portal) throw new Error(`level ${id} không phải phó bản có cổng`);
    const boss = dg.waves[dg.waves.length - 1]!.mons.find((m) => m.id.startsWith('boss_'))?.id;
    if (!boss) throw new Error('đợt cuối không có boss');
    const sizes = list('--sizes', '720p,1080p');
    const c = dg.center;
    const { page, ctx } = await r.open({
      name: 'BossFaces',
      renderer: 'webgpu',
      quality: 'high',
      query: { quiet: 1 },
      hide: 'chat',
      seenIntro: true,
    });
    await gm(page, `level ${dg.minLevel + 2}`);
    await gm(page, 'god on');
    await enterLevel(page, dg.returnLevel);
    await tp(page, dg.returnSpawn.x, dg.returnSpawn.z);
    await sleep(1500);
    await tp(page, portal.x, portal.z);
    await sleep(1500);
    await page.keyboard.press('KeyE');
    await waitLevel(page, id);
    await skipCutscene(page, 10);
    await gm(page, 'god on', 1000);
    await gm(page, 'killall', 700);
    await gm(page, `tp ${c.x} ${c.z + 16}`, 1100);
    // Hướng nhìn: về phía bắc của bí cảnh (-z), cùng quy ước dungeonart (yaw 0 sau hiệu chỉnh: bí cảnh Giới Trì dựng quay mặt -z).
    const pitch = Number(opt('--pitch', '0.4'));
    const dist = Number(opt('--dist', '26'));
    await cam(page, { yaw: Number(opt('--yaw', '0')), pitch, dist });
    await gm(page, `spawn ${boss} 1`, 2500);
    await skipCutscene(page, 40);
    const state = () =>
      page.evaluate((f) => {
        const g = window.__game!;
        for (const m of g.view.monsters.values())
          if (m.t === (window as unknown as { __boss: string }).__boss) return { am: (m.mf & f) !== 0, hp: m.hp, mhp: m.mhp };
        return null;
      }, MF_FACE);
    await page.evaluate((b) => ((window as unknown as { __boss: string }).__boss = b), boss);
    const wait = async (want: boolean, ms: number) => {
      for (let t = 0; t < ms; t += 100, await sleep(100)) if ((await state())?.am === want) return true;
      return false;
    };
    const log: Record<string, unknown> = { boss };
    // Boss vào trận khi bị đánh/đuổi tới mình: `hurt` nhẹ để chắc chắn nó giao chiến và bắt đầu đồng hồ mặt.
    await gm(page, 'hurt 95', 400);
    const t0 = Date.now();
    // Chờ dòng toast của lệnh GM tan (che thanh boss) rồi mới chụp mặt Dương.
    await snapSizes(page, r.out, '01-mat-duong', sizes, 4500);
    // Báo trước: 2 giây trước lật (mặt Dương 14 s): chờ tới ~giây 12,3 từ lúc vào trận.
    await sleep(Math.max(0, 12_400 - (Date.now() - t0)));
    await snapSizes(page, r.out, '02-bao-truoc', sizes, 0);
    const flipped = await wait(true, 6000);
    log.flippedToAm = flipped;
    await snapSizes(page, r.out, '03-vua-lat-am', sizes, 150);
    await sleep(2500);
    await snapSizes(page, r.out, '04-mat-am', sizes, 0);
    log.amState = await state();
    const back = await wait(false, 9000);
    log.flippedToDuong = back;
    await snapSizes(page, r.out, '05-vua-lat-duong', sizes, 150);
    writeJson(r.out, 'bossfaces.json', log);
    await gm(page, 'spawn clear', 900);
    await ctx.close();
  },
} satisfies Scenario;
