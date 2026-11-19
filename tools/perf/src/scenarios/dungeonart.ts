// Ảnh/video duyệt mỹ thuật bí cảnh (DUN-1): vào bằng cổng thật (vé một lần) bằng tài khoản thử bất tử, chụp các điểm nhìn cố định của level
// (lối vào, toàn cảnh, điểm wow, vành vách...) ở 720p + 1080p, một cảnh chiến đấu boss (`--battle 1`: gọi boss cuối bằng GM, chụp lúc nó ra chiêu),
// số đo khung hình (`--perf 1`) và video đi một lượt (`--video 1`). Dùng chung cho bản trước/sau (`--tag truoc|sau` chỉ là nhãn tên ảnh).
import fs from 'node:fs';
import path from 'node:path';
import { LEVELS } from '@dtl/content';
import { flag, list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import {
  cam,
  clearMonsters,
  enterLevel,
  gm,
  hideUi,
  hazards,
  perfSample,
  resetHazards,
  skipCutscene,
  tp,
  waitHazard,
  waitLevel,
} from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, snapSizes, UI_SIZES, writeJson } from '../lib/shot';

interface View {
  name: string;
  /** Vị trí người chơi so với tâm bí cảnh (m). */
  at: [number, number];
  /** Hướng nhìn (dx, dz) trên mặt phẳng thế giới. */
  look: [number, number];
  pitch: number;
  dist: number;
}

/** Điểm nhìn từng level (so với `dungeon.center`); level chưa khai báo dùng bộ chung. */
const VIEWS: Record<string, View[]> = {
  kiem_trung: [
    { name: '01-vao', at: [0, 64], look: [0, -1], pitch: 0.18, dist: 12 },
    { name: '02-toan-canh', at: [0, 52], look: [0, -1], pitch: 0.5, dist: 105 },
    { name: '03-cu-kiem-bac', at: [0, 16], look: [0, -1], pitch: 0.06, dist: 10 },
    { name: '04-nghia-dia-kiem', at: [-48, 22], look: [-1, -0.3], pitch: 0.08, dist: 9 },
    { name: '05-kiem-tran', at: [0, 6], look: [0, -1], pitch: 0.5, dist: 30 },
    { name: '06-vanh-cu-kiem', at: [40, 40], look: [0.6, -0.8], pitch: 0.04, dist: 8 },
  ],
  xich_tan_khich: [
    { name: '01-vao', at: [0, 56], look: [0, -1], pitch: 0.2, dist: 12 },
    { name: '02-toan-canh', at: [0, 30], look: [0, -1], pitch: 0.6, dist: 70 },
    { name: '03-bia-giua', at: [0, 14], look: [0, -1], pitch: 0.12, dist: 9 },
    { name: '04-cum-cot', at: [-26, -20], look: [-1, -0.1], pitch: 0.1, dist: 9 },
    { name: '05-vet-nut', at: [0, 4], look: [0, -1], pitch: 0.4, dist: 20 },
    { name: '06-doc-hem', at: [0, 60], look: [0, -1], pitch: 0.1, dist: 8 },
  ],
  do_kiep: [
    { name: '01-vao', at: [0, 52], look: [0, -1], pitch: 0.2, dist: 12 },
    { name: '02-toan-canh', at: [0, 52], look: [0, -1], pitch: 0.2, dist: 62 },
    { name: '03-dai-giua', at: [0, 10], look: [0, -1], pitch: 0.4, dist: 20 },
    { name: '04-loi-tru', at: [-26, 26], look: [-0.7, -0.7], pitch: 0.12, dist: 10 },
    { name: '05-dinh-dong', at: [10, 22], look: [0.7, -0.7], pitch: 0.14, dist: 9 },
    { name: '06-vet-set', at: [0, 40], look: [0, -1], pitch: 0.45, dist: 25 },
    { name: '07-xoay-may', at: [0, 30], look: [0, -1], pitch: -0.3, dist: 8 },
  ],
  kim_da_cung: [
    { name: '01-vao', at: [0, 64], look: [0, -1], pitch: 0.18, dist: 12 },
    { name: '02-toan-canh', at: [0, 40], look: [0, -1], pitch: 0.55, dist: 80 },
    { name: '03-ngai-bac', at: [0, 16], look: [0, -1], pitch: 0.1, dist: 10 },
    { name: '04-cot-den', at: [-40, 40], look: [-0.7, -0.7], pitch: 0.12, dist: 9 },
    { name: '05-san-vang', at: [0, 6], look: [0, -1], pitch: 0.5, dist: 30 },
    { name: '06-hang-cot', at: [40, 20], look: [0.9, -0.3], pitch: 0.16, dist: 8 },
  ],
  than_tang: [
    { name: '01-vao', at: [0, 64], look: [0, -1], pitch: 0.18, dist: 12 },
    { name: '02-toan-canh', at: [0, 40], look: [0, -1], pitch: 0.55, dist: 80 },
    { name: '03-mat-na-bac', at: [0, 16], look: [0, -1], pitch: 0.1, dist: 10 },
    { name: '04-cua-phong-an', at: [-34, 0], look: [-0.94, -0.34], pitch: 0.1, dist: 10 },
    { name: '05-san-vang', at: [0, 6], look: [0, -1], pitch: 0.5, dist: 30 },
    { name: '06-tuong-da', at: [30, 36], look: [0.7, -0.7], pitch: 0.18, dist: 8 },
  ],
  kinh_nguyet: [
    { name: '01-vao', at: [0, 64], look: [0, -1], pitch: 0.18, dist: 12 },
    { name: '02-toan-canh', at: [0, 40], look: [0, -1], pitch: 0.55, dist: 80 },
    { name: '03-vong-guong-bac', at: [0, 16], look: [0, -1], pitch: 0.08, dist: 10 },
    { name: '04-hang-cot', at: [-44, 22], look: [-1, -0.25], pitch: 0.08, dist: 9 },
    { name: '05-san-guong', at: [0, 6], look: [0, -1], pitch: 0.5, dist: 30 },
    { name: '06-manh-guong', at: [40, 40], look: [0.6, -0.8], pitch: 0.22, dist: 8 },
  ],
  phuc_mach: [
    { name: '01-vao', at: [0, 64], look: [0, -1], pitch: 0.18, dist: 12 },
    { name: '02-toan-canh', at: [0, 34], look: [0, -1], pitch: 0.66, dist: 62 },
    { name: '03-mach-tinh-bac', at: [0, 16], look: [0, -1], pitch: 0.06, dist: 10 },
    { name: '04-cua-ham', at: [-40, 30], look: [-1, -0.2], pitch: 0.08, dist: 9 },
    { name: '05-mach-san', at: [0, 6], look: [0, -1], pitch: 0.5, dist: 30 },
    { name: '06-tran-ham', at: [40, 40], look: [0.6, -0.8], pitch: 0.3, dist: 8 },
  ],
};
const FALLBACK: View[] = [
  { name: '01-vao', at: [0, 52], look: [0, -1], pitch: 0.2, dist: 12 },
  { name: '02-toan-canh', at: [0, 30], look: [0, -1], pitch: 0.78, dist: 72 },
  { name: '03-giua', at: [0, 12], look: [0, -1], pitch: 0.3, dist: 16 },
  { name: '04-tay', at: [-26, 24], look: [0.55, -0.83], pitch: 0.14, dist: 18 },
  { name: '05-dong', at: [26, 24], look: [-0.55, -0.83], pitch: 0.14, dist: 18 },
];

export default {
  name: 'dungeonart',
  desc: 'Bí cảnh theo dữ liệu: điểm ảnh cố định 720p+1080p, cảnh chiến đấu boss, video đi một lượt (duyệt mỹ thuật phó bản)',
  usage:
    '--level <id phó bản> --out <thư mục tuyệt đối> [--tag truoc|sau] [--sizes 720p,1080p] [--views a,b] [--battle 1] [--perf 1] [--video 1] [--preset low|medium|high|ultra] [--renderer webgpu|webgl2] [--query a=b]',
  async run(r) {
    const id = opt('--level', 'kiem_trung');
    const dg = LEVELS[id]?.dungeon;
    const home = dg && LEVELS[dg.returnLevel];
    const portal = home?.portals?.find((p) => p.to === id);
    // Sân độ kiếp (`tribulation: true`) không có cổng: vào bằng `/gm trib <id kiếp>` (`--trib`, mặc định hoa_than).
    const trib = !!LEVELS[id]?.tribulation;
    if (!dg || (!portal && !trib)) throw new Error(`level ${id} không phải phó bản có cổng`);
    const c = dg.center;
    const tag = opt('--tag', 'sau');
    const sizes = list('--sizes', '720p,1080p');
    const dir = path.join(r.out, 'video');
    const video = flag('--video');
    if (video) fs.mkdirSync(dir, { recursive: true });
    const { page, ctx } = await r.open({
      name: 'DunArt',
      renderer: opt('--renderer', 'webgpu'),
      quality: opt('--preset', 'high'),
      extra: opt('--query', ''),
      query: { quiet: 1 },
      hide: 'chat',
      seenIntro: true,
      video: video ? dir : undefined,
    });
    await gm(page, `level ${dg.minLevel + 2}`);
    await gm(page, 'god on');
    if (trib) {
      await gm(page, `trib ${opt('--trib', 'hoa_than')}`, 500);
    } else {
      await enterLevel(page, dg.returnLevel);
      await tp(page, dg.returnSpawn.x, dg.returnSpawn.z);
      await sleep(1500);
      await tp(page, portal!.x, portal!.z);
      await sleep(1500);
      await page.keyboard.press('KeyE');
    }
    await waitLevel(page, id);
    await skipCutscene(page, 10);
    await gm(page, 'god on', 1000);
    if (!flag('--hud')) await hideUi(page, 'hud');

    // Hiệu chỉnh hướng nhìn: hướng đi thế giới ứng với yaw 0 và chiều quay của yaw (như `xichkhe`).
    const pos = () => page.evaluate(() => ({ x: window.__game!.renderPos.x, z: window.__game!.renderPos.z }));
    const run = async (ms: number) => {
      await page.keyboard.down('KeyW');
      await sleep(ms);
      await page.keyboard.up('KeyW');
    };
    const heading = async (yaw: number) => {
      await cam(page, { yaw, pitch: 0.3, dist: 14 });
      await sleep(500);
      const a = await pos();
      await run(700);
      const b = await pos();
      return Math.atan2(b.z - a.z, b.x - a.x);
    };
    await gm(page, `tp ${c.x} ${c.z + 24}`, 1200);
    const t0 = await heading(0);
    const t1 = await heading(0.5);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const k = wrap(t1 - t0) >= 0 ? 1 : -1;
    const yawTo = (dx: number, dz: number) => k * wrap(Math.atan2(dz, dx) - t0);

    const hide = list('--hide', '');
    if (hide.length) {
      // Gỡ lỗi hình: ẩn mọi đối tượng cảnh theo tên (vd. `--hide dungeon-cracks,pm-veins`) để biết thứ gì che khung hình.
      await page.evaluate((names) => {
        const g = window.__game as unknown as { scene: { traverse: (f: (o: { name: string; visible: boolean }) => void) => void } };
        g.scene.traverse((o) => {
          if (names.includes(o.name)) o.visible = false;
        });
      }, hide);
    }
    const only = list('--views', '');
    const views = (VIEWS[id] ?? FALLBACK).filter((v) => !only.length || only.includes(v.name) || only.includes(v.name.slice(3)));
    const perf: Record<string, unknown> = {};
    // Sân độ kiếp: kiếp chỉ kéo dài 65–80 s rồi đưa về ngoài, nên vào lại trước mỗi góc chụp nếu đã bị đưa ra.
    const reenter = async (): Promise<void> => {
      if (!trib) return;
      const here = await page.evaluate(() => window.__game?.shownLevel);
      if (here === id) return;
      await gm(page, `trib ${opt('--trib', 'hoa_than')}`, 500);
      await waitLevel(page, id, 2500);
    };
    for (const v of views) {
      if (trib) await reenter();
      // Quái chết để lại vết mực trên đất (tính năng của game, tan sau 11 s): chờ tan hết trước khi chụp.
      if (!trib) {
        await gm(page, 'killall', 700);
        await sleep(11_500);
      }
      await gm(page, `tp ${Math.round(c.x + v.at[0])} ${Math.round(c.z + v.at[1])}`, 1100);
      await cam(page, { yaw: yawTo(v.look[0], v.look[1]), pitch: v.pitch, dist: v.dist });
      await snapSizes(page, r.out, `${tag}-${v.name}`, sizes, 1300);
      if (flag('--perf')) perf[v.name] = await perfSample(page);
    }
    if (flag('--perf')) writeJson(r.out, 'perf.json', perf);

    if (flag('--battle') && trib) {
      // Cảnh kiếp đang giáng: chụp ba thời điểm (mốc giây tính từ lúc vào, `--at 8,24,44`) đứng giữa sân bất tử.
      await gm(page, `trib ${opt('--trib', 'hoa_than')}`, 500);
      await waitLevel(page, id, 1500);
      await gm(page, `tp ${c.x} ${c.z}`, 600);
      await cam(page, { yaw: yawTo(0, -1), pitch: 0.42, dist: 26 });
      const t0 = Date.now();
      for (const [i, sec] of list('--at', '8,24,44').map(Number).entries()) {
        const wait = sec * 1000 - (Date.now() - t0);
        if (wait > 0) await sleep(wait);
        await snapSizes(page, r.out, `${tag}-9${i}-kiep-${sec}s`, sizes, 200);
      }
      // Khung đúng lúc sét đánh: gọi chớp ngay rồi chụp sau 70 ms (chớp tắt trong ~0,25 s), mỗi cỡ một lần.
      for (const sz of sizes) {
        const [width, height] = UI_SIZES[sz] ?? UI_SIZES['1080p'];
        await page.setViewportSize({ width, height });
        await sleep(700);
        await page.evaluate('window.__game?.doKiepArt?.strike()');
        await sleep(70);
        await snap(page, r.out, `${tag}-95-set-danh-${sz}.jpg`, { wait: 0 });
      }
    } else if (flag('--battle')) {
      // Cảnh chiến đấu boss: gọi boss cuối bằng GM ngay trước mặt, đứng sát đài chiến, chụp lúc nó ra chiêu (vạch báo) rồi lúc nó vào pha máu thấp.
      const last = dg.waves[dg.waves.length - 1]!.mons.find((m) => m.id.startsWith('boss_'))?.id;
      if (!last) throw new Error('đợt cuối không có boss');
      await gm(page, 'killall', 700);
      await gm(page, `tp ${c.x} ${c.z + 16}`, 1100);
      await cam(page, { yaw: yawTo(0, -1), pitch: 0.38, dist: 24 });
      await gm(page, `spawn ${last} 1`, 2500);
      await skipCutscene(page, 40);
      await resetHazards(page);
      const got = await waitHazard(page, 25_000);
      await snapSizes(page, r.out, `${tag}-90-boss-chieu`, sizes, 300);
      await gm(page, 'hurt 30', 900);
      await gm(page, 'heal', 600);
      await snapSizes(page, r.out, `${tag}-91-boss-pha-cuoi`, sizes, 1200);
      writeJson(r.out, 'battle.json', { boss: last, telegraph: got, hazards: await hazards(page) });
      await gm(page, 'spawn clear', 900);
      await clearMonsters(page);
    }

    if (video) {
      // Một lượt đi: từ lối vào đi thẳng lên bắc vào đài chiến; camera thấp sau lưng, đảo nhẹ hai bên rồi nâng dần.
      await gm(page, 'killall', 700);
      await gm(page, `tp ${dg.spawn.x} ${dg.spawn.z + 8}`, 1300);
      await cam(page, { yaw: yawTo(0, -1), pitch: 0.16, dist: 10 });
      await sleep(600);
      await page.keyboard.down('KeyW');
      for (let i = 0; i < 30; i++) {
        await cam(page, { yaw: yawTo(Math.sin(i * 0.3) * 0.5, -1), pitch: 0.1 + 0.08 * Math.sin(i * 0.22), dist: 9 + (i % 12) * 0.5 });
        await sleep(500);
      }
      await page.keyboard.up('KeyW');
      await sleep(600);
    }
    const v = page.video();
    await ctx.close();
    if (v && video) fs.renameSync(await v.path(), path.join(dir, `${opt('--name', id.replace(/_/g, '-'))}-${tag}.webm`));
  },
} satisfies Scenario;
