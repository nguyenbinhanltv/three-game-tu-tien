// Ba kiếp chương 6 (TN-3): ảnh 1080p + 720p cùng góc máy cho cơ chế riêng của từng kiếp, và `--full` chơi trọn kiếp Dương Thực bằng GM.
//   pnpm shots kiepch6 --out <thư mục> [--trib van_dinh,am_hu,duong_thuc] [--full 1]
// Tài khoản thử bất tử khi chụp (`god on`) để xem hết từng pha; `--full` tắt bất tử, tự dùng chiêu đúng cửa sổ phản đòn, dùng `/gm heal` thay đan hồi phục
// khi khí huyết xuống thấp, và kiểm kiếp qua (thẻ chương, lên cấp 44).
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { gatePos, tribDef, tribLevelOf, unpackGates, type TribId } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { flag, list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snapSizes } from '../lib/shot';

interface KcLog {
  s: string;
  n: number;
  x: number;
  z: number;
  r: number;
  pg: number;
  lv: number;
  at: number;
  d: number;
}

const CAM = { pitch: 0.42, dist: 30, yaw: 0.35 };
const SIZES = ['1080p', '720p'];

const logOf = (page: Page, prefix: string): Promise<KcLog[]> =>
  page.evaluate((p) => {
    const l = (window.__game!.suyLog ?? {}) as Record<string, KcLog>;
    return Object.entries(l)
      .filter(([k]) => k.startsWith(p))
      .map(([, v]) => v);
  }, prefix);

/** Chờ tới khi nhật ký có mục thỏa `ok` (tối đa `sec` giây); trả mục đó hoặc null. */
async function waitLog(page: Page, prefix: string, ok: (l: KcLog) => boolean, sec: number): Promise<KcLog | null> {
  for (let i = 0; i < sec * 10; i++) {
    const hit = (await logOf(page, prefix)).find(ok);
    if (hit) return hit;
    await sleep(100);
  }
  return null;
}

async function enterTrib(page: Page, id: TribId, god: boolean): Promise<{ x: number; z: number }> {
  const def = tribDef(id);
  if (god) await gm(page, 'god on', 1300);
  await gm(page, `trib ${id}`, 1300);
  await waitLevel(page, 'do_kiep', 1500);
  if (god) await gm(page, 'god on', 1300);
  await skipCutscene(page, 10);
  // Đứng giữa sân từ đầu: tâm cơ chế là chỗ người độ kiếp đứng lúc pha bắt đầu.
  const ctr = LEVELS[tribLevelOf(def)]!.dungeon!.center;
  await gm(page, `tp ${ctr.x} ${ctr.z}`, 1300);
  await cam(page, CAM);
  return ctr;
}

async function hoiDao(page: Page, dir: string): Promise<void> {
  const q = await waitLog(page, 'kc:hd', (l) => l.pg === 1, 75);
  if (!q) {
    console.log(
      '[kiepch6] suyLog:',
      JSON.stringify(await page.evaluate(() => window.__game!.suyLog ?? null)),
      'hp',
      JSON.stringify(await page.evaluate(() => window.__game!.me()?.hp)),
    );
    throw new Error('không thấy câu hỏi đạo');
  }
  const gates = unpackGates(q.lv);
  await cam(page, { pitch: 0.62, dist: 42, yaw: 0.35 });
  console.log(
    '[kiepch6] timeline đã phát:',
    JSON.stringify(await page.evaluate(() => window.__game!.suyFx?.log.map((l) => l.key) ?? null)),
  );
  await snapSizes(page, dir, '1-hoi-dao', SIZES, 500);
  const right = gates.indexOf(q.n);
  const g = gatePos({ x: q.x, z: q.z }, q.r, right);
  await gm(page, `tp ${g.x.toFixed(1)} ${g.z.toFixed(1)}`, 1200);
  await snapSizes(page, dir, '2-dung-dung-cong', SIZES, 400);
  await waitLog(page, 'kc:hd', (l) => l.pg === 2 || l.pg === 3, 10);
  await snapSizes(page, dir, '3-dap-dung', SIZES, 250);
  // Vòng sau: đứng giữa sân (không cổng nào) để thấy đáp sai.
  await gm(page, `tp ${q.x} ${q.z}`, 1200);
  const q2 = await waitLog(page, 'kc:hd', (l) => l.pg === 1 && l.at > Date.now() - 1500, 15);
  if (q2) {
    await snapSizes(page, dir, '4-hoi-dao-vong-sau', SIZES, 300);
    await waitLog(page, 'kc:hd', (l) => l.pg === 3, 10);
    await snapSizes(page, dir, '5-dap-sai', SIZES, 250);
  }
}

async function amLan(page: Page, dir: string): Promise<void> {
  const first = await waitLog(page, 'kc:am', (l) => l.pg === 1, 40);
  if (!first) throw new Error('không thấy âm vực nảy mầm');
  await cam(page, { pitch: 0.6, dist: 36, yaw: 0.35 });
  await snapSizes(page, dir, '1-mam', SIZES, 100);
  await sleep(3200);
  await snapSizes(page, dir, '2-lan-dan', SIZES, 100);
  await sleep(3000);
  await snapSizes(page, dir, '3-da-lan', SIZES, 100);
}

async function skill(page: Page): Promise<void> {
  await page.evaluate(() => window.__game!.send('sk', { id: 'skl_linh_khi_ho_the' }));
}

async function duongThuc(page: Page, dir: string): Promise<void> {
  const wind = await waitLog(page, 'kc:dt', (l) => l.pg === 1, 75);
  if (!wind) throw new Error('không thấy đòn nhịp');
  await sleep(900);
  await snapSizes(page, dir, '1-u-don', SIZES, 100);
  const win = await waitLog(page, 'kc:dt', (l) => l.pg === 2, 6);
  if (win) await snapSizes(page, dir, '2-cua-so-phan-don', SIZES, 50);
  await skill(page);
  await sleep(150);
  await snapSizes(page, dir, '3-phan-don', SIZES, 100);
  // Nhịp sau: không phản đòn, để chịu trọn.
  const w2 = await waitLog(page, 'kc:dt', (l) => l.pg === 1 && l.n > wind.n, 12);
  if (w2) {
    await waitLog(page, 'kc:dt', (l) => l.pg === 3, 8);
    await snapSizes(page, dir, '4-chiu-don', SIZES, 150);
  }
}

/** Chơi trọn kiếp Dương Thực bằng GM: dùng chiêu đúng cửa sổ phản đòn, hồi bằng `/gm heal` khi dưới 45% khí huyết. Trả tóm tắt. */
async function playFull(page: Page, dir: string): Promise<string[]> {
  const out: string[] = [];
  const t0 = Date.now();
  const T = () => (Date.now() - t0) / 1000;
  let parried = 0;
  let hits = 0;
  let lastWin = 0;
  let lastWind = 0;
  let lastHeal = 0;
  const seen = new Set<string>();
  while (T() < 135) {
    const dt = await logOf(page, 'kc:dt');
    for (const l of dt) {
      const key = `${l.pg}:${l.n}:${l.at}`;
      if (l.pg === 2 && l.at !== lastWin) {
        lastWin = l.at;
        await skill(page);
        parried++;
      }
      if (l.pg === 1 && l.at !== lastWind) lastWind = l.at;
      if (l.pg === 3 && !seen.has(key)) {
        seen.add(key);
        hits++;
      }
    }
    const hp = await page.evaluate(() => {
      const m = window.__game!.me();
      return m && m.mhp > 0 ? m.hp / m.mhp : 1;
    });
    if (hp < 0.45 && Date.now() - lastHeal > 1300) {
      lastHeal = Date.now();
      await gm(page, 'heal', 0);
    }
    const ended = await page.evaluate(() => !document.querySelector('.trib'));
    if (T() > 20 && ended) break;
    await sleep(120);
  }
  out.push(`phản đòn gửi ${parried} lần, trúng đòn nhịp ${hits} lần, ${T().toFixed(0)} s`);
  await snapSizes(page, dir, 'full-ket-thuc', SIZES, 1500);
  const info = await page.evaluate(() => {
    const m = window.__game!.me();
    return { lv: Number(m?.lv ?? m?.level ?? 0), room: window.__game!.shownLevel };
  });
  out.push(`sau kiếp: cấp ${info.lv}, đang ở ${info.room}`);
  return out;
}

export default {
  name: 'kiepch6',
  desc: 'Ba kiếp chương 6 (TN-3): ảnh 1080p+720p cơ chế hỏi đạo / âm vực lan / đòn nhịp Dương Thực; --full chơi trọn kiếp Dương Thực bằng GM',
  usage: '[--trib van_dinh,am_hu,duong_thuc] [--full 1]',
  async run(r) {
    const full = flag('--full');
    const ids = (full ? ['duong_thuc'] : list('--trib', 'van_dinh,am_hu,duong_thuc')) as TribId[];
    for (const id of ids) {
      const dir = path.join(r.out, id);
      fs.mkdirSync(dir, { recursive: true });
      const { page } = await r.open({ name: 'Kc' + id.slice(0, 4), quality: 'high', seenIntro: true });
      try {
        await enterTrib(page, id, !full);
      } catch (e) {
        await page.screenshot({ path: path.join(r.out, 'loi-vao-kiep.png') }).catch(() => undefined);
        console.log('[kiepch6] không vào được room kiếp. Lỗi trang:', [...new Set(r.errors)].slice(0, 12));
        throw e;
      }
      if (full) {
        const res = await playFull(page, dir);
        fs.writeFileSync(path.join(dir, 'full.txt'), res.join('\n') + '\n');
        console.log(res.join('\n'));
        continue;
      }
      if (id === 'van_dinh') await hoiDao(page, dir);
      if (id === 'am_hu') await amLan(page, dir);
      if (id === 'duong_thuc') await duongThuc(page, dir);
    }
  },
} satisfies Scenario;
