// Nhân vật v3 (Lạc Kiếm Môn Phục trên Mannequin + clip UAL trực tiếp) so với bản hiện tại, CÙNG chuỗi hành động và camera, cùng bộ
// `set_lac_kiem`: ảnh cận mặt → đứng nghỉ → chạy → chém 3 chiêu (ô 1-3) → trúng đòn nhẹ/nặng → ngã/đứng dậy → đả tọa → ngự kiếm →
// chết/hồi sinh. Mỗi (giới × bản) một webm + ảnh cận mặt; `v1` = mặc định, `v2` = `?chr=v2`, `v3` = `?chr=v3`.
// Cắt phần tải/vào game bằng ffmpeg (đặt FFMPEG=đường_dẫn nếu không có trong PATH).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { list, size } from '../lib/env';
import { cam, gm } from '../lib/game';
import { centerClip, snap } from '../lib/shot';
import type { Scenario } from '../lib/scenario';

/** `v3`/`v3b` = Lạc Kiếm v3b (mặc định của ?chr=v3), `v3a` = bản v3 cũ (`?v3model=a`). `v3raw` = v3 không bảng màu (`?v3pal=0`), để so trước/sau chỉnh màu. */
const QUERY: Record<string, Record<string, string>> = {
  v1: { chr: 'v1' },
  v3: { chr: 'v3' },
  v3b: { chr: 'v3' },
  v3a: { chr: 'v3', v3model: 'a' },
  v3a0: { chr: 'v3', armfit: '0' },
  v3a5: { chr: 'v3', armfit: '5' },
  v3new: { chr: 'v3' },
  v3nok5: { chr: 'v3', k5: '0' },
  v3raw: { chr: 'v3', v3pal: '0' },
  // Thân Pháp: vòng chạy UAL (cũ, `?ploop=0`) so với clip Patch PM_Run/PM_Sprint (mới); cùng bắt đầu/dừng/thở dốc của Patch.
  v3tpold: { chr: 'v3', thanphap: '1', ploop: '0' },
  v3tpnew: { chr: 'v3', thanphap: '1' },
};
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

interface SlideRow {
  t: number;
  r: [number, number];
  f: [number, number, number][];
}

/** Trượt chân của chân trụ từ dãy khung (xem chú thích ở `slide`). Hàm thuần. */
export function contactSlide(
  rows: SlideRow[],
): { median: number; p90: number; samples: number; contactFrac: number; bodySpeed: number } | null {
  if (rows.length < 10) return null;
  const a = rows[0]!;
  const b = rows[rows.length - 1]!;
  const dx = b.r[0] - a.r[0];
  const dz = b.r[1] - a.r[1];
  const dist = Math.hypot(dx, dz);
  const span = b.t - a.t;
  if (dist < 1 || span <= 0) return null;
  const ux = dx / dist;
  const uz = dz / dist;
  const vbar = dist / span;
  const out: number[] = [];
  let contactFrames = 0;
  for (const i of [0, 1]) {
    const ymin = Math.min(...rows.map((q) => q.f[i]![1]));
    const rel = rows.map((q) => (q.f[i]![0] - q.r[0]) * ux + (q.f[i]![2] - q.r[1]) * uz);
    const on = rows.map((q) => q.f[i]![1] < ymin + 0.03);
    contactFrames += on.filter(Boolean).length;
    for (let k = 1; k < rows.length; k++) {
      if (!on[k] || !on[k - 1]) continue;
      const dt = rows[k]!.t - rows[k - 1]!.t;
      if (dt < 0.002) continue;
      out.push(Math.abs((rel[k]! - rel[k - 1]!) / dt + vbar));
    }
  }
  if (out.length < 8) return null;
  const s = [...out].sort((x, y) => x - y);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    median: r2(s[Math.floor(s.length * 0.5)]!),
    p90: r2(s[Math.floor(s.length * 0.9)]!),
    samples: s.length,
    contactFrac: r2(contactFrames / (2 * rows.length)),
    bodySpeed: r2(vbar),
  };
}

export default {
  name: 'chrv3',
  desc: 'Video so nhân vật hiện tại (v1/v2) với v3 (Lạc Kiếm trên Mannequin + UAL trực tiếp) cùng chuỗi hành động, nam/nữ',
  usage: '[--genders m,f] [--variants v1,v2,v3,v3raw,v3tpold,v3tpnew] [--size 960x600] [--slide | --runstop]',
  async run(r) {
    const viewport = size('960x600');
    for (const g of list('--genders', 'm,f')) {
      for (const v of list('--variants', 'v1,v3')) {
        const tag = `${g === 'm' ? 'nam' : 'nu'}-${v}`;
        const dir = path.join(r.out, `_rec-${tag}`);
        // Đo trượt chân khi chạy (N-6): trong lúc chạy thẳng, lấy chân đang thấp hơn (chân trụ) và tốc độ ngang của nó so với mặt đất (m/s,
        // hệ thế giới). Chân trụ không trượt thì ≈ 0. Ghi trung vị, p90 và tốc độ chạy trung bình vào `slide-<tag>.json`.
        // Chiêu K-5 theo công pháp (N-7): mỗi công pháp một video, bắn lần lượt các ô 1-8 vào sói trước mặt, rồi đả tọa (Z).
        const skills = async () => {
          for (const method of ['lac_kiem_quyet', 'bat_dong_kim_than', 'thanh_moc_dan_kinh']) {
            const mtag = `${tag}-${method}`;
            const rec = path.join(r.out, `_rec-${mtag}`);
            const t1 = Date.now();
            const { page, ctx } = await r.open({
              name: `V3k${g}${v}${method.slice(0, 3)}`,
              viewport: [960, 600],
              quality: 'high',
              look: { g },
              query: QUERY[v] ?? {},
              hide: 'hud',
              warnings: /models|chr_v3|clip/,
              video: rec,
            });
            await gm(page, 'level 24', 1500);
            await gm(page, 'god on', 1000);
            await gm(page, `method ${method} 8`, 1200);
            await gm(page, 'killall', 700);
            await gm(page, 'tp 2048 2088', 1500);
            if (v.startsWith('v3'))
              await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
                timeout: 60_000,
                polling: 300,
              });
            else
              await page.waitForFunction(() => window.__game!.ents?.players.get(window.__game!.sid)?.model?.dirHits === true, undefined, {
                timeout: 60_000,
                polling: 300,
              });
            await sleep(3500); // chờ nguồn pose K-5 nướng/retarget
            const cf = () => cam(page, { yaw: 0.5, pitch: 0.08, dist: 3.6 });
            await cf();
            const t0 = Date.now();
            for (let slot = 1; slot <= 8; slot++) {
              if ((slot - 1) % 3 === 0) {
                await gm(page, 'spawn mon_soi_xam 3', 1300);
                await cf();
              }
              await page.evaluate((n) => window.__game!.useSkill(n), slot);
              await sleep(1700);
            }
            await gm(page, 'killall', 600);
            await page.keyboard.press('KeyZ');
            await sleep(3200);
            await page.keyboard.press('KeyW');
            await sleep(800);
            const vid = page.video();
            await ctx.close();
            if (vid) {
              const raw = await vid.path();
              const dst = path.join(r.out, `${mtag}.webm`);
              const cut = spawnSync(FFMPEG, [
                '-y',
                '-loglevel',
                'error',
                '-ss',
                Math.max(0, (t0 - t1) / 1000 - 0.5).toFixed(2),
                '-i',
                raw,
                '-c:v',
                'libvpx',
                '-b:v',
                '1.5M',
                '-an',
                dst,
              ]);
              if (cut.status !== 0) fs.copyFileSync(raw, dst);
            }
            fs.rmSync(rec, { recursive: true, force: true });
            console.log(`[shots:chrv3] ${mtag}.webm`);
          }
        };
        const slide = async () => {
          const { page, ctx } = await r.open({
            name: `V3s${g}${v}`,
            viewport: [640, 400],
            quality: 'medium',
            look: { g },
            query: {
              ...(QUERY[v] ?? {}),
              ...(process.env.JOG ? { jog: process.env.JOG } : {}),
              ...(process.env.PSTRIDE ? { pstride: process.env.PSTRIDE } : {}),
            },
            hide: 'hud',
            warnings: /models|chr_v3|clip/,
          });
          await gm(page, 'god on', 1000);
          await gm(page, 'tp 2048 2088', 1500);
          if (v.startsWith('v3'))
            await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
              timeout: 60_000,
              polling: 300,
            });
          await sleep(1500);
          // Chuỗi JS thuần: tsx chèn `__name` vào hàm đặt tên trong evaluate(() => ...) làm trang lỗi.
          await page.evaluate(`(() => {
            const g2 = window.__game;
            const e = g2.ents.players.get(g2.sid);
            const rig = e.model.rig;
            const feet = [rig.getObjectByName('foot_l'), rig.getObjectByName('foot_r')];
            const V3 = feet[0].position.constructor;
            const w = { samples: [], speeds: [], rows: [] };
            let last = null;
            const tick = () => {
              const now = performance.now() / 1000;
              const pts = feet.map((f) => f.getWorldPosition(new V3()));
              const root = { x: e.model.root.position.x, z: e.model.root.position.z };
              if (last && now - last.t > 0.001) {
                const dt = now - last.t;
                const i = pts[0].y < pts[1].y ? 0 : 1;
                w.samples.push(Math.hypot(pts[i].x - last.p[i].x, pts[i].z - last.p[i].z) / dt);
                w.speeds.push(Math.hypot(root.x - last.root.x, root.z - last.root.z) / dt);
              }
              const rw = e.model.root.getWorldPosition(new V3());
              w.rows.push({ t: now, r: [rw.x, rw.z], f: pts.map((q) => [q.x, q.y, q.z]) });
              last = { t: now, p: pts, root };
              window.__slide = w;
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          })()`);
          await page.keyboard.down('KeyW');
          await sleep(500);
          await page.evaluate(
            '(() => { window.__slide.samples.length = 0; window.__slide.speeds.length = 0; window.__slide.rows.length = 0; })()',
          );
          await sleep(3500);
          await page.keyboard.up('KeyW');
          const res = (await page.evaluate(`(() => {
            const w = window.__slide;
            const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)] ?? 0;
            const run = w.speeds.filter((x) => x > 0.5);
            return { frames: w.samples.length, runSpeedMean: run.reduce((a, b) => a + b, 0) / Math.max(1, run.length), slideMedian: q(w.samples, 0.5), slideP90: q(w.samples, 0.9), rows: w.rows };
          })()`)) as { rows: SlideRow[] } & Record<string, unknown>;
          // Trượt chân đo ĐÚNG chân trụ: chỉ khung hai khung liền chân đang tiếp đất (cổ chân trong 3 cm trên điểm thấp nhất của nó), vị trí chân tính TƯƠNG ĐỐI thân
          // (triệt nhiễu bước vị trí theo gói tin) chiếu lên hướng chạy; trượt = |vận tốc chân so với thân + tốc độ thân trung bình|. 0 = chân dính đất.
          const contact = contactSlide(res.rows);
          delete (res as { rows?: unknown }).rows;
          Object.assign(res, { contact });
          fs.writeFileSync(
            path.join(
              r.out,
              `slide-${tag}${process.env.JOG ? '-jog' + process.env.JOG : ''}${process.env.PSTRIDE ? '-ps' + process.env.PSTRIDE : ''}.json`,
            ),
            JSON.stringify(res, null, 1),
          );
          console.log(`[shots:chrv3] slide ${tag}: ${JSON.stringify(res)}`);
          await ctx.close();
        };
        // Chạy–dừng–chạy (Thân Pháp, `v3tpold` so `v3tpnew`): giữ W 1,6 s, thả 1,5 s, giữ W 1,6 s; chụp khung liên tục, tên có mốc ms để dựng dải khung.
        // Ảnh `rs-<tag>-<NNN>-<ms>.png` ở thư mục ra (cắt quanh nhân vật khi xử lý hậu kỳ).
        const runstop = async () => {
          const { page, ctx } = await r.open({
            name: `V3r${g}${v}`,
            viewport,
            quality: 'high',
            look: { g },
            query: QUERY[v] ?? {},
            hide: 'hud',
            warnings: /models|chr_v3|clip/,
          });
          await gm(page, 'god on', 1000);
          await gm(page, 'tp 2048 2088', 1500);
          await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
            timeout: 60_000,
            polling: 300,
          });
          await sleep(1500);
          const t0 = Date.now();
          let n = 0;
          const grab = async (until: number) => {
            while (Date.now() - t0 < until) {
              const ms = Date.now() - t0;
              await page.screenshot({ path: path.join(r.out, `rs-${tag}-${String(n++).padStart(3, '0')}-${ms}.png`) });
            }
          };
          await page.keyboard.down('KeyW');
          await grab(1600);
          await page.keyboard.up('KeyW');
          await grab(3100);
          await page.keyboard.down('KeyW');
          await grab(4700);
          await page.keyboard.up('KeyW');
          await grab(5600);
          console.log(`[shots:chrv3] runstop ${tag}: ${n} khung`);
          await ctx.close();
        };
        const stills = async () => {
          // Ảnh cận mặt: phiên riêng, camera đặt ngay sau khi vào game (trong phiên quay, nhân vật đã bị `level`/di chuyển nên hướng nhìn lệch).
          const still = await r.open({
            name: `V3c${g}${v}`,
            viewport: [800, 500],
            quality: 'high',
            look: { g },
            query: QUERY[v] ?? {},
            hide: 'hud',
            warnings: /models|chr_v3|clip/,
          });
          await gm(still.page, 'god on', 1000);
          await gm(still.page, 'set set_lac_kiem', 1200);
          await gm(still.page, 'killall', 800);
          await gm(still.page, 'tp 2048 2088', 1500);
          if (v.startsWith('v3'))
            await still.page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
              timeout: 60_000,
              polling: 300,
            });
          await sleep(2500);
          // Không `level`/di chuyển trước khi chụp: ngay sau khi vào, nhân vật quay mặt về camera yaw 0 (hướng thấy mặt).
          await cam(still.page, { yaw: Number(process.env.STILL_YAW ?? 0), pitch: 0.12, dist: 1.25 });
          if (process.env.STILL_FLIP) {
            // Quay mặt nhân vật về phía camera (hướng nhìn mặc định sau khi vào game là quay lưng); heading khóa lại để engine không xoay trở về.
            await still.page.evaluate(() => {
              const g = window.__game! as unknown as { camYaw: number; facing: number };
              g.facing = g.camYaw + Math.PI;
            });
          }
          await sleep(1200);
          await snap(still.page, r.out, `${tag}-canmat.jpg`, { clip: centerClip(800, 500, 520, 400) });
          // Toàn thân cùng góc ảnh concept (trước mặt, xa hơn), để so màu cạnh nhau.
          await cam(still.page, { yaw: Number(process.env.STILL_YAW ?? 0), pitch: 0.06, dist: 2.6 });
          await sleep(1200);
          await snap(still.page, r.out, `${tag}-toanthan.jpg`, { clip: centerClip(800, 500, 360, 460) });
          // Cùng khung nhưng ẩn nhân vật: hiệu hai ảnh cho mặt nạ chính xác của nhân vật (đo màu trong game, không lẫn nền).
          await still.page.evaluate(() => {
            const g = window.__game!;
            g.ents.players.get(g.sid).model.root.visible = false;
          });
          await sleep(500);
          await snap(still.page, r.out, `${tag}-toanthan-nen.jpg`, { clip: centerClip(800, 500, 360, 460) });
          await still.ctx.close();
        };
        if (process.argv.includes('--six')) {
          // So không chừa tay | chừa tay 16° (v3b2): từng clip UAL hai góc camera (3/4 sau, ngang), camera sát hông-gối, nhãn tên clip trên khung. So `v3old` (v3b) với
          // `v3new` (v3b2); k5=0 để mọi clip là UAL. Mỗi biến thể quay riêng (nhẹ máy) và ghi mốc đầu từng đoạn (đồng hồ trong trang, quy về đuôi video);
          // sau khi quay đủ biến thể thì cắt từng đoạn theo mốc rồi ghép trái/phải: cùng clip, cùng thời điểm dù trang nào đó khựng.
          const [at0, at1] = (process.env.SIX_AT ?? '2048 2088').split(' ');
          const rec = path.join(r.out, `_rec-${tag}`);
          const { page, ctx } = await r.open({
            name: `V3w${g}${v}`,
            viewport: [800, 600],
            quality: 'high',
            look: { g },
            query: QUERY[v] ?? {},
            hide: 'hud',
            warnings: /models|chr_v3|clip/,
            video: rec,
          });
          await gm(page, 'god on', 1000);
          await gm(page, 'killall', 700);
          await gm(page, `tp ${at0} ${at1}`, 1500);
          await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
            timeout: 60_000,
            polling: 300,
          });
          await sleep(2500);
          // Nhãn: biến thể + clip đang phát thật (đòn một lần nếu có, không thì clip nền) + có track vạt nướng hay không; `__mark` ghi mốc.
          await page.evaluate(`(() => {
            const d = document.createElement('div');
            d.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;color:#fff;background:rgba(0,0,0,.65);font:15px monospace;padding:5px 8px;border-radius:4px';
            document.body.appendChild(d);
            const g = window.__game;
            window.__marks = [];
            window.__mark = (n) => window.__marks.push([n, Date.now()]);
            setInterval(() => {
              const m = g.ents.players.get(g.sid).model;
              d.textContent = '${v === 'v3new' ? 'GỘP: 16° + HỆ SỐ BUÔNG' : v === 'v3a5' ? 'MAIN: 5°' : 'KHÔNG BÙ TAY'} · ' + (m.shot ? m.shot.getClip().name : m.baseName);
            }, 100);
          })()`);
          const view = (side: boolean) =>
            cam(page, {
              yaw: side ? Number(process.env.SIX_YAW_SIDE ?? -1.75) : Number(process.env.SIX_YAW ?? -0.7),
              pitch: 0.0,
              dist: 1.7,
            });
          const shot = (name: string, rate: number) =>
            page.evaluate(`(() => { const g = window.__game; g.ents.players.get(g.sid).model.oneShot('${name}', ${rate}); })()`);
          const tStart = Date.now();
          const spec: { name: string; ms: number }[] = [];
          // Một đoạn = hai góc; mỗi góc lặp `act` mỗi `period` ms (đòn một lần) trong `ms`.
          const seg = async (name: string, act: (() => Promise<unknown>) | null, ms: number, period = ms) => {
            for (const side of [false, true]) {
              const label = `${name}${side ? ' (ngang)' : ' (3/4)'}`;
              spec.push({ name: label, ms });
              await view(side);
              await page.evaluate(`window.__mark(${JSON.stringify(label)})`);
              const t0 = Date.now();
              do {
                if (act) await act();
                await sleep(Math.max(50, Math.min(period, ms - (Date.now() - t0))));
              } while (act && Date.now() - t0 < ms - 60);
              if (!act) await sleep(Math.max(0, ms - (Date.now() - t0)));
            }
          };
          await seg('Idle', null, 2200);
          await page.keyboard.down('KeyW');
          await seg('Chạy', null, 2000);
          await page.keyboard.up('KeyW');
          await sleep(800);
          await seg('Chém', () => shot('Sword_Regular_A', 1.6), 2000, 1000);
          await seg('Xoay chém', () => shot('Sword_Regular_C', 1.6), 3600, 1800);
          await seg('Lăn', () => shot('Roll', 1), 4400, 2200);
          await page.keyboard.press('KeyZ'); // ngồi (Sitting_Idle_Loop khi k5=0)
          await seg('Ngồi', null, 2400);
          await page.keyboard.press('KeyW');
          await sleep(900);
          await view(false);
          await page.evaluate(`window.__mark('Ngã (3/4)')`);
          spec.push({ name: 'Ngã (3/4)', ms: 2000 });
          await gm(page, 'die', 4000);
          const elapsed = (Date.now() - tStart) / 1000;
          const marks = (await page.evaluate(`({ marks: window.__marks, now: Date.now() })`)) as { marks: [string, number][]; now: number };
          const vid = page.video();
          await ctx.close();
          if (vid) {
            const raw = await vid.path();
            const probe = spawnSync(FFMPEG, ['-i', raw], { encoding: 'utf8' });
            const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(`${probe.stderr}`);
            const total = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : elapsed + 20;
            // Giây (trong video thô) của từng mốc, quy từ đuôi video: total - (now - tMark).
            const at = marks.marks.map(([n, t]) => ({ name: n, sec: total - (marks.now - t) / 1000 }));
            fs.copyFileSync(raw, path.join(r.out, `_raw-${tag}.webm`));
            fs.writeFileSync(path.join(r.out, `_marks-${tag}.json`), JSON.stringify({ at, spec }, null, 1));
            console.log(`[shots:chrv3] ${tag}: ${at.length} mốc, ${elapsed.toFixed(1)} s`);
          }
          fs.rmSync(rec, { recursive: true, force: true });
          const vs = list('--variants', 'v3a0,v3a5,v3new');
          if (v === vs[vs.length - 1]) {
            // Ghép từng đoạn: [video biến thể 1 | video biến thể 2], cắt theo mốc của từng video.
            const tgs = vs.map((x) => `${g === 'm' ? 'nam' : 'nu'}-${x}`);
            const meta = tgs.map(
              (t) =>
                JSON.parse(fs.readFileSync(path.join(r.out, `_marks-${t}.json`), 'utf8')) as {
                  at: { name: string; sec: number }[];
                  spec: { name: string; ms: number }[];
                },
            );
            const inputs = tgs.flatMap((t) => ['-i', path.join(r.out, `_raw-${t}.webm`)]);
            const parts: string[] = [];
            const n = meta[0].spec.length;
            for (let k = 0; k < n; k++) {
              const len = meta[0].spec[k].ms / 1000;
              const lbl = tgs.map((_, vi) => {
                const a = meta[vi].at[k].sec;
                return `[${vi}:v]trim=start=${a.toFixed(3)}:end=${(a + len).toFixed(3)},setpts=PTS-STARTPTS,fps=25[c${k}_${vi}]`;
              });
              parts.push(...lbl, `${tgs.map((_, vi) => `[c${k}_${vi}]`).join('')}hstack=inputs=${tgs.length}[s${k}]`);
            }
            const cat = `${Array.from({ length: n }, (_, k) => `[s${k}]`).join('')}concat=n=${n}:v=1:a=0[out]`;
            const dst = path.join(r.out, `${g === 'm' ? 'nam' : 'nu'}-6clip-so-sanh.webm`);
            const res = spawnSync(
              FFMPEG,
              [
                '-y',
                '-loglevel',
                'error',
                ...inputs,
                '-filter_complex',
                [...parts, cat].join(';'),
                '-map',
                '[out]',
                '-c:v',
                'libvpx',
                '-b:v',
                '3M',
                '-an',
                dst,
              ],
              { encoding: 'utf8' },
            );
            console.log(res.status === 0 ? `[shots:chrv3] ${path.basename(dst)}` : `[shots:chrv3] ghép lỗi: ${res.stderr}`);
          }
          continue;
        }
        if (process.argv.includes('--sit')) {
          // Ảnh đả tọa (Z) cận cảnh, không có quái xung quanh (ngồi thiền chỉ vào được khi ngoài giao chiến).
          const { page, ctx } = await r.open({
            name: `V3d${g}${v}`,
            viewport: [800, 560],
            quality: 'high',
            look: { g },
            query: QUERY[v] ?? {},
            hide: 'hud',
            warnings: /models|chr_v3|clip/,
          });
          await gm(page, 'god on', 1000);
          await gm(page, 'set set_lac_kiem', 1200);
          await gm(page, 'tp 2048 2088', 1500);
          if (v.startsWith('v3'))
            await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
              timeout: 60_000,
              polling: 300,
            });
          await sleep(4500);
          await page.keyboard.press('KeyZ');
          await sleep(3000);
          for (const [k, yaw] of [
            ['truoc', 0.5],
            ['canh', 1.6],
          ] as const) {
            await cam(page, { yaw, pitch: 0.12, dist: 2.7 });
            await sleep(900);
            await snap(page, r.out, `${tag}-datoa-${k}.jpg`, { clip: centerClip(800, 560, 440, 440) });
          }
          await ctx.close();
          continue;
        }
        if (process.argv.includes('--skills')) {
          await skills();
          continue;
        }
        if (process.argv.includes('--slide')) {
          await slide();
          continue;
        }
        if (process.argv.includes('--runstop')) {
          await runstop();
          continue;
        }
        if (process.argv.includes('--stills')) {
          await stills();
          continue;
        }
        const t0 = Date.now();
        const { ctx, page } = await r.open({
          name: `V3${g}${v}`,
          viewport,
          quality: 'high',
          look: { g },
          query: QUERY[v] ?? {},
          hide: 'hud',
          warnings: /models|chr_v3|clip/,
          video: dir,
        });
        await gm(page, 'level 12', 1500);
        await gm(page, 'god on', 1200);
        await gm(page, 'set set_lac_kiem', 1200);
        await gm(page, 'killall', 800);
        await gm(page, 'tp 2048 2088', 1500);
        if (v.startsWith('v3'))
          await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
            timeout: 60_000,
            polling: 300,
          });
        else if (v !== 'v1' || true)
          await page.waitForFunction(() => window.__game!.ents?.players.get(window.__game!.sid)?.model?.dirHits === true, undefined, {
            timeout: 60_000,
            polling: 300,
          });
        // Camera 3/4 gần, đặt lại trước mỗi pha (camera theo khu có thể kéo xa).
        const frame = () => cam(page, { yaw: 0.5, pitch: 0.08, dist: 3.4 });
        await frame();
        const tScene = Date.now();
        await sleep(1500);
        await frame();
        await sleep(1500); // đứng nghỉ
        await page.keyboard.down('KeyW'); // chạy
        await sleep(2600);
        await page.keyboard.up('KeyW');
        await sleep(600);
        await frame();
        await gm(page, 'spawn mon_soi_xam 1', 1500); // chém
        await frame();
        for (const slot of [1, 2, 3]) {
          await page.evaluate((n) => window.__game!.useSkill(n), slot);
          await sleep(1300);
        }
        await gm(page, 'killall', 700);
        await page.keyboard.press('KeyQ'); // lướt
        await sleep(1200);
        for (const heavy of [false, true]) {
          await page.evaluate((hv) => {
            const g2 = window.__game!;
            const m = g2.ents.players.get(g2.sid).model;
            const y = m.root.rotation.y;
            m.hitReact({ dirX: -Math.sin(y), dirZ: -Math.cos(y), noStop: true, heavy: hv, crit: hv });
          }, heavy);
          await sleep(1300);
        }
        await page.evaluate(() => window.__game!.ents.players.get(window.__game!.sid).model.knockdown());
        await sleep(3000);
        await frame();
        await page.keyboard.press('KeyZ'); // đả tọa
        await sleep(2600);
        await page.keyboard.press('KeyW');
        await sleep(600);
        await page.evaluate(() => window.__game!.toggleFly()); // ngự kiếm
        await sleep(900);
        await page.keyboard.down('KeyW');
        await sleep(1800);
        await page.keyboard.up('KeyW');
        await page.evaluate(() => window.__game!.toggleFly());
        await sleep(1500);
        await frame();
        await gm(page, 'die', 4200);
        await page.evaluate(() => window.__game!.send('resp', {}));
        await sleep(2200);
        const vid = page.video();
        await ctx.close();
        if (vid) {
          const raw = await vid.path();
          const dst = path.join(r.out, `${tag}.webm`);
          const ss = Math.max(0, (tScene - t0) / 1000 - 0.3);
          const cut = spawnSync(FFMPEG, [
            '-y',
            '-loglevel',
            'error',
            '-ss',
            ss.toFixed(2),
            '-i',
            raw,
            '-c:v',
            'libvpx',
            '-b:v',
            '1.5M',
            '-an',
            dst,
          ]);
          if (cut.status !== 0) fs.copyFileSync(raw, dst);
        }
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`[shots:chrv3] ${tag}.webm`);
        await stills();
      }
    }
  },
} satisfies Scenario;
