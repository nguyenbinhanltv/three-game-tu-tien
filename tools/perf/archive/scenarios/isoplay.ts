// Thiên Nhãn P5b: chơi thử tự động bằng camera chéo qua các chương: mỗi bản đồ vào bằng GM, đi bằng chuột phải, né Space, ra chiêu vào một quái
// (tự khóa theo con trỏ), đo khung/draw call, gom lỗi console. Ảnh + số đo ghi vào thư mục ra (`isoplay.json`).
//   pnpm shots isoplay --out <thư mục> [--only van_lam,cuu_kieu] [--views 1280x720]
import { LEVELS } from '@dtl/content';
import { levelSpawns } from '@dtl/shared';
import { flag, list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { enterLevel, gm, perfSample, resetHazards, skipCutscene, tp, waitHazard } from '../lib/game';
import { requireLevel } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

/** Chương → bản đồ chơi thử (cấp GM để vào được và đánh được). */
const STOPS = [
  { ch: 1, level: 'van_lam', lv: 8 },
  { ch: 3, level: 'doan_mach', lv: 22 },
  { ch: 4, level: 'van_hai', lv: 24 },
  { ch: 4, level: 'thien_khuyet', lv: 26 },
  { ch: 5, level: 'bac_hoang', lv: 30 },
  { ch: 6, level: 'van_dinh', lv: 40 },
  { ch: 7, level: 'cuu_kieu', lv: 46 },
];

interface Pos {
  x: number;
  z: number;
}

export default {
  name: 'isoplay',
  desc: 'Thiên Nhãn P5b: chơi thử camera chéo qua từng chương (đi chuột phải, né, ra chiêu, đo khung, lỗi console)',
  usage:
    '[--only van_lam,cuu_kieu] [--views 1280x720] [--hazard 1: chờ vòng cảnh báo của quái rồi chụp thêm] [--query mood=night] [--portal 1: chụp cổng phó bản + cột linh quang] [--probe 1: liệt kê mesh cộng sáng gần cổng]',
  async run(r) {
    const only = list('--only', '');
    const [vw, vh] = opt('--views', '1280x720').split('x').map(Number) as [number, number];
    const { page } = await r.open({
      name: 'IsoPlay',
      quality: 'high',
      viewport: [vw, vh],
      query: { cam: 'iso' },
      extra: opt('--query', ''),
      seenIntro: true,
      hide: undefined,
    });
    const pos = (): Promise<Pos> => page.evaluate(() => ({ x: window.__game!.renderPos.x, z: window.__game!.renderPos.z }));
    const dist = (a: Pos, b: Pos) => Math.round(Math.hypot(a.x - b.x, a.z - b.z) * 10) / 10;
    const log: Record<string, unknown>[] = [];
    await gm(page, 'god on');
    for (const st of STOPS) {
      if (only.length && !only.includes(st.level)) continue;
      const rec: Record<string, unknown> = { ch: st.ch, level: st.level, lv: st.lv };
      try {
        await gm(page, `level ${st.lv}`, 900);
        await gm(page, 'god on', 400);
        await enterLevel(page, st.level);
        await skipCutscene(page, 20);
        await snap(page, r.out, `c${st.ch}-${st.level}-vao.png`, { wait: 600 });
        if (flag('--portal')) {
          // Cột linh quang của cổng phó bản: dịch người tới cổng đầu tiên dẫn vào phó bản rồi chụp.
          const portal = (LEVELS[st.level]?.portals ?? []).find((q) => LEVELS[q.to]?.dungeon);
          if (portal) {
            await tp(page, portal.x + 3, portal.z + 3);
            await sleep(1500);
            await snap(page, r.out, `c${st.ch}-${st.level}-cot-sang.png`, { wait: 400 });
            if (flag('--probe')) {
              // Liệt kê mesh lớn gần cổng (tìm thứ vẽ cột/quầng): tên, vị trí, cỡ, kiểu pha trộn.
              const found = await page.evaluate(
                ([px, pz]) => {
                  const g = window.__game as unknown as { scene: { traverse(f: (o: unknown) => void): void } };
                  const out: unknown[] = [];
                  g.scene.traverse((o) => {
                    const m = o as {
                      isMesh?: boolean;
                      name?: string;
                      position: { x: number; y: number; z: number };
                      material?: { blending?: number };
                      scale: { x: number; y: number; z: number };
                      visible: boolean;
                      parent?: { name?: string };
                    };
                    if (!m.isMesh || !m.visible) return;
                    const d = Math.hypot(m.position.x - (px ?? 0), m.position.z - (pz ?? 0));
                    if (d < 40)
                      out.push({
                        n: m.name || m.parent?.name || '?',
                        d: Math.round(d),
                        y: Math.round(m.position.y),
                        s: [m.scale.x, m.scale.y, m.scale.z].map((v) => Math.round(v * 10) / 10),
                        add: m.material?.blending === 2,
                      });
                  });
                  return out.filter((e) => (e as { add: boolean }).add).slice(0, 25);
                },
                [portal.x, portal.z],
              );
              console.log('[isoplay] probe', JSON.stringify(found));
              // Tắt cột linh quang (Beacons) rồi chụp: còn cột sáng thì nó không phải Beacons.
              const had = await page.evaluate(() => {
                const g = window.__game as unknown as { beacons?: { mesh: { visible: boolean } } | null };
                if (!g.beacons) return false;
                g.beacons.mesh.visible = false;
                return true;
              });
              await sleep(600);
              await snap(page, r.out, `c${st.ch}-${st.level}-cot-sang-tat-beacons.png`, { wait: 200 });
              console.log('[isoplay] beacons', had);
            }
          }
        }
        // Đi bằng chuột phải: bấm lệch tâm màn hình, chờ ~2,5 s.
        const p0 = await pos();
        await page.mouse.click(vw / 2 + vw * 0.15, vh / 2 - vh * 0.12, { button: 'right' });
        await sleep(2500);
        const p1 = await pos();
        rec.moveRightClick = dist(p0, p1);
        // Né Space.
        await page.keyboard.press('Space');
        await sleep(700);
        rec.dodge = dist(p1, await pos());
        // Chiêu: gọi một quái của bãi đầu tiên ngay cạnh người, trỏ chuột lên nó, bấm chiêu 1 vài lần.
        const spawn = levelSpawns(requireLevel(st.level)).find((s) => !s.mon.startsWith('boss_'));
        if (spawn) {
          await gm(page, `spawn ${spawn.mon} 1`, 2500);
          const mon = await page.evaluate(() => {
            const g = window.__game!;
            const m = [...g.view.monsters.values()]
              .filter((x) => x.st !== 4)
              .map((x) => ({ x: x.x, z: x.z, hp: x.hp, mhp: x.mhp, d: Math.hypot(x.x - g.cur.x, x.z - g.cur.z) }))
              .sort((a, b) => a.d - b.d)[0];
            return m ?? null;
          });
          rec.spawn = { id: spawn.mon, found: !!mon, dist: mon ? Math.round(mon.d * 10) / 10 : null };
          if (mon) {
            for (let i = 0; i < 6; i++) {
              await page.evaluate(() => window.__game!.useSkill(0));
              await sleep(700);
            }
            await snap(page, r.out, `c${st.ch}-${st.level}-danh.png`, { wait: 200 });
            const after = await page.evaluate(() => {
              const g = window.__game!;
              const m = [...g.view.monsters.values()]
                .filter((x) => x.st !== 4)
                .sort((a, b) => Math.hypot(a.x - g.cur.x, a.z - g.cur.z) - Math.hypot(b.x - g.cur.x, b.z - g.cur.z))[0];
              return m ? m.hp : 0;
            });
            rec.damaged = after < mon.hp;
            if (flag('--hazard')) {
              // Chờ tinh anh ra chiêu có vạch báo, chụp lúc đang nạp (ảnh duyệt cỡ vòng cảnh báo ở iso).
              await resetHazards(page);
              rec.hazard = await waitHazard(page, 15_000);
              if (rec.hazard) {
                await sleep(500);
                await snap(page, r.out, `c${st.ch}-${st.level}-bao-hieu.png`, { wait: 100 });
              }
            }
            rec.autoTarget = await page.evaluate(() => !!window.__game!.targetId);
          }
        }
        const perf = await perfSample(page);
        rec.perf = { drawCalls: perf.drawCalls, triangles: perf.triangles, frameMs: perf.frameMs };
      } catch (e) {
        rec.error = e instanceof Error ? e.message.slice(0, 300) : String(e);
      }
      log.push(rec);
      console.log('[isoplay]', JSON.stringify(rec));
    }
    writeJson(r.out, 'isoplay.json', log);
  },
} satisfies Scenario;
