// Animation nhân vật v3 (Lạc Kiếm v3b): quay RIÊNG từng bản (cũ = `?v3anim=0`, mới), mỗi tình huống 3,5 s có nhãn, ghi mốc đầu từng tình huống,
// rồi cắt cùng tình huống từ hai bản và xếp trái (cũ) | phải (mới), nối lần lượt (FFMPEG=đường dẫn, mặc định ffmpeg trong PATH).
// Camera gần, toàn thân ~60% chiều cao khung; chạy/rẽ/chạy+chém có hai góc (3/4 trước và ngang). Kèm đo "đỉnh tay nằm trong khối thân"
// (xuyên ống tay) theo từng tình huống: `pen-<giới>-<bản>.json`.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { list, size } from '../lib/env';
import { cam, gm } from '../lib/game';
import type { Scenario } from '../lib/scenario';

const DUR = 3500;
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const QUERY: Record<string, Record<string, string>> = {
  old: { chr: 'v3', v3anim: '0' },
  new: { chr: 'v3' },
  noarm: { chr: 'v3', armfit: '0' },
};

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
  desc: 'Animation nhân vật v3: video cũ | mới ghép theo mốc từng tình huống (3,5 s, toàn thân, hai góc) + đo tay xuyên thân',
  usage: '[--genders m,f] [--variants old,new,noarm] [--group all|base|loco] [--sit <tên chứa>] [--size 960x600] [--nopen]',
  async run(r) {
    const viewport = size('960x600');
    const variants = list('--variants', 'old,new');
    const genders = list('--genders', 'm,f');
    const pen = !process.argv.includes('--nopen');
    const group = list('--group', 'all')[0]!;
    for (const g of genders) {
      const gname = g === 'm' ? 'nam' : 'nu';
      for (const v of variants) {
        const tag = `${gname}-${v}`;
        const t0 = Date.now();
        const { ctx, page } = await r.open({
          name: `A${g}${v}`,
          viewport,
          quality: 'high',
          look: { g },
          query: QUERY[v] ?? {},
          hide: 'hud',
          warnings: /models|chr_v3|clip/,
          video: path.join(r.out, `_rec-${tag}`),
        });
        await gm(page, 'level 12', 1500);
        await gm(page, 'god on', 1200);
        await gm(page, 'set set_lac_kiem', 1200);
        await gm(page, 'killall', 800);
        await gm(page, 'tp 2048 2088', 1500);
        await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, {
          timeout: 60_000,
          polling: 300,
        });
        await sleep(3500); // chờ nguồn pose K-5 nướng
        if (pen) await page.evaluate(PEN_INSTALL);
        // Toàn thân ~60% chiều cao khung: camera gần.
        const frame = () => cam(page, { yaw: 0.5, pitch: 0.1, dist: 2.7 });
        await frame();
        const vtag = v === 'old' ? 'CŨ' : v === 'new' ? 'MỚI' : 'MỚI (không bù tay)';
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
              const w = (window as unknown as { __pen?: { name: string } }).__pen;
              if (w) w.name = t;
            },
            [text, vtag] as const,
          );
        const hold = async (keys: string[], ms: number) => {
          for (const k of keys) await page.keyboard.down(k);
          await sleep(ms);
          for (const k of keys) await page.keyboard.up(k);
        };
        const useSkill = (n: number) => page.evaluate((x) => window.__game!.useSkill(x), n);
        const hit = (hv: boolean) =>
          page.evaluate((h) => {
            const g2 = window.__game!;
            const m = g2.ents.players.get(g2.sid).model;
            const y = m.root.rotation.y;
            m.hitReact({ dirX: -Math.sin(y), dirZ: -Math.cos(y), heavy: h, crit: h });
          }, hv);
        // Phím chạy tương đối camera: S+D = chạy chếch về phía camera (3/4 trước), D = chạy ngang màn hình (góc ngang).
        const FRONT = ['KeyS', 'KeyD'];
        const BACKL = ['KeyS', 'KeyA'];
        interface Sit {
          name: string;
          prep?: () => Promise<void>;
          /** Camera riêng của tình huống (mặc định `frame`). */
          cam?: () => Promise<void>;
          run: () => Promise<void>;
        }
        const slash = async (keys: string[]) => {
          for (const k of keys) await page.keyboard.down(k);
          for (const slot of [1, 2, 3, 1]) {
            await useSkill(slot);
            await sleep(DUR / 4);
          }
          for (const k of keys) await page.keyboard.up(k);
        };
        const sits: Sit[] = [
          { name: 'đứng yên (3/4 trước)', run: async () => void (await sleep(DUR)) },
          { name: 'chạy (3/4 trước)', run: () => hold(FRONT, DUR) },
          { name: 'chạy (góc ngang)', run: () => hold(['KeyD'], DUR) },
          {
            name: 'rẽ gấp (3/4 trước)',
            run: async () => {
              for (const ks of [FRONT, BACKL, FRONT, BACKL]) await hold(ks, DUR / 4);
            },
          },
          {
            name: 'rẽ gấp (góc ngang)',
            run: async () => {
              for (const ks of [['KeyD'], ['KeyW'], ['KeyD'], ['KeyS']]) await hold(ks, DUR / 4);
            },
          },
          {
            name: 'chạy + chém (3/4 trước)',
            prep: async () => {
              await gm(page, 'spawn mon_soi_xam 2', 1500);
            },
            run: () => slash(FRONT),
          },
          { name: 'chạy + chém (góc ngang)', run: () => slash(['KeyD']) },
          {
            name: 'chuỗi 3 chiêu (đứng)',
            run: async () => {
              for (const slot of [1, 2, 3]) {
                await useSkill(slot);
                await sleep(DUR / 3);
              }
            },
          },
          {
            name: 'trúng đòn (nhẹ rồi nặng)',
            prep: async () => {
              await gm(page, 'killall', 700);
            },
            run: async () => {
              await sleep(300);
              await hit(false);
              await sleep(1500);
              await hit(true);
              await sleep(DUR - 1800);
            },
          },
          {
            name: 'lăn / lướt (Q)',
            run: async () => {
              await hold(FRONT, 400);
              await page.keyboard.press('KeyQ');
              await sleep(DUR - 400);
            },
          },
          {
            name: 'ngã rồi dậy',
            run: async () => {
              await sleep(200);
              await page.evaluate(() => window.__game!.ents.players.get(window.__game!.sid).model.knockdown());
              await sleep(DUR - 200);
            },
          },
          {
            name: 'ngồi đả tọa',
            run: async () => {
              await sleep(300);
              await page.keyboard.press('KeyZ');
              await sleep(DUR - 300);
              await page.keyboard.press('KeyW');
            },
          },
        ];
        // A1: đi lùi / đi ngang / chéo khi nhân vật nhìn mục tiêu. Khóa hướng mặt của nhân vật (chỉ trong trang, không đổi mã game) về phía
        // camera, camera đặt trước mặt: phím theo camera nên W = lùi, S = tiến, D = sang trái nhân vật, A = sang phải (góc đo được in ra log).
        const lockFacing = () =>
          page.evaluate(
            `(() => { const g = window.__game; const f = g.camYaw; Object.defineProperty(g, 'facing', { configurable: true, get() { return f; }, set() {} }); })()`,
          );
        const locoSit = (name: string, keys: string[], slash = false): Sit => ({
          name,
          prep: async () => {
            await gm(page, 'killall', 800);
            await gm(page, 'tp 2048 2088', 1500); // cùng chỗ khởi đầu cho mọi tình huống và hai bản (không phụ thuộc chỗ đã chạy tới)
            if (slash) {
              await gm(page, 'spawn mon_soi_xam 1', 1500);
              await page.evaluate(
                `(() => { const g = window.__game; const e = [...g.view.monsters.entries()].sort((p, q) => Math.hypot(p[1].x - g.cur.x, p[1].z - g.cur.z) - Math.hypot(q[1].x - g.cur.x, q[1].z - g.cur.z))[0]; if (e) g.setTarget(e[0], 'mon'); })()`,
              );
            }
            await cam(page, { yaw: 0.9, pitch: 0.3, dist: 3.6 });
            await lockFacing();
            await sleep(300);
          },
          cam: async () => void (await sleep(1)),
          run: async () => {
            for (const k of keys) await page.keyboard.down(k);
            const end = Date.now() + DUR;
            while (Date.now() < end) {
              await sleep(DUR / 4);
              if (slash) await useSkill(1); // nửa trên đánh, chân giữ clip lùi
            }
            for (const k of keys) await page.keyboard.up(k);
          },
        });
        const locoSits: Sit[] = [
          locoSit('đi lùi', ['KeyW']),
          locoSit('đi ngang trái', ['KeyD']),
          locoSit('đi ngang phải', ['KeyA']),
          locoSit('chéo lùi-trái', ['KeyW', 'KeyD']),
          locoSit('chéo lùi-phải', ['KeyW', 'KeyA']),
          locoSit('lùi + chém', ['KeyW'], true),
        ];
        const pick = list('--sit', '')[0];
        const chosen = (group === 'base' ? sits : group === 'loco' ? locoSits : [...sits, ...locoSits]).filter(
          (x) => !pick || x.name.includes(pick),
        );
        const marks: { name: string; at: number }[] = [];
        await hold(FRONT, 350); // quay mặt về phía camera
        await sleep(700);
        for (const sit of chosen) {
          if (sit.prep) await sit.prep();
          await (sit.cam ?? frame)();
          await setLabel(sit.name);
          await sleep(150);
          marks.push({ name: sit.name, at: (Date.now() - t0) / 1000 });
          // Giữa tình huống: đọc góc hướng đi mà model nhận (kiểm tra kịch bản đúng hướng, ghi vào log).
          const probe = (async () => {
            await sleep(DUR / 2);
            return page.evaluate(() => {
              const g = window.__game!;
              const a = (g.ents.players.get(g.sid).model as { lastAnim?: { moveAngle?: number; speed: number } }).lastAnim;
              const f = (g as unknown as { facing: number }).facing;
              return { tgt: g.targetId, ang: a?.moveAngle, spd: a?.speed, fac: f, cam: g.camYaw };
            });
          })();
          await sit.run();
          const pr = await probe;
          console.log(
            `[shots:chrv3anim] ${tag} · ${sit.name}: góc ${pr.ang === undefined ? '—' : ((pr.ang * 180) / Math.PI).toFixed(0) + '°'}, tốc độ ${pr.spd?.toFixed(1)}, mục tiêu ${pr.tgt || 'không'}, facing ${pr.fac?.toFixed(2)}, camYaw ${pr.cam.toFixed(2)}`,
          );
          await sleep(500);
        }
        if (pen) {
          const res = (await page.evaluate(
            `(() => { const o = {}; for (const [k, v] of Object.entries(window.__pen.byName)) o[k] = { samples: v.n, meanArmVertsInTorso: +(v.sum / v.n).toFixed(2) }; return o; })()`,
          )) as unknown;
          fs.writeFileSync(path.join(r.out, `pen-${tag}.json`), JSON.stringify(res, null, 1));
        }
        const vid = page.video();
        await ctx.close();
        if (vid) {
          fs.copyFileSync(await vid.path(), path.join(r.out, `_raw-${tag}.webm`));
          fs.writeFileSync(path.join(r.out, `_marks-${tag}.json`), JSON.stringify(marks));
        }
        fs.rmSync(path.join(r.out, `_rec-${tag}`), { recursive: true, force: true });
        console.log(`[shots:chrv3anim] ${tag} quay xong, ${marks.length} tình huống`);
      }
      // Ghép theo mốc đầu từng tình huống (cùng tình huống, cùng thời điểm bắt đầu): trái cũ | phải mới.
      if (variants.includes('old') && variants.includes('new')) {
        const mo = JSON.parse(fs.readFileSync(path.join(r.out, `_marks-${gname}-old.json`), 'utf8')) as { at: number }[];
        const mn = JSON.parse(fs.readFileSync(path.join(r.out, `_marks-${gname}-new.json`), 'utf8')) as { at: number }[];
        const parts: string[] = [];
        const outs: string[] = [];
        mo.forEach((m, n) => {
          parts.push(`[0:v]trim=start=${m.at.toFixed(2)}:duration=${DUR / 1000},setpts=PTS-STARTPTS[o${n}]`);
          parts.push(`[1:v]trim=start=${mn[n].at.toFixed(2)}:duration=${DUR / 1000},setpts=PTS-STARTPTS[n${n}]`);
          parts.push(`[o${n}][n${n}]hstack[h${n}]`);
          outs.push(`[h${n}]`);
        });
        parts.push(`${outs.join('')}concat=n=${mo.length}:v=1:a=0[v]`);
        const res = spawnSync(FFMPEG, [
          '-y',
          '-loglevel',
          'error',
          '-i',
          path.join(r.out, `_raw-${gname}-old.webm`),
          '-i',
          path.join(r.out, `_raw-${gname}-new.webm`),
          '-filter_complex',
          parts.join(';'),
          '-map',
          '[v]',
          '-c:v',
          'libvpx',
          '-b:v',
          '3M',
          '-an',
          path.join(r.out, `${gname}-cu-moi.webm`),
        ]);
        console.log(`[shots:chrv3anim] ghép ${gname}: ${res.status === 0 ? 'ok' : 'lỗi ' + res.stderr}`);
      }
    }
  },
} satisfies Scenario;
