// Diễn Võ Trường, sân boss: ĐO ĐỘ LỆCH giữa VẠCH BÁO được vẽ và VÙNG TRÚNG THẬT của server cho đòn vùng của boss/tinh anh.
//   pnpm --filter @dtl/perf exec tsx src/zonecheck.ts --out <thư mục> [--query style=dahoa] [--mons id1,id2 | all] [--kinds slam,line] [--tries 2]
// Mỗi (quái, loại chiêu): `/gm boss <id>` → `/gm cast <loại> loop` → chờ tin vạch báo → dừng lớp hình ngay TRƯỚC lúc server phán định
// → chụp hai ảnh cùng khung (có hiệu ứng / ẩn nhóm VFX): chênh giữa hai ảnh = phần vạch báo người chơi thật sự nhìn thấy. So với mặt nạ
// của vùng thật (hình trong tin `S.HAZARD`, đúng hình server kiểm bằng `inHazard`; chiếu lên màn hình bởi `ZoneOverlay.screenMask`):
//   - phủ %     : bao nhiêu phần vùng thật có vạch báo vẽ lên (thấp = có chỗ dính đòn mà không được báo)
//   - tràn %    : phần vạch báo vẽ RA NGOÀI vùng thật, tính theo diện tích vùng (cao = báo to hơn thật)
//   - vượt mép  : vạch báo lấn ra ngoài viền bao xa (m, phân vị 95 của các ô tràn)
// Giới hạn: thân quái và nhân vật đứng trong vùng che mất một phần vạch (phủ bị thấp đi); hiệu ứng khác của quái trong cùng nhóm VFX
// (hào quang, bụi) cũng tính vào "tràn". Dùng để tìm chiêu lệch RÕ, không phải số tuyệt đối. Ảnh `<quái>__<loại>.png` có viền vùng thật.
import { MONSTERS } from '@dtl/content';
import type { Page } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { num, opt } from '../lib/env';
import { gm, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { writeJson } from '../lib/shot';

/** Loại chiêu có vùng sát thương (bỏ gọi đệ tử, phản đòn, lộ yếu điểm). */
const ZONE_KINDS = ['slam', 'sweep', 'chant', 'caster', 'line', 'leap', 'charge', 'burrow'];
/** Bộ mặc định: boss và tinh anh chính của các bản đồ, đủ mọi loại chiêu vùng. */
const DEFAULT = [
  'boss_huyet_lang_vuong',
  'boss_han_giao',
  'boss_kiem_khoi',
  'boss_dia_mach_long',
  'boss_van_hai_kinh_vuong',
  'boss_kinh_nguyet_chan_quan',
  'boss_thien_khuyet_thu_linh',
  'boss_kim_da_ma_hau',
  'boss_tan_hoa_kiem_co',
  'elite_huyet_nha_lang',
  'elite_cu_nham_vien',
  'elite_loi_van_su_vuong',
  'elite_xich_sa_ngo_cong',
  'elite_kinh_dien_ma_quan',
];
/** Chiêu mở rộng gắn nhãn `mv` trên vạch báo (lọc đúng chiêu đang ép); các loại khác không có nhãn. */
const MV: Record<string, string> = { line: 'line', leap: 'leap', charge: 'charge', burrow: 'burrow' };
const CELL = 4;
/** Ngưỡng chênh màu (tổng |ΔR| + |ΔG| + |ΔB|) để coi một điểm ảnh là "có vạch báo". */
const DIFF = 36;
/** Chỉ xét vạch báo trong vòng này quanh vùng thật (m). */
const ROI = 3;

interface ZoneEntry {
  zone: { kind: string; x: number; z: number; r?: number; len?: number; w?: number; half?: number; yaw?: number };
  from: string;
  src: string;
  tag: string;
  t0: number;
  at: number;
}
interface Zones {
  enable(): void;
  setVisible(v: boolean): void;
  log: ZoneEntry[];
  screenMask(zone: unknown, cell: number, y: number): { w: number; h: number; dist: number[] };
}
type W = Window & { __labEdit?: { zones(): Zones | null } };

interface Row {
  mon: string;
  kind: string;
  shape: string;
  size: string;
  delay: number;
  /** Phần vùng thật nằm trong khung hình (0–1). */
  seen: number;
  cover: number;
  spill: number;
  over: number;
  note: string;
  file: string;
}

const zonesDo = <T>(pg: Page, fn: (z: Zones) => T): Promise<T> =>
  pg.evaluate((src) => {
    const z = (window as W).__labEdit?.zones();
    if (!z) throw new Error('chưa có __labEdit.zones()');
    return (0, eval)(`(${src})`)(z) as T;
  }, fn.toString());

async function shot(pg: Page): Promise<{ data: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(await pg.screenshot({ type: 'png' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

export default {
  name: 'zonecheck',
  desc: 'Sân boss: đo vạch báo được vẽ so với vùng trúng thật của server (phủ, tràn, vượt mép) cho boss/tinh anh',
  usage: '[--query style=dahoa] [--mons id1,id2 | all] [--kinds slam,line] [--tries 2]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const want = opt('--mons', '');
    const kindsOnly = opt('--kinds', '')
      .split(',')
      .filter(Boolean);
    const tries = num('--tries', 2);
    const all = MONSTERS.filter((m) => m.boss || m.id.startsWith('elite_'));
    const ids = want === 'all' ? all.map((m) => m.id) : want ? want.split(',') : DEFAULT;
    const { page: pg } = await r.open({
      name: 'ZoneChk',
      quality: 'high',
      viewport: [1280, 720],
      query: { cam: 'iso', quiet: 1 },
      extra: opt('--query', ''),
      seenIntro: true,
      hide: 'hud',
    });
    await pg.evaluate('globalThis.__name ??= (f) => f');
    await skipCutscene(pg, 20);
    await gm(pg, 'dvt');
    await waitLevel(pg, 'dien_vo');
    await gm(pg, 'build lac_kiem_quyet 30', 1500);
    await zonesDo(pg, (z) => z.enable());
    const rows: Row[] = [];
    const frames2 = () => pg.evaluate(() => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res()))));
    const setVfx = (on: boolean) => pg.evaluate((v) => void ((window.__game as unknown as { vfx: { group: { visible: boolean } } }).vfx.group.visible = v), on);
    for (const id of ids) {
      const def = all.find((m) => m.id === id);
      if (!def) {
        console.log(`[zonecheck] bỏ ${id}: không có trong dữ liệu`);
        continue;
      }
      const ai = (def.ai ?? {}) as Record<string, unknown>;
      const kinds = ZONE_KINDS.filter((k) => k in ai && (!kindsOnly.length || kindsOnly.includes(k)));
      if (!kinds.length) continue;
      await gm(pg, 'boss ' + id, 2600);
      for (const kind of kinds) {
        let best: Row | null = null;
        for (let k = 0; k < tries; k++) {
          await pg.evaluate(() => void (window.__game!.timeScale = 1));
          // Server bỏ tin chat cách tin trước dưới 800 ms: mọi lệnh GM cách nhau ≥ 900 ms.
          await gm(pg, `cast ${kind} loop`, 900);
          const n0 = await zonesDo(pg, (z) => z.log.length);
          // Chờ vạch báo MỚI của quái (boss có thể phải đi tới gần rồi mới ra chiêu).
          const until = Date.now() + 14_000;
          let e: ZoneEntry | null = null;
          while (Date.now() < until && !e) {
            await sleep(60);
            e = await pg.evaluate(
              ([n, mon, mv]) => {
                const z = (window as W).__labEdit!.zones()!;
                const mons = window.__game!.view.monsters;
                // Chỉ nhận vạch của ĐÚNG con quái đang đo, đúng loại chiêu (chiêu mở rộng mang `mv`), còn đủ thời gian báo để kịp dừng hình.
                const hit = z.log
                  .slice(n as number)
                  .find((x) => x.from === 'mon' && mons.get(x.src)?.t === mon && x.at - performance.now() >= 250 && (!mv || x.tag === mv));
                return hit ? { ...hit, t0: hit.t0 - performance.now(), at: hit.at - performance.now() } : null;
              },
              [n0, id, MV[kind] ?? ''] as const,
            );
          }
          if (!e) {
            best ??= { mon: id, kind, shape: '—', size: '', delay: 0, seen: 0, cover: 0, spill: 0, over: 0, note: 'không thấy vạch báo trong 14 giây', file: '' };
            continue;
          }
          const delay = Math.round(e.at - e.t0) / 1000;
          // Dừng lớp hình ~120 ms trước lúc phán định: vạch báo đã tô gần đầy.
          await sleep(Math.max(0, e.at - 120));
          await pg.evaluate(() => void (window.__game!.timeScale = 0));
          await frames2();
          await zonesDo(pg, (z) => z.setVisible(false));
          await frames2();
          const a = await shot(pg);
          await setVfx(false);
          await frames2();
          const b = await shot(pg);
          await setVfx(true);
          await zonesDo(pg, (z) => z.setVisible(true));
          await frames2();
          const file = `${id}__${kind}.png`;
          await pg.screenshot({ path: path.join(r.out, file) });
          const mask = await pg.evaluate(
            ([zone, cell]) => {
              const g = window.__game as unknown as { me(): { y: number } | undefined };
              return (window as W).__labEdit!.zones()!.screenMask(zone, cell as number, g.me()?.y ?? 0);
            },
            [e.zone, CELL] as const,
          );
          await pg.evaluate(() => void (window.__game!.timeScale = 1));
          // Ô có vạch báo: ≥ 25% điểm ảnh của ô đổi màu giữa hai ảnh.
          let zoneN = 0;
          let inN = 0;
          let spillN = 0;
          const outD: number[] = [];
          for (let j = 0; j < mask.h; j++)
            for (let i = 0; i < mask.w; i++) {
              const d = mask.dist[j * mask.w + i]!;
              if (d < 0 || d > ROI) continue;
              let ch = 0;
              for (let y = 0; y < CELL; y++)
                for (let x = 0; x < CELL; x++) {
                  const o = ((j * CELL + y) * a.w + i * CELL + x) * 3;
                  if (Math.abs(a.data[o]! - b.data[o]!) + Math.abs(a.data[o + 1]! - b.data[o + 1]!) + Math.abs(a.data[o + 2]! - b.data[o + 2]!) > DIFF) ch++;
                }
              const warn = ch >= (CELL * CELL) / 4;
              if (d === 0) {
                zoneN++;
                if (warn) inN++;
              } else if (warn) {
                spillN++;
                outD.push(d);
              }
            }
          outD.sort((x, y) => x - y);
          const z = e.zone;
          const area = z.kind === 'circle' ? Math.PI * z.r! ** 2 : z.kind === 'rect' ? z.len! * z.w! : z.half! * z.r! ** 2;
          // Diện tích vùng tính theo ô màn hình không quy đổi được ra m² (phối cảnh), nên "phần nhìn thấy" ước theo tâm vùng có trong khung không.
          const row: Row = {
            mon: id,
            kind,
            shape: z.kind,
            size:
              z.kind === 'circle'
                ? `r ${z.r}`
                : z.kind === 'rect'
                  ? `${z.len!.toFixed(1)} × ${z.w}`
                  : `r ${z.r}, ${Math.round((z.half! * 360) / Math.PI)}°`,
            delay,
            seen: zoneN,
            cover: zoneN ? Math.round((inN / zoneN) * 100) : 0,
            spill: zoneN ? Math.round((spillN / zoneN) * 100) : 0,
            over: outD.length ? Math.round(outD[Math.floor(outD.length * 0.95)]! * 10) / 10 : 0,
            note: zoneN < 60 ? `vùng gần như ngoài khung (${zoneN} ô, ${area.toFixed(0)} m²)` : '',
            file,
          };
          // Giữ lượt có vùng nằm trong khung nhiều nhất.
          if (!best || row.seen > best.seen) best = row;
          if (row.seen >= 60) break;
        }
        await gm(pg, 'cast off', 900);
        if (best) {
          rows.push(best);
          console.log(
            `[zonecheck] ${best.mon.padEnd(30)} ${best.kind.padEnd(7)} ${best.shape.padEnd(6)} ${best.size.padEnd(14)} báo ${best.delay.toFixed(2)} s  phủ ${String(best.cover).padStart(3)}%  tràn ${String(best.spill).padStart(3)}%  vượt mép ${best.over} m  ${best.note}`,
          );
        }
      }
    }
    const md = [
      '| Quái | Chiêu | Vùng thật | Báo trước (s) | Phủ | Tràn | Vượt mép (m) | Ghi chú |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...rows.map((x) => `| \`${x.mon}\` | ${x.kind} | ${x.shape} ${x.size} | ${x.delay.toFixed(2)} | ${x.cover}% | ${x.spill}% | ${x.over} | ${x.note} |`),
    ].join('\n');
    fs.writeFileSync(path.join(r.out, 'zonecheck.md'), md + '\n');
    writeJson(r.out, 'zonecheck.json', { cell: CELL, diff: DIFF, roi: ROI, rows });
    console.log(`[zonecheck] ${rows.length} chiêu đã đo`);
  },
} satisfies Scenario;
