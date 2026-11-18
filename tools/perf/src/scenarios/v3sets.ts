// Các bộ nhân vật v3 dựng hàng loạt (Đồ Đệ Tử, Huyền Giáp, Đan Tâm): quay RIÊNG từng bộ × giới (video có nhãn, mỗi tình huống 3 s),
// rồi ghép ba bộ cạnh nhau theo mốc từng tình huống thành `<giới>-3bo.webm`, và dựng tờ khung `to-khung-<bộ>-<giới>.png` (6 ảnh tĩnh).
// FFMPEG=đường dẫn nếu ffmpeg không ở PATH. Mỗi bộ mặc bằng `/gm set <id>`; Đồ Đệ Tử = không mặc bộ nào (`set off`).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { list, size } from '../lib/env';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';

const DUR = 3000;
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const SETS: Record<string, { gm: string; label: string }> = {
  de_tu: { gm: 'set off', label: 'Đồ Đệ Tử' },
  huyen_giap: { gm: 'set set_huyen_giap', label: 'Huyền Giáp' },
  dan_tam: { gm: 'set set_dan_tam', label: 'Đan Tâm' },
};

export default {
  name: 'v3sets',
  desc: 'Bộ v3 dựng hàng loạt: video ba bộ cạnh nhau (đứng, chạy, chém, lăn, ngồi) + tờ khung mỗi bộ, nam và nữ',
  usage: '[--genders m,f] [--sets de_tu,huyen_giap,dan_tam] [--size 640x600] [--query a=b]',
  async run(r) {
    const viewport = size('640x600');
    const genders = list('--genders', 'm,f');
    const sets = list('--sets', 'de_tu,huyen_giap,dan_tam');
    for (const g of genders) {
      const gname = g === 'm' ? 'nam' : 'nu';
      for (const s of sets) {
        const tag = `${gname}-${s}`;
        const t0 = Date.now();
        const { ctx, page } = await r.open({
          name: `S${g}${s}`,
          viewport,
          quality: 'high',
          look: { g },
          query: { chr: 'v3' },
          hide: 'hud',
          warnings: /models|chr_v3|clip/,
          video: path.join(r.out, `_rec-${tag}`),
        });
        await gm(page, 'level 12', 1500);
        await gm(page, 'god on', 1200);
        await gm(page, SETS[s].gm, 1500);
        await gm(page, 'killall', 800);
        await gm(page, 'tp 2048 2088', 1500);
        await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
          timeout: 60_000,
          polling: 300,
        });
        await sleep(3500);
        const asset = await page.evaluate(
          () =>
            (window.__game!.ents.players.get(window.__game!.sid).model as unknown as { tpl?: { handle?: { id: string } } }).tpl?.handle
              ?.id ?? '?',
        );
        console.log(`[shots:v3sets] ${tag}: asset ${asset}`);
        const frame = () => cam(page, { yaw: 0.5, pitch: 0.1, dist: 2.7 });
        await frame();
        const setLabel = (text: string) =>
          page.evaluate(
            ([t, vt]) => {
              let d = document.getElementById('anim-label');
              if (!d) {
                d = document.createElement('div');
                d.id = 'anim-label';
                d.style.cssText =
                  'position:fixed;left:12px;top:10px;z-index:99999;padding:6px 12px;background:#000a;color:#fff;font:600 20px sans-serif;border-radius:6px;pointer-events:none';
                document.body.appendChild(d);
              }
              d.textContent = `${vt} · ${t}`;
            },
            [text, SETS[s].label] as const,
          );
        const hold = async (keys: string[], ms: number) => {
          for (const k of keys) await page.keyboard.down(k);
          await sleep(ms);
          for (const k of keys) await page.keyboard.up(k);
        };
        const useSkill = (n: number) => page.evaluate((x) => window.__game!.useSkill(x), n);
        const FRONT = ['KeyS', 'KeyD'];
        const stills: string[] = [];
        const shot = async (n: string) => {
          const f = path.join(r.out, `_still-${tag}-${stills.length}.png`);
          await page.screenshot({ path: f });
          stills.push(f);
          void n;
        };
        interface Sit {
          name: string;
          prep?: () => Promise<void>;
          run: () => Promise<void>;
        }
        const sits: Sit[] = [
          { name: 'đứng yên', run: async () => void (await sleep(DUR / 2), await shot('d'), await sleep(DUR / 2)) },
          {
            name: 'chạy (3/4 trước)',
            run: async () => {
              for (const k of FRONT) await page.keyboard.down(k);
              await sleep(DUR / 2);
              await shot('c');
              await sleep(DUR / 2);
              for (const k of FRONT) await page.keyboard.up(k);
            },
          },
          {
            name: 'chạy (góc ngang)',
            run: async () => {
              await page.keyboard.down('KeyD');
              await sleep(DUR / 2);
              await shot('n');
              await sleep(DUR / 2);
              await page.keyboard.up('KeyD');
            },
          },
          {
            name: 'chém',
            prep: async () => {
              await gm(page, 'spawn mon_soi_xam 2', 1500);
            },
            run: async () => {
              for (const k of FRONT) await page.keyboard.down(k);
              for (const slot of [1, 2, 3, 1]) {
                await useSkill(slot);
                await sleep(DUR / 4);
                if (slot === 2) await shot('x');
              }
              for (const k of FRONT) await page.keyboard.up(k);
            },
          },
          {
            name: 'lăn / lướt (Q)',
            prep: async () => {
              await gm(page, 'killall', 700);
            },
            run: async () => {
              await hold(FRONT, 400);
              await page.keyboard.press('KeyQ');
              await sleep(DUR / 3);
              await shot('l');
              await sleep(DUR - 400 - DUR / 3);
            },
          },
          {
            name: 'ngồi đả tọa',
            run: async () => {
              await sleep(300);
              await page.keyboard.press('KeyZ');
              await sleep(DUR - 1200);
              await shot('z');
              await sleep(900);
              await page.keyboard.press('KeyW');
            },
          },
        ];
        const marks: { name: string; at: number }[] = [];
        await hold(FRONT, 350);
        await sleep(700);
        for (const sit of sits) {
          if (sit.prep) await sit.prep();
          await frame();
          await setLabel(sit.name);
          await sleep(150);
          marks.push({ name: sit.name, at: (Date.now() - t0) / 1000 });
          await sit.run();
          await sleep(500);
        }
        const vid = page.video();
        await ctx.close();
        if (vid) {
          fs.copyFileSync(await vid.path(), path.join(r.out, `_raw-${tag}.webm`));
          fs.writeFileSync(path.join(r.out, `_marks-${tag}.json`), JSON.stringify(marks));
        }
        fs.rmSync(path.join(r.out, `_rec-${tag}`), { recursive: true, force: true });
        // Tờ khung 3×2: ảnh tĩnh giữa mỗi tình huống.
        if (stills.length) {
          const inputs = stills.flatMap((f) => ['-i', f]);
          const filt =
            stills.map((_, i) => `[${i}:v]scale=480:-1[s${i}]`).join(';') +
            `;${stills.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${stills.length}:layout=${stills
              .map((_, i) => `${(i % 3) * 480}_${Math.floor(i / 3) * Math.round((480 * viewport[1]) / viewport[0])}`)
              .join('|')}[o]`;
          const res = spawnSync(FFMPEG, [
            '-y',
            '-loglevel',
            'error',
            ...inputs,
            '-filter_complex',
            filt,
            '-map',
            '[o]',
            '-frames:v',
            '1',
            path.join(r.out, `to-khung-${s}-${gname}.png`),
          ]);
          console.log(`[shots:v3sets] tờ khung ${tag}: ${res.status === 0 ? 'ok' : 'lỗi ' + res.stderr}`);
        }
        for (const f of stills) fs.rmSync(f, { force: true });
        console.log(`[shots:v3sets] ${tag} quay xong, ${marks.length} tình huống`);
      }
      // Ghép các bộ cạnh nhau theo mốc từng tình huống.
      const ms = sets.map((s) => JSON.parse(fs.readFileSync(path.join(r.out, `_marks-${gname}-${s}.json`), 'utf8')) as { at: number }[]);
      const parts: string[] = [];
      const outs: string[] = [];
      ms[0].forEach((_, n) => {
        sets.forEach((_s, k) =>
          parts.push(`[${k}:v]trim=start=${ms[k][n].at.toFixed(2)}:duration=${DUR / 1000},setpts=PTS-STARTPTS[v${n}_${k}]`),
        );
        parts.push(`${sets.map((_s, k) => `[v${n}_${k}]`).join('')}hstack=inputs=${sets.length}[h${n}]`);
        outs.push(`[h${n}]`);
      });
      parts.push(`${outs.join('')}concat=n=${ms[0].length}:v=1:a=0[v]`);
      const res = spawnSync(FFMPEG, [
        '-y',
        '-loglevel',
        'error',
        ...sets.flatMap((s) => ['-i', path.join(r.out, `_raw-${gname}-${s}.webm`)]),
        '-filter_complex',
        parts.join(';'),
        '-map',
        '[v]',
        '-c:v',
        'libvpx',
        '-b:v',
        '3M',
        '-an',
        path.join(r.out, `${gname}-3bo.webm`),
      ]);
      console.log(`[shots:v3sets] ghép ${gname}: ${res.status === 0 ? 'ok' : 'lỗi ' + res.stderr}`);
    }
  },
} satisfies Scenario;
