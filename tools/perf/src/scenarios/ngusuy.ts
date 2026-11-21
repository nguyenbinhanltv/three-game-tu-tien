// Thiên Nhân Ngũ Suy (TN-4): chụp từng ải ở 720p + 1080p. Tài khoản thử bất tử vào thẳng từng ải bằng `/gm trib ngu_suy <ải>`;
// kịch bản đóng vai "người chơi giỏi" thao tác đúng (đọc dấu trên sân qua `__game.suyLog` của bản dev) để ải chạy trọn. Ảnh gồm hai loại:
// theo mốc giờ (đầu/giữa/cuối/kết ải) và theo SỰ KIỆN hình (`__game.suyFx.log`: Linh Nhãn mở, đón Tôi Thể Lôi, lôi ẩn nổ, đèn tắt, phá vọng…).
// Mỗi cỡ màn hình chạy riêng một lượt (không đổi viewport giữa chừng, để ảnh sự kiện chụp đúng khoảnh khắc). Ghi `perf.json`: draw call nền và cao nhất.
// Bất tử không cứu được thanh suy khí: không thao tác thì ải thất bại.
import fs from 'node:fs';
import path from 'node:path';
import { suySectorYaw, tribDef } from '@dtl/shared';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

const DEF = tribDef('ngu_suy');
const SLUG = ['1-linh-luc-suy', '2-nhuc-than-suy', '3-than-thuc-suy', '4-tho-nguyen-suy', '5-dao-tam-suy'];
/** Sự kiện hình đáng chụp của từng ải: khóa timeline → [tên ảnh, trễ ms sau khi phát]. */
const EVENTS: Record<string, Record<string, [string, number]>> = {
  suy_linh: { suy_nhan_open: ['linh-nhan-mo', 350], suy_nhan_end: ['linh-nhan-doi-cho', 200], suy_ok: ['qua-ai', 350] },
  suy_the: { suy_toi_warn: ['toi-the-loi-bao', 200], suy_toi_hit: ['don-toi-the-loi', 140], suy_ok: ['qua-ai', 350] },
  suy_thuc: {
    suy_thuc_brew: ['loi-an-dang-tu', 500],
    suy_thuc_pulse: ['ngung-than', 350],
    suy_thuc_boom: ['loi-an-no', 160],
    suy_ok: ['qua-ai', 350],
  },
  suy_tho: {
    suy_den_gust: ['suy-phong-nham-den', 900],
    suy_den_out: ['den-tat', 250],
    suy_den_light: ['dang-thap-lai', 600],
    suy_den_relit: ['den-chay-lai', 150],
    suy_ok: ['qua-ai', 350],
  },
  suy_tam: { suy_tam_open: ['nhip-pha-vong', 450], suy_tam_good: ['pha-vong-trung', 120], suy_ok: ['qua-ai', 350] },
};

interface Mark {
  s: string;
  n: number;
  x: number;
  z: number;
  r: number;
  pg: number;
  lv: number;
  at: number;
}

/**
 * `--lab`: phát riêng từng nhóm hiệu ứng cạnh nhân vật ở sân tông môn (ban ngày, không có thiên lôi của kiếp chen vào) rồi chụp,
 * để soát hình khối, màu và độ đọc của từng timeline. Gọi thẳng `__game.suyFx` (chỉ là lớp hình, không qua server).
 */
async function lab(r: Parameters<Scenario['run']>[0], tag: string): Promise<void> {
  const dir = path.join(r.out, 'lab');
  fs.mkdirSync(dir, { recursive: true });
  const { page, ctx } = await r.open({ name: 'SuyLab', quality: 'high', seenIntro: true, viewport: UI_SIZES[tag] ?? UI_SIZES['1080p']! });
  await skipCutscene(page, 10);
  await cam(page, { pitch: Number(opt('--pitch', '0.5')), dist: Number(opt('--dist', '16')), yaw: 0 });
  // Mỗi cảnh: danh sách tin FX (toạ độ lệch so với nhân vật) + thời điểm chụp (ms).
  const scenes: [string, number, Record<string, unknown>[]][] = [
    ['1-linh-nhan', 1500, [{ t: 'suymark', s: 'nhan', dx: 0, dz: 6, r: 3.2, d: 8, pg: 1 }]],
    ['2-toi-the-loi-bao', 1300, [{ t: 'suymark', s: 'toi', dx: 0, dz: 6, r: 2.8, d: 2.2, pg: 1 }]],
    ['2-toi-the-loi-don', 160, [{ t: 'suymark', s: 'toi', dx: 0, dz: 6, r: 2.8, pg: 2 }]],
    ['3-loi-an-tu', 700, [{ t: 'suymark', s: 'thuc', dx: 0, dz: 8, r: 14, d: 3, pg: 3 }]],
    ['3-ngung-than', 350, [{ t: 'suymark', s: 'thuc', dx: 0, dz: 0, r: 14, pg: 1 }]],
    ['3-loi-an-no', 200, [{ t: 'suymark', s: 'thuc', dx: 0, dz: 3, r: 14, n: 0b00000011, lv: 8, pg: 0 }]],
    [
      '4-tho-dang',
      1600,
      [
        { t: 'suymark', s: 'den', n: 0, dx: -5, dz: 6, r: 2.8, pg: 1 },
        { t: 'suymark', s: 'den', n: 1, dx: 0, dz: 6, r: 2.8, pg: 0 },
        { t: 'suymark', s: 'den', n: 2, dx: 5, dz: 6, r: 2.8, pg: 1 },
        { t: 'suymark', s: 'den', n: 2, dx: 5, dz: 6, r: 2.8, d: 1.5, pg: 2 },
        { t: 'suymark', s: 'den', n: 1, dx: 0, dz: 6, r: 2.8, d: 1.2, pg: 3 },
      ],
    ],
    ['5-nhip-pha-vong', 900, [{ t: 'suy', s: 'suy_tam', pg: 40, n: 1, d: 3 }]],
    ['5-pha-vong-trung', 140, [{ t: 'suymark', s: 'tam', pg: 1 }]],
    ['5-dong-niem', 250, [{ t: 'suymark', s: 'tam', pg: 0 }]],
    ['0-qua-ai', 350, [{ t: 'suyok' }]],
  ];
  // Mở ải giả để `SuyFx` biết bảng màu; cờ độ kiếp không bật nên vòng lặp tự dọn sau 2 giây (đủ để chụp).
  for (const [name, wait, msgs] of scenes) {
    await page.evaluate((list) => {
      const g = window.__game!;
      const fx = (
        g as unknown as { suyFx: { bar(m: unknown): void; mark(m: unknown): void; ok(m: unknown): void; clear(s: string): void } }
      ).suyFx;
      const sid = (g as unknown as { sid: string }).sid;
      fx.clear(sid);
      for (const m of list) {
        const msg = { ...m, src: sid, x: g.cur.x + ((m.dx as number) ?? 0), z: g.cur.z + ((m.dz as number) ?? 0) };
        if (m.t === 'suy') {
          fx.bar({ t: 'suy', src: sid, s: m.s, pg: 30, n: 0, x: g.cur.x, z: g.cur.z });
          fx.bar(msg);
        } else if (m.t === 'suyok') fx.ok(msg);
        else fx.mark(msg);
      }
    }, msgs);
    await snap(page, dir, `${name}-${tag}.jpg`, { wait });
    await sleep(2600);
  }
  await ctx.close();
}

export default {
  name: 'ngusuy',
  desc: 'Thiên Nhân Ngũ Suy: từng ải ở 720p + 1080p (mốc giờ + sự kiện hình), đo draw call, tùy chọn webm',
  usage: '[--stages 1,2,3,4,5] [--sizes 720p,1080p] [--video] [--pitch 0.6] [--dist 22] [--fxq low|medium|high] [--lab]',
  async run(r) {
    const sizes = list('--sizes', '720p,1080p');
    const video = process.argv.includes('--video');
    const fxq = opt('--fxq', '');
    const perf: Record<string, { backend: string; base: number; peak: number; added: number }> = {};
    if (process.argv.includes('--lab')) return lab(r, sizes[0] ?? '1080p');
    for (const tag of sizes) {
      const viewport = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      for (const sv of list('--stages', '1,2,3,4,5')) {
        const k = Math.max(1, Math.min(DEF.phases.length, Number(sv) || 1));
        const ph = DEF.phases[k - 1]!;
        const dir = path.join(r.out, SLUG[k - 1]!);
        fs.mkdirSync(dir, { recursive: true });
        const { page, ctx } = await r.open({
          name: 'Suy' + k,
          quality: 'high',
          seenIntro: true,
          viewport,
          ...(fxq ? { query: { fxq } } : {}),
          ...(video ? { video: dir } : {}),
        });
        await gm(page, 'god on', 900);
        await gm(page, `trib ngu_suy ${k}`, 500);
        await waitLevel(page, 'do_kiep', 1500);
        await gm(page, 'god on', 900);
        await skipCutscene(page, 10);
        await cam(page, { pitch: Number(opt('--pitch', '0.6')), dist: Number(opt('--dist', '22')), yaw: 0 });
        const draws = () => page.evaluate(() => window.__game!.info().drawCalls);
        const base = await draws();
        let peak = base;
        for (let i = 0; i < 80 && !(await page.evaluate(() => !!document.querySelector('[data-testid=suy-bar]'))); i++) await sleep(250);
        const t0 = Date.now();
        const T = () => (Date.now() - t0) / 1000;
        const len = ph.end - (DEF.phases[k - 2]?.end ?? 0);
        const marks = (): Promise<Mark[]> => page.evaluate(() => Object.values(window.__game!.suyLog ?? {}) as never);
        const fxLog = (): Promise<string[]> => page.evaluate(() => (window.__game!.suyFx?.log ?? []).map((e: { key: string }) => e.key));
        const text = (sel: string) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel);
        const me = () => page.evaluate(() => ({ x: window.__game!.cur.x, z: window.__game!.cur.z }));
        const anchor = await me();
        let lastTp = 0;
        let lastKey = '';
        // `/gm tp` đi qua chat nên thưa nhịp ≥ 850 ms (server bỏ tin chat dày hơn 800 ms).
        const goto = async (key: string, p: { x: number; z: number }) => {
          if (key === lastKey || Date.now() - lastTp < 850) return;
          lastKey = key;
          lastTp = Date.now();
          await gm(page, `tp ${p.x.toFixed(1)} ${p.z.toFixed(1)}`, 0);
        };
        const timed: [number, string][] = [
          [1.5, '01-dau-ai'],
          [len * 0.35, '02-giua-ai'],
          [len * 0.8, '03-cuoi-ai'],
        ];
        const events = { ...(EVENTS[ph.mechanic ?? ''] ?? {}) };
        let seen = 0;
        let castAt = 0;
        let wasStrike = false;
        let xAt = 0;
        while (T() < len + 1.5) {
          const t = T();
          const ms = await marks();
          const now = Date.now();
          if (ph.mechanic === 'suy_linh') {
            const m = ms.find((x) => x.s === 'nhan' && x.pg === 1);
            if (m) await goto(`nhan:${m.at}`, m);
          } else if (ph.mechanic === 'suy_the') {
            const m = ms.find((x) => x.s === 'toi' && x.pg === 1);
            if (m) await goto(`toi:${m.at}`, m);
          } else if (ph.mechanic === 'suy_thuc') {
            const m = ms.find((x) => x.s === 'thuc');
            if (m?.pg === 3 && now >= xAt) {
              xAt = now + 400;
              await page.keyboard.press('KeyX');
            } else if (m?.pg === 1 && m.lv) {
              let i = 0;
              while (i < m.lv && (m.n & (1 << i)) !== 0) i++;
              const a = suySectorYaw(i, m.lv);
              await goto(`thuc:${m.at}`, { x: m.x + Math.sin(a) * 5, z: m.z + Math.cos(a) * 5 });
            }
          } else if (ph.mechanic === 'suy_tho') {
            const m = ms.find((x) => x.s === 'den' && x.pg === 0) ?? ms.find((x) => x.s === 'den' && (x.pg === 2 || x.pg === 3));
            if (m) await goto(`den:${m.n}:${m.pg === 0 ? m.at : 'aim'}`, m);
            else await goto('tam-san', anchor);
          } else if (ph.mechanic === 'suy_tam') {
            // Nhịp phá vọng: ra một đòn đánh thường vào Tâm Ma Ảnh; nhịp tĩnh: không làm gì.
            const strike = (await text('[data-testid=suy-hint]')).includes('Phá vọng');
            // Đầu mỗi nhịp phá vọng chờ ~1 giây rồi mới ra đòn, để ảnh sự kiện chụp được tín hiệu vàng trước khi nó tắt vì đã trúng.
            if (strike && !wasStrike) castAt = now + 1000;
            wasStrike = strike;
            if (strike && now >= castAt) {
              castAt = now + 500;
              await page.evaluate(() => {
                const g = window.__game!;
                for (const [id, m] of g.view.monsters) if (m.t === 'mon_tam_ma' && m.st !== 4) g.send('sk', { id: 'skl_phi_kiem', t: id });
              });
            }
          }
          peak = Math.max(peak, await draws());
          // Ảnh theo sự kiện hình: mỗi loại một tấm, chụp sau khi hình kịp mọc.
          const log = await fxLog();
          for (; seen < log.length; seen++) {
            const ev = events[log[seen]!];
            if (!ev) continue;
            delete events[log[seen]!];
            // Vòng Tôi Thể Lôi hiện cách người vài mét, có khi ngoài khung hình: tới vòng trước rồi mới chụp lúc tia đang giáng.
            if (log[seen] === 'suy_toi_warn') {
              const m = (await marks()).find((x) => x.s === 'toi' && x.pg === 1);
              if (m) {
                await sleep(Math.max(0, 860 - (Date.now() - lastTp)));
                lastKey = `toi:${m.at}`;
                lastTp = Date.now();
                await gm(page, `tp ${m.x.toFixed(1)} ${m.z.toFixed(1)}`, 0);
              }
            }
            await snap(page, dir, `fx-${ev[0]}-${tag}.jpg`, { wait: ev[1] });
            peak = Math.max(peak, await draws());
          }
          const due = timed[0];
          if (due && t >= due[0]) {
            timed.shift();
            await snap(page, dir, `${due[1]}-${tag}.jpg`);
          }
          await sleep(100);
        }
        const info = await page.evaluate(() => window.__game!.info());
        perf[`${SLUG[k - 1]}@${tag}`] = { backend: info.backend, base, peak, added: peak - base };
        console.log(
          `  ải ${k} @${tag}: draw nền ${base}, cao nhất ${peak} (+${peak - base}); chưa chụp: ${Object.keys(events).join(',') || 'không'}`,
        );
        await snap(page, dir, `04-ket-ai-${tag}.jpg`, { wait: 600 });
        const v = page.video();
        await ctx.close();
        if (v) fs.renameSync(await v.path(), path.join(dir, `${SLUG[k - 1]}-${tag}.webm`));
      }
    }
    writeJson(r.out, 'perf.json', perf);
  },
} satisfies Scenario;
