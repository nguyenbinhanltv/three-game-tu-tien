// Huyền Kiếp (TN-6): chụp từng kiếp nhỏ ở 720p + 1080p, camera mặc định sau lưng. Tài khoản thử bất tử vào thẳng từng kiếp bằng
// `/gm trib huyen_<chuỗi> <kiếp>`; kịch bản đóng vai người chơi THẬT: giữ phím W/A/S/D để chạy (không dịch chuyển tức thời, vì Tuyết Kiếp chấm tốc độ),
// bấm X điều tức, ra đòn đánh thường. Nó đọc dấu trên sân qua `__game.suyLog` / `__game.hazardLog` của bản dev.
// Ảnh gồm: theo mốc giờ (đầu/giữa/cuối/kết) và theo SỰ KIỆN hình (`__game.suyFx.log`). Mỗi cỡ màn hình chạy riêng một lượt. Ghi `perf.json`.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { HUYEN_CHAINS, hkInRect, hkLuanAngle, hkRingPos, hkSealAfter, tribDef } from '@dtl/shared';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { snap, UI_SIZES, writeJson } from '../lib/shot';

/** Sự kiện hình đáng chụp của từng kiếp: khóa timeline → [tên ảnh, trễ ms sau khi phát]. */
const EVENTS: Record<string, Record<string, [string, number]>> = {
  hk_tuyet: { hk_tuyet_drift: ['dun-tuyet', 1700], suy_ok: ['qua-kiep', 350] },
  hk_phong: { hk_phong_warn: ['bao-huong-gio', 1500], hk_phong_blow: ['gio-thoi-toi', 200], suy_ok: ['qua-kiep', 350] },
  hk_loi: { hk_loi_rod: ['dan-loi-tru', 900], hk_loi_zap: ['xa-loi-luc', 120], hk_loi_boom: ['tru-no', 160], suy_ok: ['qua-kiep', 350] },
  hk_tram_ly: { hk_ly_seal: ['ban-menh-an', 900], hk_ly_cut: ['nhat-chem', 120], suy_ok: ['qua-kiep', 350] },
  hk_huyet_anh: { hk_huyet_spawn: ['huyet-anh-hien', 500], hk_huyet_kill: ['ha-huyet-anh', 120], suy_ok: ['qua-kiep', 350] },
  hk_van_tam: {
    hk_van_true: ['an-that-sang', 500],
    hk_van_spin: ['an-dang-xoay', 700],
    hk_van_ok: ['dung-an', 150],
    suy_ok: ['qua-kiep', 350],
  },
  hk_kho_than: { hk_tuc_beat: ['vong-nhip-khep', 1500], hk_tuc_good: ['dung-nhip', 120], suy_ok: ['qua-kiep', 350] },
  hk_hon_tho: { hk_chau: ['hon-chau', 700], hk_chau_get: ['nhat-hon-chau', 120], suy_ok: ['qua-kiep', 350] },
  hk_luan_hoi: {
    hk_luan_wheel: ['cung-sinh', 1500],
    hk_luan_warn: ['sap-nghien', 700],
    hk_luan_grind: ['nghien', 160],
    suy_ok: ['qua-kiep', 350],
  },
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
  d?: number;
  ox?: number;
  oz?: number;
}
interface Pt {
  x: number;
  z: number;
}
interface Snap {
  x: number;
  z: number;
  marks: Record<string, Mark>;
  cuts: { x: number; z: number; r: number; yaw: number; w: number }[];
  bar: string;
  log: string[];
  draws: number;
  shadow: string;
}

const KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD'] as const;

/** Người lái: giữ/nhả W A S D để đi về một điểm (camera cố định nên bốn phím là bốn hướng thế giới, đo lúc đầu). */
class Driver {
  private down = new Set<string>();
  private f: Pt = { x: 0, z: 1 };
  private r: Pt = { x: 1, z: 0 };
  constructor(private page: Page) {}

  private async pos(): Promise<Pt> {
    return this.page.evaluate(() => ({ x: window.__game!.cur.x, z: window.__game!.cur.z }));
  }

  /** Đo hướng của W và D trong thế giới (bấm thử 300 ms mỗi phím). */
  async calibrate(): Promise<void> {
    for (const [key, set] of [
      ['KeyW', (v: Pt) => (this.f = v)],
      ['KeyD', (v: Pt) => (this.r = v)],
    ] as const) {
      const a = await this.pos();
      await this.page.keyboard.down(key);
      await sleep(320);
      await this.page.keyboard.up(key);
      await sleep(120);
      const b = await this.pos();
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d > 0.3) set({ x: (b.x - a.x) / d, z: (b.z - a.z) / d });
    }
  }

  /** Giữ đúng các phím đưa nhân vật từ `me` về `to` (null hoặc đã tới = nhả hết). */
  async steer(me: Pt, to: Pt | null, stopAt = 0.7): Promise<void> {
    const want = new Set<string>();
    if (to) {
      const dx = to.x - me.x;
      const dz = to.z - me.z;
      if (Math.hypot(dx, dz) > stopAt) {
        const af = dx * this.f.x + dz * this.f.z;
        const ar = dx * this.r.x + dz * this.r.z;
        const dead = Math.max(0.35, Math.hypot(dx, dz) * 0.2);
        if (af > dead) want.add('KeyW');
        else if (af < -dead) want.add('KeyS');
        if (ar > dead) want.add('KeyD');
        else if (ar < -dead) want.add('KeyA');
      }
    }
    for (const k of KEYS) {
      if (want.has(k) && !this.down.has(k)) await this.page.keyboard.down(k);
      else if (!want.has(k) && this.down.has(k)) await this.page.keyboard.up(k);
    }
    this.down = want;
  }

  async release(): Promise<void> {
    await this.steer({ x: 0, z: 0 }, null);
  }
}

const read = (page: Page): Promise<Snap> =>
  page.evaluate(() => {
    const g = window.__game!;
    const now = Date.now();
    let shadow = '';
    for (const [id, m] of g.view.monsters) if (!shadow && m.t === 'mon_tam_ma' && m.st !== 4) shadow = id;
    const hz = (g.hazardLog ?? []) as unknown as {
      sh: string;
      src: string;
      x: number;
      z: number;
      r: number;
      yaw?: number;
      w?: number;
      at?: number;
      delay?: number;
    }[];
    return {
      x: g.cur.x,
      z: g.cur.z,
      marks: (g.suyLog ?? {}) as never,
      cuts: hz
        .filter((h) => h.sh === 'rect' && !h.src && h.at !== undefined && now < h.at + (h.delay ?? 1.5) * 1000 + 150)
        .map((h) => ({ x: h.x, z: h.z, r: h.r, yaw: h.yaw ?? 0, w: h.w ?? 2.6 })),
      bar: document.querySelector('[data-testid=suy-bar]')?.textContent ?? '',
      log: (g.suyFx?.log ?? []).map((e: { key: string }) => e.key),
      draws: g.info().drawCalls,
      shadow,
    };
  });

export default {
  name: 'huyenkiep',
  desc: 'Huyền Kiếp: chín kiếp nhỏ ở 720p + 1080p (mốc giờ + sự kiện hình), người lái bằng phím thật, đo draw call',
  usage: '[--chains ngoai,noi,hon] [--stages 1,2,3] [--sizes 720p,1080p] [--video] [--pitch 0.6] [--dist 22] [--fxq low|medium|high]',
  async run(r) {
    const sizes = list('--sizes', '720p,1080p');
    const video = process.argv.includes('--video');
    const fxq = opt('--fxq', '');
    const perf: Record<string, { backend: string; peak: number; bar: string; passed: boolean }> = {};
    for (const tag of sizes) {
      const viewport = UI_SIZES[tag] ?? UI_SIZES['1080p']!;
      for (const cn of list('--chains', 'ngoai,noi,hon')) {
        const chain = HUYEN_CHAINS.find((c) => c.endsWith(cn));
        if (!chain) continue;
        const def = tribDef(chain);
        for (const sv of list('--stages', '1,2,3')) {
          const k = Math.max(1, Math.min(def.phases.length, Number(sv) || 1));
          const ph = def.phases[k - 1]!;
          const hk = ph.hk!;
          const slug = `${HUYEN_CHAINS.indexOf(chain) * 3 + k}-${ph.id.replace(/_/g, '-')}`;
          const dir = path.join(r.out, slug);
          fs.mkdirSync(dir, { recursive: true });
          const { page, ctx } = await r.open({
            name: 'Hk' + slug.slice(0, 1),
            quality: 'high',
            seenIntro: true,
            viewport,
            look: { g: 'm' },
            ...(fxq ? { query: { fxq } } : {}),
            ...(video ? { video: dir } : {}),
          });
          await gm(page, 'god on', 900);
          await gm(page, `trib ${chain} ${k}`, 500);
          await waitLevel(page, 'do_kiep', 1500);
          await gm(page, 'god on', 900);
          await skipCutscene(page, 10);
          await cam(page, { pitch: Number(opt('--pitch', '0.6')), dist: Number(opt('--dist', '22')), yaw: 0 });
          for (let i = 0; i < 80 && !(await page.evaluate(() => !!document.querySelector('[data-testid=suy-bar]'))); i++) await sleep(250);
          const t0 = Date.now();
          const T = () => (Date.now() - t0) / 1000;
          const drv = new Driver(page);
          const anchor = await page.evaluate(() => ({ x: window.__game!.cur.x, z: window.__game!.cur.z }));
          // Đo hướng phím trong 4 giây điều tức đầu kiếp rồi quay lại tâm.
          await drv.calibrate();
          const len = ph.end - (def.phases[k - 2]?.end ?? 0);
          const timed: [number, string][] = [
            [2.2, '01-dau-kiep'],
            [len * 0.4, '02-giua-kiep'],
            [len * 0.8, '03-cuoi-kiep'],
          ];
          const events = { ...(EVENTS[ph.mechanic ?? ''] ?? {}) };
          let seen = 0;
          let peak = 0;
          let castAt = 0;
          let vanIdx = -1;
          let vanTo: Pt | null = null;
          let wheel: Mark | null = null;
          let beatDone = -1;
          let lastBar = '';
          const near = (me: Pt, pts: Pt[]): Pt | null =>
            pts.reduce<Pt | null>((b, o) => (!b || Math.hypot(o.x - me.x, o.z - me.z) < Math.hypot(b.x - me.x, b.z - me.z) ? o : b), null);
          while (T() < len + 1.2) {
            const s = await read(page);
            const now = Date.now();
            const ms = Object.values(s.marks);
            if (s.bar) lastBar = s.bar;
            const pg = Number(/(\d+)%/.exec(s.bar)?.[1] ?? 0);
            let to: Pt | null = null;
            let stop = 0.7;
            switch (ph.mechanic) {
              case 'hk_tuyet': {
                const a = Math.atan2(s.x - anchor.x, s.z - anchor.z) + 0.6;
                to = { x: anchor.x + Math.sin(a) * 6, z: anchor.z + Math.cos(a) * 6 };
                stop = 0;
                break;
              }
              case 'hk_phong': {
                const m = s.marks['phong:0'];
                if (m?.pg === 2 && now < m.at + (m.d ?? 3) * 1000 + 300)
                  to = near(
                    s,
                    Array.from({ length: hk.pillars! }, (_, i) => {
                      const pp = hkRingPos(anchor, hk.ring!, i, hk.pillars!);
                      return { x: pp.x + (m.ox ?? 0) * 2.2, z: pp.z + (m.oz ?? 0) * 2.2 };
                    }),
                  );
                else to = anchor;
                break;
              }
              case 'hk_loi':
                to =
                  pg > 25
                    ? (near(
                        s,
                        ms.filter((m) => m.s === 'loi' && m.pg === 1),
                      ) ?? anchor)
                    : anchor;
                break;
              case 'hk_tram_ly': {
                const cut = s.cuts.find((c) => hkInRect(c.x, c.z, c.yaw, c.r, c.w + 1.8, s.x, s.z));
                if (cut) {
                  const sx = Math.cos(cut.yaw);
                  const sz = -Math.sin(cut.yaw);
                  const side = (s.x - cut.x) * sx + (s.z - cut.z) * sz >= 0 ? 1 : -1;
                  to = { x: s.x + sx * side * 4, z: s.z + sz * side * 4 };
                  stop = 0;
                } else to = Math.hypot(s.x - anchor.x, s.z - anchor.z) > 2.5 ? anchor : null;
                break;
              }
              case 'hk_huyet_anh':
                if (s.shadow && now >= castAt) {
                  castAt = now + 450;
                  await page.evaluate((id) => window.__game!.send('sk', { id: 'skl_phi_kiem', t: id }), s.shadow);
                }
                break;
              case 'hk_van_tam': {
                const m = s.marks['van:0'];
                if (m?.pg === 2) vanIdx = m.n;
                else if (m?.pg === 3 && vanIdx >= 0) vanTo = hkRingPos(anchor, hk.ring!, hkSealAfter(vanIdx, m.n, hk.seals!), hk.seals!);
                else if (m && m.pg >= 4) vanTo = null;
                to = vanTo ?? anchor;
                break;
              }
              case 'hk_kho_than': {
                const m = s.marks['tuc:0'];
                if (m?.pg === 1 && m.n !== beatDone) {
                  const wait = m.at + (m.d ?? 0) * 1000 - now;
                  if (wait < 160) {
                    beatDone = m.n;
                    if (wait > 0) await sleep(wait);
                    await page.keyboard.press('KeyX');
                  }
                }
                break;
              }
              case 'hk_hon_tho':
                to =
                  near(
                    s,
                    ms.filter((m) => m.s === 'chau' && m.pg === 1 && now < m.at + (m.d ?? 6) * 1000),
                  ) ?? anchor;
                stop = 0.4;
                break;
              case 'hk_luan_hoi': {
                const m = s.marks['luan:0'];
                if (m?.pg === 1) wheel = m;
                if (wheel) {
                  const th = hkLuanAngle(wheel.ox ?? 0, wheel.oz ?? 0, (now - wheel.at) / 1000 + 0.3);
                  to = { x: anchor.x + Math.sin(th) * 5.5, z: anchor.z + Math.cos(th) * 5.5 };
                  stop = 0.5;
                }
                break;
              }
            }
            await drv.steer(s, to, stop);
            peak = Math.max(peak, s.draws);
            for (; seen < s.log.length; seen++) {
              const ev = events[s.log[seen]!];
              if (!ev) continue;
              delete events[s.log[seen]!];
              await snap(page, dir, `fx-${ev[0]}-${tag}.jpg`, { wait: ev[1] });
            }
            const due = timed[0];
            if (due && T() >= due[0]) {
              timed.shift();
              await snap(page, dir, `${due[1]}-${tag}.jpg`);
            }
            await sleep(60);
          }
          await drv.release();
          const passed = !Object.keys(events).includes('suy_ok');
          const info = await page.evaluate(() => window.__game!.info());
          perf[`${slug}@${tag}`] = { backend: info.backend, peak, bar: lastBar, passed };
          console.log(
            `  ${slug} @${tag}: ${passed ? 'QUA' : 'TRƯỢT'}, thanh cuối "${lastBar}", draw cao nhất ${peak}; chưa chụp: ${Object.keys(events).join(',') || 'không'}`,
          );
          await snap(page, dir, `04-ket-kiep-${tag}.jpg`, { wait: 500 });
          const v = page.video();
          await ctx.close();
          if (v) fs.renameSync(await v.path(), path.join(dir, `${slug}-${tag}.webm`));
        }
      }
    }
    writeJson(r.out, 'perf.json', perf);
  },
} satisfies Scenario;
