// Diễn Võ Trường (phòng tập GM): BỘ ẢNH CHUẨN. Vào phòng bằng `/gm dvt`, nạp lần lượt mọi cảnh mẫu (`/gm scene <id>`,
// dữ liệu ở packages/content/data/lab/scenes.json), chụp mỗi cảnh một ảnh cùng góc + số đo, rồi ra và kiểm nhân vật về nguyên trạng.
// Có `--base <thư mục bộ trước>` thì so từng cảnh bằng SSIM/ΔE (tools/painted-compare/compare.mjs) và dựng trang trước/sau `index.html`.
//   pnpm shots dienvo --out <thư mục> [--view 720p|1080p] [--query style=dahoa] [--base <thư mục>] [--ssim 0.9] [--only id1,id2]
//                     [--quality high|medium|low] [--renderer webgl2] [--diag 1] [--layersoff 2,3] [--fx id1,id2] [--panel 1]
//                     [--ping 150] [--swings 1 --window 4000] [--crowd 8,20,50] [--fx 'skl_kiem*' --gate 1] [--silhouette 1] [--floor light|grass|snow]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LAB_SCENES } from '@dtl/content';
import { num, opt } from '../lib/env';
import { cam, gm, perfSample, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import sharp from 'sharp';
import { sleep } from '../lib/devserver';
import { Bots } from '../lib/bots';
import { snap, writeJson } from '../lib/shot';

interface Row {
  id: string;
  file: string;
  perf: unknown;
  ink?: unknown;
  /** Cảnh đang đánh: khoảng cách tới mục tiêu trước khi bấm và sau khi chụp, máu mục tiêu (không so SSIM). */
  act?: unknown;
  /** Cảnh đang đánh: tỉ lệ điểm ảnh trong ô quanh thân mục tiêu bị hiệu ứng thay đổi (0..1), đo ở khung đã dừng. */
  cover?: number;
  coverAvg?: number;
  ssim?: number;
  deltaE00?: number;
  diff?: string;
  base?: string;
  flag?: boolean;
}

/** Ngưỡng cảnh báo: hiệu ứng đổi quá ngần này phần ô thân mục tiêu thì coi là che quái (chuẩn HPL2: thân địch phải đọc được). */
export const COVER_WARN = 0.45;
/** Tổng chênh ba kênh (0–765) để coi một điểm ảnh của thân là bị hiệu ứng thay hẳn. */
export const HID_DIFF = 120;

/**
 * Tỉ lệ THÂN mục tiêu bị hiệu ứng che: trong ô vuông tâm (cx, cy) nửa cạnh `half` (điểm ảnh CSS, dpr 1), mặt nạ thân = điểm ảnh đổi rõ giữa ảnh ẩn VFX
 * và ảnh ẩn cả VFX lẫn mục tiêu; trên mặt nạ đó đếm điểm ảnh đổi rõ (tổng chênh ba kênh > 45) giữa ảnh có VFX và ảnh ẩn VFX.
 */
async function coverIn(
  bare: Buffer,
  shot: Buffer,
  box: { cx: number; cy: number; half: number },
  empty: Buffer,
): Promise<number | null> {
  const meta = await sharp(shot).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const left = Math.max(0, Math.round(box.cx - box.half));
  const top = Math.max(0, Math.round(box.cy - box.half));
  const width = Math.min(W - left, Math.round(box.half * 2));
  const height = Math.min(H - top, Math.round(box.half * 2));
  if (width <= 0 || height <= 0) return 0;
  const cut = (b: Buffer) => sharp(b).removeAlpha().extract({ left, top, width, height }).raw().toBuffer();
  const [a, c, e] = await Promise.all([cut(bare), cut(shot), cut(empty)]);
  const dist = (x: Buffer, y: Buffer, i: number) =>
    Math.abs(x[i * 3]! - y[i * 3]!) + Math.abs(x[i * 3 + 1]! - y[i * 3 + 1]!) + Math.abs(x[i * 3 + 2]! - y[i * 3 + 2]!);
  // Mặt nạ thân: đổi rõ (> 45) khi quái biến mất. BỊ CHE: điểm ảnh thân bị THAY HẲN (> `HID_DIFF`), không tính thân chỉ sáng lên nhẹ vì chớp trúng
  // hay ánh của vệt sáng gần đó (đo 27/11: ngưỡng 45 báo 71% trong khi nhìn ảnh con sói vẫn đọc rõ).
  const far = (x: Buffer, y: Buffer, i: number) => dist(x, y, i) > 45;
  let body = 0;
  let hid = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    if (!far(a, e, i)) continue; // không phải điểm ảnh của thân mục tiêu
    body++;
    if (dist(a, c, i) > HID_DIFF) hid++;
  }
  // Thân quá nhỏ trong khung (dưới 40 điểm ảnh) thì không đủ để kết luận.
  return body >= 40 ? hid / body : null;
}

/**
 * Cổng duyệt VFX tự chấm (`--fx … --gate 1`). Ngưỡng TẠM (27/11), chỉnh khi đã chấm đủ nhiều chiêu:
 * che thân mục tiêu (như `COVER_WARN`), lóa = phần màn hình bị hiệu ứng đẩy lên gần trắng, phủ = phần màn hình hiệu ứng làm đổi rõ,
 * lưới = số lưới hiệu ứng sống cùng lúc, dài = thời lượng timeline (giây, tính từ dữ liệu).
 */
export const FX_GATE = { pop: 0.13, cover: COVER_WARN, glare: 0.02, spread: 0.35, live: 120, dur: 4 };

/** Lóa và phủ của một khung: so ảnh có VFX với ảnh ẩn VFX trên TOÀN màn hình. Lóa: cả ba kênh ≥ 245 mà ảnh ẩn VFX chưa trắng. */
async function glareOf(bare: Buffer, shot: Buffer): Promise<{ glare: number; spread: number; pop: number }> {
  const raw = (b: Buffer) => sharp(b).removeAlpha().raw().toBuffer();
  const [a, c] = await Promise.all([raw(bare), raw(shot)]);
  const n = Math.min(a.length, c.length) / 3;
  let white = 0;
  let changed = 0;
  let seen = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    const d = Math.abs(a[k]! - c[k]!) + Math.abs(a[k + 1]! - c[k + 1]!) + Math.abs(a[k + 2]! - c[k + 2]!);
    if (d > 45) changed++;
    // Độ NỔI: chênh trung bình (0..1) của mọi điểm ảnh hiệu ứng làm đổi thấy được (> 12) so với nền ngay dưới nó. Thấp = hiệu ứng chìm vào nền.
    if (d > 12) {
      seen++;
      sum += d;
    }
    if (c[k]! >= 245 && c[k + 1]! >= 245 && c[k + 2]! >= 245 && d > 45) white++;
  }
  return { glare: white / n, spread: changed / n, pop: seen > 200 ? sum / seen / 765 : 0 };
}

/** Timeline chỉ có lớp neo ở mình (mọi sự kiện có `at` đều là `self`): chiêu tự cường hóa, không có gì để che mục tiêu. */
function fxSelfOnly(id: string): boolean {
  const f = path.resolve(process.cwd(), '../../packages/content/data/fx', id + '.json');
  if (!fs.existsSync(f)) return false;
  const j = JSON.parse(fs.readFileSync(f, 'utf8')) as { events?: { at?: string }[] };
  const ats = (j.events ?? []).map((e) => e.at).filter((a): a is string => !!a);
  return ats.length > 0 && ats.every((a) => a === 'self');
}

/** Thời lượng một timeline (giây): mốc kết thúc muộn nhất của các sự kiện (`t` + `dur`). */
function fxDuration(id: string): number | null {
  const f = path.resolve(process.cwd(), '../../packages/content/data/fx', id + '.json');
  if (!fs.existsSync(f)) return null;
  const j = JSON.parse(fs.readFileSync(f, 'utf8')) as { events?: { t?: number; dur?: number }[] };
  const t0 = Math.min(0, ...(j.events ?? []).map((e) => e.t ?? 0));
  return Math.max(0, ...(j.events ?? []).map((e) => (e.t ?? 0) + (e.dur ?? 0))) - t0;
}

/**
 * Phép thử bóng đen: từ ảnh cảnh và ảnh cùng khung đã ẩn mọi nhân vật + quái, dựng ảnh chỉ còn DÁNG (đen trên nền xám phẳng) để soi nhân vật/quái có
 * đọc được bằng hình khối không, bỏ hết màu, viền và chi tiết. Trả tỉ lệ diện tích bóng trên màn hình.
 */
/** Tổng chênh ba kênh để coi một điểm ảnh thuộc thân (thấp hơn ngưỡng đo che: thân tối trên nền tối chỉ chênh vài chục). */
const SIL_DIFF = 16;
async function silhouette(shot: Buffer, empty: Buffer, out: string): Promise<number> {
  const meta = await sharp(shot).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const raw = (b: Buffer) => sharp(b).removeAlpha().raw().toBuffer();
  const [a, e] = await Promise.all([raw(shot), raw(empty)]);
  const px = Buffer.alloc(W * H * 3);
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    const k = i * 3;
    const on = Math.abs(a[k]! - e[k]!) + Math.abs(a[k + 1]! - e[k + 1]!) + Math.abs(a[k + 2]! - e[k + 2]!) > SIL_DIFF;
    if (on) n++;
    px[k] = px[k + 1] = px[k + 2] = on ? 12 : 150;
  }
  // Lọc trung vị 3×3 bỏ điểm lẻ (hạt bụi, nhiễu nén) để mép dáng sạch.
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).median(5).png().toFile(out);
  return n / (W * H);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function page(rows: Row[], view: string, style: string, limit: number): string {
  const tr = rows
    .map((r) => {
      const p = r.perf as { drawCalls?: number; triangles?: number; frameMs?: number } | undefined;
      const cmp =
        r.ssim === undefined
          ? '<td class="na" colspan="2">chưa có bộ trước</td>'
          : `<td><img src="${esc(r.base!)}"></td><td><img src="${esc(r.diff!)}"></td>`;
      const cov = r.cover === undefined ? '' : `<b class="${r.cover > COVER_WARN ? 'bad' : 'ok'}">che thân mục tiêu: lớn nhất ${Math.round(r.cover * 100)}%, trung bình ${Math.round((r.coverAvg ?? 0) * 100)}%</b>`;
      const score = (r.ssim === undefined ? '' : `<b class="${r.flag ? 'bad' : 'ok'}">SSIM ${r.ssim}</b> · ΔE ${r.deltaE00}`) + cov;
      return `<tr><th>${esc(r.id)}<br>${score}<br><small>${p?.drawCalls ?? '?'} draw · ${Math.round((p?.triangles ?? 0) / 1000)}k tam giác</small></th>${cmp}<td><img src="${esc(r.file)}"></td></tr>`;
    })
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Diễn Võ Trường — bộ ảnh chuẩn ${view}</title>
<style>body{background:#14181f;color:#dfe6ee;font:14px system-ui;margin:16px}table{border-collapse:collapse;width:100%}
td,th{border:1px solid #2c3440;padding:6px;vertical-align:top}th{width:170px;text-align:left}img{width:100%;display:block}
.bad{color:#ff8a7a}.ok{color:#8fe0a8}.na{color:#7d8896;text-align:center}small{color:#9aa6b4}</style>
<h1>Diễn Võ Trường — bộ ảnh chuẩn (${esc(view)}, ${esc(style || 'mặc định')})</h1>
<p>Cột: bộ trước · bản đồ chênh (ΔE) · bộ này. Cảnh có SSIM dưới ${limit} được tô đỏ.</p>
<table><tr><th>Cảnh</th><th>Trước</th><th>Chênh</th><th>Sau</th></tr>
${tr}</table>`;
}

export default {
  name: 'dienvo',
  desc: 'Diễn Võ Trường: bộ ảnh chuẩn của mọi cảnh mẫu (lab/scenes.json) + số đo; --base thì so SSIM với bộ trước và dựng trang trước/sau',
  usage: '[--view 720p|1080p] [--query style=dahoa] [--base <thư mục bộ trước>] [--ssim 0.9] [--only id1,id2]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const view = opt('--view', '720p');
    const query = opt('--query', '');
    const base = opt('--base', '');
    const limit = num('--ssim', 0.9);
    const only = opt('--only', '')
      .split(',')
      .filter(Boolean);
    const scenes = LAB_SCENES.filter((s) => !only.length || only.includes(s.id));
    const { page: pg } = await r.open({
      name: 'DienVo',
      // Thử máy yếu: `--quality medium|low` và `--renderer webgl2` (đường lùi không có WebGPU).
      quality: opt('--quality', 'high'),
      renderer: opt('--renderer', '') || undefined,
      viewport: view === '1080p' ? [1920, 1080] : [1280, 720],
      query: { cam: 'iso', quiet: 1 },
      extra: query,
      seenIntro: true,
      // `--panel 1`: kiểm tab Diễn Võ bằng cách BẤM NÚT THẬT, nên phải để giao diện hiện.
      hide: opt('--panel', '') ? undefined : 'hud',
    });
    await skipCutscene(pg, 20);
    // Xưởng VFX: `--layersoff 0,3` tắt các lớp có chỉ số đó trong `events` của mọi timeline phát ra (soi lớp nào vẽ gì).
    const layersOff = opt('--layersoff', '')
      .split(',')
      .filter(Boolean)
      .map(Number);
    if (layersOff.length)
      await pg.evaluate((ix) => {
        const s = (window as unknown as { __fxLayerOff?: Set<number> }).__fxLayerOff;
        ix.forEach((i) => s?.add(i));
      }, layersOff);
    // `--crowd 8,20,50`: đo đám đông — client và N bot vào CHUNG một phòng tập bằng `/gm dvt <khóa>`; bot đi lại quanh võ đài. Mỗi mức in số người thấy,
    // draw call, ms/khung và chụp một ảnh. Không chụp các cảnh mẫu.
    const crowd = opt('--crowd', '')
      .split(',')
      .filter(Boolean)
      .map(Number);
    if (crowd.length) {
      const out: unknown[] = [];
      for (const n of crowd) {
        const key = 'crowd' + n;
        await gm(pg, 'dvt ' + key);
        await waitLevel(pg, 'dien_vo');
        const bots = new Bots(r.port);
        try {
          const joined = await bots.start(n, 'dv' + n + 'b', ['--gm', 'dvt ' + key, '--crowd', '1300,985,7']);
          const others = () => pg.evaluate(() => (window.__game as unknown as { room: { state: { players: { size: number } } } }).room.state.players.size);
          const until = Date.now() + 60_000;
          while (Date.now() < until && (await others()) < n + 1) await sleep(500);
          await sleep(4000);
          const seen = await others();
          const perf = await perfSample(pg);
          const file = `${view}/crowd-${n}.png`;
          await snap(pg, r.out, file, { wait: 300 });
          console.log(`  đám đông ${n}: ${joined} bot vào game, client thấy ${seen} người trong phòng; ${JSON.stringify(perf)}`);
          out.push({ bots: n, joined, seen, perf, file });
        } finally {
          await bots.stop();
        }
        await gm(pg, 'dvt');
        await waitLevel(pg, 'van_lam');
        await sleep(1500);
      }
      writeJson(r.out, `dienvo-crowd-${view}.json`, { view, query, crowd: out });
      return;
    }
    await gm(pg, 'dvt');
    await waitLevel(pg, 'dien_vo');
    // `--ping N`: bật ping giả N ms (khứ hồi) cho cả lượt chụp; `--swings 1`: cảnh đang đánh chỉ ĐẾM số đòn thường ra trong `--window` ms (mặc định 4000)
    // thay cho đo che quái, để so nhịp chuỗi đòn giữa các mức ping.
    // `--floor light|grass|snow`: nền thử của sàn phòng cho cả lượt chụp (mặc định nền tối).
    const floorId = opt('--floor', '');
    if (floorId) console.log(`[shots:dienvo] nền thử ${floorId}: ${(await pg.evaluate((f) => window.__game!.labFloor(f), floorId)) ? 'đã đổi' : 'KHÔNG đổi được'}`);
    const ping = num('--ping', 0);
    if (ping > 0) await pg.evaluate((n) => void (window.__game!.fakePing = n), ping);
    const rows: Row[] = [];
    // `--panel 1`: mở bảng F3, bấm các nút của tab Diễn Võ bằng chuột thật (Playwright) và kiểm kết quả ở trạng thái game. Thay cho việc bấm tay.
    if (opt('--panel', '')) {
      const checks: { name: string; ok: boolean; note?: string }[] = [];
      const check = (name: string, ok: boolean, note?: string) => {
        checks.push({ name, ok, note });
        console.log(`  ${ok ? 'ĐẠT ' : 'HỎNG'} ${name}${note ? ' — ' + note : ''}`);
      };
      const btn = (name: string) => pg.locator('.debug-panel button', { hasText: name }).first();
      const mons = () => pg.evaluate(() => [...window.__game!.view.monsters.values()].filter((m) => m.st !== 4).length);
      await pg.keyboard.press('F3');
      await sleep(600);
      check('bảng F3 mở', (await pg.locator('.debug-panel').count()) > 0);
      await snap(pg, r.out, `${view}/panel-1-mo.png`, { wait: 300 });
      // Nạp cảnh mẫu đầu danh sách (ba sói).
      await btn('Nạp cảnh').click();
      await sleep(4500);
      const n1 = await mons();
      check('nút "Nạp cảnh" dựng quái', n1 === 3, `${n1} quái sống`);
      // Thời gian: Dừng rồi Bước 1 khung, rồi 100%.
      await btn('Thời gian').click();
      await sleep(200);
      await btn('Dừng').click();
      await sleep(300);
      check('nút "Dừng" đặt tốc độ hình về 0', (await pg.evaluate(() => window.__game!.timeScale)) === 0);
      const f0 = await pg.evaluate(() => window.__game!.stepLeft);
      await btn('Bước 5 khung').click();
      const f1 = await pg.evaluate(() => window.__game!.stepLeft);
      check('nút "Bước 5 khung" xếp khung chờ bước', f1 > f0 || f1 === 0, `stepLeft ${f0} → ${f1}`);
      await btn('100%').click();
      await sleep(300);
      check('nút "100%" trả tốc độ hình về 1', (await pg.evaluate(() => window.__game!.timeScale)) === 1);
      await btn('150 ms').click();
      await sleep(200);
      check('nút "150 ms" bật ping giả 150', (await pg.evaluate(() => window.__game!.fakePing)) === 150);
      await btn('0 ms').click();
      await sleep(200);
      check('nút "0 ms" tắt ping giả', (await pg.evaluate(() => window.__game!.fakePing)) === 0);
      // Hiệu ứng: tắt lớp 0 rồi bật hết; phát một timeline.
      await btn('Hiệu ứng').click();
      await sleep(200);
      await btn('+200 ms').click();
      await sleep(600);
      const sk = await pg.evaluate(() => ({ ts: window.__game!.timeScale, left: window.__game!.stepLeft, live: (window.__game as unknown as { vfx: { pool: { live: number } } }).vfx.pool.live }));
      check('nút "+200 ms" tua tới mốc và dừng hình', sk.ts === 0 && sk.left === 0 && sk.live > 0, JSON.stringify(sk));
      await snap(pg, r.out, `${view}/panel-tua-200ms.png`, { wait: 200 });
      await pg.evaluate(() => void (window.__game!.timeScale = 1));
      await sleep(1800);
      const floorOf = () => pg.evaluate(() => (window.__game as unknown as { vdWonders: { floor?: string } | null }).vdWonders?.floor);
      await btn('Nền tuyết').click();
      await sleep(300);
      check('nút "Nền tuyết" đổi nền thử', (await floorOf()) === 'snow');
      await snap(pg, r.out, `${view}/panel-nen-tuyet.png`, { wait: 300 });
      await btn('Nền tối').click();
      await sleep(300);
      check('nút "Nền tối" trả nền mặc định', (await floorOf()) === 'dark');
      await pg.locator('.debug-panel button', { hasText: /^0$/ }).first().click();
      await sleep(200);
      const off1 = await pg.evaluate(() => [...((window as unknown as { __fxLayerOff: Set<number> }).__fxLayerOff ?? [])]);
      check('nút lớp "0" tắt lớp 0', off1.length === 1 && off1[0] === 0, JSON.stringify(off1));
      await btn('Bật hết').click();
      await sleep(200);
      const off2 = await pg.evaluate(() => (window as unknown as { __fxLayerOff: Set<number> }).__fxLayerOff.size);
      check('nút "Bật hết" bật lại mọi lớp', off2 === 0);
      const live0 = await pg.evaluate(() => (window.__game as unknown as { vfx: { pool: { live: number } } }).vfx.pool.live);
      await btn('Phát').click();
      await sleep(250);
      const live1 = await pg.evaluate(() => (window.__game as unknown as { vfx: { pool: { live: number } } }).vfx.pool.live);
      check('nút "Phát" tạo lưới hiệu ứng', live1 > live0, `lưới sống ${live0} → ${live1}`);
      await snap(pg, r.out, `${view}/panel-2-hieu-ung.png`, { wait: 200 });
      // Mọi nút của tab phải nằm TRONG khung nhìn (bảng không cuộn được bằng chuột): kiểm từng nhóm con.
      for (const tab of ['Cảnh và nhân vật', 'Quái trong phòng', 'Hiệu ứng', 'Thời gian']) {
        await btn(tab).click();
        await sleep(200);
        const out = await pg.evaluate(() => {
          const H = window.innerHeight;
          return [...document.querySelectorAll('.debug-tools button')].filter((b) => {
            const q = b.getBoundingClientRect();
            return q.top < 0 || q.bottom > H;
          }).length;
        });
        check(`nhóm "${tab}": mọi nút nằm trong khung 720p`, out === 0, `${out} nút ngoài khung`);
        await snap(pg, r.out, `${view}/panel-nhom-${tab.replace(/\s+/g, '-')}.png`, { wait: 100 });
      }
      // Trả phòng về như mới.
      await btn('Trả phòng về như mới').click();
      await sleep(2000);
      const n2 = await mons();
      check('nút "Trả phòng về như mới" dọn quái', n2 === 0, `${n2} quái sống`);
      await btn('Vào / rời Diễn Võ Trường').click();
      await waitLevel(pg, 'van_lam');
      check('nút "Vào / rời Diễn Võ Trường" đưa về bản đồ', true);
      writeJson(r.out, `dienvo-panel-${view}.json`, { view, checks });
      const bad = checks.filter((c) => !c.ok);
      console.log(bad.length ? `[shots:dienvo] ${bad.length} nút HỎNG` : `[shots:dienvo] ${checks.length}/${checks.length} mục của tab Diễn Võ đạt`);
      return;
    }
    // Xưởng VFX: `--fx id1,id2` phát từng timeline lên con sói gần nhất của cảnh `soi_thuong` (đã đóng băng) và chụp ở +30/+150/+400 ms
    // (dừng lớp hình đúng mốc). Bỏ qua bộ cảnh mẫu.
    // `--fx a,b`: id timeline; `skl_kiem*` (dấu * ở cuối) = mọi timeline có tiền tố đó trong packages/content/data/fx.
    const fxDir = path.resolve(process.cwd(), '../../packages/content/data/fx');
    const fxAll = fs.existsSync(fxDir)
      ? fs
          .readdirSync(fxDir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -5))
      : [];
    const fxIds = opt('--fx', '')
      .split(',')
      .filter(Boolean)
      .flatMap((k) => (k.endsWith('*') ? fxAll.filter((f) => f.startsWith(k.slice(0, -1))) : [k]));
    const gate = !!opt('--gate', '');
    if (fxIds.length) {
      await gm(pg, 'scene soi_thuong', 3500);
      await pg.evaluate(() => {
        const g = window.__game!;
        const me = g.info();
        let best = '';
        let bd = 1e9;
        g.view.monsters.forEach((m, id) => {
          const d = Math.hypot(m.x - me.x, m.z - me.z);
          if (m.st !== 4 && d < bd) {
            bd = d;
            best = id;
          }
        });
        g.targetId = best;
      });
      // Cổng duyệt: tắt sự kiện màn hình/camera (chỉ số -1 = `FX_SCREEN_OFF`), nếu không camera đẩy và chớp vẫn chạy giữa ảnh có VFX và ảnh ẩn VFX,
      // thân mục tiêu lệch đi và bị tính nhầm là bị che (đo 27/11: Kiếm Khí Trảm 60% → xem số sau khi tắt).
      if (gate) await pg.evaluate(() => void (window as unknown as { __fxLayerOff?: Set<number> }).__fxLayerOff?.add(-1));
      type Gate = { pop: number; selfOnly?: boolean; coverMax?: number; cover: number | null; glare: number; spread: number; live: number; dur: number | null; fail: string[] };
      const fxRows: { id: string; ok: boolean; gate?: Gate }[] = [];
      const frames2 = () => pg.evaluate(() => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res()))));
      for (const id of fxIds) {
        // Cổng duyệt: DỪNG lớp hình trước khi phát rồi bước đúng số khung 1/60 s tới từng mốc (không chờ theo ms thật), để hai lượt chạy dừng ở cùng
        // một khung của timeline (trước đây chờ theo ms: số che lệch 10–20 điểm giữa hai lượt).
        if (gate) await pg.evaluate(() => void (window.__game!.timeScale = 0));
        const ok = await pg.evaluate((k) => window.__game!.labFx(k), id);
        fxRows.push({ id, ok });
        if (!ok) {
          console.log(`[shots:dienvo] không có timeline ${id}`);
          continue;
        }
        const covers: number[] = [];
        const g: Gate = { pop: 0, cover: null, glare: 0, spread: 0, live: 0, dur: fxDuration(id), fail: [] };
        let last = 0;
        // Cổng duyệt chấm NĂM mốc (33 / 100 / 200 / 300 / 450 ms); chụp thường giữ ba mốc cũ.
        for (const ms of gate ? [33, 100, 200, 300, 450] : [30, 150, 400]) {
          if (gate) {
            const n = Math.round(((ms - last) * 60) / 1000);
            await pg.evaluate((k) => void (window.__game!.stepLeft = k), n);
            await pg.waitForFunction(() => window.__game!.stepLeft === 0, undefined, { timeout: 10_000 });
          } else {
            await sleep(ms - last);
            await pg.evaluate(() => void (window.__game!.timeScale = 0));
          }
          last = ms;
          await pg.evaluate(() => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res()))));
          const shot = await snap(pg, r.out, `${view}/fx/${id}+${ms}ms.png`, { wait: 0 });
          if (gate) {
            // Cùng khung đã dừng: ảnh ẩn VFX (lóa, phủ) và ảnh ẩn cả mục tiêu (mặt nạ thân để đo che), như cảnh đang đánh.
            const st = (await pg.evaluate(`(() => {
              var g = window.__game, v = new g.camera.position.constructor(), u = new g.camera.position.constructor();
              var live = g.vfx.pool.live, box = null;
              if (g.ents.chestOf(g.targetId, v)) {
                u.copy(v); u.y += 1; v.project(g.camera); u.project(g.camera);
                var W = window.innerWidth, H = window.innerHeight, cx = (v.x * 0.5 + 0.5) * W, cy = (-v.y * 0.5 + 0.5) * H;
                box = { cx: cx, cy: cy, half: Math.max(18, Math.abs((-u.y * 0.5 + 0.5) * H - cy) * 1.1) };
              }
              g.vfx.group.visible = false;
              return { live: live, box: box };
            })()`)) as { live: number; box: { cx: number; cy: number; half: number } | null };
            await frames2();
            const bare = await pg.screenshot();
            await pg.evaluate(`(() => { var m = window.__game.ents.monsters.get(window.__game.targetId); if (m) { m.model.root.userData.__s = m.model.root.scale.x; m.model.root.scale.setScalar(1e-4); } })()`);
            await frames2();
            const empty = await pg.screenshot();
            await pg.evaluate(`(() => { var g = window.__game, m = g.ents.monsters.get(g.targetId); if (m && m.model.root.userData.__s) m.model.root.scale.setScalar(m.model.root.userData.__s); g.vfx.group.visible = true; })()`);
            const gl = await glareOf(bare, shot);
            const cv = st.box ? await coverIn(bare, shot, st.box, empty) : null;
            if (cv !== null) covers.push(cv);
            g.glare = Math.max(g.glare, gl.glare);
            g.spread = Math.max(g.spread, gl.spread);
            g.pop = Math.max(g.pop, gl.pop);
            g.live = Math.max(g.live, st.live);
          }
          if (opt('--diag', '') && ms === 150) {
            // Các lô lưới hiệu ứng đang vẽ ở mốc +150 ms: tên lô, số instance, và vị trí + cỡ của từng instance (so với mục tiêu). Để biết một lớp có được
            // DỰNG không, nằm ở đâu và to bao nhiêu, khi trên ảnh không thấy gì.
            const dump = await pg.evaluate(`(() => {
              var g = window.__game, V = g.camera.position.constructor, c = new V(), out = [];
              g.ents.chestOf(g.targetId, c);
              g.vfx.group.traverse(function (o) {
                if (!o.isMesh || !o.visible) return;
                var row = { n: o.name || '?', inst: o.isInstancedMesh ? o.count : -1, items: [] };
                if (o.isInstancedMesh && o.count > 0 && o.instanceMatrix) {
                  var e = o.instanceMatrix.array;
                  for (var i = 0; i < Math.min(o.count, 30); i++) {
                    var k = i * 16;
                    var sx = Math.hypot(e[k], e[k + 1], e[k + 2]), sy = Math.hypot(e[k + 4], e[k + 5], e[k + 6]), sz = Math.hypot(e[k + 8], e[k + 9], e[k + 10]);
                    row.items.push([+(e[k + 12] - c.x).toFixed(1), +(e[k + 13] - c.y).toFixed(1), +(e[k + 14] - c.z).toFixed(1), +sx.toFixed(2), +sy.toFixed(2), +sz.toFixed(2)]);
                  }
                }
                if (o.isInstancedMesh && o.count > 1) {
                  // Thuộc tính theo instance của lô (độ đục, tiến độ quét/tan, màu): 2 instance đầu.
                  row.attrs = {};
                  var at = o.geometry.attributes;
                  Object.keys(at).forEach(function (k) {
                    var A = at[k];
                    if (!A.isInstancedBufferAttribute) return;
                    row.attrs[k] = Array.prototype.slice.call(A.array, 0, A.itemSize * 2).map(function (v) { return +(+v).toFixed(3); });
                  });
                  row.mat = { type: o.material.type, transparent: o.material.transparent, depthTest: o.material.depthTest, side: o.material.side, vis: o.material.visible, ro: o.renderOrder, layers: o.layers.mask };
                  row.pos = [+o.position.x.toFixed(1), +o.position.y.toFixed(1), +o.position.z.toFixed(1)];
                  var mw = o.matrixWorld.elements;
                  row.world = [+mw[12].toFixed(1), +mw[13].toFixed(1), +mw[14].toFixed(1)];
                  row.auto = [o.matrixAutoUpdate, o.matrixWorldAutoUpdate, o.frustumCulled];
                  row.geoVerts = o.geometry.attributes.position.count;
                  row.bs = o.boundingSphere ? [+o.boundingSphere.center.x.toFixed(1), +o.boundingSphere.center.y.toFixed(1), +o.boundingSphere.center.z.toFixed(1), +o.boundingSphere.radius.toFixed(1)] : null;
                }
                if (row.inst !== 0) out.push(row);
              });
              return out;
            })()`);
            console.log('[fxdiag] ' + id + ' ' + JSON.stringify(dump));
          }
          if (!gate) await pg.evaluate(() => void (window.__game!.timeScale = 1));
        }
        if (gate) await pg.evaluate(() => void (window.__game!.timeScale = 1));
        if (gate) {
          // Chiêu chỉ có lớp neo ở MÌNH (hộ thể, hóa thân, nhưng cả đòn cận chiến như Tam Đao): vẫn chấm che (mục tiêu cận chiến đứng sát mình), chỉ ĐÁNH DẤU
          // để người đọc bảng biết số che phụ thuộc khoảng đứng trong phòng (~3 m).
          g.selfOnly = fxSelfOnly(id);
          // Che thân chấm theo mốc GIỮA của các mốc (trung vị): chớp trúng đòn che thân trong một khung là chủ ý, che kéo dài qua hai mốc mới là hỏng.
          if (covers.length) {
            const so = [...covers].sort((x, y) => x - y);
            g.cover = so[Math.floor(so.length / 2)]!;
            g.coverMax = so[so.length - 1]!;
          }
          if ((g.cover ?? 0) > FX_GATE.cover) g.fail.push('che thân');
          if (g.glare > FX_GATE.glare) g.fail.push('lóa');
          if (g.pop < FX_GATE.pop) g.fail.push('chìm vào nền');
          if (g.spread > FX_GATE.spread) g.fail.push('phủ màn hình');
          if (g.live > FX_GATE.live) g.fail.push('nhiều lưới');
          if ((g.dur ?? 0) > FX_GATE.dur) g.fail.push('quá dài');
          fxRows[fxRows.length - 1]!.gate = g;
          const pc = (x: number | null) => (x === null ? '  ?' : String(Math.round(x * 100)).padStart(3)) + '%';
          console.log(
            `  ${g.fail.length ? 'HỎNG' : 'ĐẠT '} ${id.padEnd(30)} che ${pc(g.cover)} (đỉnh ${pc(g.coverMax ?? null)})  lóa ${pc(g.glare)}  phủ ${pc(g.spread)}  nổi ${pc(g.pop)}  lưới ${String(g.live).padStart(3)}  dài ${g.dur?.toFixed(2) ?? '?'} s${g.selfOnly ? '  [neo ở mình]' : ''}${g.fail.length ? '  ← ' + g.fail.join(', ') : ''}`,
          );
        }
        await sleep(1500);
      }
      await gm(pg, 'labreset', 1500);
      await gm(pg, 'dvt');
      await waitLevel(pg, 'van_lam');
      if (gate) {
        const bad = fxRows.filter((x) => x.gate?.fail.length);
        console.log(`[shots:dienvo] cổng duyệt VFX: ${fxRows.length - bad.length}/${fxRows.length} đạt` + (bad.length ? '; hỏng: ' + bad.map((x) => x.id).join(', ') : ''));
      }
      writeJson(r.out, `dienvo-fx-${view}.json`, { view, query, gate: gate ? FX_GATE : undefined, fx: fxRows });
      return;
    }
    const dflt = await pg.evaluate(() => ({ pitch: window.__game!.camPitch, dist: window.__game!.camDist }));
    for (const sc of scenes) {
      await gm(pg, `scene ${sc.id}`, 3500);
      await cam(pg, { ...dflt, ...sc.cam });
      const file = `${view}/${sc.id}.png`;
      if (sc.act) {
        // Cảnh đang đánh: nhắm quái gần nhất, bấm ô chiêu, chụp sau `waitMs` rồi thêm hai khung cách 120 ms (bắt vệt chém đang quét).
        const d0 = await pg.evaluate((slot) => {
          const g = window.__game!;
          const me = g.info();
          let best = '';
          let bd = 1e9;
          g.view.monsters.forEach((m, id) => {
            const d = Math.hypot(m.x - me.x, m.z - me.z);
            if (m.st !== 4 && d < bd) {
              bd = d;
              best = id;
            }
          });
          g.targetId = best;
          g.useSkill(slot);
          return { d: bd, skill: g.bar()[slot]?.id ?? '' };
        }, sc.act.slot);
        if (opt('--swings', '')) {
          const win = num('--window', 4000);
          // Đếm tin hiệu ứng đòn thường của mình (server phát mỗi đòn ra thật) trong cửa sổ, bỏ 1 giây đầu để chuỗi vào nhịp.
          await sleep(1000);
          await pg.evaluate(() => {
            const g = window.__game as unknown as { onFx(m: { t: string; src?: string }, held?: boolean): void; sid: string };
            const w = window as unknown as { __sw: number; __swOrig?: unknown };
            w.__sw = 0;
            if (!w.__swOrig) {
              const orig = g.onFx.bind(g);
              w.__swOrig = orig;
              g.onFx = (m, held) => {
                if (m.t === 'sword' && m.src === g.sid && !held) w.__sw++;
                return orig(m, held);
              };
            }
          });
          await sleep(win);
          const swings = await pg.evaluate(() => (window as unknown as { __sw: number }).__sw);
          const hp = await pg.evaluate(() => {
            const g = window.__game!;
            const m = g.view.monsters.get(g.targetId);
            return m ? { hp: m.hp, mhp: m.mhp } : null;
          });
          console.log(`  ${sc.id}: ping giả ${ping} ms, ${swings} đòn trong ${win} ms (${((swings * 1000) / win).toFixed(2)} đòn/giây)`);
          rows.push({ id: sc.id, file, perf: await perfSample(pg), act: { skill: d0.skill, ping, swings, windowMs: win, hp } });
          continue;
        }
        // Đo hiệu ứng che thân mục tiêu ở BỐN mốc liên tiếp (cách nhau ~110 ms thật): mỗi mốc dừng lớp hình rồi chụp HAI lần cùng khung, có hiệu ứng
        // và ẩn nhóm VFX; chênh giữa hai ảnh trong ô quanh thân mục tiêu = phần thân bị che (không lẫn tư thế; số sát thương là DOM nên cũng không lẫn).
        // Một mốc thì lệch nhiều theo thời điểm (đo 27/11: cùng cảnh ra 61% rồi 89%), nên báo cả LỚN NHẤT và trung bình.
        const setVfx = (on: boolean) =>
          pg.evaluate((v) => void ((window.__game as unknown as { vfx: { group: { visible: boolean } } }).vfx.group.visible = v), on);
        // Chờ đúng hai khung vẽ (không chờ theo ms): hoạt ảnh giật lùi của quái chạy theo giờ thật, chờ lâu thì thân lệch giữa các ảnh và bị tính nhầm là che.
        const frames2 = () => pg.evaluate(() => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res()))));
        const covers: number[] = [];
        await sleep(sc.act.waitMs);
        for (let k = 0; k < 4; k++) {
          await pg.evaluate(() => void (window.__game!.timeScale = 0));
          await frames2();
          const shot = await snap(pg, r.out, k === 0 ? file : `${view}/${sc.id}.k${k}.png`, { wait: 0 });
          const box = (await pg.evaluate(`(() => {
            var g = window.__game, v = new g.camera.position.constructor(), u = new g.camera.position.constructor();
            if (!g.ents.chestOf(g.targetId, v)) return null;
            u.copy(v); u.y += 1;
            v.project(g.camera); u.project(g.camera);
            var W = window.innerWidth, H = window.innerHeight;
            var cx = (v.x * 0.5 + 0.5) * W, cy = (-v.y * 0.5 + 0.5) * H;
            var pxPerM = Math.abs((-u.y * 0.5 + 0.5) * H - cy);
            return { cx: cx, cy: cy, half: Math.max(18, pxPerM * 1.1) };
          })()`)) as { cx: number; cy: number; half: number } | null;
          await setVfx(false);
          await frames2();
          const bare = await snap(pg, r.out, `${view}/${sc.id}.k${k}.novfx.png`, { wait: 0 });
          // Ảnh thứ ba: ẩn luôn thân mục tiêu (thu nhỏ gốc mô hình) để lấy MẶT NẠ THÂN = chỗ ảnh đổi khi quái biến mất. Chỉ tính che trên mặt nạ này,
          // nên vệt quạt/pháp trận nằm trên sàn quanh quái không bị tính là che quái.
          await pg.evaluate(`(() => { var m = window.__game.ents.monsters.get(window.__game.targetId); if (m) { m.model.root.userData.__s = m.model.root.scale.x; m.model.root.scale.setScalar(1e-4); } })()`);
          await frames2();
          const empty = await pg.screenshot();
          await pg.evaluate(`(() => { var m = window.__game.ents.monsters.get(window.__game.targetId); if (m && m.model.root.userData.__s) m.model.root.scale.setScalar(m.model.root.userData.__s); })()`);
          await setVfx(true);
          await pg.evaluate(() => void (window.__game!.timeScale = 1));
          if (box) {
            const c = await coverIn(bare, shot, box, empty);
            if (c !== null) covers.push(c);
          }
          await sleep(110);
        }
        const cover = covers.length ? Math.max(...covers) : null;
        const coverAvg = covers.length ? covers.reduce((n, x) => n + x, 0) / covers.length : null;
        const d1 = await pg.evaluate(() => {
          const g = window.__game!;
          const me = g.info();
          const m = g.view.monsters.get(g.targetId);
          return m ? { d: Math.hypot(m.x - me.x, m.z - me.z), hp: m.hp, mhp: m.mhp } : null;
        });
        rows.push({ id: sc.id, file, perf: await perfSample(pg), act: { skill: d0.skill, distBefore: d0.d, after: d1 }, cover: cover ?? undefined, coverAvg: coverAvg ?? undefined });
        console.log(`  ${sc.id}: chiêu ${d0.skill}`);
        if (cover !== null) console.log(`  ${sc.id}: hiệu ứng che thân mục tiêu lớn nhất ${Math.round(cover * 100)}%, trung bình ${Math.round((coverAvg ?? 0) * 100)}% (4 mốc)`);
        continue;
      }
      const still = await snap(pg, r.out, file, { wait: 1200 });
      // `--silhouette 1`: thêm ảnh bóng đen `<id>.sil.png` của cảnh (ẩn VFX, rồi ẩn mọi nhân vật + quái để lấy mặt nạ dáng).
      if (opt('--silhouette', '')) {
        await pg.evaluate(() => void (window.__game!.timeScale = 0));
        const f2 = () => pg.evaluate(() => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res()))));
        await f2();
        const withBodies = await pg.screenshot();
        await pg.evaluate(`(() => { var g = window.__game; [g.ents.monsters, g.ents.players].forEach(function (mp) { mp.forEach(function (v) { v.model.root.traverse(function (o) { o.userData.__silL = o.layers.mask; o.layers.set(31); }); }); }); })()`);
        await f2();
        const empty = await pg.screenshot();
        await pg.evaluate(`(() => { var g = window.__game; [g.ents.monsters, g.ents.players].forEach(function (mp) { mp.forEach(function (v) { v.model.root.traverse(function (o) { if (o.userData.__silL !== undefined) { o.layers.mask = o.userData.__silL; delete o.userData.__silL; } }); }); }); g.timeScale = 1; })()`);
        const area = await silhouette(withBodies, empty, path.join(r.out, `${view}/${sc.id}.sil.png`));
        console.log(`  ${sc.id}: bóng đen chiếm ${(area * 100).toFixed(1)}% màn hình → ${view}/${sc.id}.sil.png`);
        void still;
      }
      // Chẩn đoán viền mực: số vỏ đang hiện và màu của chúng (trạng thái quái phải lên hình, không chỉ có ở state).
      const ink = await pg.evaluate(`(() => { var out = []; window.__game.scene.traverse(function (o) { if (o.userData && o.userData.inkHull && o.visible) out.push((o.userData.ink.color || 0).toString(16) + '@' + o.userData.ink.w.toFixed(3)); }); return out; })()`);
      if (opt('--diag', '')) {
        const d = await pg.evaluate(`(() => { var out = []; window.__game.scene.traverse(function (o) { if (!(o.userData && o.userData.inkHull)) return; var p = o.parent, sib = []; if (p) p.children.forEach(function (c) { sib.push((c.type || '?') + ':' + (c.name || '') + ':' + (c.visible ? 'v' : 'h') + ':' + (c.userData && c.userData.inkHull ? 'HULL' : '') + ':' + (c.geometry ? c.geometry.attributes.position.count : 0) + ':ro' + c.renderOrder + ':' + (c.material ? (c.material.type + '/t' + (c.material.transparent ? 1 : 0) + '/dw' + (c.material.depthWrite ? 1 : 0)) : '')); }); var w = new (o.position.constructor)(); o.getWorldPosition(w); var ws = new (o.position.constructor)(); o.getWorldScale(ws); var nA = o.geometry.attributes.normal, pA = o.geometry.attributes.position; out.push({ nrm: nA ? [nA.array.constructor.name, nA.normalized, nA.itemSize, Array.prototype.slice.call(nA.array, 0, 9)] : null, posA: [pA.array.constructor.name, pA.normalized, Array.prototype.slice.call(pA.array, 0, 6)], bind: Array.prototype.slice.call(o.bindMatrix.elements, 0, 16).map(function (v) { return +v.toFixed(3); }), inv0: o.skeleton ? Array.prototype.slice.call(o.skeleton.boneInverses[0].elements, 0, 16).map(function (v) { return +v.toFixed(4); }) : null, b0: o.skeleton ? [o.skeleton.bones[0].name].concat(Array.prototype.slice.call(o.skeleton.bones[0].matrixWorld.elements, 0, 16).map(function (v) { return +v.toFixed(3); })) : null, side: o.material.side, mvis: o.material.visible, sib: sib, pos: [w.x.toFixed(1), w.y.toFixed(1), w.z.toFixed(1)], scale: ws.x.toFixed(3), bones: o.skeleton ? o.skeleton.bones.length : -1, parentChain: (function () { var n = [], q = o.parent; while (q && n.length < 6) { n.push((q.type || '') + ':' + (q.name || '') + ':' + (q.visible ? 'v' : 'h')); q = q.parent; } return n; })() }); }); return out; })()`);
        console.log('[diag] ' + sc.id + ' ' + JSON.stringify(d, null, 1));
      }
      rows.push({ id: sc.id, file, perf: await perfSample(pg), ink });
    }
    await gm(pg, 'labreset', 1500);
    await gm(pg, 'dvt');
    await waitLevel(pg, 'van_lam');
    const back = await pg.evaluate(() => window.__game!.info());
    console.log(`[shots:dienvo] backend ${back.backend}, preset ${opt('--quality', 'high')}`);

    // So với bộ trước (nếu có): SSIM + ΔE + ảnh chênh, cảnh dưới ngưỡng được đánh dấu.
    if (base) {
      const tool = path.resolve(process.cwd(), '../painted-compare/compare.mjs');
      for (const row of rows) {
        const before = path.join(base, row.file);
        if (!fs.existsSync(before) || row.act) continue;
        const diff = `${view}/${row.id}.diff.png`;
        try {
          const res = JSON.parse(
            execFileSync('node', [tool, before, path.join(r.out, row.file), '--out', path.join(r.out, diff)], { encoding: 'utf8' })
              .trim()
              .split('\n')
              .pop()!,
          ) as { ssim: number; deltaE00: number };
          const copy = `${view}/${row.id}.truoc.png`;
          fs.copyFileSync(before, path.join(r.out, copy));
          Object.assign(row, { ssim: res.ssim, deltaE00: res.deltaE00, diff, base: copy, flag: res.ssim < limit });
        } catch (e) {
          console.log(`[shots:dienvo] không so được ${row.id}: ${(e as Error).message.split('\n')[0]}`);
        }
      }
      const bad = rows.filter((x) => x.flag);
      console.log(
        bad.length
          ? `[shots:dienvo] ${bad.length} cảnh lệch quá ngưỡng SSIM ${limit}: ${bad.map((x) => `${x.id} (${x.ssim})`).join(', ')}`
          : `[shots:dienvo] mọi cảnh có bộ trước đều ≥ SSIM ${limit}`,
      );
    }
    fs.writeFileSync(path.join(r.out, `index-${view}.html`), page(rows, view, query, limit));
    writeJson(r.out, `dienvo-${view}.json`, { view, query, quality: opt('--quality', 'high'), renderer: opt('--renderer', ''), base, limit, rows, back });
  },
} satisfies Scenario;
