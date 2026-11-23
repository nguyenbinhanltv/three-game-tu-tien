// Thiên Nhãn P0: ảnh duyệt + số đo camera chéo (`?cam=iso`) so với camera cũ, cùng vị trí, preset Thấp/Cao, 720p/1080p.
// Ảnh: cũ vs iso, đánh quái (khung sau trúng đòn), trong/ngoài công trình (mái cổng tam quan), ngự kiếm.
import { LEVELS } from '@dtl/content';
import { FOREST, SPAWN_POINT } from '@dtl/shared';
import { list, opt } from '../lib/env';
import { sleep } from '../lib/devserver';
import { cam, enterLevel, gm, perfSample, skipCutscene, tp, waitLevel } from '../lib/game';
import { levelPoints, requireLevel } from '../lib/levelpoints';
import type { Scenario } from '../lib/scenario';
import { snap, writeJson } from '../lib/shot';

const VIEWS: Record<string, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080] };
const YAW = Math.PI * 0.25;
const LEVEL = opt('--level', 'van_lam');
/** Hướng camera iso (độ) đang dùng để đẩy điểm đứng ra phía camera: `isoyaw=` trong --query, không thì bảng hướng đã chọn (khớp ISO_YAW ở client). */
const YAW_DEG: Record<string, number> = {
  van_lam: 30,
  van_hai: 135,
  thien_khuyet: 20,
  doan_mach: 135,
  bac_hoang: 45,
  van_dinh: 135,
  gioi_tri: 135,
  cuu_kieu: 45,
  xich_tan_khich: -45,
};
const standYaw = (): number => {
  const m = /isoyaw=(-?[0-9.]+)/.exec(opt('--query', ''));
  return (((m ? Number(m[1]) : (YAW_DEG[LEVEL] ?? 45)) as number) * Math.PI) / 180;
};
/** Bí cảnh có cổng (không phải sân độ kiếp): vào bằng cổng thật ở level nhà, điểm đo là các vị trí cố định so với tâm bí cảnh. */
const DG = LEVELS[LEVEL]?.dungeon;
const DG_OFFSETS: [string, number, number][] = [
  ['vao', 0, 50],
  ['giua', 0, 16],
  ['tay', -30, 24],
  ['dong', 30, 24],
];
const VAN_LAM_POINTS = [
  { name: 'san', x: SPAWN_POINT.x, z: SPAWN_POINT.z },
  { name: 'cong-trong', x: 2048, z: 2128 },
  { name: 'cong-ngoai', x: 2048, z: 2150 },
];

/** Điểm đo: Vân Lam đặt tay (sân, cổng); level khác lấy từ `levelPoints` (ưu tiên điểm quan tâm, vùng, boss) tối đa 4 điểm. */
function pointsFor(): { name: string; x: number; z: number }[] {
  if (LEVEL === 'van_lam') return VAN_LAM_POINTS;
  if (DG) return DG_OFFSETS.map(([name, dx, dz]) => ({ name: `dg_${name}`, x: DG.center.x + dx, z: DG.center.z + dz }));
  const all = levelPoints(LEVEL).filter((q) => q.name !== 'trencao');
  const pick = [
    ...all.filter((q) => q.name.startsWith('poi_')),
    ...all.filter((q) => q.name.startsWith('zone_')),
    ...all.filter((q) => q.name.startsWith('boss_')),
  ];
  return (pick.length ? pick : all).slice(0, 4);
}

/** Điểm cảnh đánh quái: rừng Vân Lam; level khác là điểm sinh quái thường đầu tiên. */
function fightSpot(): { x: number; z: number } {
  if (LEVEL === 'van_lam') return { x: FOREST.x - 40, z: FOREST.z };
  if (DG) return { x: DG.center.x, z: DG.center.z + 16 };
  const sp =
    requireLevel(LEVEL).spawns.find((q) => !q.mon.startsWith('boss_') && !q.mon.startsWith('elite_')) ?? requireLevel(LEVEL).spawns[0]!;
  return { x: sp.x, z: sp.z };
}

interface IsoDbg {
  view: { monsters: Map<string, { x: number; z: number; st: number }> };
  renderPos: { x: number; z: number };
  useSkill(n: number): void;
  toggleFly(): void;
}

export default {
  name: 'camiso',
  desc: 'Thiên Nhãn P0: camera chéo ?cam=iso vs camera cũ (ảnh duyệt + draw call/tam giác/ms khung)',
  usage: '[--presets low,high] [--views 720p,1080p] [--cams old,iso] [--level <id>] [--query isoyaw=30]',
  async run(r) {
    const perf: Record<string, unknown> = {};
    for (const preset of list('--presets', 'low,high')) {
      for (const view of list('--views', '720p,1080p')) {
        for (const mode of list('--cams', 'iso')) {
          const iso = mode === 'iso';
          const { ctx, page } = await r.open({
            name: `Iso${preset[0]}${view[0]}${mode[0]}`,
            renderer: opt('--renderer', 'webgpu'),
            quality: preset,
            viewport: VIEWS[view]!,
            extra: [iso ? 'cam=iso' : '', opt('--query', '')].filter(Boolean).join('&'),
            seenIntro: true,
          });
          const stem = `${LEVEL === 'van_lam' ? '' : LEVEL + '-'}${mode}-${preset}-${view}`;
          await gm(page, `level ${LEVEL === 'van_lam' ? 15 : DG ? DG.minLevel + 2 : Math.max(27, requireLevel(LEVEL).minLevel ?? 0)}`);
          await gm(page, 'god on');
          if (DG) {
            const portal = LEVELS[DG.returnLevel]?.portals?.find((q) => q.to === LEVEL);
            if (!portal) throw new Error(`level ${LEVEL} không có cổng vào`);
            await enterLevel(page, DG.returnLevel);
            await tp(page, DG.returnSpawn.x, DG.returnSpawn.z);
            await sleep(1500);
            await tp(page, portal.x, portal.z);
            await sleep(1500);
            await page.keyboard.press('KeyE');
            await waitLevel(page, LEVEL);
            await skipCutscene(page, 10);
            await gm(page, 'god on', 1000);
          } else if (LEVEL !== 'van_lam') await enterLevel(page, LEVEL);
          const POINTS = pointsFor();
          // Vị trí đo: cùng điểm cho cả hai camera; camera cũ đặt cùng hướng nhìn.
          for (const p of POINTS) {
            // Điểm quan tâm (đình, cầu...) ở level khác: đứng ra phía camera 3,5 m để người không lẫn vào chân công trình.
            const k = LEVEL === 'van_lam' ? 0 : 3.5;
            await tp(page, p.x + Math.sin(standYaw()) * k, p.z + Math.cos(standYaw()) * k);
            await gm(page, 'killall', 1200);
            if (!iso) await cam(page, { yaw: YAW });
            await sleep(2500);
            await snap(page, r.out, `${stem}-${p.name}.png`);
            perf[`${stem}-${p.name}`] = await perfSample(page);
          }
          if (iso) {
            // Chuột phải: đi tới điểm cách tâm màn hình 200 px về phía phải-dưới; kiểm nhân vật thật sự di chuyển (ý định gửi như WASD).
            await tp(page, POINTS[0]!.x, POINTS[0]!.z);
            const [vw, vh] = VIEWS[view]!;
            const a = await page.evaluate(() => ({ ...(window.__game as unknown as IsoDbg).renderPos }));
            await page.mouse.move(vw / 2 + 200, vh / 2 + 120);
            await page.mouse.click(vw / 2 + 200, vh / 2 + 120, { button: 'right' });
            await sleep(1500);
            const b = await page.evaluate(() => ({ ...(window.__game as unknown as IsoDbg).renderPos }));
            console.log(`  chuột phải: đi ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)} m sau 1,5 s`);
            perf[`${stem}-rightclick-m`] = Math.hypot(b.x - a.x, b.z - a.z);
            await snap(page, r.out, `${stem}-chuotphai.png`);
          }
          // Cảnh đánh quái ở rừng: đứng cạnh quái, đặt con trỏ lên quái (iso), ra chiêu 1, chụp các khung sau trúng đòn.
          const fs = fightSpot();
          await tp(page, fs.x, fs.z);
          await gm(page, 'god on');
          if (!iso) await cam(page, { yaw: YAW });
          await sleep(2500);
          const nearest = () =>
            page.evaluate(() => {
              const g = window.__game as unknown as IsoDbg;
              let best: { x: number; z: number } | null = null;
              let bd = 1e9;
              for (const m of g.view.monsters.values()) {
                if (m.st === 4) continue;
                const d = Math.hypot(m.x - g.renderPos.x, m.z - g.renderPos.z);
                if (d < bd) {
                  bd = d;
                  best = m;
                }
              }
              return best;
            });
          // Đưa người tới sát quái gần nhất (~5 m, về phía camera để quái nằm trên người trong khung) để khung đánh thấy cả người lẫn mục tiêu, rồi lấy lại quái gần nhất.
          if (DG) {
            // Phó bản: gọi một quái của đợt đầu ngay trước mặt (đợt thật chỉ ra theo giờ).
            const first = DG.waves[0]!.mons.find((q) => !q.id.startsWith('boss_'))?.id ?? DG.waves[0]!.mons[0]!.id;
            await gm(page, `spawn ${first} 1`, 2500);
          }
          let mon = await nearest();
          if (mon) {
            await gm(page, `tp ${Math.round(mon.x + Math.sin(standYaw()) * 5)} ${Math.round(mon.z + Math.cos(standYaw()) * 5)}`, 1500);
            mon = (await nearest()) ?? mon;
          }
          if (mon) {
            if (iso) {
              // Đặt con trỏ lên quái gần nhất: chiêu đơn phải tự khóa đúng quái đó.
              const sp = await page.evaluate((m) => {
                const g = window.__game as unknown as {
                  camera: { updateMatrixWorld(): void };
                  renderPos: { constructor: new (x: number, y: number, z: number) => { project(c: unknown): { x: number; y: number } } };
                };
                g.camera.updateMatrixWorld();
                const v = new g.renderPos.constructor(m.x, 1, m.z).project(g.camera);
                return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
              }, mon);
              await page.mouse.move(sp.x, sp.y);
              await sleep(300);
            }
            await page.evaluate(() => (window.__game as unknown as IsoDbg).useSkill(0));
            await sleep(30);
            await snap(page, r.out, `${stem}-danh-30ms.png`);
            await sleep(600);
            await snap(page, r.out, `${stem}-danh-600ms.png`);
            perf[`${stem}-danh`] = await perfSample(page);
          }
          // Ngự kiếm.
          await gm(page, 'killall', 1000);
          await page.evaluate(() => (window.__game as unknown as IsoDbg).toggleFly());
          await page.keyboard.down('Space');
          await sleep(1200);
          await page.keyboard.up('Space');
          await snap(page, r.out, `${stem}-ngukiem.png`, { wait: 1200 });
          await ctx.close();
        }
      }
    }
    writeJson(r.out, 'perf.json', perf);
  },
} satisfies Scenario;
