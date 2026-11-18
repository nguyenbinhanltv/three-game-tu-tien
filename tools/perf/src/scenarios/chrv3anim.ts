// Animation nhân vật v3 (Lạc Kiếm v3b): cùng chuỗi tình huống có nhãn, quay hai bản (cũ = `?v3anim=0`, mới) cho nam và nữ, ghép trái|phải
// bằng ffmpeg (FFMPEG=đường dẫn, mặc định ffmpeg-static). Kèm đo "đỉnh tay nằm trong khối thân" (xuyên ống tay) theo từng tình huống:
// ghi `pen-<giới>-<bản>.json`. Tình huống: đứng yên, chạy, rẽ gấp, chạy+chém, chuỗi 3 chiêu, trúng đòn, lăn, đả tọa.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { list, size } from '../lib/env';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const QUERY: Record<string, Record<string, string>> = { old: { chr: 'v3', v3anim: '0' }, new: { chr: 'v3' }, noarm: { chr: 'v3', armfit: '0' } };

// Đo xuyên: đỉnh có xương tay (upperarm/lowerarm/hand) trội nằm trong viên nang thân (pelvis → neck). Chuỗi JS thuần (tsx chèn __name).
const PEN_INSTALL = `(() => {
  const g = window.__game; const e = g.ents.players.get(g.sid); const m = e.model; const rig = m.rig;
  const V = rig.position.constructor;
  const mesh = m.lods[0].find((x) => x.isSkinnedMesh);
  const sk = mesh.skeleton; const names = sk.bones.map((b) => b.name);
  const armBones = new Set(names.map((n, i) => (/^(upperarm|lowerarm|hand)_(l|r)$/.test(n) ? i : -1)).filter((i) => i >= 0));
  const si = mesh.geometry.attributes.skinIndex; const sw = mesh.geometry.attributes.skinWeight;
  const arm = [];
  for (let i = 0; i < si.count; i++) { let w = 0; for (let k = 0; k < 4; k++) if (armBones.has(si.getComponent(i, k))) w += sw.getComponent(i, k); if (w > 0.6) arm.push(i); }
  const step = Math.max(1, Math.floor(arm.length / 900)); const pick = arm.filter((_, i) => i % step === 0);
  const get = (n) => rig.getObjectByName(n);
  const segs = [['pelvis', 'spine_02', 0.15], ['spine_02', 'spine_03', 0.16], ['spine_03', 'neck_01', 0.13]];
  const H = m.height / 1.8;
  const a = new V(), b = new V(), p = new V(), ab = new V(), ap = new V();
  const w = { name: '', byName: {} };
  window.__pen = w;
  window.__penSample = () => {
    sk.update();
    let n = 0;
    for (const i of pick) {
      mesh.getVertexPosition(i, p); p.applyMatrix4(mesh.matrixWorld);
      for (const [s0, s1, r] of segs) {
        get(s0).getWorldPosition(a); get(s1).getWorldPosition(b);
        ab.subVectors(b, a); ap.subVectors(p, a);
        const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(1e-6, ab.lengthSq())));
        a.addScaledVector(ab, t);
        if (p.distanceTo(a) < r * H) { n++; break; }
      }
    }
    const o = (w.byName[w.name] ??= { sum: 0, n: 0 }); o.sum += n; o.n++;
  };
  setInterval(() => { if (w.name) window.__penSample(); }, 120);
  return pick.length;
})()`;

export default {
  name: 'chrv3anim',
  desc: 'Animation nhân vật v3: video cũ | mới theo tình huống có nhãn (đứng, chạy, rẽ gấp, chạy+chém, chuỗi 3 chiêu, trúng đòn, lăn, đả tọa) + đo tay xuyên thân',
  usage: '[--genders m,f] [--variants old,new,noarm] [--size 960x600] [--nopen]',
  async run(r) {
    const viewport = size('960x600');
    const variants = list('--variants', 'old,new');
    const genders = list('--genders', 'm,f');
    const pen = !process.argv.includes('--nopen');
    for (const g of genders) {
      for (const v of variants) {
        const tag = `${g === 'm' ? 'nam' : 'nu'}-${v}`;
        const dir = path.join(r.out, `_rec-${tag}`);
        const t0 = Date.now();
        const { ctx, page } = await r.open({ name: `A${g}${v}`, viewport, quality: 'high', look: { g }, query: QUERY[v] ?? {}, hide: 'hud', warnings: /models|chr_v3|clip/, video: dir });
        await gm(page, 'level 12', 1500);
        await gm(page, 'god on', 1200);
        await gm(page, 'set set_lac_kiem', 1200);
        await gm(page, 'killall', 800);
        await gm(page, 'tp 2048 2088', 1500);
        await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, { timeout: 60_000, polling: 300 });
        await sleep(3500); // chờ nguồn pose K-5 nướng
        if (pen) await page.evaluate(PEN_INSTALL);
        const frame = () => cam(page, { yaw: 0.5, pitch: 0.08, dist: 3.6 });
        await frame();
        const label = async (text: string) => {
          await page.evaluate(
            ([t, vtag]) => {
              let d = document.getElementById('anim-label');
              if (!d) {
                d = document.createElement('div');
                d.id = 'anim-label';
                d.style.cssText = 'position:fixed;left:12px;top:10px;z-index:99999;padding:6px 12px;background:#000a;color:#fff;font:600 20px sans-serif;border-radius:6px;pointer-events:none';
                document.body.appendChild(d);
              }
              d.textContent = `${vtag} · ${t}`;
              (window as unknown as { __pen?: { name: string } }).__pen && ((window as unknown as { __pen: { name: string } }).__pen.name = t);
            },
            [text, v === 'old' ? 'CŨ' : v === 'new' ? 'MỚI' : 'MỚI (không bù tay)'] as const,
          );
        };
        const tScene = Date.now();
        const key = async (k: string, ms: number) => {
          await page.keyboard.down(k);
          await sleep(ms);
          await page.keyboard.up(k);
        };
        await label('đứng yên');
        await sleep(3000);
        await label('chạy');
        await key('KeyW', 3000);
        await label('đứng lại');
        await sleep(1500);
        await label('rẽ gấp (vuông)');
        await frame();
        for (const k of ['KeyW', 'KeyD', 'KeyS', 'KeyA']) await key(k, 1000);
        await sleep(800);
        await frame();
        await gm(page, 'spawn mon_soi_xam 2', 1500);
        await frame();
        await label('chạy + chém');
        await page.keyboard.down('KeyW');
        for (const slot of [1, 2, 3, 1]) {
          await page.evaluate((n) => window.__game!.useSkill(n), slot);
          await sleep(900);
        }
        await page.keyboard.up('KeyW');
        await sleep(500);
        await frame();
        await label('chuỗi 3 chiêu (đứng)');
        for (const slot of [1, 2, 3]) {
          await page.evaluate((n) => window.__game!.useSkill(n), slot);
          await sleep(1100);
        }
        await gm(page, 'killall', 700);
        await label('trúng đòn (nhẹ, nặng)');
        for (const heavy of [false, true]) {
          await page.evaluate((hv) => {
            const g2 = window.__game!;
            const m = g2.ents.players.get(g2.sid).model;
            const y = m.root.rotation.y;
            m.hitReact({ dirX: -Math.sin(y), dirZ: -Math.cos(y), heavy: hv, crit: hv });
          }, heavy);
          await sleep(1500);
        }
        await label('lăn / lướt (Q)');
        await key('KeyW', 300);
        await page.keyboard.press('KeyQ');
        await sleep(1500);
        await label('ngã rồi dậy');
        await page.evaluate(() => window.__game!.ents.players.get(window.__game!.sid).model.knockdown());
        await sleep(3000);
        await frame();
        await label('ngồi đả tọa');
        await page.keyboard.press('KeyZ');
        await sleep(3500);
        await page.keyboard.press('KeyW');
        await sleep(800);
        if (pen) {
          const res = (await page.evaluate(`(() => { const o = {}; for (const [k, v] of Object.entries(window.__pen.byName)) o[k] = { samples: v.n, meanArmVertsInTorso: +(v.sum / v.n).toFixed(2) }; return o; })()`)) as unknown;
          fs.writeFileSync(path.join(r.out, `pen-${tag}.json`), JSON.stringify(res, null, 1));
          console.log(`[shots:chrv3anim] pen ${tag}: ${JSON.stringify(res)}`);
        }
        const vid = page.video();
        await ctx.close();
        if (vid) {
          const raw = await vid.path();
          const dst = path.join(r.out, `${tag}.webm`);
          const ss = Math.max(0, (tScene - t0) / 1000 - 0.3);
          const cut = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-i', raw, '-c:v', 'libvpx', '-b:v', '1.5M', '-an', dst]);
          if (cut.status !== 0) fs.copyFileSync(raw, dst);
        }
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`[shots:chrv3anim] ${tag}.webm`);
      }
      // Ghép trái (cũ) | phải (mới).
      if (variants.includes('old') && variants.includes('new')) {
        const sx = `${r.out}/${g === 'm' ? 'nam' : 'nu'}`;
        const res = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', `${sx}-old.webm`, '-i', `${sx}-new.webm`, '-filter_complex', 'hstack=inputs=2', '-c:v', 'libvpx', '-b:v', '3M', '-an', `${sx}-cu-moi.webm`]);
        console.log(`[shots:chrv3anim] ghép ${g}: ${res.status === 0 ? 'ok' : 'lỗi ' + res.stderr}`);
      }
    }
  },
} satisfies Scenario;
