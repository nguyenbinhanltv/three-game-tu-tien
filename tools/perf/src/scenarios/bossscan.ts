// Diễn Võ Trường, xưởng animation: QUÉT BOSS THEO TỪNG PHA.
//   pnpm --filter @dtl/perf exec tsx src/bossscan.ts --out <thư mục> [--query style=dahoa] [--bosses id1,id2 | all] [--runms 2200]
// Mỗi boss: `/gm boss <id>`, rồi với từng pha (`/gm phase n`, pha 0 = pha đầu):
//   - cho boss đuổi rồi áp sát đánh (mình chạy ra, đứng lại): sải chân theo clip (`StrideSlip`: chân trụ trôi bao nhiêu % tốc độ thân), số lần chuyển
//     clip đổi cứng (bước nhảy trọng số ≥ 0,5) và tốc độ xoay khớp lớn nhất lúc chuyển;
//   - ép từng đòn lớn của pha (`/gm cast slam|sweep|chant|line`): đúng lúc server phán định (tin vạch báo tới + `delay`) đọc đồng hồ clip đòn của
//     model và so với khung trúng `impact` của clip → hoạt ảnh trúng sớm/muộn bao nhiêu ms; kèm tiếng phát quanh mốc đó (đầu dò tiếng, đo được
//     cả khi tắt tiếng).
// Dùng cổng của xưởng animation (`apps/client/src/game/debug/animWorkshop.ts`) và nhật ký vùng trúng thật (`__labEdit.zones()`).
import { MONSTERS } from '@dtl/content';
import type { Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from '../lib/devserver';
import { num, opt } from '../lib/env';
import { gm, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { writeJson } from '../lib/shot';

const MOVE_KINDS = ['slam', 'sweep', 'chant', 'line'];
/** Ngưỡng báo: chân trụ trôi quá 25% tốc độ thân; khung trúng của clip lệch mốc server quá 80 ms. */
const SLIP = 0.25;
const HIT_TOL = 80;

interface Snap {
  ok: boolean;
  clips: { name: string; dur: number }[];
  blends: { from: string; to: string; ms: number; pop: number; spin: number; bone?: string }[];
  stride?: { key: string; n: number; speed: number; slip: number }[];
}
interface MoveSample {
  shape: string;
  delay: number;
  /** Clip đang phát ~60 ms sau khi vạch báo tới, và có phải đòn lớn (`bossMove`) không. */
  clip0: string | null;
  move: boolean;
  impact: number | null;
  /** [ms so với mốc phán định, clip đòn đang phát (null nếu không), giây trong clip, đang chờ phát (1/0)]. */
  trace: [number, string | null, number | null, number][];
  moveClip: string | null;
  snd: { name: string; off: number; why: string }[];
}
interface MoveRow extends Partial<MoveSample> {
  kind: string;
  /** Khung trúng của clip so với mốc phán định của server (ms; âm = hoạt ảnh trúng SỚM, dương = muộn). null = không đo được. */
  errMs: number | null;
  note: string;
}
interface PhaseRow {
  boss: string;
  phase: number;
  stride: { key: string; n: number; speed: number; slip: number }[];
  hard: string[];
  spin: number;
  spinAt: string;
  moves: MoveRow[];
}

const INSTALL = `(async () => {
  const audio = await import('/src/game/audio/audio.ts');
  const ws = await import('/src/game/debug/animWorkshop.ts');
  const probe = audio.sfxProbe ?? { on: false, rows: [] };
  probe.on = true;
  window.__bscan = { probe, ws: ws.animWorkshop(window.__game) };
  window.__labEdit.zones().enable();
  window.__labEdit.zones().setVisible(false);
  return true;
})()`;

/** Chờ vạch báo MỚI của con `mon`, rồi đọc đồng hồ clip đòn đúng lúc server phán định. */
const SAMPLE = `(async (mon, ms) => {
  const z = window.__labEdit.zones(), g = window.__game, n = z.count, t0 = performance.now();
  const wait = (t) => new Promise((r) => setTimeout(r, t));
  while (performance.now() - t0 < ms) {
    await wait(30);
    // Vạch báo của đúng con boss; vạch không ghi nguồn (một số chiêu thả theo nhóm) cũng nhận vì phòng chỉ có một boss.
    const e = z.log.find((x) => x.seq > n && x.from === 'mon' && (!x.src || g.view.monsters.get(x.src)?.t === mon) && x.at - performance.now() >= 200);
    if (!e) continue;
    let mdl = null;
    g.ents.monsters.forEach((m) => { if (!mdl && m.s && m.s.t === mon) mdl = m.model; });
    if (!mdl) return null;
    const def = mdl.moves ? mdl.moves[e.zone.kind === 'circle' ? 'slam' : 'sweep'] : null;
    // Vết đồng hồ clip đòn: mỗi ~35 ms ghi (ms so với lúc server phán định, tên clip, giây trong clip) tới 400 ms sau mốc.
    const trace = [];
    let moved = false, clip0 = null;
    while (performance.now() < e.at + 400) {
      const s = mdl.shot, act = s && s.action;
      const name = act ? act.getClip().name : null;
      if (clip0 === null && name) clip0 = name;
      if (s && s.move) moved = true;
      trace.push([Math.round(performance.now() - e.at), s && s.move ? name : null, act ? Math.round(act.time * 1000) / 1000 : null, mdl.pendingMove ? 1 : 0]);
      await wait(35);
    }
    const snd = window.__bscan.probe.rows
      .filter((r) => Math.abs(r.at + (r.delayMs || 0) - e.at) < 350)
      .map((r) => ({ name: r.name, off: Math.round(r.at + (r.delayMs || 0) - e.at), why: r.why }));
    return { shape: e.zone.kind, delay: Math.round(e.at - e.t0) / 1000, clip0, move: moved, impact: def ? def.impact : null, moveClip: def ? def.clip : null, snd, trace };
  }
  return null;
})`;

/** Lúc đồng hồ clip đòn đi qua khung trúng, tính bằng ms so với mốc phán định của server (âm = hoạt ảnh trúng SỚM). null = không đi qua trong vết. */
function crossMs(trace: [number, string | null, number | null, number][], clip: string, impact: number): number | null {
  let prev: [number, number] | null = null;
  for (const [dt, name, t] of trace) {
    if (name !== clip || t === null) {
      prev = null;
      continue;
    }
    if (t >= impact) {
      if (!prev) return dt;
      const k = (impact - prev[1]) / Math.max(1e-6, t - prev[1]);
      return Math.round(prev[0] + (dt - prev[0]) * k);
    }
    prev = [dt, t];
  }
  return null;
}

const aim = (pg: Page) =>
  pg.evaluate(() => {
    const g = window.__game!;
    const me = g.info();
    let best = '';
    let bd = 1e9;
    g.view.monsters.forEach((m, id) => {
      const d = Math.hypot(m.x - me.x, m.z - me.z);
      if (m.st !== 4 && d < bd) {
        bd = d;
        best = id;
      }
    });
    g.targetId = best;
    return best ? g.view.monsters.get(best)!.t : '';
  });

export default {
  name: 'bossscan',
  desc: 'Xưởng animation: quét boss theo từng pha (sải chân, chuyển clip giật, clip đòn lớn so với mốc trúng của server, tiếng quanh mốc)',
  usage: '[--query style=dahoa] [--bosses id1,id2 | all] [--runms 2200]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const want = opt('--bosses', '');
    const all = MONSTERS.filter((m) => m.boss);
    const ids = want === 'all' || !want ? all.map((m) => m.id) : want.split(',');
    const runMs = num('--runms', 2200);
    const { page: pg } = await r.open({
      name: 'BossScan',
      quality: 'high',
      viewport: [1280, 720],
      query: { cam: 'iso', quiet: 1 },
      extra: opt('--query', ''),
      seenIntro: true,
    });
    await pg.evaluate('globalThis.__name ??= (f) => f');
    await skipCutscene(pg, 20);
    await gm(pg, 'dvt');
    await waitLevel(pg, 'dien_vo');
    await gm(pg, 'build lac_kiem_quyet 30', 1500);
    await pg.evaluate(INSTALL);
    const rows: PhaseRow[] = [];
    for (const id of ids) {
      const def = all.find((m) => m.id === id);
      if (!def) continue;
      await gm(pg, 'boss ' + id, 3000);
      if ((await aim(pg)) !== id) {
        console.log(`[bossscan] ${id}: /gm boss không gọi được`);
        continue;
      }
      const phases = (def as unknown as { phases?: { ai?: Record<string, unknown> }[] }).phases ?? [];
      let ai: Record<string, unknown> = { ...((def.ai ?? {}) as Record<string, unknown>) };
      for (let ph = 0; ph <= phases.length; ph++) {
        if (ph > 0) ai = { ...ai, ...(phases[ph - 1]!.ai ?? {}) };
        await gm(pg, 'phase ' + ph, 1100);
        await aim(pg);
        await pg.evaluate(`(() => { const w = window.__bscan.ws; w.setSubject('target'); w.start(); w.resetStats(); })()`);
        // Chạy ra xa cho boss đuổi (clip chạy), đứng lại cho nó áp sát và đánh (chạy → đánh → đứng), hai lượt.
        for (const key of ['KeyW', 'KeyS']) {
          await pg.keyboard.down(key);
          await sleep(runMs);
          await pg.keyboard.up(key);
          await sleep(2600);
        }
        const moves: MoveRow[] = [];
        for (const kind of MOVE_KINDS.filter((k) => k in ai)) {
          await gm(pg, 'cast ' + kind, 950);
          const s = (await pg.evaluate(`${SAMPLE}(${JSON.stringify(id)}, 9000)`)) as MoveSample | null;
          if (!s) {
            moves.push({ kind, errMs: null, note: 'không thấy vạch báo trong 9 giây' });
            continue;
          }
          let errMs: number | null = null;
          let note = '';
          if (s.impact === null) note = 'model không khai clip đòn lớn cho loại này';
          else if (!s.move) note = `đòn lớn KHÔNG phát (đang phát ${s.clip0 ?? 'không clip nào'})`;
          else {
            errMs = crossMs(s.trace, s.moveClip ?? '', s.impact);
            if (errMs === null) {
              const first = s.trace.find((x) => x[1] === s.moveClip);
              note = first ? `clip đòn bắt đầu ở ${first[0]} ms, ĐÃ QUA khung trúng (${first[2]} s ≥ ${s.impact} s) hoặc chưa tới trong vết` : 'clip đòn không phát trong cửa sổ đo';
            }
          }
          moves.push({ kind, ...s, errMs, note });
          // Chờ đòn vừa rồi phát hết: đang có đòn lớn thì model bỏ qua đòn kế (`playMove`).
          await sleep(2600);
        }
        const sn = (await pg.evaluate(`window.__bscan.ws.snapshot()`)) as Snap;
        const hard = sn.blends.filter((b) => b.pop >= 0.5);
        const worst = sn.blends.reduce<Snap['blends'][number] | null>((w, b) => (!w || b.spin > w.spin ? b : w), null);
        const row: PhaseRow = {
          boss: id,
          phase: ph,
          stride: sn.stride ?? [],
          hard: [...new Set(hard.map((b) => `${b.from}→${b.to}`))],
          spin: worst?.spin ?? 0,
          spinAt: worst ? `${worst.from}→${worst.to}${worst.bone ? ' ' + worst.bone : ''}` : '',
          moves,
        };
        rows.push(row);
        const st = row.stride
          .filter((x) => x.n >= 20)
          .map((x) => `${x.key} ${(x.slip * 100).toFixed(0)}%${Math.abs(x.slip) > SLIP ? '!' : ''}`)
          .join(', ');
        console.log(`[bossscan] ${id} pha ${ph}: sải [${st || 'không đủ mẫu'}] · đổi cứng ${row.hard.length ? row.hard.join(', ') : '0'} · xoay ${row.spin}°/s ${row.spinAt}`);
        for (const m of moves)
          console.log(
            `[bossscan]     ${m.kind.padEnd(6)} ${m.errMs === null ? '—' : (m.errMs >= 0 ? '+' : '') + m.errMs + ' ms' + (Math.abs(m.errMs) > HIT_TOL ? ' (LỆCH)' : '')}  ${m.moveClip ?? ''} ${m.shape ?? ''}  báo ${m.delay ?? '?'} s  tiếng: ${(m.snd ?? []).map((x) => `${x.name}${x.off >= 0 ? '+' : ''}${x.off}`).join(' ') || 'không'}  ${m.note}`,
          );
      }
      await pg.evaluate(`(() => { const w = window.__bscan.ws; w.stop(); w.setSubject('me'); })()`);
      await gm(pg, 'phase off', 950);
    }
    writeJson(r.out, 'bossscan.json', { slip: SLIP, hitTol: HIT_TOL, rows });
    const md = [
      '| Boss | Pha | Sải chân (clip: chân trụ trôi) | Đổi clip cứng | Xoay khớp lớn nhất | Đòn lớn: lệch mốc trúng |',
      '| --- | --- | --- | --- | --- | --- |',
      ...rows.map(
        (x) =>
          `| \`${x.boss}\` | ${x.phase} | ${x.stride.filter((s) => s.n >= 20).map((s) => `${s.key} ${(s.slip * 100).toFixed(0)}%`).join(', ') || '—'} | ${x.hard.join(', ') || '0'} | ${x.spin}°/s | ${x.moves.map((m) => `${m.kind} ${m.errMs === null ? '— ' + m.note : (m.errMs >= 0 ? '+' : '') + m.errMs + ' ms'}`).join('; ') || '—'} |`,
      ),
    ].join('\n');
    fs.writeFileSync(path.join(r.out, 'bossscan.md'), md + '\n');
    console.log(`[bossscan] ${rows.length} pha đã quét`);
  },
} satisfies Scenario;
