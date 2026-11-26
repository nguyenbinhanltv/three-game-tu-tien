// Thân Pháp TP-2 (ảnh duyệt PR): ngã + đứng dậy khi trúng chiêu cuối (quái nhỏ/vừa + người chơi KHÁC, bot làm người chơi khác), quái chết ngã ra xa người đánh,
// người chơi hồi sinh đứng dậy, và bằng chứng "nhường server" (quái đang nằm mà server báo di chuyển/ra đòn thì đứng dậy ≤ 0,2 s, đo dòng thời gian thật).
//   pnpm shots tp2 --out <thư mục tuyệt đối> [--sizes 720p,1080p] [--moods day,night] [--only mon,other,death,priority,revive]
// Ảnh: tp2-<mood>-<cỡ>-<mon|other|death|priority|revive>.jpg (dải khung có mũi tên hướng đòn nơi cần), tp2.json (dòng thời gian hủy ngã).
import path from 'node:path';
import sharp from 'sharp';
import { list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { Bots } from '../lib/bots';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { UI_SIZES, writeJson } from '../lib/shot';

type Page = Awaited<ReturnType<Run['open']>>['page'];
const STEP_MS = 10;
const frame = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
async function advance(page: Page, ms: number): Promise<void> {
  for (let left = ms; left > 0; left -= STEP_MS) {
    await page.evaluate((x) => window.__animlab!.step(x), Math.min(STEP_MS, left));
    await frame(page);
  }
}
interface Pt {
  x: number;
  y: number;
}

/** Cắt quanh `c` (px) một ô w×h, kẹp trong ảnh; vẽ mũi tên hướng đòn từ `from` tới `to` (px màn hình) và nhãn nếu có. */
async function crop(
  buf: Buffer,
  vw: number,
  vh: number,
  c: Pt,
  w: number,
  h: number,
  arrow?: { from: Pt; to: Pt },
  label?: string,
): Promise<Buffer> {
  const left = Math.max(0, Math.min(vw - w, Math.round(c.x - w / 2)));
  const top = Math.max(0, Math.min(vh - h, Math.round(c.y - h / 2)));
  const overlays: { input: Buffer; left: number; top: number }[] = [];
  if (arrow) {
    const [x1, y1, x2, y2] = [arrow.from.x - left, arrow.from.y - top, arrow.to.x - left, arrow.to.y - top];
    const a = Math.atan2(y2 - y1, x2 - x1);
    const hx = (k: number) => x2 - Math.cos(a + k) * 18;
    const hy = (k: number) => y2 - Math.sin(a + k) * 18;
    overlays.push({
      left: 0,
      top: 0,
      input: Buffer.from(
        `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffd23c" stroke-width="5" stroke-linecap="round"/>` +
          `<polygon points="${x2},${y2} ${hx(0.5)},${hy(0.5)} ${hx(-0.5)},${hy(-0.5)}" fill="#ffd23c"/><circle cx="${x1}" cy="${y1}" r="7" fill="#3cd2ff"/></svg>`,
      ),
    });
  }
  if (label)
    overlays.push({
      left: 0,
      top: h - 34,
      input: Buffer.from(
        `<svg width="${w}" height="34" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="34" fill="#000" fill-opacity="0.55"/><text x="8" y="23" font-family="sans-serif" font-size="18" fill="#fff">${label}</text></svg>`,
      ),
    });
  return sharp(buf).extract({ left, top, width: w, height: h }).composite(overlays).jpeg({ quality: 88 }).toBuffer();
}

async function strip(file: string, cells: Buffer[]): Promise<void> {
  if (!cells.length) return;
  const metas = await Promise.all(cells.map((b) => sharp(b).metadata()));
  const W = metas.reduce((s, m) => s + (m.width ?? 0), 0);
  const H = Math.max(...metas.map((m) => m.height ?? 0));
  let x = 0;
  const comps = cells.map((input, i) => {
    const left = x;
    x += metas[i]!.width ?? 0;
    return { input, left, top: 0 };
  });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#161b21' } })
    .composite(comps)
    .jpeg({ quality: 88 })
    .toFile(file);
  console.log('  ảnh', path.basename(file));
}

export default {
  name: 'tp2',
  desc: 'Thân Pháp TP-2: ngã/đứng dậy chiêu cuối (quái, người chơi khác), quái chết ngã ra xa, hồi sinh, bằng chứng nhường server (ngày + đêm)',
  usage: '--out <dir> [--sizes 720p,1080p] [--moods day,night] [--only mon,other,death,priority,revive]',
  env: { RATE_LIMIT_EXEMPT: 'loopback', MAX_CLIENTS: '64' },
  async run(r) {
    const sizes = list('--sizes', '720p,1080p');
    const moods = list('--moods', 'day,night');
    const only = new Set(list('--only', 'mon,other,death,priority,revive'));
    const timeline: Record<string, unknown> = {};
    const bots = new Bots(r.port);
    let botsUp = false;
    try {
      for (const mood of moods)
        for (const sz of sizes) {
          const [vw, vh] = UI_SIZES[sz]!;
          const tag = `${mood}-${sz}`;
          const { ctx, page } = await r.open({
            name: `T2${mood[0]}`,
            viewport: [vw, vh],
            quality: 'high',
            seenIntro: true,
            look: { g: 'm' },
            query: { realm: 'nk12', god: 1, chr: 'v3', animlab: 1, quiet: 1, ...(mood === 'night' ? { mood: 'night' } : {}) },
            hide: 'hud',
          });
          page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
          await page.waitForFunction(() => !!window.__game && !!window.__animlab, undefined, { timeout: 120_000 });
          await sleep(2500);
          await gm(page, 'level 32', 1500);
          await gm(page, 'tp 2048 2095', 2500);
          await gm(page, 'spawn clear', 1000);
          if (!botsUp) {
            // Bot làm "người chơi khác": đứng quanh sân tông (Vân Lam), không đánh ai.
            await bots.start(1, 'tp2', ['--level', '15', '--crowd', '2048,2095,3', '--tp']);
            botsUp = true;
          }
          await sleep(4000);
          console.log('  [census]', JSON.stringify(await page.evaluate(() => window.__animlab!.census())));
          await page.evaluate(() => window.__animlab!.cam('iso'));
          const S = () => page.evaluate(() => window.__animlab!.scr());
          const shot = (): Promise<Buffer> => page.screenshot({ type: 'jpeg', quality: 90 });
          const CW = Math.round(vw * 0.5);
          const CH = Math.round(vh * 0.5);
          const seq = async (name: string, kind: 'mon' | 'other', steps: number[], hit: () => Promise<void>): Promise<void> => {
            await page.evaluate(() => window.__animlab!.pause(false));
            await sleep(1800);
            await page.evaluate(() => window.__animlab!.pause(true));
            await frame(page);
            // Đợi mục tiêu đứng yên (bot đi lại thì tự hủy ngã) và model quái nạp xong (không chụp model khối tạm).
            for (let k = 0; k < 300; k++) {
              const c = await page.evaluate(() => window.__animlab!.census());
              const ok = kind === 'mon' ? !c.pending : c.otherSpeed !== null && c.otherSpeed < 0.15;
              if (ok) {
                if (kind === 'mon') {
                  // Đợi hết hiệu ứng hiện hình của quái mới spawn.
                  await page.evaluate(() => window.__animlab!.pause(false));
                  await sleep(2500);
                  await page.evaluate(() => window.__animlab!.pause(true));
                }
                break;
              }
              await page.evaluate(() => window.__animlab!.pause(false));
              await sleep(120);
              await page.evaluate(() => window.__animlab!.pause(true));
            }
            await frame(page);
            const p0 = await S();
            const tgt = (kind === 'mon' ? p0.mon : p0.other) ?? null;
            if (!tgt || !p0.self) {
              console.log(`  [${name}] thiếu ${kind === 'mon' ? 'quái' : 'người chơi khác'} trong cảnh, bỏ qua`);
              return;
            }
            const mid: Pt = { x: (tgt.x + p0.self.x) / 2, y: (tgt.y + p0.self.y) / 2 };
            const cells: Buffer[] = [];
            let t = 0;
            const errs: (number | null)[] = [];
            const errBefore = 0;
            for (const ms of steps) {
              if (ms === 0) await hit();
              else if (ms > t) await advance(page, ms - t);
              t = ms;
              for (let k = 0; k < 4; k++) await frame(page);
              const buf = await shot();
              const mt = name === 'death' ? await page.evaluate(() => window.__animlab!.monTurn()) : null;
              const err = mt?.deg ?? null;
              errs.push(err);
              const errTxt = name === 'death' ? ` xoay phụ ${err}° (mặt đã hướng người đánh)` : '';
              if (ms === 0)
                cells.push(
                  await crop(buf, vw, vh, mid, CW, CH, { from: p0.self, to: tgt }, `${name} ${tag} +0 ms${errTxt} (mũi tên: hướng đòn)`),
                );
              else {
                const now = (kind === 'mon' ? (await S()).mon : (await S()).other) ?? tgt;
                cells.push(
                  await crop(
                    buf,
                    vw,
                    vh,
                    { x: now.x, y: now.y + CH * 0.05 },
                    Math.round(vw * 0.26),
                    CH,
                    undefined,
                    `${name} ${tag} +${ms} ms${errTxt}`,
                  ),
                );
              }
            }
            await strip(path.join(r.out, `tp2-${tag}-${name}.jpg`), cells);
            if (name === 'death') timeline[`death-${tag}`] = { stepsMs: steps, turnDeg: errs, beforeDeg: errBefore };
          };
          const STEPS = [0, 150, 350, 600, 900, 1250];
          if (only.has('other')) {
            await seq('other', 'other', STEPS, async () => void (await page.evaluate(() => window.__animlab!.hitOther(3))));
          }
          await gm(page, 'tp bh_tram', 6000);
          console.log('  [bot]', bots.out.slice(-3).join(' | ').slice(0, 300));
          await gm(page, 'spawn mon_tan_chung 1', 5000);
          if (only.has('mon')) {
            await seq('mon', 'mon', STEPS, async () => void (await page.evaluate(() => window.__animlab!.hitReal(3))));
          }
          if (only.has('death')) {
            // Đòn cuối còn mới (≤ 1,5 s) rồi quái chết: phải ngã ra xa người đánh (mũi tên = hướng đòn từ mình tới quái).
            await seq('death', 'mon', [0, 90, 190, 300, 450, 650], async () => {
              await page.evaluate(() => window.__animlab!.hitReal(1));
              await page.evaluate(() => window.__animlab!.pause(false));
              await gm(page, 'killall', 120);
              await page.evaluate(() => window.__animlab!.pause(true));
            });
          }
          if (only.has('priority')) {
            // Thời gian thật, không tạm dừng: quái bị đánh giả (client) trong khi server vẫn điều khiển nó đuổi/đánh → phải hủy ngã ngay.
            await gm(page, 'spawn clear', 800);
            await gm(page, 'spawn mon_tan_chung 1', 5000);
            await page.evaluate(() => window.__animlab!.pause(false));
            for (let k = 0; k < 300; k++) {
              const c = await page.evaluate(() => window.__animlab!.census());
              if (c.monsters > 0 && !c.pending) break;
              await sleep(150);
            }
            await sleep(2500);
            await sleep(1500);
            const p0 = await S();
            for (const variant of ['tu-het', 'lenh-danh']) {
              if (variant === 'lenh-danh') await sleep(4500); // nghỉ qua KNOCK_COOLDOWN_S
              const marks = [0, 150, 300, 450, 700];
              const cells: Buffer[] = [];
              // Ghi mỗi khung ngay trong trang (không bị chậm bởi chụp ảnh): trạng thái ngã, tốc độ server báo, clip đang phát của quái.
              await page.evaluate(`(() => {
              const w = window; w.__rec = []; w.__t0 = performance.now();
              const tick = () => {
                const s = w.__animlab.knockState().mon;
                w.__rec.push({ t: Math.round(performance.now() - w.__t0), knock: s ? s.knock : null, speed: s ? Math.round(s.speed * 10) / 10 : null, state: s ? s.state : null });
                if (performance.now() - w.__t0 < 1800) requestAnimationFrame(tick);
              };
              w.__animlab.hitReal(3);
              ${variant === 'lenh-danh' ? 'setTimeout(() => w.__animlab.orderMon("attack"), 300);' : ''}
              tick();
            })()`);
              const nowMs = () => page.evaluate('Math.round(performance.now() - window.__t0)') as Promise<number>;
              for (const m of marks) {
                while ((await nowMs()) < m) await sleep(10);
                const t = await nowMs();
                const sc = (await S()).mon ?? p0.mon ?? { x: vw / 2, y: vh / 2 };
                cells.push(await crop(await shot(), vw, vh, sc, CW, CH, undefined, `${variant} ${tag} +${t} ms`));
              }
              await sleep(1000);
              await strip(path.join(r.out, `tp2-${tag}-priority-${variant}.jpg`), cells);
              const trace = (await page.evaluate('window.__rec')) as {
                t: number;
                knock: boolean | null;
                speed: number | null;
                state: string | null;
              }[];
              const first = (f: (x: (typeof trace)[number]) => boolean) => trace.find(f)?.t ?? null;
              const startKnock = first((x) => x.knock === true);
              const endKnock = trace.find((x) => x.t > (startKnock ?? 0) && x.knock === false)?.t ?? null;
              timeline[`priority-${variant}-${tag}`] = {
                knockStartMs: startKnock,
                knockEndMs: endKnock,
                knockLenMs: startKnock !== null && endKnock !== null ? endKnock - startKnock : null,
                firstMoveMs: first((x) => (x.speed ?? 0) > 1),
                stateAtEnd: trace.find((x) => x.t === endKnock)?.state ?? null,
                states: [...new Set(trace.map((x) => x.state))],
                trace: trace.filter((_, k) => k % 3 === 0).slice(0, 80),
              };
            }
          }
          if (only.has('revive')) {
            await gm(page, 'spawn clear', 800);
            await page.evaluate(() => window.__animlab!.pause(false));
            await gm(page, 'die', 1800);
            await page.evaluate(() => window.__animlab!.hideVfx(true));
            await page.evaluate(() => window.__animlab!.respawn());
            await sleep(450);
            await page.evaluate(() => window.__animlab!.cam('close'));
            const cells: Buffer[] = [];
            for (const ms of [0, 150, 300, 450, 650, 900]) {
              await sleep(ms === 0 ? 0 : 150);
              const sc0 = (await S()).self ?? { x: vw / 2, y: vh / 2 };
              const sc = { x: sc0.x, y: sc0.y + vh * 0.12 };
              cells.push(
                await crop(await shot(), vw, vh, sc, Math.round(vw * 0.32), Math.round(vh * 0.62), undefined, `hoi sinh ${tag} ~${ms}`),
              );
            }
            await page.evaluate(() => window.__animlab!.hideVfx(false));
            await strip(path.join(r.out, `tp2-${tag}-revive.jpg`), cells);
          }
          await ctx.close();
        }
    } finally {
      await bots.stop();
    }
    writeJson(r.out, 'tp2.json', timeline);
  },
} satisfies Scenario;
