// Thân Pháp TP-2 (ảnh duyệt PR): ngã + đứng dậy khi trúng chiêu cuối (quái nhỏ/vừa + người chơi KHÁC, bot làm người chơi khác), quái chết ngã ra xa người đánh,
// người chơi hồi sinh đứng dậy, và bằng chứng "nhường server" (quái đang nằm mà server báo di chuyển/ra đòn thì đứng dậy ≤ 0,2 s, đo dòng thời gian thật).
//   pnpm shots tp2 --out <thư mục tuyệt đối> [--sizes 720p,1080p] [--moods day,night] [--only mon,other,death,priority,ult,revive]
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

/** Khung RỘNG toàn màn hình (camera iso chơi thật), thu nhỏ một nửa; vẽ mũi tên hướng đòn (vàng, chấm xanh = người đánh) và nhãn. */
async function wide(buf0: Buffer, vw0: number, vh0: number, arrow?: { from: Pt; to: Pt }, label?: string, focus?: Pt): Promise<Buffer> {
  // Kích thước thật của ảnh chụp (có thể lệch khung nhìn khi DPR ≠ 1); toạ độ mũi tên theo khung nhìn nên nhân tỉ lệ.
  const meta = await sharp(buf0).metadata();
  const vw = meta.width ?? vw0;
  const vh = meta.height ?? vh0;
  const k = vw / vw0;
  const buf = buf0;
  if (arrow) arrow = { from: { x: arrow.from.x * k, y: arrow.from.y * k }, to: { x: arrow.to.x * k, y: arrow.to.y * k } };
  const arrowOverlay: { input: Buffer; left: number; top: number }[] = [];
  if (arrow) {
    const { from, to } = arrow;
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    const hx = (k: number) => to.x - Math.cos(a + k) * 26;
    const hy = (k: number) => to.y - Math.sin(a + k) * 26;
    arrowOverlay.push({
      left: 0,
      top: 0,
      input: Buffer.from(
        `<svg width="${vw}" height="${vh}" xmlns="http://www.w3.org/2000/svg"><line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#ffd23c" stroke-width="7" stroke-linecap="round"/>` +
          `<polygon points="${to.x},${to.y} ${hx(0.5)},${hy(0.5)} ${hx(-0.5)},${hy(-0.5)}" fill="#ffd23c"/><circle cx="${from.x}" cy="${from.y}" r="10" fill="#3cd2ff"/></svg>`,
      ),
    });
  }
  // Cắt vùng 70% × 70% quanh điểm giữa người đánh–mục tiêu (vẫn thấy cả hai và bối cảnh iso), giữ độ phân giải gốc; nhãn vẽ sau khi cắt.
  const fp: Pt = focus ? { x: focus.x * k, y: focus.y * k } : { x: vw / 2, y: vh / 2 };
  const cw = Math.round(vw * 0.7);
  const ch = Math.round(vh * 0.7);
  const left = Math.max(0, Math.min(vw - cw, Math.round(fp.x - cw / 2)));
  const top = Math.max(0, Math.min(vh - ch, Math.round(fp.y - ch / 2)));
  const withArrow = await sharp(buf).composite(arrowOverlay).jpeg({ quality: 92 }).toBuffer();
  const cropped = await sharp(withArrow).extract({ left, top, width: cw, height: ch }).jpeg({ quality: 92 }).toBuffer();
  const labelOverlay = label
    ? [
        {
          left: 0,
          top: ch - 44,
          input: Buffer.from(
            `<svg width="${cw}" height="44" xmlns="http://www.w3.org/2000/svg"><rect width="${cw}" height="44" fill="#000" fill-opacity="0.6"/><text x="12" y="30" font-family="sans-serif" font-size="24" fill="#fff">${label}</text></svg>`,
          ),
        },
      ]
    : [];
  const labelled = await sharp(cropped).composite(labelOverlay).jpeg({ quality: 92 }).toBuffer();
  return sharp(labelled)
    .resize({ width: Math.min(cw, 960) })
    .jpeg({ quality: 88 })
    .toBuffer();
}

/** Lưới `cols` cột các khung rộng đã thu nhỏ. */
async function grid(file: string, cells: Buffer[], cols = 3): Promise<void> {
  if (!cells.length) return;
  const metas = await Promise.all(cells.map((b) => sharp(b).metadata()));
  const cw = metas[0]!.width ?? 0;
  const ch = metas[0]!.height ?? 0;
  const rows = Math.ceil(cells.length / cols);
  const comps = cells.map((input, i) => ({ input, left: (i % cols) * cw, top: Math.floor(i / cols) * ch }));
  await sharp({ create: { width: cw * cols, height: ch * rows, channels: 3, background: '#161b21' } })
    .composite(comps)
    .jpeg({ quality: 88 })
    .toFile(file);
  console.log('  ảnh', path.basename(file));
}

export default {
  name: 'tp2',
  desc: 'Thân Pháp TP-2: ngã/đứng dậy chiêu cuối (quái, người chơi khác), quái chết ngã ra xa, hồi sinh, bằng chứng nhường server (ngày + đêm)',
  usage: '--out <dir> [--sizes 720p,1080p] [--moods day,night] [--only mon,other,death,priority,ult,revive]',
  env: { RATE_LIMIT_EXEMPT: 'loopback', MAX_CLIENTS: '64' },
  async run(r) {
    const sizes = list('--sizes', '720p,1080p');
    const moods = list('--moods', 'day,night');
    const only = new Set(list('--only', 'mon,other,death,priority,ult,revive'));
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
              cells.push(await wide(buf, vw, vh, { from: p0.self, to: tgt }, `${name} ${tag} +${ms} ms${errTxt}`, mid));
            }
            await grid(path.join(r.out, `tp2-${tag}-${name}.jpg`), cells);
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
                cells.push(
                  await wide(
                    await shot(),
                    vw,
                    vh,
                    p0.self && p0.mon ? { from: p0.self, to: p0.mon } : undefined,
                    `${variant} ${tag} +${t} ms`,
                  ),
                );
              }
              await sleep(1000);
              await grid(path.join(r.out, `tp2-${tag}-priority-${variant}.jpg`), cells);
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
          if (only.has('ult')) {
            // Chiêu cuối THẬT của mình (chọn mục tiêu + useSkill như bấm phím, server tính sát thương S.DMG) lên quái nhỏ, camera iso chơi thật, khung rộng.
            await gm(page, 'spawn clear', 800);
            await gm(page, 'spawn mon_tan_chung 1', 5000);
            await page.evaluate(() => window.__animlab!.pause(false));
            for (let k = 0; k < 300; k++) {
              const c = await page.evaluate(() => window.__animlab!.census());
              if (c.monsters > 0 && !c.pending) break;
              await sleep(150);
            }
            await sleep(2500);
            await gm(page, 'method lac_kiem_quyet', 1500);
            await gm(page, 'charge', 800);
            console.log('  [ult] census', JSON.stringify(await page.evaluate(() => window.__animlab!.census())));
            const p0 = await S();
            await page.evaluate(`(() => {
              const w = window; w.__rec = []; w.__t0 = performance.now();
              const tick = () => {
                const s = w.__animlab.knockState().mon;
                w.__rec.push({ t: Math.round(performance.now() - w.__t0), knock: s ? s.knock : null, speed: s ? Math.round(s.speed * 10) / 10 : null, state: s ? s.state : null });
                if (performance.now() - w.__t0 < 3200) requestAnimationFrame(tick);
              };
              tick();
            })()`);
            // Nhật ký cấp đòn thật mà `ents.hitReact` nhận (từ S.DMG của server) trong lúc dùng chiêu cuối.
            await page.evaluate(`(() => {
              const e = window.__game.ents; const orig = e.hitReact.bind(e); window.__hits = [];
              e.hitReact = (dst, src, crit, delay, heavy, stop, tier) => { window.__hits.push({ t: Math.round(performance.now() - window.__t0), tier: tier === undefined ? null : tier, heavy: !!heavy, crit: !!crit, self: dst === window.__game.sid }); return orig(dst, src, crit, delay, heavy, stop, tier); };
            })()`);
            const cast = await page.evaluate(() => window.__animlab!.ultOnMon());
            const shots: { t: number; buf: Buffer }[] = [];
            const nowMs = () => page.evaluate('Math.round(performance.now() - window.__t0)') as Promise<number>;
            while ((await nowMs()) < 2800) {
              const buf = await shot();
              shots.push({ t: await nowMs(), buf });
            }
            const trace = (await page.evaluate('window.__rec')) as {
              t: number;
              knock: boolean | null;
              speed: number | null;
              state: string | null;
            }[];
            const kStart0 = trace.find((x) => x.knock === true)?.t ?? null;
            const kEnd0 = kStart0 === null ? null : (trace.find((x) => x.t > kStart0 && x.knock === false)?.t ?? null);
            // Quái Mannequin: server đặt `stun` và model dùng Hit_Knockback cho stun (cú ngã client nhường trạng thái server): lấy cửa sổ stun làm mốc.
            const sStart = trace.find((x) => x.state === 'stun')?.t ?? null;
            const sEnd = sStart === null ? null : ([...trace].reverse().find((x) => x.state === 'stun')?.t ?? null);
            const kStart = kStart0 ?? sStart;
            const kEnd = kEnd0 ?? sEnd;
            // 6 mốc: trước đòn, giữa lúc ngã/stun, lúc dậy… quanh [kStart, kEnd] (nếu không có thì rải đều).
            const lo = kStart ?? 400;
            const hi = kEnd ?? lo + 1200;
            const want = [0, Math.max(0, lo - 150), lo + (hi - lo) * 0.2, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.8, hi + 250];
            const picked = want.map((w) => shots.reduce((b, x) => (Math.abs(x.t - w) < Math.abs(b.t - w) ? x : b), shots[0]!));
            const cells: Buffer[] = [];
            for (const x of picked)
              cells.push(
                await wide(
                  x.buf,
                  vw,
                  vh,
                  p0.self && p0.mon ? { from: p0.self, to: p0.mon } : undefined,
                  `ult THAT ${tag} +${x.t} ms (${kStart0 !== null ? 'ngã' : 'stun'} ${kStart ?? '-'}→${kEnd ?? '-'} ms)`,
                  p0.self && p0.mon ? { x: (p0.self.x + p0.mon.x) / 2, y: (p0.self.y + p0.mon.y) / 2 } : undefined,
                ),
              );
            await grid(path.join(r.out, `tp2-${tag}-ult.jpg`), cells);
            timeline[`ult-${tag}`] = {
              cast,
              hits: await page.evaluate('window.__hits'),
              knockStartMs: kStart0,
              stunStartMs: sStart,
              stunEndMs: sEnd,
              knockEndMs: kEnd,
              knockLenMs: kStart !== null && kEnd !== null ? kEnd - kStart : null,
              states: [...new Set(trace.map((x) => x.state))],
              pickedMs: picked.map((x) => x.t),
            };
          }
          if (only.has('revive')) {
            await gm(page, 'spawn clear', 800);
            await page.evaluate(() => window.__animlab!.pause(false));
            await gm(page, 'die', 1800);
            await page.evaluate(() => window.__animlab!.hideVfx(true));
            const t0 = Date.now();
            await page.evaluate(() => window.__animlab!.respawn());
            const shots: { t: number; buf: Buffer }[] = [];
            while (Date.now() - t0 < 2200) shots.push({ t: Date.now() - t0, buf: await shot() });
            await page.evaluate(() => window.__animlab!.hideVfx(false));
            // 6 mốc rải từ lúc nằm tới lúc đứng (nhân vật ở giữa khung nhờ camera iso bám người chơi).
            const pick = [0.12, 0.28, 0.42, 0.58, 0.74, 0.95].map((f) => shots[Math.min(shots.length - 1, Math.floor(f * shots.length))]!);
            const cells: Buffer[] = [];
            const sf = (await S()).self ?? undefined;
            for (const x of pick) cells.push(await wide(x.buf, vw, vh, undefined, `hoi sinh ${tag} +${x.t} ms`, sf));
            await grid(path.join(r.out, `tp2-${tag}-revive.jpg`), cells);
          }
          await ctx.close();
        }
    } finally {
      await bots.stop();
    }
    writeJson(r.out, 'tp2.json', timeline);
  },
} satisfies Scenario;
