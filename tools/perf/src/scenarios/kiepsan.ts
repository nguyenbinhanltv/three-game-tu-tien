// V-P10: ảnh độ kiếp TẠI CHỖ ở camera chơi thật (camera chéo khóa góc, không đổi góc máy): vào kiếp bằng GM với tài khoản thử bất tử rồi chụp liên tiếp
// để bắt được mở kiếp, kiếp vân, vạch báo và tia sét. Dùng cho hai sân độ kiếp và kiếp ngoài thế giới.
//   pnpm shots kiepsan --out <thư mục> [--trib truc_co,hoa_than,anh_bien] [--frames 28] [--gap 350] [--size 720p]
// Ảnh chụp theo thời gian thật (không tạm dừng) nên mốc không chính xác từng mili giây: số đo và khung +30 ms lấy ở `pnpm shots vfxlab --skill lab_loi`.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { tribDef, tribLevelOf, type TribId } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { list, num, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES } from '../lib/shot';

export default {
  name: 'kiepsan',
  desc: 'V-P10: ảnh độ kiếp tại chỗ ở camera chơi thật (mở kiếp, kiếp vân, vạch báo, tia sét) trong sân độ kiếp hoặc ngoài thế giới',
  usage: '[--trib truc_co,hoa_than,anh_bien] [--frames 28] [--gap 350] [--size 720p]',
  async run(r) {
    const ids = list('--trib', 'truc_co,hoa_than,anh_bien') as TribId[];
    const frames = num('--frames', 28);
    const gap = num('--gap', 350);
    const [w, h] = UI_SIZES[opt('--size', '720p')] ?? UI_SIZES['720p']!;
    for (const id of ids) {
      const def = tribDef(id);
      const dir = path.join(r.out, id);
      fs.mkdirSync(dir, { recursive: true });
      const { ctx, page } = await r.open({ name: 'Ks' + id.slice(0, 4), quality: 'high', seenIntro: true, viewport: [w, h], hide: 'hud' });
      await gm(page, 'god on', 1300);
      await gm(page, `trib ${id}`, 600);
      if (def.room !== 'world') {
        await waitLevel(page, tribLevelOf(def), 1500);
        // Room kiếp là sim mới: `god` của room thế giới không theo sang.
        await gm(page, 'god on', 900);
        await gm(page, 'god on', 900);
        await skipCutscene(page, 10);
        const c = LEVELS[tribLevelOf(def)]!.dungeon!.center;
        await gm(page, `tp ${c.x} ${c.z}`, 900);
      }
      const bufs: Buffer[] = [];
      for (let i = 0; i < frames; i++) {
        bufs.push(await snap(page, dir, `${id}-${String(i).padStart(2, '0')}.jpg`, { wait: 0 }));
        await sleep(gap);
      }
      // Tấm ghép 7 cột để duyệt nhanh.
      const cw = 320;
      const ch = Math.round((cw * h) / w);
      const tiles = await Promise.all(bufs.map((b) => sharp(b).resize(cw, ch).jpeg({ quality: 82 }).toBuffer()));
      await sharp({ create: { width: cw * 7, height: ch * Math.ceil(tiles.length / 7), channels: 3, background: '#111' } })
        .composite(tiles.map((input, i) => ({ input, left: (i % 7) * cw, top: Math.floor(i / 7) * ch })))
        .jpeg({ quality: 85 })
        .toFile(path.join(dir, `${id}-sheet.jpg`));
      await ctx.close();
    }
  },
} satisfies Scenario;
