// Duyệt bộ v3 bậc cao (NV3-B): MỖI (bộ × giới) → (1) đứng 4 góc (trước/trái/phải/sau) ở 720p + 1080p, ghép cạnh ảnh multiview Thiên Giai
// (`<dtl-asset-source>/2d/hoa-truc/thien_giai/<bộ>_<giới>_{front,left,right,back}.png`); (2) tờ chuyển động PNG (đứng, chạy, lùi, ngang,
// chém, trúng đòn, bay (ngự kiếm), ngồi đả tọa). Không cần ffmpeg: ghép bằng `sheet()` (HTML phụ). Ra `<out>/<bộ>-<giới>-{goc,chuyendong}.png`
// và `<out>/<bộ>-<giới>-goc-{720p,1080p}.jpg`.
// Dùng: pnpm shots v3views --out <thư mục tuyệt đối> [--sets kinh_quang,liet_mach,tinh_khuyet] [--genders m,f] [--ref <thư mục multiview>]
import fs from 'node:fs';
import path from 'node:path';
import { env, list } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, gm } from '../lib/game';
import { sheet, type SheetRow } from '../lib/shot';
import type { Scenario } from '../lib/scenario';

/** key (tên file multiview + tên asset `chr_v3_<key>_*`) → id bộ trong sets.json + nhãn. Tên ảnh multiview khác key ở Địa Long (`dia_giap`). */
const SETS: Record<string, { gm: string; label: string; ref: string }> = {
  kinh_quang: { gm: 'set set_kinh_quang', label: 'Kính Quang Kiếm Y', ref: 'kinh_quang' },
  liet_mach: { gm: 'set set_liet_mach', label: 'Liệt Mạch Kiếm Y', ref: 'liet_mach' },
  tinh_khuyet: { gm: 'set set_tinh_khuyet', label: 'Tinh Khuyết Kiếm Bào', ref: 'tinh_khuyet' },
  co_thanh: { gm: 'set set_co_thanh', label: 'Cổ Thành Huyền Giáp', ref: 'co_thanh' },
  dia_long: { gm: 'set set_dia_giap', label: 'Địa Long Hộ Giáp', ref: 'dia_giap' },
  van_kinh: { gm: 'set set_van_kinh', label: 'Vạn Kinh Thiết Giáp', ref: 'van_kinh' },
  luu_ly: { gm: 'set set_luu_ly', label: 'Lưu Ly Đan Y', ref: 'luu_ly' },
  phuc_mach: { gm: 'set set_phuc_mach', label: 'Phục Mạch Đan Bào', ref: 'phuc_mach' },
  than_tang: { gm: 'set set_than_tang', label: 'Thần Tàng Đan Bào', ref: 'than_tang' },
};
const REF_DIR = 'D:/METAGRIT/dtl-asset-source/2d/hoa-truc/thien_giai';
/** Góc camera so với hướng nhân vật (`facing`): 0 = sau lưng. Mặt trước/trái/phải suy ra từ thử nghiệm (`--yaws` ghi đè để chỉnh). */
const DEFAULT_YAWS = '3.1416,0,-1.5708,1.5708'; // [sau, trước, trái, phải] so với hướng nhân vật (đo bằng thử: camera cùng hướng root.rotation.y = nhìn thấy mặt trước)

export default {
  name: 'v3views',
  desc: 'Bộ v3 bậc cao: đứng 4 góc 720p/1080p cạnh ảnh multiview + tờ chuyển động (chạy, lùi, ngang, chém, trúng đòn, bay, ngồi)',
  usage: '--out <dir> [--sets kinh_quang,…] [--genders m,f] [--yaws sau,truoc,a,b]',
  async run(r) {
    const genders = list('--genders', 'm,f');
    const sets = list('--sets', 'kinh_quang,liet_mach,tinh_khuyet');
    const [yBack, yFront, yA, yB] = list('--yaws', DEFAULT_YAWS).map(Number);
    const refDir = env('V3_REF_DIR', REF_DIR);
    for (const g of genders) {
      const gname = g === 'm' ? 'nam' : 'nu';
      for (const s of sets) {
        const S = SETS[s];
        if (!S) throw new Error(`bộ không biết: ${s}`);
        const tag = `${s}-${gname}`;
        const { ctx, page } = await r.open({
          name: `V${g}${s}`,
          viewport: [1280, 720],
          quality: 'high',
          look: { g },
          query: { chr: 'v3', ...(env('V3_CLOTH', '') === '1' ? { cloth: '1' } : {}), ...Object.fromEntries(new URLSearchParams(env('V3_QUERY', '')).entries()) }, // V3_CLOTH=1: vải mô phỏng Thiên Y
          hide: 'hud',
          warnings: /models|chr_v3|clip/,
        });
        await gm(page, 'level 12', 1500);
        await gm(page, 'god on', 1200);
        await gm(page, S.gm, 1500);
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
        console.log(`[shots:v3views] ${tag}: asset ${asset}`);
        if (!asset.startsWith(`chr_v3_${s}_`)) console.log(`[shots:v3views] CẢNH BÁO ${tag}: asset ${asset} không phải model riêng của bộ`);

        await page.evaluate(() => {
          const g = window.__game!;
          const ent = g.ents.players.get(g.sid);
          ent.model.root.remove(ent.label); // nhãn tên che nhân vật: gỡ khỏi cây cảnh (engine chỉ gắn lại khi đổi tên)
        });
        // (1) đứng 4 góc, 720p + 1080p. Camera gần, chiều cao nhân vật vừa khung.
        const facing = await page.evaluate(() => window.__game!.facing as number);
        const base = facing;
        const views: Record<string, number> = { front: base + yFront, back: base + yBack, left: base + yA, right: base + yB };
        const fixed: Record<string, Buffer> = {};
        for (const [tagSize, [w, h]] of Object.entries({ '720p': [1280, 720], '1080p': [1920, 1080] }) as [string, [number, number]][]) {
          await page.setViewportSize({ width: w, height: h });
          const strip: Buffer[] = [];
          for (const v of ['front', 'left', 'right', 'back']) {
            await cam(page, { yaw: views[v], pitch: 0.02, dist: 1.9 });
            await sleep(900);
            const b = await page.screenshot({ clip: { x: w / 2 - h * 0.3, y: 0, width: h * 0.6, height: h } });
            fs.writeFileSync(path.join(r.out, `${tag}-${v}-${tagSize}.png`), b);
            strip.push(b);
            if (tagSize === '1080p') fixed[v] = b;
          }
          const rows: SheetRow[] = [{ label: `game ${tagSize}: trước · trái · phải · sau`, cells: strip.map((b, i) => ({ img: b, caption: ['front', 'left', 'right', 'back'][i] })) }];
          const refs = ['front', 'left', 'right', 'back'].map((v) => path.join(refDir, `${S.ref}_${gname}_${v}.png`));
          if (refs.every((f) => fs.existsSync(f)))
            rows.push({ label: 'ảnh multiview (Thiên Giai)', cells: refs.map((f, i) => ({ img: fs.readFileSync(f), caption: ['front', 'left', 'right', 'back'][i] })) });
          await sheet(ctx, path.join(r.out, `${tag}-goc-${tagSize}.png`), rows, { cell: tagSize === '1080p' ? 420 : 300, ratio: 1.45, title: `${S.label} (${gname}) · ${asset}` });
        }
        await page.setViewportSize({ width: 1280, height: 720 });

        // (1b) cận mặt + bàn tay trong game (so với render Blender của GLB gốc: `chr_v3.py --debug-faces`).
        await page.setViewportSize({ width: 960, height: 960 });
        for (const [nm, dist, pitch, yawAdd] of [['face', 0.62, -0.02, 0], ['face34', 0.62, -0.02, 0.5], ['hand', 0.9, 0.35, 0]] as const) {
          await cam(page, { yaw: base + yFront + yawAdd, pitch, dist });
          await sleep(900);
          fs.writeFileSync(path.join(r.out, `${tag}-${nm}.png`), await page.screenshot());
        }
        await page.setViewportSize({ width: 2000, height: 2000 });
        await cam(page, { yaw: base + yFront, pitch: 0.0, dist: 2.4 });
        await sleep(1200);
        fs.writeFileSync(path.join(r.out, `${tag}-facefar.png`), await page.screenshot());
        const dbg = await page.evaluate(() => {
          const g = window.__game!;
          const m = g.ents.players.get(g.sid).model;
          const hd = m.rig.getObjectByName('Head');
          const nk = m.rig.getObjectByName('neck_01');
          const V = m.rig.position.constructor as new () => { x: number; y: number; z: number };
          const h = hd!.getWorldPosition(new V() as never) as unknown as { x: number; y: number; z: number };
          const n = nk!.getWorldPosition(new V() as never) as unknown as { x: number; y: number; z: number };
          return { clip: (m as unknown as { baseName?: string }).baseName, headY: Math.round(h.y * 100) / 100, neckY: Math.round(n.y * 100) / 100, dz: Math.round((h.z - n.z) * 100) / 100, camPitch: g.camPitch };
        });
        console.log(`[shots:v3views] ${tag} dbg: ${JSON.stringify(dbg)}`);
        await page.setViewportSize({ width: 1280, height: 720 });

        // (2) tờ chuyển động.
        const hold = async (keys: string[], ms: number) => {
          for (const k of keys) await page.keyboard.down(k);
          await sleep(ms);
          for (const k of keys) await page.keyboard.up(k);
        };
        const clip = { x: 1280 / 2 - 230, y: 40, width: 460, height: 640 };
        const shot = (): Promise<Buffer> => page.screenshot({ clip });
        const cells: { img: Buffer; caption: string; mark?: boolean }[] = [];
        const add = async (cap: string, mark = false) => cells.push({ img: await shot(), caption: cap, mark });
        const frame = () => cam(page, { yaw: base + 0.5, pitch: 0.1, dist: 2.1 });
        await frame();
        await sleep(500);
        await add('đứng');
        await page.keyboard.down('KeyW');
        await sleep(900);
        await add('chạy 1');
        await sleep(350);
        await add('chạy 2');
        await page.keyboard.up('KeyW');
        await page.keyboard.down('KeyS');
        await sleep(900);
        await add('lùi');
        await page.keyboard.up('KeyS');
        await page.keyboard.down('KeyD');
        await sleep(900);
        await add('ngang phải');
        await page.keyboard.up('KeyD');
        await page.keyboard.down('KeyA');
        await sleep(900);
        await add('ngang trái');
        await page.keyboard.up('KeyA');
        await gm(page, 'spawn mon_soi_xam 2', 1500);
        await frame();
        const useSkill = (n: number) => page.evaluate((x) => window.__game!.useSkill(x), n);
        for (const slot of [1, 2, 3]) {
          await useSkill(slot);
          await sleep(260);
          await add(`chém ${slot}`);
          await sleep(500);
        }
        await gm(page, 'killall', 800);
        await hold(['KeyS', 'KeyD'], 400);
        await page.keyboard.press('KeyQ');
        await sleep(280);
        await add('lướt');
        await sleep(900);
        const hitReact = (heavy: boolean) =>
          page.evaluate((hv) => {
            const g = window.__game!;
            const m = g.ents.players.get(g.sid).model;
            const y = m.root.rotation.y as number;
            m.hitReact({ dirX: -Math.sin(y), dirZ: -Math.cos(y), noStop: true, heavy: hv, crit: hv });
          }, heavy);
        await sleep(600);
        await hitReact(false);
        await sleep(250);
        await add('trúng đòn nhẹ');
        await sleep(900);
        await hitReact(true);
        await sleep(300);
        await add('trúng đòn nặng');
        await sleep(1500);
        await page.keyboard.press('KeyZ');
        await sleep(1900);
        await add('ngồi đả tọa');
        await page.keyboard.press('KeyW');
        await sleep(900);
        await page.evaluate(() => window.__game!.toggleFly());
        await sleep(1200);
        await add('bay (ngự kiếm)');
        await page.keyboard.down('KeyW');
        await sleep(1200);
        await add('bay tiến');
        await page.keyboard.up('KeyW');
        const rows: SheetRow[] = [];
        for (let i = 0; i < cells.length; i += 5) rows.push({ label: i === 0 ? `${S.label} (${gname}) · ${asset}` : '', cells: cells.slice(i, i + 5) });
        await sheet(ctx, path.join(r.out, `${tag}-chuyendong.png`), rows, { cell: 300, ratio: 1.39 });
        const bones = await page.evaluate(() => {
          const g = window.__game!;
          const m = g.ents.players.get(g.sid).model;
          const y0 = m.root.position.y;
          const out: Record<string, number[]> = {};
          for (const n of ['pelvis', 'spine_03', 'neck_01', 'Head', 'dtl_scabbard', 'hand_l']) {
            const o = m.rig.getObjectByName(n);
            if (o) {
              const v = o.getWorldPosition(new (o.position.constructor as new () => { x: number; y: number; z: number; sub: (v: unknown) => unknown })() as never) as unknown as { x: number; y: number; z: number };
              out[n] = [Math.round((v.y - y0) * 100) / 100];
            }
          }
          return out;
        });
        const tex = await page.evaluate(() => {
          const g = window.__game!;
          const m = g.ents.players.get(g.sid).model;
          const out: string[] = [];
          m.rig.traverse((o: { isMesh?: boolean; material?: { map?: { image?: { width: number; height: number }; colorSpace?: string } | null; roughness?: number; metalness?: number }; name: string; visible: boolean }) => {
            if (o.isMesh && o.visible && o.material?.map) out.push(`${o.name}: ${o.material.map.image?.width}x${o.material.map.image?.height} ${o.material.map.colorSpace} r=${o.material.roughness} m=${o.material.metalness}`);
          });
          return out;
        });
        console.log(`[shots:v3views] ${tag} texture: ${tex.join(' | ')}`);
        console.log(`[shots:v3views] ${tag} xương (cao so với chân, m): ${JSON.stringify(bones)}`);
        const cst = await page.evaluate(() => {
          const g = window.__game!;
          return g.ents.players.get(g.sid).model.cloth?.stats ?? null;
        });
        console.log(`[shots:v3views] ${tag} vải mô phỏng: ${cst ? `${cst.verts} đỉnh, ${cst.ms.toFixed(3)} ms/khung (trung bình trượt)` : 'tắt'}`);
        await ctx.close();
        console.log(`[shots:v3views] ${tag} xong`);
      }
    }
  },
} satisfies Scenario;
