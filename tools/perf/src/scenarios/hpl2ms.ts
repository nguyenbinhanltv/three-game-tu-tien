// HPL2: ĐO THỜI GIAN KHUNG khi hiệu ứng Họa Pháp Lô 2 (trúng đòn chung, trạng thái kéo dài, môi trường) chạy liên tục, so với nền không hiệu ứng, CÙNG một phiên Chrome.
//   pnpm shots hpl2ms --out <thư mục tuyệt đối> [--renderer webgpu|webgl2] [--secs 10] [--rate 100] [--dummies 5]
// Ba pha cùng cảnh phòng thử (sân Lạc Kiếm Tông, quái hình nộm quanh người chơi, HUD ẩn, tắt tiếng):
//   A nền: không phát gì.
//   B trúng đòn chung: mỗi `--rate` ms phát lần lượt fx_hit_* / fx_break / fx_evade / fx_heal* (quái và người chơi).
//   C trạng thái + môi trường: mỗi `--rate` ms phát lần lượt fx_st_* và fx_env_* (cả cổng, linh thảo, hái, hồi sinh).
//   D tất cả cùng lúc (B + C xen kẽ, tải xấu nhất, nặng hơn nhiều so với lúc chơi thật vì ép phát mọi lượt mà bỏ qua giãn cách/giới hạn thực thể).
// Mỗi pha lấy mẫu mỗi khung: dt rAF (ms), draw call, tam giác, số lưới FX sống; in p50/p95/p99/max, số khung > 33 ms, draw call/tam giác/lưới FX p50 và max.
// Số ms là dt giữa hai khung rAF (đã gồm GPU, bị giới hạn bởi vsync nên nền ~16,7 ms); so pha với nền của chính phiên.
import { num } from '../lib/env';
import { sleep } from '../lib/devserver';
import { gm } from '../lib/game';
import type { Run, Scenario } from '../lib/scenario';
import { writeJson } from '../lib/shot';

interface Sample {
  ms: number[];
  dc: number[];
  tri: number[];
  live: number[];
}

declare global {
  interface Window {
    __hpl2Perf?: Sample;
    __hpl2Stop?: boolean;
  }
}

const SAMPLER = `(() => { const g = window.__game; const o = (window.__hpl2Perf = { dc: [], tri: [], ms: [], live: [] }); window.__hpl2Stop = false; let last = performance.now(); (function t() { if (window.__hpl2Stop) return; const i = g.info(); const n = performance.now(); o.dc.push(i.drawCalls); o.tri.push(i.triangles); o.ms.push(n - last); o.live.push(g.vfx.pool.live); last = n; requestAnimationFrame(t); })(); })()`;

const HIT = [
  'fx_hit_cut',
  'fx_hit_smash',
  'fx_hit_stab',
  'fx_hit_crit',
  'fx_hit_block',
  'fx_hit_mon',
  'fx_hit_bite',
  'fx_break',
  'fx_evade',
  'fx_heal',
  'fx_heal_tick',
  'fx_mana',
];
const ST = ['fx_st_slow', 'fx_st_poison', 'fx_st_burn', 'fx_st_stun', 'fx_st_hot'];
const ENV = ['fx_env_gate', 'fx_env_gate_flat', 'fx_env_herb', 'fx_env_gather', 'fx_env_revive'];

const q = (a: number[], f: number): number => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * f)] ?? 0;
const r1 = (x: number): number => Math.round(x * 10) / 10;

function stats(s: Sample): Record<string, number> {
  const ms = s.ms.slice(2); // bỏ hai khung đầu (khởi động bộ lấy mẫu)
  return {
    frames: ms.length,
    msP50: r1(q(ms, 0.5)),
    msP95: r1(q(ms, 0.95)),
    msP99: r1(q(ms, 0.99)),
    msMax: r1(Math.max(0, ...ms)),
    over33: ms.filter((x) => x > 33.4).length,
    dcP50: q(s.dc, 0.5),
    dcMax: Math.max(0, ...s.dc),
    triP50: q(s.tri, 0.5),
    triMax: Math.max(0, ...s.tri),
    liveP50: q(s.live, 0.5),
    liveMax: Math.max(0, ...s.live),
  };
}

type Page = Awaited<ReturnType<Run['open']>>['page'];

async function phase(page: Page, secs: number, rate: number, keys: string[]): Promise<Record<string, number>> {
  await page.evaluate(SAMPLER);
  const end = Date.now() + secs * 1000;
  let i = 0;
  while (Date.now() < end) {
    if (keys.length) {
      const k = keys[i++ % keys.length]!;
      await page.evaluate((key) => window.__vfxlab!.cast(key), k);
    }
    await sleep(rate);
  }
  await page.evaluate(`(window.__hpl2Stop = true)`);
  const s = (await page.evaluate(() => window.__hpl2Perf)) as Sample;
  return stats(s);
}

export default {
  name: 'hpl2ms',
  desc: 'HPL2: đo thời gian khung (rAF dt, draw call, tam giác, lưới FX) khi hiệu ứng trúng đòn/trạng thái/môi trường chạy liên tục, so với nền cùng phiên',
  usage: '--out <dir> [--renderer webgpu|webgl2] [--secs 10] [--rate 100] [--dummies 5]',
  async run(r: Run) {
    const secs = num('--secs', 10);
    const rate = num('--rate', 100);
    const dummies = Math.min(5, Math.max(1, num('--dummies', 5)));
    const { ctx, page } = await r.open({
      name: 'VL',
      viewport: [1280, 720],
      seenIntro: true,
      look: { g: 'm' },
      query: { realm: 'nk12', god: 1, chr: 'v3', vfxlab: 1, quiet: 1 },
      hide: 'hud',
    });
    page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
    await page.waitForFunction(() => !!window.__game && !!window.__vfxlab, undefined, { timeout: 120_000 });
    await sleep(2500);
    await gm(page, 'level 32', 1500);
    await gm(page, 'tp 2048 2095', 1800);
    await gm(page, 'spawn clear', 1400);
    await gm(page, `spawn elite_liet_cot_bao ${dummies}`, 1800);
    await gm(page, 'tp 2048 2088', 1800);
    await gm(page, 'cd', 1300);
    await page.evaluate(() => {
      const g = window.__game as unknown as {
        view: { monsters: Map<string, { t: string; st: number }> };
        setTarget?: (id: string, kind: string) => void;
      };
      const e = [...g.view.monsters.entries()].find(([, v]) => v.st !== 3);
      if (e) g.setTarget?.(e[0], 'mon');
    });
    // Phòng thử: bỏ FX do server kích để chỉ phát lệnh của kịch bản; không tạm dừng (đo thời gian thật).
    await page.evaluate(() => window.__vfxlab!.monLab(true));
    await sleep(1500);
    const out: Record<string, unknown> = { renderer: r.renderer, secs, rateMs: rate, dummies };
    out.A_nen = await phase(page, secs, rate, []);
    out.B_trungDon = await phase(page, secs, rate, HIT);
    out.C_trangThaiMoiTruong = await phase(page, secs, rate, [...ST, ...ENV]);
    const mix: string[] = [];
    for (let i = 0; i < Math.max(HIT.length, ST.length + ENV.length); i++) {
      if (HIT[i]) mix.push(HIT[i]!);
      const o = [...ST, ...ENV][i];
      if (o) mix.push(o);
    }
    out.D_tatCa = await phase(page, secs, rate, mix);
    const errs = r.errors.length;
    out.consoleErrors = errs;
    writeJson(r.out, `hpl2ms-${r.renderer}.json`, out);
    for (const k of ['A_nen', 'B_trungDon', 'C_trangThaiMoiTruong', 'D_tatCa']) console.log(k, JSON.stringify(out[k]));
    console.log('lỗi console:', errs);
    await ctx.close();
  },
} satisfies Scenario;
