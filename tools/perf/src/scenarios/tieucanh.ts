// Chân Cảnh M1–M5 (pilot Lạc Kiếm Tông): ảnh tiểu cảnh camera chéo, 6 điểm × 4 thời điểm × 2 cỡ ảnh, cùng góc trước/sau, kèm số đo.
//   pnpm shots tieucanh --out <thư mục> [--tag truoc|sau] [--moods dawn,day,dusk,night] [--views 720p,1080p] [--points a,b|all] [--perf 1] [--at x,z;x,z] (tọa độ tương đối tâm)
//   `--deck 1` đi bộ lên cầu treo, ảnh đầu cầu/giữa cầu/bờ kia (ghi cao độ người);
//   `--clip 1` quay đoạn đi bộ xuyên tông môn (webm ~60 s, 1080p, `--mood`); `--hit 1` thêm khung +30 ms sau trúng đòn ở điểm đánh.
import { SECT } from '@dtl/shared';
import type { Page } from 'playwright';
import { sleep } from '../lib/devserver';
import { flag, list, opt } from '../lib/env';
import { cam, enterLevel, faceMonster, gm, perfSample, skipCutscene, tp } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

/** Điểm đứng (tương đối tâm tông môn). Khớp bản đồ tiểu cảnh `docs/map/lac-kiem-tieu-canh.md`. */
export const POINTS: { name: string; x: number; z: number }[] = [
  { name: 'congbai', x: 0, z: 114 },
  { name: 'aosen', x: -60, z: 58 },
  { name: 'kiembia', x: 66, z: 58 },
  { name: 'loivach', x: -112, z: 69 },
  { name: 'cautreo', x: -136, z: 64 },
  { name: 'thachlam', x: 96, z: -8 },
];
/** Lộ trình clip (tương đối tâm): cổng bài → đại lộ → ao sen → lối men vách → ĐI QUA cầu treo sang bờ bên kia và về → kiếm bia. */
const ROUTE: [number, number][] = [
  [0, 100],
  [-30, 80],
  [-58, 56],
  [-92, 54],
  [-107.5, 64.5],
  [-116.5, 73.5],
  [-119.5, 78],
  [-125.5, 73.5],
  [-135.7, 63],
  [-137.5, 69.8],
  [-143, 91],
  [-148.9, 112.2],
  [-143, 91],
  [-137.5, 69.8],
  [-125.5, 73.5],
  [-119.5, 78],
  [-116.5, 73.5],
  [-40, 70],
  [30, 62],
  [66, 58],
];

/** Đi tới (x, z) bằng chuột phải theo từng chặng ≤ 9 m (điểm ngắm chiếu lên màn hình), tối đa 40 chặng. */
async function walkTo(page: Page, x: number, z: number, vp: [number, number]): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(
      ([tx, tz]) => {
        const g = window.__game as unknown as {
          camera: { updateMatrixWorld(): void };
          renderPos: {
            x: number;
            y: number;
            z: number;
            constructor: new (x: number, y: number, z: number) => { project(c: unknown): { x: number; y: number } };
          };
        };
        const dx = tx! - g.renderPos.x;
        const dz = tz! - g.renderPos.z;
        const d = Math.hypot(dx, dz);
        const k = Math.min(1, 9 / Math.max(d, 1e-6));
        g.camera.updateMatrixWorld();
        const v = new g.renderPos.constructor(g.renderPos.x + dx * k, g.renderPos.y, g.renderPos.z + dz * k).project(g.camera);
        return { d, sx: (v.x * 0.5 + 0.5) * innerWidth, sy: (-v.y * 0.5 + 0.5) * innerHeight };
      },
      [x, z],
    );
    if (st.d < 2.5) return;
    const sx = Math.min(vp[0] - 40, Math.max(40, st.sx));
    const sy = Math.min(vp[1] - 40, Math.max(40, st.sy));
    await page.mouse.move(sx, sy);
    await page.mouse.click(sx, sy, { button: 'right' });
    await sleep(1400);
  }
}

/** Vị trí người (thế giới) từ client. */
const posOf = (page: Page) =>
  page.evaluate(() => ({
    x: (window.__game as unknown as { renderPos: { x: number; y: number; z: number } }).renderPos.x,
    y: (window.__game as unknown as { renderPos: { x: number; y: number; z: number } }).renderPos.y,
    z: (window.__game as unknown as { renderPos: { x: number; y: number; z: number } }).renderPos.z,
  }));

/**
 * Đi tới (x, z) bằng WASD (không phụ thuộc vị trí chuột/HUD): đo hướng của W và D lúc đầu (camera chéo khóa góc), rồi giữ phím theo vòng lặp kín.
 * Dừng khi cách đích < 1,2 m hoặc quá `maxMs`.
 */
async function keyWalk(page: Page, x: number, z: number, maxMs = 30000): Promise<void> {
  const probe = async (key: string) => {
    const a = await posOf(page);
    await page.keyboard.down(key);
    await sleep(450);
    await page.keyboard.up(key);
    await sleep(150);
    const b = await posOf(page);
    const d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / d, z: (b.z - a.z) / d };
  };
  const fwd = await probe('w');
  const right = await probe('d');
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const p = await posOf(page);
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.2) return;
    const f = (dx * fwd.x + dz * fwd.z) / d;
    const rr = (dx * right.x + dz * right.z) / d;
    const keys = [f > 0.38 ? 'w' : f < -0.38 ? 's' : '', rr > 0.38 ? 'd' : rr < -0.38 ? 'a' : ''].filter(Boolean);
    for (const k of keys) await page.keyboard.down(k);
    await sleep(d > 6 ? 250 : 100);
    for (const k of keys) await page.keyboard.up(k);
    await sleep(40);
  }
}

const SIZES: Record<string, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080] };

export default {
  name: 'tieucanh',
  desc: 'Chân Cảnh M: ảnh tiểu cảnh Lạc Kiếm Tông (6 điểm × 4 giờ × 720p/1080p, camera chéo) + đo hiệu năng + clip đi bộ',
  usage:
    '[--tag truoc|sau] [--moods dawn,day,dusk,night] [--views 720p,1080p] [--points a,b|all] [--perf 1] [--hit 1] [--clip 1] [--deck 1]',
  async run(r) {
    const tag = opt('--tag', 'sau');
    const only = list('--points', 'all');
    const extra = opt('--at', '')
      .split(';')
      .filter(Boolean)
      .map((q, i) => {
        const [x, z] = q.split(',').map(Number) as [number, number];
        return { name: `at${i}`, x, z };
      });
    const pts = [...POINTS.filter((p) => only.includes('all') || only.includes(p.name)), ...extra].filter(
      (p) => !extra.length || extra.includes(p) || flag('--with-base'),
    );
    const perf: Record<string, unknown> = {};
    for (const view of list('--views', '720p,1080p')) {
      for (const mood of list('--moods', 'day,dusk')) {
        const { ctx, page } = await r.open({
          name: `Tc${mood[0]}${view[0]}`,
          quality: opt('--preset', 'high'),
          viewport: SIZES[view]!,
          query: { mood, cam: 'iso', quiet: 1 },
          extra: opt('--query', ''),
          seenIntro: true,
          warnings: true,
        });
        await gm(page, 'level 15', 2500);
        await gm(page, 'god on', 2500);
        await gm(page, 'killall', 2500);
        let first = true;
        for (const p of pts) {
          await tp(page, SECT.x + p.x, SECT.z + p.z);
          // HUD bật như lúc chơi: chờ đủ lâu giữa các lệnh GM để không dính banner "nói nhanh quá", và chờ GLB prop nạp ở lần đầu
          await snap(page, r.out, `${tag}-${view}-${mood}-${p.name}.png`, { wait: first ? 7000 : 4500 });
          if (first)
            perf[`camDist-${view}-${mood}`] = await page.evaluate(() => {
              const g = window.__game as unknown as {
                camera: { position: { x: number; y: number; z: number } };
                renderPos: { x: number; y: number; z: number };
              };
              const c = g.camera.position;
              const t = g.renderPos;
              return Math.hypot(c.x - t.x, c.y - (t.y + 1), c.z - t.z);
            });
          first = false;
          if (flag('--perf')) perf[`${view}-${mood}-${p.name}`] = await perfSample(page);
        }
        await ctx.close();
      }
    }
    if (flag('--deck')) {
      // Đứng TRÊN ván cầu treo (đi bộ thật bằng chuột phải, server quyết định vị trí): ảnh giữa nhịp + ảnh khi sang tới bờ bên kia; ghi cao độ người so với mặt đất.
      for (const view of list('--views', '720p,1080p')) {
        for (const mood of list('--moods', 'day,dusk')) {
          const { ctx, page } = await r.open({
            name: `TcDeck${mood[0]}${view[0]}`,
            quality: 'high',
            hide: 'chat',
            viewport: SIZES[view]!,
            query: { mood, cam: 'iso', quiet: 1 },
            extra: opt('--query', ''),
            seenIntro: true,
            warnings: true,
          });
          await gm(page, 'level 15', 2500);
          await gm(page, 'god on', 2500);
          await gm(page, 'killall', 2500);
          await tp(page, SECT.x - 135.7, SECT.z + 63);
          await sleep(5000);
          for (const [wx, wz, label] of [
            [-137.5, 69.8, 'dau-cau'],
            [-143, 91, 'giua-cau'],
            [-148.9, 112.2, 'bo-kia'],
          ] as const) {
            await keyWalk(page, SECT.x + wx, SECT.z + wz);
            await sleep(800);
            perf[`deck-${view}-${mood}-${label}`] = await page.evaluate(() => {
              const g = window.__game as unknown as {
                renderPos: { x: number; y: number; z: number };
                heightAt?: (x: number, z: number) => number;
              };
              return { x: g.renderPos.x, y: g.renderPos.y, z: g.renderPos.z };
            });
            await snap(page, r.out, `${tag}-${view}-${mood}-${label}.png`, { wait: 1500 });
          }
          await ctx.close();
        }
      }
    }
    if (flag('--hit')) {
      const view = list('--views', '720p,1080p')[0]!;
      const { ctx, page } = await r.open({
        name: 'TcHit',
        quality: 'high',
        viewport: SIZES[view]!,
        query: { cam: 'iso', quiet: 1, slowmo: 0.1 },
        extra: opt('--query', ''),
        seenIntro: true,
        hide: 'chat',
      });
      await gm(page, 'level 12', 900);
      await gm(page, 'god on', 900);
      await enterLevel(page, 'van_lam');
      await skipCutscene(page, 20);
      await tp(page, SECT.x + 4, SECT.z + 40);
      await gm(page, 'killall', 900);
      await gm(page, 'spawn mon_soi_xam 1', 3000);
      await cam(page, { pitch: 0.9, dist: 9 });
      await faceMonster(page, 'mon_soi_xam', {});
      await page.evaluate(() => (window.__game as unknown as { useSkill(n: number): void }).useSkill(0));
      await sleep(30);
      await snap(page, r.out, `${tag}-${view}-hit-30ms.png`);
      await ctx.close();
    }
    if (flag('--clip')) {
      // Clip đi bộ xuyên tông môn (webm): chuột phải đi tới từng điểm trên lộ trình, camera chéo theo người.
      const dir = `${r.out}/clip-${tag}`;
      const { ctx, page } = await r.open({
        name: 'TcClip',
        quality: 'high',
        viewport: SIZES['1080p']!,
        query: { mood: opt('--mood', 'day'), cam: 'iso', quiet: 1 },
        extra: opt('--query', ''),
        seenIntro: true,
        hide: 'hud',
        video: dir,
      });
      await gm(page, 'level 15');
      await gm(page, 'god on');
      await tp(page, SECT.x, SECT.z + 130);
      await sleep(6000);
      for (const [wx, wz] of ROUTE) await walkTo(page, SECT.x + wx, SECT.z + wz, SIZES['1080p']!);
      await ctx.close(); // đóng context mới ghi xong webm
    }
    writeJson(r.out, `perf-${tag}.json`, perf);
  },
} satisfies Scenario;
