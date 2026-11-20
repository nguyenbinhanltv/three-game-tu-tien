// IK chân bám dốc của nhân vật v3 (NV3-A2): ảnh đứng yên TRƯỚC (`?v3feet=0`) và SAU (mặc định) cùng điểm, cùng góc, ở 720p và 1080p:
// dốc đất, bậc thang tông môn (Lạc Kiếm Tông), mép phiến đá, Cầu Đá Gãy (Đoạn Mạch); chuỗi 15 khung đi lên bậc; tờ so sánh.
//   pnpm shots chrv3feet --out <thư mục> [--genders m] [--sizes 720p,1080p] [--spots slope,stairs,rock,bridge] [--frames 15]
import path from 'node:path';
import { type BoxShape, collisionOf, terrainOf } from '@dtl/shared';
import { sleep } from '../lib/devserver';
import { list, opt } from '../lib/env';
import { cam, enterLevel, gm, skipCutscene, tp } from '../lib/game';
import { requireLevel } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';
import { centerClip, type SheetRow, sheet, snap, UI_SIZES, writeJson } from '../lib/shot';

interface Spot {
  id: string;
  level: string;
  x: number;
  z: number;
  /** Hướng nhìn của nhân vật (rad, atan2(dz, dx) thế giới) khi đứng. */
  face: number;
}

/** Điểm dốc đất ~20–27° gần tông môn, không có vật rắn gần. */
function slopeSpot(): Spot {
  requireLevel('van_lam');
  const t = terrainOf('van_lam');
  const shapes = collisionOf('van_lam').shapes;
  let best: { x: number; z: number; s: number } | null = null;
  for (let x = 1900; x < 2200; x += 4)
    for (let z = 2150; z < 2500; z += 4) {
      const gx = (t.groundAt(x + 1, z) - t.groundAt(x - 1, z)) / 2;
      const gz = (t.groundAt(x, z + 1) - t.groundAt(x, z - 1)) / 2;
      const s = Math.hypot(gx, gz);
      if (s < 0.36 || s > 0.5 || shapes.some((h) => Math.hypot(h.x - x, h.z - z) < 6)) continue;
      if (!best || s > best.s) best = { x, z, s };
    }
  const b = best ?? { x: 2048, z: 2200, s: 0 };
  return { id: 'slope', level: 'van_lam', x: b.x, z: b.z, face: Math.PI / 2 };
}

/** Mép đá: phiến đá đi được gần nhất tâm tông môn; đứng sát mép +x cục bộ để một chân trên, một chân dưới. */
function rockSpot(): Spot {
  requireLevel('van_lam');
  const rocks = collisionOf('van_lam').shapes.filter(
    (s): s is BoxShape => s.k === 'box' && s.walk !== false && s.tag === 'prop_da_phien' && s.hx > 0.8 && s.hx < 4,
  );
  rocks.sort((a, b) => Math.hypot(a.x - 2048, a.z - 2400) - Math.hypot(b.x - 2048, b.z - 2400));
  const s = rocks[0] ?? ({ x: 2002, z: 2377, hx: 1, hz: 1, yaw: 0 } as BoxShape);
  const d = s.hx - 0.1;
  return { id: 'rock', level: 'van_lam', x: s.x + Math.cos(s.yaw) * d, z: s.z - Math.sin(s.yaw) * d, face: Math.PI / 2 };
}

function spots(): Spot[] {
  requireLevel('doan_mach');
  const br = collisionOf('doan_mach').shapes.find((s) => s.k === 'box' && s.tag === 'prop_cau_da_gay' && s.y1b !== undefined) as BoxShape | undefined;
  const bridge: Spot = br
    ? { id: 'bridge', level: 'doan_mach', x: br.x + Math.sin(br.yaw) * br.hz * 0.2, z: br.z + Math.cos(br.yaw) * br.hz * 0.2, face: Math.atan2(Math.cos(br.yaw), Math.sin(br.yaw)) }
    : { id: 'bridge', level: 'doan_mach', x: 1504, z: 969, face: Math.PI / 2 };
  return [
    slopeSpot(),
    // Bậc tông môn: ~0,2 m mỗi bậc, đi về phía -z.
    { id: 'stairs', level: 'van_lam', x: 2048, z: 2021.4, face: -Math.PI / 2 },
    rockSpot(),
    bridge,
  ];
}

export default {
  name: 'chrv3feet',
  desc: 'IK chân bám dốc v3: ảnh trước/sau ở dốc, bậc thang, mép đá, cầu; chuỗi 15 khung đi lên bậc',
  usage: '[--genders m] [--sizes 720p,1080p] [--spots slope,stairs,rock,bridge] [--frames 15]',
  async run(r) {
    const genders = list('--genders', 'm');
    const sizes = list('--sizes', '720p,1080p');
    const want = new Set(list('--spots', 'slope,stairs,rock,bridge'));
    const frames = Number(opt('--frames', '15'));
    const all = spots().filter((s) => want.has(s.id));
    const stills = new Map<string, Buffer>();
    const seq: Record<string, Buffer[]> = {};
    const stats: Record<string, unknown> = {};
    for (const g of genders) {
      for (const v of ['truoc', 'sau'] as const) {
        const [w0, h0] = UI_SIZES[sizes[0]!] ?? UI_SIZES['720p']!;
        const { ctx, page } = await r.open({
          name: `F${g}${v}`,
          viewport: [w0, h0],
          quality: 'high',
          look: { g },
          query: v === 'truoc' ? { chr: 'v3', v3feet: '0' } : { chr: 'v3' },
          hide: 'hud',
          warnings: /models|chr_v3|clip/,
        });
        await gm(page, 'level 12', 1500);
        await gm(page, 'god on', 1000);
        await gm(page, 'set set_lac_kiem', 1200);
        await gm(page, 'killall', 800);
        await skipCutscene(page, 10);
        await page.waitForFunction(() => !!window.__game!.ents?.players.get(window.__game!.sid)?.model?.v3, undefined, { timeout: 60_000, polling: 300 });
        // Hiệu chỉnh hướng đi theo camera: phím W đi theo `camYaw`, ta tìm yaw để đi đúng hướng thế giới mong muốn.
        const pos = () => page.evaluate(() => ({ x: window.__game!.renderPos.x, y: window.__game!.renderPos.y, z: window.__game!.renderPos.z }));
        const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
        const calib = async () => {
          const probe = async (yaw: number) => {
            await cam(page, { yaw, pitch: 0.3, dist: 6 });
            await sleep(500);
            const a = await pos();
            await page.keyboard.down('KeyW');
            await sleep(600);
            await page.keyboard.up('KeyW');
            const b = await pos();
            return Math.atan2(b.z - a.z, b.x - a.x);
          };
          const t0 = await probe(0);
          const t1 = await probe(0.5);
          const k = wrap(t1 - t0) >= 0 ? 1 : -1;
          return (theta: number) => k * wrap(theta - t0);
        };
        let level = '';
        let camFor: ((th: number) => number) | null = null;
        for (const s of all) {
          if (s.level !== level) {
            if (s.level === 'van_lam' && level) await gm(page, 'tp tong_mon', 3000);
            else if (s.level !== 'van_lam') await enterLevel(page, s.level);
            level = s.level;
            await tp(page, s.x, s.z);
            camFor = await calib();
          }
          await tp(page, s.x, s.z);
          await sleep(1500);
          // Quay mặt về hướng `face` bằng cách chạy một nhịp ngắn rồi lùi lại chỗ cũ (thân quay theo hướng chạy).
          const cf = camFor!;
          await cam(page, { yaw: cf(s.face), pitch: 0.2, dist: 5 });
          await sleep(400);
          await page.keyboard.down('KeyW');
          await sleep(150);
          await page.keyboard.up('KeyW');
          await tp(page, s.x, s.z);
          await sleep(1800); // đứng yên: chân khóa, hông hạ xong
          const p0 = await pos();
          stats[`${s.id}-${g}-${v}`] = { y: +p0.y.toFixed(2), x: +p0.x.toFixed(1), z: +p0.z.toFixed(1) };
          // Nhìn ngang (vuông góc hướng nhìn) để thấy chân so với mặt đất.
          await cam(page, { yaw: cf(s.face + Math.PI / 2), pitch: s.id === 'bridge' ? 1.0 : 0.12, dist: s.id === 'bridge' ? 5 : 4.4 });
          for (const sz of sizes) {
            const [vw, vh] = UI_SIZES[sz] ?? UI_SIZES['720p']!;
            await page.setViewportSize({ width: vw, height: vh });
            await sleep(900);
            const buf = await snap(page, r.out, `${s.id}-${g}-${sz}-${v}.jpg`);
            stills.set(`${s.id}/${g}/${sz}/${v}`, buf);
          }
          if (s.id === 'stairs') {
            // Chuỗi đi lên bậc: camera ngang, chụp mỗi ~150 ms.
            const [vw, vh] = UI_SIZES[sizes[0]!] ?? UI_SIZES['720p']!;
            await page.setViewportSize({ width: vw, height: vh });
            await tp(page, s.x, s.z + 5);
            await sleep(1200);
            await cam(page, { yaw: cf(s.face + Math.PI / 2), pitch: 0.1, dist: 4.4 });
            const list2: Buffer[] = [];
            // Camera ngang: W đi vào màn hình, nên đi dọc bậc bằng A hoặc D (tự dò phím nào đi về phía -z).
            const probeKey = async (k: string) => {
              await tp(page, s.x, s.z + 5);
              await sleep(600);
              const q0 = await pos();
              await page.keyboard.down(k);
              await sleep(300);
              await page.keyboard.up(k);
              return (await pos()).z - q0.z;
            };
            const key = (await probeKey('KeyD')) < 0 ? 'KeyD' : 'KeyA';
            await tp(page, s.x, s.z + 4);
            await sleep(1200);
            const clip = centerClip(vw, vh, 640, 360);
            await page.keyboard.down(key);
            await sleep(120);
            for (let i = 0; i < frames; i++) list2.push(await snap(page, r.out, `stairs-walk-${g}-${v}/${String(i).padStart(2, '0')}.jpg`, { clip }));
            await page.keyboard.up(key);
            seq[`${g}-${v}`] = list2;
          }
        }
        await ctx.close();
      }
      const sctx = (await r.open({ name: 'Fsheet', viewport: [800, 600] })).ctx;
      const rows: SheetRow[] = [];
      for (const s of all)
        for (const sz of sizes)
          rows.push({
            label: `${s.id} ${sz}`,
            cells: (['truoc', 'sau'] as const).map((v) => ({ img: stills.get(`${s.id}/${g}/${sz}/${v}`)!, caption: v === 'truoc' ? 'TRƯỚC (v3feet=0)' : 'SAU' })),
          });
      await sheet(sctx, path.join(r.out, `so-sanh-${g}.jpg`), rows, { cell: 640, ratio: 0.5625, title: `NV3-A2 IK chân bám dốc (${g})` });
      for (const v of ['truoc', 'sau']) {
        const fr = seq[`${g}-${v}`];
        if (fr) await sheet(sctx, path.join(r.out, `bac-thang-${g}-${v}.jpg`), [{ label: v, cells: fr.map((b, i) => ({ img: b, caption: String(i) })) }].flatMap((row) => {
          const out: SheetRow[] = [];
          for (let i = 0; i < row.cells.length; i += 5) out.push({ label: i === 0 ? row.label : '', cells: row.cells.slice(i, i + 5) });
          return out;
        }), { cell: 320, ratio: 0.5625 });
      }
      await sctx.close();
    }
    writeJson(r.out, 'stats.json', stats);
  },
} satisfies Scenario;
