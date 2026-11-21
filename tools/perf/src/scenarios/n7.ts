// N-7 (chuyển mặc định sang nhân vật v3): ảnh so trước/sau ở 1080p và 720p.
//   - cận từng phái × giới: nhân vật mình mặc bộ bậc cao của phái (`/gm set`), camera 3/4 trước;
//   - đám đông: N bot mặc luân phiên 12 bộ × nam/nữ đứng quanh sân tông môn, camera tự do nhìn cả đám, kèm số draw call/tam giác.
// Ảnh "trước": `--query chr=v1 --tag truoc`; ảnh "sau": mặc định, `--tag sau`. Số đo ghi ở `<tag>-so-do.json`.
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { Bots } from '../lib/bots';
import { sleep } from '../lib/devserver';
import { flag, list, opt } from '../lib/env';
import { gm, perfSample } from '../lib/game';
import type { Scenario } from '../lib/scenario';

/** Sân tông môn (SPAWN_POINT). */
const SAN = { x: 2048, z: 2088 };
/** Bộ chụp cận mặc định: một bộ bậc cao mỗi phái. */
const CLOSE: Record<string, string> = { kiem_tu: 'set_tinh_khuyet', ho_phap: 'set_van_kinh', dan_su: 'set_than_tang' };
/** Bộ của đám đông: 3 bộ cơ bản + 9 bộ bậc cao (bot thứ i mặc bộ thứ i/2 % 12, giới tính xen kẽ). */
const CROWD_SETS = [
  'set_lac_kiem',
  'set_huyen_giap',
  'set_dan_tam',
  'set_kinh_quang',
  'set_liet_mach',
  'set_tinh_khuyet',
  'set_co_thanh',
  'set_dia_giap',
  'set_van_kinh',
  'set_luu_ly',
  'set_phuc_mach',
  'set_than_tang',
];
const SIZES: [string, number, number][] = [
  ['1080p', 1920, 1080],
  ['720p', 1280, 720],
];

/** Chờ mọi người chơi trong tầm nhìn có model thật (không còn model khối tạm trong lúc nạp asset). */
async function waitModels(page: Page, min: number, timeout: number): Promise<number> {
  const until = Date.now() + timeout;
  let ready = 0;
  while (Date.now() < until) {
    const r = await page.evaluate(() => {
      const ps = [...window.__game!.ents.players.values()] as { model: { setView?: unknown } }[];
      return { all: ps.length, ok: ps.filter((p) => !!p.model.setView).length };
    });
    ready = r.ok;
    if (r.all >= min && r.ok === r.all) return ready;
    await sleep(500);
  }
  return ready;
}

/** Chụp cùng một cảnh ở 1080p rồi 720p (đổi viewport, chờ dựng lại bề mặt). */
async function shoot(page: Page, out: string, name: string): Promise<void> {
  for (const [label, w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(1200);
    await page.screenshot({ path: path.join(out, `${name}-${label}.png`) });
  }
}

export default {
  name: 'n7',
  desc: 'N-7: ảnh trước/sau khi đổi mặc định sang nhân vật v3 (cận từng phái, đám đông 20–50), 1080p + 720p',
  usage: '[--tag sau] [--query chr=v1] [--bots 20,50] [--radius 9] [--genders m,f] [--no-close] [--no-crowd] [--quality high]',
  env: { RATE_LIMIT_EXEMPT: 'loopback', MAX_CLIENTS: '128' },
  async run(r) {
    const tag = opt('--tag', 'sau');
    const extra = opt('--query', '');
    const quality = opt('--quality', 'high');
    const genders = list('--genders', 'm,f');
    const counts = list('--bots', '20,50').map(Number);
    const radius = Number(opt('--radius', '9'));
    const stats: Record<string, unknown> = {};

    if (!flag('--no-close')) {
      for (const g of genders) {
        const gname = g === 'm' ? 'nam' : 'nu';
        const { ctx, page } = await r.open({
          name: `N7${g}`,
          viewport: [1920, 1080],
          quality,
          look: { g },
          extra,
          hide: 'hud',
          seenIntro: true,
          warnings: /models|chr_v3|clip/,
        });
        await gm(page, 'level 15', 1500);
        await gm(page, 'god on', 1100);
        await gm(page, 'killall', 900);
        // Mỗi giới đứng một chỗ: server còn giữ chỗ nhân vật của lượt trước vài chục giây sau khi trang đóng (hai người chồng lên nhau).
        await gm(page, `tp ${SAN.x + (g === 'm' ? 0 : 7)} ${SAN.z}`, 1500);
        for (const [phai, set] of Object.entries(CLOSE)) {
          await gm(page, `set ${set}`, 1500);
          await waitModels(page, 1, 60_000);
          await sleep(6000); // áo/texture nạp lười + lò xo vạt ổn định
          // Camera tự do 3/4 trước mặt, đặt theo vị trí và hướng thân thật: hai lượt trước/sau trùng góc.
          await page.evaluate(() => {
            const g = window.__game!;
            const root = g.ents.players.get(g.sid).model.root as { rotation: { y: number }; position: { x: number; y: number; z: number } };
            const a = root.rotation.y + 0.45;
            const p = root.position;
            g.freeCam = { x: p.x + Math.sin(a) * 3, y: p.y + 1.3, z: p.z + Math.cos(a) * 3, tx: p.x, ty: p.y + 0.92, tz: p.z, fov: 40 };
          });
          await sleep(1500);
          await shoot(page, r.out, `${tag}-can-${phai}-${gname}`);
          console.log(`[shots:n7] ${tag} cận ${phai} ${gname} (${set})`);
        }
        await ctx.close();
      }
    }

    if (!flag('--no-crowd')) {
      const bots = new Bots(r.port);
      try {
        for (const n of counts) {
          const got = await bots.start(n, `n${n}x`, [
            '--crowd',
            `${SAN.x},${SAN.z},${radius}`,
            '--tp',
            '--level',
            '15',
            '--set',
            CROWD_SETS.join(','),
            '--genders',
            'm,f',
          ]);
          const { ctx, page } = await r.open({
            name: `N7c${n}`,
            viewport: [1920, 1080],
            quality,
            look: { g: 'm' },
            extra,
            hide: 'hud',
            seenIntro: true,
            warnings: /models|chr_v3|clip/,
          });
          await gm(page, 'god on', 1100);
          await gm(page, 'killall', 900);
          await gm(page, `tp ${SAN.x} ${SAN.z}`, 1500);
          // Bot mặc bộ sau ~3 s (level → tp → set); asset từng bộ nạp lười nên chờ model thật của mọi người rồi chờ thêm texture.
          await sleep(8000);
          const ready = await waitModels(page, got + 1, 120_000);
          await sleep(12_000);
          await page.evaluate(
            ([x, z]) => {
              const g = window.__game!;
              const y = g.renderPos.y;
              g.freeCam = { x: x! + 3, y: y + 4.4, z: z! + 13.5, tx: x!, ty: y + 0.9, tz: z! - 1, fov: 55 };
            },
            [SAN.x, SAN.z],
          );
          await sleep(2500);
          await shoot(page, r.out, `${tag}-dam-dong-${n}`);
          // Số đo ở 720p (viewport cuối của `shoot`), cùng điều kiện với bench.
          const perf = await perfSample(page);
          const players = await page.evaluate(() => window.__game!.ents.players.size);
          // Heap sau khi ép GC (CDP) + ước lượng phần do nhân vật giữ: byte hình học duy nhất, số action của mixer, byte keyframe của clip.
          const cdp = await ctx.newCDPSession(page);
          await cdp.send('HeapProfiler.collectGarbage');
          await sleep(500);
          const heap = await page.evaluate(() => {
            const geos = new Set<any>();
            const clips = new Set<any>();
            let actions = 0;
            let geoBytes = 0;
            let clipBytes = 0;
            for (const p of window.__game!.ents.players.values()) {
              p.model.root.traverse((o: any) => o.geometry && geos.add(o.geometry));
              const mixer = p.model.mixer;
              for (const a of mixer?._actions ?? []) {
                actions++;
                clips.add(a.getClip());
              }
            }
            for (const g of geos) {
              for (const k of Object.keys(g.attributes)) geoBytes += g.attributes[k].array.byteLength;
              if (g.index) geoBytes += g.index.array.byteLength;
            }
            for (const c of clips) for (const t of c.tracks) clipBytes += t.times.byteLength + t.values.byteLength;
            // Trạng thái hiển thị từng người: asset | LOD | nhóm trong có hiện | số lưới đang hiện (bắt lỗi "có bảng tên, không có thân").
            const shown: Record<string, number> = {};
            for (const p of window.__game!.ents.players.values()) {
              const m = p.model;
              let vis = 0;
              m.root.traverse((o: any) => {
                if (!o.isMesh || !o.visible) return;
                let q = o.parent;
                while (q && q !== m.root && q.visible) q = q.parent;
                if (q === m.root) vis++;
              });
              const k = `${m.tpl?.handle?.id ?? m.constructor.name} lod${m.lodLevel ?? m.lod ?? '?'} ${vis} lưới`;
              shown[k] = (shown[k] ?? 0) + 1;
            }
            return {
              shown,
              heapGcMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6),
              geoMB: Math.round(geoBytes / 1e6),
              actions,
              clips: clips.size,
              clipMB: Math.round(clipBytes / 1e6),
            };
          });
          stats[`dam-dong-${n}`] = { bots: got, players, ready, ...perf, ...heap };
          console.log(
            `[shots:n7] heap sau GC ${heap.heapGcMB} MB, hình học ${heap.geoMB} MB, ${heap.actions} action, ${heap.clips} clip ${heap.clipMB} MB`,
          );
          console.log(`[shots:n7] ${tag} đám đông ${n}: ${players} người, ${perf.drawCalls} draw, ${perf.triangles} tam giác`);
          await ctx.close();
          await bots.stop();
          await sleep(3000);
        }
      } finally {
        await bots.stop();
      }
    }
    fs.writeFileSync(path.join(r.out, `${tag}-so-do.json`), JSON.stringify(stats, null, 2));
  },
} satisfies Scenario;
