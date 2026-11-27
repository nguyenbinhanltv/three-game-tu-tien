// Diễn Võ Trường, xưởng âm thanh + xưởng animation (V2d): ĐO trong phòng tập, không chỉ bấm nút.
//   pnpm shots xuong --out <thư mục> [--query style=dahoa] [--only cast,anim,loud] [--paths kiem_tu,the_tu] [--ping 0] [--bots 8]
// - cast: với từng lối tu, dựng nhân vật thử rồi ra TỪNG ô chiêu lên một con sói bị khóa máu; engine đánh mốc vào thế / khung trúng của hoạt ảnh /
//   sát thương server về, đầu dò tiếng ghi mọi lời gọi phát tiếng (kể cả khi tắt tiếng). Báo lệch tiếng trúng so với khung trúng theo từng chiêu.
// - anim: chạy tới / lùi / ngang / dừng / né bằng phím thật, đo trượt chân theo clip nền và nhật ký chuyển clip; rồi ép một clip đứng yên (tua)
//   cho mình và cho quái, chụp ảnh, thả ra và kiểm game điều khiển lại.
// - loud: N bot cùng đánh một bầy sói trong phòng chung, mình đánh cùng; đồng hồ từng bus báo đỉnh (dBFS, đo trước âm lượng tổng nên đo được cả
//   khi tắt tiếng) và số lần chạm trần 0 dBFS, kèm mật độ lời gọi phát tiếng.
// Chạy tắt tiếng như mọi kịch bản; số đo lấy từ đồng hồ `performance.now()` của trang nên phải để tốc độ lớp hình 100%.
import { PATHS } from '@dtl/content';
import { num, opt } from '../lib/env';
import { gm, skipCutscene, tp, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import { sleep } from '../lib/devserver';
import { Bots } from '../lib/bots';
import { snap, writeJson } from '../lib/shot';
import type { Page } from 'playwright';

interface CastRow {
  skill: string;
  combo: number;
  hitMs: number | null;
  planMs: number | null;
  dmgMs: number | null;
  swingMs: number | null;
  hitSndMs: number | null;
  sounds: { name: string; offMs: number }[];
  verdict: string;
}
interface CastSummary {
  key: string;
  n: number;
  hitSndMs: number | null;
  hitSndWorst: number | null;
  dmgMs: number | null;
  swingMs: number | null;
  planErrMs: number | null;
  bad: number;
}
interface AnimSnap {
  ok: boolean;
  clips: { name: string; dur: number }[];
  active: { name: string; t: number; dur: number; w: number }[];
  hold: { name: string; t: number; dur: number; playing: boolean } | null;
  feet: { bone: string; h: number; planted: boolean; v: number }[];
  slide: { key: string; time: number; planted: number; slide: number; travel: number; peak: number; cmPerM: number | null; cmPerS: number }[];
  blends: { from: string; to: string; ms: number; pop: number; spin: number }[];
}

/** Nạp các module của xưởng trong trang (Vite dev phục vụ theo đường dẫn; cùng bản module với game) và bật đầu dò. */
const INSTALL = `(async () => {
  const cast = await import('/src/game/debug/sfxCast.ts');
  const audio = await import('/src/game/audio/audio.ts');
  const ws = await import('/src/game/debug/animWorkshop.ts');
  const probe = audio.sfxProbe ?? { on: false, rows: [] };
  window.__xuong = { cast, probe, ws: ws.animWorkshop(window.__game) };
  window.__xuong.audio = audio;
  cast.castMarks.on = true;
  probe.on = true;
  return { probe: !!audio.sfxProbe, meter: !!audio.busMeter && audio.busMeter(true) };
})()`;

const clearLogs = (pg: Page) => pg.evaluate(`(() => { const x = window.__xuong; x.cast.castMarks.rows.length = 0; x.probe.rows.length = 0; })()`);
const readCasts = (pg: Page) =>
  pg.evaluate(`(() => { const x = window.__xuong; const rows = x.cast.castRows(x.cast.castMarks.rows, x.probe.rows); return { rows, sum: x.cast.castSummary(rows), marks: x.cast.castMarks.rows.length, sfx: x.probe.rows.length }; })()`) as Promise<{
    rows: CastRow[];
    sum: CastSummary[];
    marks: number;
    sfx: number;
  }>;
interface Meter {
  state: string;
  muted: boolean;
  voices: number;
  bus: Record<string, { peak: number; rms: number; hold: number; clips: number }>;
}
const readMeter = (pg: Page, reset: boolean) => pg.evaluate(`window.__xuong.audio.busMeterRead ? window.__xuong.audio.busMeterRead(${reset}) : null`) as Promise<Meter | null>;
const animSnap = (pg: Page) => pg.evaluate(`window.__xuong.ws.snapshot()`) as Promise<AnimSnap>;

/** Nhắm con quái sống gần nhất; trả vị trí của nó và khoảng cách. */
const aimNearest = (pg: Page) =>
  pg.evaluate(() => {
    const g = window.__game!;
    const me = g.info();
    let best = '';
    let bd = 1e9;
    let bx = 0;
    let bz = 0;
    g.view.monsters.forEach((m, id) => {
      const d = Math.hypot(m.x - me.x, m.z - me.z);
      if (m.st !== 4 && d < bd) {
        bd = d;
        best = id;
        bx = m.x;
        bz = m.z;
      }
    });
    if (best) g.setTarget(best, 'mon');
    return best ? { id: best, x: bx, z: bz, d: bd } : null;
  });

const f = (v: number | null, unit = ''): string => (v === null ? '—' : `${v > 0 ? '+' : ''}${v}${unit}`);

export default {
  name: 'xuong',
  desc: 'Diễn Võ Trường, xưởng âm thanh + animation: đo lệch tiếng so với khung trúng theo từng chiêu, trượt chân, chuyển clip, tua clip',
  usage: '[--query style=dahoa] [--only cast,anim,loud] [--paths kiem_tu,the_tu] [--ping 0] [--wait 2200] [--bots 8]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const query = opt('--query', '');
    const only = opt('--only', '')
      .split(',')
      .filter(Boolean);
    const want = (k: string) => !only.length || only.includes(k);
    const pathIds = opt('--paths', '')
      .split(',')
      .filter(Boolean);
    const ping = num('--ping', 0);
    const wait = num('--wait', 2200);
    const { page: pg } = await r.open({
      name: 'XuongLab',
      quality: 'high',
      viewport: [1280, 720],
      query: { cam: 'iso', quiet: 1 },
      extra: query,
      seenIntro: true,
    });
    await skipCutscene(pg, 20);
    await gm(pg, 'dvt');
    await waitLevel(pg, 'dien_vo');
    // Một phím thật để trình duyệt cho AudioContext chạy (đồng hồ bus đo tín hiệu thật, loa vẫn im vì đang tắt tiếng).
    await pg.keyboard.press('ShiftLeft');
    const inst = (await pg.evaluate(INSTALL)) as { probe: boolean; meter: boolean };
    if (!inst.probe) console.log('  (bản này chưa có đầu dò lời gọi phát tiếng `sfxProbe`: chỉ đo được mốc chiêu, không có cột tiếng)');
    if (ping > 0) await pg.evaluate((p) => void (window.__game!.fakePing = p), ping);
    const report: Record<string, unknown> = { ping, query };

    if (want('cast')) {
      const paths = PATHS.filter((p) => !pathIds.length || pathIds.includes(p.id));
      const all: { path: string; method: string; rows: CastRow[]; sum: CastSummary[]; meter: Meter | null }[] = [];
      for (const p of paths) {
        const method = p.methods[0]!;
        await gm(pg, 'scene soi_thuong', 3500);
        await gm(pg, `build ${method} 30`, 1600);
        await gm(pg, 'lockhp', 900);
        await gm(pg, 'charge', 900);
        let aim = await aimNearest(pg);
        if (!aim) {
          console.log(`  ${p.id}: không có quái trong cảnh, bỏ qua`);
          continue;
        }
        // Đứng cách mục tiêu 4 m: trong tầm của mọi chiêu, kể cả đòn thường cận chiến.
        await tp(pg, aim.x, aim.z - 4);
        await sleep(600);
        aim = await aimNearest(pg);
        const bar = await pg.evaluate(() => window.__game!.bar().map((s) => s.id));
        const rows: CastRow[] = [];
        for (let slot = 0; slot < bar.length; slot++) {
          await clearLogs(pg);
          await pg.evaluate((i) => window.__game!.useSkill(i), slot);
          // Ô 1 là đòn thường: để tự đánh chạy hết chuỗi ba đòn (vài vòng) rồi mới dừng.
          await sleep(slot === 0 ? 3600 : wait);
          if (slot === 0) {
            await pg.evaluate(() => {
              const g = window.__game as unknown as { autoAttack: boolean };
              g.autoAttack = false;
            });
            await sleep(900);
          }
          const got = await readCasts(pg);
          rows.push(...got.rows.filter((x) => x.skill));
        }
        const sum = (await pg.evaluate((list) => (window as unknown as { __xuong: { cast: { castSummary(r: unknown): unknown } } }).__xuong.cast.castSummary(list), rows)) as CastSummary[];
        const meter = await readMeter(pg, true);
        all.push({ path: p.id, method, rows, sum, meter });
        console.log(`\n  ${p.id} (${method}): ${rows.length} lần ra chiêu trên ${bar.length} ô${meter ? ` · đỉnh bus SFX ${meter.bus.sfx?.hold} dBFS, tổng ${meter.bus.sum?.hold} dBFS (${meter.state})` : ''}`);
        console.log('    chiêu                          lần  khung trúng−dữ liệu  sát thương về  tiếng vung  tiếng trúng (xấu nhất)  hỏng');
        for (const s of sum)
          console.log(
            `    ${s.key.padEnd(30)} ${String(s.n).padStart(3)}  ${f(s.planErrMs, ' ms').padStart(18)}  ${f(s.dmgMs, ' ms').padStart(13)}  ${f(s.swingMs, ' ms').padStart(10)}  ${(f(s.hitSndMs, ' ms') + ' (' + f(s.hitSndWorst) + ')').padStart(22)}  ${s.bad || ''}`,
          );
      }
      report.cast = all;
      const flat = all.flatMap((a) => a.sum.map((s) => ({ path: a.path, ...s })));
      const bad = flat.filter((s) => s.bad > 0);
      console.log(`\n  Tổng: ${flat.length} chiêu/đòn đã đo, ${bad.length} có lần lệch quá dung sai hoặc câm: ${bad.map((s) => `${s.path}:${s.key}`).join(', ') || 'không'}`);
    }

    if (want('anim')) {
      await gm(pg, 'scene soi_thuong', 3500);
      await gm(pg, 'lockhp', 900);
      await pg.evaluate(`window.__xuong.ws.start()`);
      // Vết theo thời gian (mỗi ~120 ms): clip đang góp trọng số và trạng thái từng bàn chân, để đọc lại khi số đo trông lạ.
      const trace: { key: string; active: string; feet: string }[] = [];
      const hold = async (key: string, ms: number) => {
        await pg.keyboard.down(key);
        for (let left = ms; left > 0; left -= 120) {
          await sleep(Math.min(120, left));
          const s = await animSnap(pg);
          trace.push({
            key,
            active: s.active.slice(0, 4).map((a) => `${a.name} ${a.w.toFixed(2)}`).join(' | '),
            feet: s.feet.map((x) => `${(x.h * 100).toFixed(0)}cm ${x.planted ? 'trụ' : 'nhấc'} ${x.v.toFixed(1)}m/s`).join(' | '),
          });
        }
        await pg.keyboard.up(key);
      };
      // Đứng → chạy tới → dừng → lùi → ngang hai bên → chạy rồi né.
      await sleep(800);
      await hold('KeyW', 1800);
      await sleep(700);
      await hold('KeyS', 1800);
      await sleep(700);
      await hold('KeyA', 1500);
      await sleep(500);
      await hold('KeyD', 1500);
      await sleep(700);
      await pg.keyboard.down('KeyW');
      await sleep(700);
      await pg.keyboard.press('Space');
      await sleep(600);
      await pg.keyboard.up('KeyW');
      await sleep(900);
      const moved = await animSnap(pg);
      console.log(`\n  Trượt chân (mình, xương ${moved.feet.map((x) => x.bone).join(' + ')}, ${moved.clips.length} clip):`);
      console.log('    clip nền                 giây   đi (m)  trượt (cm)  cm/m   cm/s lúc trụ  đỉnh cm/s');
      for (const s of moved.slide)
        console.log(
          `    ${s.key.padEnd(24)} ${s.time.toFixed(1).padStart(4)}  ${s.travel.toFixed(1).padStart(6)}  ${(s.slide * 100).toFixed(1).padStart(9)}  ${(s.cmPerM === null ? '—' : s.cmPerM.toFixed(1)).padStart(5)}  ${s.cmPerS.toFixed(1).padStart(12)}  ${(s.peak * 100).toFixed(0).padStart(8)}`,
        );
      console.log('  Chuyển clip:');
      for (const b of moved.blends) console.log(`    ${b.from} → ${b.to}: ${b.ms} ms, bước nhảy trọng số ${b.pop}, khớp xoay nhanh nhất ${b.spin}°/s`);

      // Tua: ép clip đứng yên ở giữa, chụp; dịch 5 khung; thả.
      const pick = moved.clips.find((c) => /jog|run|walk/i.test(c.name)) ?? moved.clips[0];
      const checks: { name: string; ok: boolean; note?: string }[] = [];
      const check = (name: string, ok: boolean, note?: string) => {
        checks.push({ name, ok, note });
        console.log(`  ${ok ? 'ĐẠT ' : 'HỎNG'} ${name}${note ? ' — ' + note : ''}`);
      };
      check('model của mình có cổng soi mixer và đo được bàn chân', moved.ok && moved.feet.length >= 2 && moved.clips.length > 0, `${moved.clips.length} clip, xương chân: ${moved.feet.map((x) => x.bone).join(', ')}`);
      if (pick) {
        const mid = pick.dur / 2;
        await pg.evaluate(([n, t]) => (window as unknown as { __xuong: { ws: { hold(n: string, t: number): boolean } } }).__xuong.ws.hold(n as string, t as number), [pick.name, mid]);
        await sleep(500);
        const h1 = await animSnap(pg);
        await snap(pg, r.out, 'anim-1-tua-minh.png', { wait: 150 });
        await sleep(400);
        const h2 = await animSnap(pg);
        check(
          `ép clip "${pick.name}" đứng ở ${mid.toFixed(2)} s: clip của game tạm tắt, mốc không trôi`,
          !!h1.hold && h1.hold.name === pick.name && Math.abs(h1.hold.t - mid) < 1e-3 && !!h2.hold && Math.abs(h2.hold.t - h1.hold.t) < 1e-3 && h1.active.length === 0,
          h1.hold ? `mốc ${h1.hold.t.toFixed(3)} → ${h2.hold?.t.toFixed(3)} s, ${h1.active.length} clip game còn trọng số` : 'không ép được',
        );
        await pg.evaluate(`window.__xuong.ws.nudge(5)`);
        await sleep(250);
        const h3 = await animSnap(pg);
        check('nút dịch 5 khung dời mốc 5/30 giây', !!h3.hold && Math.abs(h3.hold.t - Math.min(pick.dur, mid + 5 / 30)) < 1e-3, h3.hold ? `${h3.hold.t.toFixed(3)} s` : '');
        await pg.evaluate(`window.__xuong.ws.hold(null)`);
        await sleep(700);
        const h4 = await animSnap(pg);
        check('thả ra thì game điều khiển lại (có clip nền đang phát)', !h4.hold && h4.active.length > 0, h4.active.map((a) => `${a.name} ${a.w.toFixed(2)}`).join(', '));
      }
      // Quái đang nhắm.
      await aimNearest(pg);
      await pg.evaluate(`window.__xuong.ws.setSubject('target')`);
      await sleep(500);
      const mon = await animSnap(pg);
      check('quái đang nhắm: có cổng soi mixer và danh sách clip', mon.ok && mon.clips.length > 0, `${mon.clips.length} clip: ${mon.clips.map((c) => c.name).slice(0, 8).join(', ')}`);
      const mclip = mon.clips.find((c) => /attack|bite|atk/i.test(c.name)) ?? mon.clips[0];
      if (mon.ok && mclip) {
        await pg.evaluate(([n, t]) => (window as unknown as { __xuong: { ws: { hold(n: string, t: number): boolean } } }).__xuong.ws.hold(n as string, t as number), [mclip.name, mclip.dur * 0.5]);
        await sleep(600);
        const mh = await animSnap(pg);
        await snap(pg, r.out, 'anim-2-tua-quai.png', { wait: 150 });
        check(`ép clip "${mclip.name}" của quái`, !!mh.hold && mh.hold.name === mclip.name);
        await pg.evaluate(`window.__xuong.ws.hold(null)`);
      }
      await pg.evaluate(`window.__xuong.ws.stop()`);
      report.anim = { slide: moved.slide, blends: moved.blends, clips: moved.clips, monClips: mon.clips, checks, trace };
    }

    if (want('loud')) {
      const n = num('--bots', 8);
      const key = 'loud' + n;
      await gm(pg, 'dvt ' + key);
      await waitLevel(pg, 'dien_vo');
      await gm(pg, 'spawn mon_soi_xam 8', 1800);
      await gm(pg, 'lockhp', 900);
      await gm(pg, 'god', 900);
      const bots = new Bots(r.port);
      try {
        const joined = await bots.start(n, 'ld' + n + 'b', ['--gm', 'dvt ' + key, '--fight', '1300,985,12', '--tp']);
        const others = () => pg.evaluate(() => (window.__game as unknown as { room: { state: { players: { size: number } } } }).room.state.players.size);
        const until = Date.now() + 60_000;
        while (Date.now() < until && (await others()) < n + 1) await sleep(500);
        const aim = await aimNearest(pg);
        if (aim) await tp(pg, aim.x, aim.z - 4);
        await sleep(3000);
        await aimNearest(pg);
        await clearLogs(pg);
        await readMeter(pg, true);
        // Mình tự đánh 12 giây, xen chiêu ô 2 đến 6; bot đánh quanh đó.
        await pg.evaluate(() => window.__game!.useSkill(0));
        for (let i = 0; i < 10; i++) {
          await sleep(1200);
          await pg.evaluate((slot) => window.__game!.useSkill(slot), 1 + (i % 5));
        }
        const meter = await readMeter(pg, false);
        const dens = (await pg.evaluate(`(() => {
          const rows = window.__xuong.probe.rows, heard = rows.filter((r) => r.why === 'ok' || r.why === 'mute' || r.why === 'idle');
          let burst = 0, vol = 0;
          for (let i = 0; i < heard.length; i++) { let c = 0, v = 0; for (let j = i; j < heard.length && heard[j].at - heard[i].at < 100; j++) { c++; v += heard[j].vol; } if (c > burst) burst = c; if (v > vol) vol = v; }
          const span = rows.length ? (rows[rows.length - 1].at - rows[0].at) / 1000 : 0;
          return { calls: rows.length, heard: heard.length, throttled: rows.filter((r) => r.why === 'throttle').length, quiet: rows.filter((r) => r.why === 'quiet').length, burst, burstVol: Math.round(vol * 100) / 100, perSec: span > 0 ? Math.round((heard.length / span) * 10) / 10 : 0, capped: rows.length >= 600 };
        })()`)) as Record<string, number | boolean>;
        const seen = await others();
        console.log(`\n  Độ to khi ${joined} bot + mình cùng đánh (client thấy ${seen} người):`);
        if (meter)
          for (const [k, v] of Object.entries(meter.bus)) console.log(`    bus ${k.padEnd(8)} đỉnh giữ ${String(v.hold).padStart(6)} dBFS · chạm trần ${v.clips} lần`);
        else console.log('    (bản này chưa có đồng hồ từng bus)');
        console.log(`    lời gọi phát tiếng: ${JSON.stringify(dens)}${meter ? ` · AudioContext ${meter.state}, ${meter.voices} giọng đang phát` : ''}`);
        report.loud = { bots: joined, seen, meter, dens };
      } finally {
        await bots.stop();
      }
    }

    writeJson(r.out, 'xuong.json', report);
    await gm(pg, 'labreset', 1500);
    await gm(pg, 'dvt');
  },
} satisfies Scenario;
