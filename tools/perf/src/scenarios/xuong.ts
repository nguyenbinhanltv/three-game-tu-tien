// Diễn Võ Trường, xưởng âm thanh + xưởng animation (V2d): ĐO trong phòng tập, không chỉ bấm nút.
//   pnpm shots xuong --out <thư mục> [--query style=dahoa] [--only cast,anim,stopfade,ui,loud] [--paths kiem_tu,the_tu] [--ping 0] [--bots 8]
// - cast: với từng lối tu, dựng nhân vật thử rồi ra TỪNG ô chiêu lên một con sói bị khóa máu; engine đánh mốc vào thế / khung trúng của hoạt ảnh /
//   sát thương server về, đầu dò tiếng ghi mọi lời gọi phát tiếng (kể cả khi tắt tiếng). Báo lệch tiếng trúng so với khung trúng theo từng chiêu.
// - anim: chạy tới / lùi / ngang / dừng / né bằng phím thật, đo trượt chân theo clip nền và nhật ký chuyển clip; rồi ép một clip đứng yên (tua)
//   cho mình và cho quái, chụp ảnh, thả ra và kiểm game điều khiển lại.
// - loud: N bot cùng đánh một bầy sói trong phòng chung, mình đánh cùng; đồng hồ từng bus báo đỉnh (dBFS, đo trước âm lượng tổng nên đo được cả
//   khi tắt tiếng) và số lần chạm trần 0 dBFS, kèm mật độ lời gọi phát tiếng.
// - mons: gọi từng quái/boss (`--mons`, mặc định 12 con đại diện mỗi kiểu xương), cho nó đuổi rồi đánh mình; in trượt chân theo clip và nhật ký chuyển clip.
// - bossfade: thử A/B thời gian mờ vào của đòn lớn boss (`SKIN_TUNE.moveFade` ở skinned.ts): ép từng boss ra slam / sweep bằng `/gm cast`, in tốc độ
//   xoay khớp lớn nhất lúc clip đòn lên.
// - stopfade: thử A/B thời gian mờ vào của clip DỪNG (`PATCH_TUNE.stopFade` ở mannequin.ts): mỗi mức chạy rồi dừng 4 lần, in tốc độ xoay khớp
//   lớn nhất lúc clip dừng lên và độ trượt chân của nhịp dừng.
// - ui: gắn hai nhóm nút của xưởng (`ui/lab/WorkshopLab.tsx`) vào trang rồi BẤM NÚT THẬT: bật đo lệch, ra chiêu, đọc bảng ở lớp phủ; bật đo chân,
//   chạy, ép clip, kéo thanh thời gian, thả; chụp ảnh từng bước.
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
  blends: { from: string; to: string; ms: number; pop: number; spin: number; bone?: string }[];
  lift?: number;
  stride?: { key: string; n: number; speed: number; slip: number; refFix: number }[];
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
  usage: '[--query style=dahoa] [--only cast,anim,mons,bossfade,stopfade,ui,loud] [--mons id1,id2] [--bosses id1,id2] [--paths kiem_tu,the_tu] [--ping 0] [--wait 2200] [--bots 8]',
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
    // Ghi sau TỪNG phần: phần sau có lỗi thì số đo của phần trước vẫn còn.
    const save = () => writeJson(r.out, 'xuong.json', report);

    if (want('cast')) {
      const paths = PATHS.filter((p) => !pathIds.length || pathIds.includes(p.id));
      const all: { path: string; method: string; rows: CastRow[]; sum: CastSummary[]; meter: Meter | null; net: { ping: number; netLag: number } }[] = [];
      for (const p of paths) {
        const method = p.methods[0]!;
        await gm(pg, 'scene soi_thuong', 3500);
        await gm(pg, `build ${method} 30`, 1600);
        await gm(pg, 'lockhp on', 900);
        await gm(pg, 'charge', 900);
        // Đồng hồ sát thương bật thì tin S.DMG mang id chiêu (`sk`): bảng lệch quy đúng sát thương về chiêu, không lẫn độc/trận/thú triệu hồi.
        await gm(pg, 'dps start', 900);
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
        const onlySkills = opt('--skills', '').split(',').filter(Boolean);
        for (let slot = 0; slot < bar.length; slot++) {
          if (onlySkills.length && !onlySkills.includes(bar[slot]!)) continue;
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
        // Ping engine tự ước (gồm cả chờ tick và nhịp gửi patch) và độ bù trễ đang áp cho khung trúng.
        const net = await pg.evaluate(() => {
          const g = window.__game as unknown as { ping: number; skillPoses?: { netLag?: number } };
          return { ping: Math.round(g.ping), netLag: Math.round((g.skillPoses?.netLag ?? 0) * 1000) };
        });
        all.push({ path: p.id, method, rows, sum, meter, net });
        console.log(`\n  ${p.id} (${method}): ${rows.length} lần ra chiêu trên ${bar.length} ô${meter ? ` · đỉnh bus SFX ${meter.bus.sfx?.hold} dBFS, tổng ${meter.bus.sum?.hold} dBFS (${meter.state})` : ''} · ping engine ước ${net.ping} ms, bù khung trúng ${net.netLag} ms`);
        console.log('    chiêu                          lần  khung trúng−dữ liệu  sát thương về  tiếng vung  tiếng trúng (xấu nhất)  hỏng');
        for (const s of sum)
          console.log(
            `    ${s.key.padEnd(30)} ${String(s.n).padStart(3)}  ${f(s.planErrMs, ' ms').padStart(18)}  ${f(s.dmgMs, ' ms').padStart(13)}  ${f(s.swingMs, ' ms').padStart(10)}  ${(f(s.hitSndMs, ' ms') + ' (' + f(s.hitSndWorst) + ')').padStart(22)}  ${s.bad || ''}`,
          );
      }
      report.cast = all;
      save();
      const flat = all.flatMap((a) => a.sum.map((s) => ({ path: a.path, ...s })));
      const bad = flat.filter((s) => s.bad > 0);
      console.log(`\n  Tổng: ${flat.length} chiêu/đòn đã đo, ${bad.length} có lần lệch quá dung sai hoặc câm: ${bad.map((s) => `${s.path}:${s.key}`).join(', ') || 'không'}`);
    }

    if (want('anim')) {
      await gm(pg, 'scene soi_thuong', 3500);
      await gm(pg, 'lockhp on', 900);
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
      // Vết TỪNG KHUNG của hai bàn chân trong 2 giây chạy thẳng (sau 0,7 giây lấy đà): [ms, cao cm, trụ 0/1, tốc độ ngang m/s] × chân.
      await pg.keyboard.down('KeyW');
      await sleep(700);
      const feetTrace = (await pg.evaluate(`(async () => {
        const ws = window.__xuong.ws, out = [], t0 = performance.now();
        await new Promise((res) => {
          const f = () => {
            const s = ws.snapshot();
            out.push([Math.round(performance.now() - t0), ...s.feet.flatMap((x) => [Math.round(x.h * 1000) / 10, x.planted ? 1 : 0, Math.round(x.v * 100) / 100])]);
            if (performance.now() - t0 < 2000) requestAnimationFrame(f);
            else res();
          };
          requestAnimationFrame(f);
        });
        return out;
      })()`)) as number[][];
      await pg.keyboard.up('KeyW');
      {
        const n = feetTrace.length || 1;
        const plant = [2, 5].map((i) => feetTrace.filter((row) => row[i] === 1).length / n);
        const hs = feetTrace.flatMap((row) => [row[1] ?? 0, row[4] ?? 0]);
        const vPlanted = feetTrace.flatMap((row) => [row[2] === 1 ? row[3]! : -1, row[5] === 1 ? row[6]! : -1]).filter((v) => v >= 0);
        const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
        console.log(`\n  Vết chân khi chạy thẳng: ${feetTrace.length} khung; chân trụ ${(plant[0]! * 100).toFixed(0)}% / ${(plant[1]! * 100).toFixed(0)}% thời gian; cao ${Math.min(...hs).toFixed(1)} đến ${Math.max(...hs).toFixed(1)} cm; tốc độ ngang lúc trụ TB ${avg(vPlanted).toFixed(2)} m/s`);
      }
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
      console.log(`\n  Trượt chân (mình, xương ${moved.feet.map((x) => x.bone).join(' + ')}, ${moved.clips.length} clip, gốc nhân vật cao hơn mặt đất ${((moved.lift ?? 0) * 100).toFixed(0)} cm):`);
      console.log('    clip nền                 giây   đi (m)  trượt (cm)  cm/m   cm/s lúc trụ  đỉnh cm/s');
      for (const s of moved.slide)
        console.log(
          `    ${s.key.padEnd(24)} ${s.time.toFixed(1).padStart(4)}  ${s.travel.toFixed(1).padStart(6)}  ${(s.slide * 100).toFixed(1).padStart(9)}  ${(s.cmPerM === null ? '—' : s.cmPerM.toFixed(1)).padStart(5)}  ${s.cmPerS.toFixed(1).padStart(12)}  ${(s.peak * 100).toFixed(0).padStart(8)}`,
        );
      console.log('  Chuyển clip:');
      for (const b of moved.blends) console.log(`    ${b.from} → ${b.to}: ${b.ms} ms, bước nhảy trọng số ${b.pop}, khớp xoay nhanh nhất ${b.spin}°/s${b.bone ? ' (' + b.bone + ')' : ''}`);

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
      const monBones = (await pg.evaluate(`(() => { const g = window.__game, m = g.ents.monsters.get(g.targetId), p = m && m.model.labAnim && m.model.labAnim(); const out = []; if (p) p.rig.traverse((o) => { if (o.isBone) out.push(o.name); }); return out; })()`)) as string[];
      console.log(`  xương của quái đang nhắm (${monBones.length}): ${monBones.slice(0, 60).join(', ')}`);
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
      await pg.evaluate(`window.__xuong.ws.setSubject('me')`);
      report.anim = { slide: moved.slide, blends: moved.blends, clips: moved.clips, monClips: mon.clips, monBones, checks, trace, feetTrace };
      save();
    }

    if (want('mons')) {
      const ids = opt('--mons', 'mon_soi_xam,mon_thiet_boi_tru,mon_hoa_van_ho,mon_thach_vien,mon_ngo_cong_au,elite_huyet_nha_lang,boss_huyet_lang_vuong,boss_kiem_khoi,boss_han_giao,boss_thu_mo_tuong,boss_dia_mach_long,boss_kinh_nguyet_chan_quan')
        .split(',')
        .filter(Boolean);
      await gm(pg, 'labreset', 1800);
      await gm(pg, 'god on', 900);
      await gm(pg, 'lockhp on', 900);
      await gm(pg, 'freeze off', 900);
      const out: unknown[] = [];
      for (const id of ids) {
        await gm(pg, 'spawn clear', 1100);
        await gm(pg, `spawn ${id} 1`, 3200);
        const aim = await aimNearest(pg);
        if (!aim) {
          console.log(`  ${id}: không gọi được`);
          continue;
        }
        await pg.evaluate(`(() => { const w = window.__xuong.ws; w.setSubject('target'); w.start(); w.resetStats(); })()`);
        // Chạy ra xa cho quái đuổi (clip chạy), rồi đứng yên cho nó áp sát và đánh (chuyển chạy → đánh → đứng).
        for (const key of ['KeyW', 'KeyS']) {
          await pg.keyboard.down(key);
          await sleep(num('--runms', 2200));
          await pg.keyboard.up(key);
          await sleep(2600);
        }
        const sn = await animSnap(pg);
        const bones = sn.feet.length
          ? []
          : ((await pg.evaluate(`(() => { const g = window.__game, m = g.ents.monsters.get(g.targetId), p = m && m.model.labAnim && m.model.labAnim(); const o = []; if (p) p.rig.traverse((b) => { if (b.isBone) o.push(b.name); }); return o; })()`)) as string[]);
        const worst = sn.blends.reduce<(typeof sn.blends)[number] | null>((w, b) => (!w || b.spin > w.spin ? b : w), null);
        const hard = sn.blends.filter((b) => b.pop >= 0.5);
        console.log(`\n  ${id}: ${sn.ok ? `${sn.clips.length} clip (${sn.clips.map((c) => c.name).join(', ')}), chân: ${sn.feet.map((x) => x.bone).join(' ') || 'KHÔNG THẤY'}` : 'không có cổng soi (model khối hoặc chưa nạp)'}`);
        for (const s of sn.stride ?? [])
          console.log(`    sải ${s.key.padEnd(10)} ${String(s.n).padStart(4)} mẫu · thân ${s.speed.toFixed(1)} m/s · chân trụ trôi ${(s.slip * 100).toFixed(0)}% tốc độ thân${Math.abs(s.slip) > 0.25 ? ' (QUÁ NGƯỠNG)' : ''} · refSpeed nên × ${s.refFix.toFixed(2)}`);
        console.log(`    chuyển clip: ${sn.blends.length} lần, ${hard.length} lần đổi cứng${hard.length ? ' (' + [...new Set(hard.map((b) => b.from + '→' + b.to))].join(', ') + ')' : ''}; xoay nhanh nhất ${worst ? `${worst.spin}°/s ở ${worst.bone} (${worst.from}→${worst.to}, ${worst.ms} ms)` : '—'}`);
        if (bones.length) console.log(`    xương (${bones.length}): ${bones.slice(0, 50).join(', ')}`);
        out.push({ id, ok: sn.ok, clips: sn.clips, feet: sn.feet.map((x) => x.bone), slide: sn.slide, stride: sn.stride, blends: sn.blends, bones });
      }
      await pg.evaluate(`(() => { const w = window.__xuong.ws; w.stop(); w.setSubject('me'); })()`);
      await gm(pg, 'spawn clear', 1100);
      report.mons = out;
      save();
    }

    if (want('bossfade')) {
      const ids = opt('--bosses', 'boss_thu_mo_tuong,boss_kiem_khoi,boss_huyet_lang_vuong,boss_kinh_nguyet_chan_quan')
        .split(',')
        .filter(Boolean);
      await gm(pg, 'labreset', 1800);
      await gm(pg, 'god on', 900);
      await gm(pg, 'lockhp on', 900);
      await pg.evaluate(`(async () => { window.__xuong.sk = await import('/src/game/character/skinned.ts'); })()`);
      const base = (await pg.evaluate(`window.__xuong.sk.SKIN_TUNE.moveFade`)) as number;
      const acc = new Map<number, { spin: number[]; pop: number[]; ms: number[] }>();
      const rowsOut: unknown[] = [];
      console.log(`\n  Thử thời gian mờ vào của đòn lớn boss (đang dùng ${base} s):`);
      for (const id of ids) {
        await gm(pg, 'spawn clear', 1100);
        await gm(pg, `spawn ${id} 1`, 3200);
        const aim = await aimNearest(pg);
        if (!aim) continue;
        await tp(pg, aim.x, aim.z - 5);
        await sleep(600);
        await aimNearest(pg);
        await pg.evaluate(`(() => { const w = window.__xuong.ws; w.setSubject('target'); w.start(); })()`);
        for (const fade of [0.07, 0.14, 0.2]) {
          await pg.evaluate(`(() => { window.__xuong.sk.SKIN_TUNE.moveFade = ${fade}; window.__xuong.ws.resetStats(); })()`);
          for (const kind of ['slam', 'sweep', 'slam', 'sweep']) {
            await gm(pg, 'cast ' + kind, 1100);
            await sleep(2600);
          }
          const sn = await animSnap(pg);
          const mv = sn.blends.filter((b) => b.to === 'slam' || b.to === 'sweep');
          const a = acc.get(fade) ?? { spin: [], pop: [], ms: [] };
          acc.set(fade, a);
          for (const b of mv) {
            a.spin.push(b.spin);
            a.pop.push(b.pop);
            a.ms.push(b.ms);
          }
          rowsOut.push({ id, fade, moves: mv });
          console.log(`    ${id} mờ vào ${fade.toFixed(2)} s: ${mv.length} lần vào đòn · ${mv.map((b) => `${b.from}→${b.to} ${b.spin}°/s ${b.bone ?? ''} (${b.ms} ms, nhảy ${b.pop})`).join(' | ') || 'không ghi được lần nào'}`);
        }
      }
      const med = (xs: number[]) => {
        const s2 = [...xs].sort((p, q) => p - q);
        return s2.length ? s2[s2.length >> 1]! : 0;
      };
      for (const [fade, a] of acc) console.log(`  TỔNG mờ vào ${fade.toFixed(2)} s: ${a.spin.length} lần · xoay khớp trung vị ${med(a.spin)}°/s, lớn nhất ${Math.max(0, ...a.spin)} · bước nhảy trọng số trung vị ${med(a.pop)} · lên trong ${med(a.ms)} ms`);
      await pg.evaluate(`(() => { window.__xuong.sk.SKIN_TUNE.moveFade = ${base}; const w = window.__xuong.ws; w.stop(); w.setSubject('me'); })()`);
      await gm(pg, 'cast off', 1100);
      await gm(pg, 'spawn clear', 1100);
      report.bossfade = rowsOut;
      save();
    }

    if (want('stopfade')) {
      await gm(pg, 'scene soi_thuong', 3500);
      await pg.evaluate(`(async () => { window.__xuong.mq = await import('/src/game/character/mannequin.ts'); window.__xuong.ws.setSubject('me'); window.__xuong.ws.start(); })()`);
      const base = (await pg.evaluate(`window.__xuong.mq.PATCH_TUNE.stopFade`)) as number;
      const med = (xs: number[]) => {
        const a = [...xs].sort((x, y) => x - y);
        return a.length ? a[a.length >> 1]! : 0;
      };
      const out: { fade: number; bone: string; stops: number; spin: number; spinMax: number; ms: number; cmPerM: number | null }[] = [];
      console.log(`\n  Thử thời gian mờ vào của clip dừng (đang dùng ${base} s):`);
      for (const fade of [0.06, 0.1, 0.14, 0.18]) {
        await pg.evaluate(`(() => { window.__xuong.mq.PATCH_TUNE.stopFade = ${fade}; window.__xuong.ws.resetStats(); })()`);
        for (let i = 0; i < 4; i++) {
          await pg.keyboard.down(i % 2 ? 'KeyS' : 'KeyW');
          await sleep(1300);
          await pg.keyboard.up(i % 2 ? 'KeyS' : 'KeyW');
          await sleep(1400);
        }
        const sn = await animSnap(pg);
        const stops = sn.blends.filter((b) => /_To_Idle$/.test(b.to));
        const sl = sn.slide.filter((x) => /_To_Idle$/.test(x.key));
        const travel = sl.reduce((a, x) => a + x.travel, 0);
        const worst = stops.reduce<(typeof stops)[number] | null>((w, b) => (!w || b.spin > w.spin ? b : w), null);
        const row = {
          fade,
          bone: worst?.bone ?? '',
          stops: stops.length,
          spin: med(stops.map((b) => b.spin)),
          spinMax: Math.max(0, ...stops.map((b) => b.spin)),
          ms: med(stops.map((b) => b.ms)),
          cmPerM: travel > 0.3 ? Math.round((sl.reduce((a, x) => a + x.slide, 0) / travel) * 1000) / 10 : null,
        };
        out.push(row);
        console.log(`    mờ vào ${fade.toFixed(2)} s: ${row.stops} lần dừng · khớp xoay nhanh nhất trung vị ${row.spin}°/s (lớn nhất ${row.spinMax}${row.bone ? ' ở ' + row.bone : ''}) · clip dừng lên trong ${row.ms} ms · trượt chân nhịp dừng ${row.cmPerM ?? '—'} cm/m`);
      }
      await pg.evaluate(`(() => { window.__xuong.mq.PATCH_TUNE.stopFade = ${base}; window.__xuong.ws.stop(); })()`);
      report.stopfade = out;
      save();
    }

    if (want('ui')) {
      await gm(pg, 'scene soi_thuong', 3500);
      const aim = await aimNearest(pg);
      if (aim) await tp(pg, aim.x, aim.z - 4);
      await sleep(500);
      await aimNearest(pg);
      await pg.evaluate(`(async () => {
        const m = await import('/src/ui/lab/WorkshopLab.tsx');
        m.labCastOn(false);
        const el = document.createElement('div');
        el.className = 'debug-panel';
        el.setAttribute('data-testid', 'xuong-controls');
        document.body.appendChild(el);
        window.__xuong.unmount = m.mountWorkshopControls(el);
      })()`);
      await sleep(600);
      const checks: { name: string; ok: boolean; note?: string }[] = [];
      const check = (name: string, ok: boolean, note?: string) => {
        checks.push({ name, ok, note });
        console.log(`  ${ok ? 'ĐẠT ' : 'HỎNG'} ${name}${note ? ' — ' + note : ''}`);
      };
      const btn = (name: string | RegExp) => pg.locator('[data-testid="xuong-controls"] button', { hasText: name }).first();
      await btn('Lệch theo chiêu').click();
      await sleep(400);
      check('nút "Lệch theo chiêu" hiện lớp phủ số đo', (await pg.locator('[data-testid="lab-ws"]').count()) === 1);
      await pg.evaluate(() => window.__game!.useSkill(1));
      await sleep(2200);
      await pg.evaluate(() => window.__game!.useSkill(2));
      await sleep(2200);
      const castRowsUi = await pg.locator('[data-testid="lab-cast"] tbody tr').allInnerTexts();
      check('ra hai chiêu thì bảng có dòng theo từng chiêu, có số tiếng trúng', castRowsUi.length >= 1 && castRowsUi.some((x) => /[+-]?\d/.test(x)), castRowsUi.map((x) => x.replace(/\s+/g, ' ')).join(' ‖ '));
      await snap(pg, r.out, 'ui-1-lech-theo-chieu.png', { wait: 200 });
      await btn(/^Mình$/).click();
      await btn('Đo chân và chuyển clip').click();
      await sleep(400);
      await pg.keyboard.down('KeyW');
      await sleep(1600);
      await pg.keyboard.up('KeyW');
      await sleep(900);
      const slideUi = await pg.locator('[data-testid="lab-slide"] tbody tr').allInnerTexts();
      const blendUi = await pg.locator('[data-testid="lab-blend"] tbody tr').count();
      check('bật "Đo chân và chuyển clip" rồi chạy: có bảng trượt chân và nhật ký chuyển clip', slideUi.length >= 1 && blendUi >= 1, `${slideUi.length} dòng trượt chân, ${blendUi} lần chuyển clip`);
      await snap(pg, r.out, 'ui-2-truot-chan.png', { wait: 200 });
      await btn('Ép clip').click();
      await sleep(500);
      const seek = pg.locator('[data-testid="lab-clip-seek"]');
      const max = Number(await seek.getAttribute('max'));
      // Thanh kéo `range` do React quản: đặt giá trị bằng setter gốc rồi phát sự kiện `input` (Playwright `fill` không nhận loại ô này).
      await seek.evaluate((el, v) => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        set.call(el, String(v));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, max / 2);
      await sleep(500);
      const now1 = await pg.locator('[data-testid="lab-clip-now"]').innerText();
      await btn('▶').click();
      await sleep(350);
      const now2 = await pg.locator('[data-testid="lab-clip-now"]').innerText();
      check('"Ép clip" + kéo thanh thời gian + nút ▶: dòng trạng thái ghi clip đang ép và mốc đổi theo', /đang ép/.test(now1) && now1 !== now2, `${now1} → ${now2}`);
      await snap(pg, r.out, 'ui-3-ep-clip.png', { wait: 200 });
      await btn('Thả').click();
      await sleep(500);
      const now3 = await pg.locator('[data-testid="lab-clip-now"]').innerText();
      check('"Thả" trả quyền cho game', /đang phát/.test(now3), now3);
      await btn('Đo chân và chuyển clip').click();
      await btn('Lệch theo chiêu').click();
      await sleep(400);
      check('tắt cả hai nút thì lớp phủ biến mất', (await pg.locator('[data-testid="lab-ws"]').count()) === 0);
      await pg.evaluate(`(() => { window.__xuong.unmount(); document.querySelector('[data-testid="xuong-controls"]').remove(); window.__xuong.cast.castMarks.on = true; })()`);
      report.ui = checks;
      save();
    }

    if (want('loud')) {
      const n = num('--bots', 8);
      const key = 'loud' + n;
      await gm(pg, 'dvt ' + key);
      await waitLevel(pg, 'dien_vo');
      await gm(pg, 'spawn mon_soi_xam 8', 1800);
      await gm(pg, 'lockhp on', 900);
      await gm(pg, 'god on', 900);
      const bots = new Bots(r.port);
      try {
        const joined = await bots.start(n, 'ld' + n + 'b', ['--gm', 'dvt ' + key, '--fight', '1300,985,14']);
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
        // Bộ chặn đỉnh: dựng lại đúng chuỗi của game (hạ 1/4 → WaveShaper với bảng `limitTable`) trong OfflineAudioContext, cho sóng sin biên độ
        // 0,5 (phải giữ nguyên) và 1,5 (trước đây bị xén cứng) đi qua rồi đo đỉnh. Loa đang tắt tiếng nên không đo được ở đầu ra thật.
        const lim = (await pg.evaluate(`(async () => {
          const L = await import('/src/game/audio/limiter.ts');
          const run = async (amp) => {
            const c = new OfflineAudioContext(1, 4800, 48000);
            const o = c.createOscillator(); o.frequency.value = 440;
            const g = c.createGain(); g.gain.value = amp;
            const pre = c.createGain(); pre.gain.value = 1 / L.LIMIT_RANGE;
            const sh = c.createWaveShaper(); sh.curve = L.limitTable();
            o.connect(g).connect(pre).connect(sh).connect(c.destination); o.start();
            const d = (await c.startRendering()).getChannelData(0);
            let peak = 0; for (let i = 480; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
            return Math.round(peak * 1000) / 1000;
          };
          return { half: await run(0.5), over: await run(1.5), far: await run(6) };
        })()`)) as { half: number; over: number; far: number };
        console.log(`    bộ chặn đỉnh (WebAudio thật, ngoại tuyến): sin 0,5 → đỉnh ${lim.half}; sin 1,5 → đỉnh ${lim.over}; sin 6 → đỉnh ${lim.far}`);
        console.log(`\n  Độ to khi ${joined} bot + mình cùng đánh (client thấy ${seen} người):`);
        if (meter)
          for (const [k, v] of Object.entries(meter.bus)) console.log(`    bus ${k.padEnd(8)} đỉnh giữ ${String(v.hold).padStart(6)} dBFS · chạm trần ${v.clips} lần`);
        else console.log('    (bản này chưa có đồng hồ từng bus)');
        console.log(`    lời gọi phát tiếng: ${JSON.stringify(dens)}${meter ? ` · AudioContext ${meter.state}, ${meter.voices} giọng đang phát` : ''}`);
        // Đám đông TỔNG HỢP: bot có thể không lọt vào tầm nhìn của client, nên bắn thẳng tiếng đòn của 8 người đứng cách 3 đến 9 m qua đúng hàm `sfx`
        // của game (cùng âm lượng theo vai người khác: tiếng vung 0,45 × 0,6, tiếng trúng × 0,5, có giãn 45 ms), trong lúc mình vẫn tự đánh thật.
        await readMeter(pg, true);
        await clearLogs(pg);
        const synth = (await pg.evaluate(`(async () => {
          const a = window.__xuong.audio, g = window.__game, me = g.info();
          const foes = Array.from({ length: 8 }, (_, i) => ({ x: me.x + Math.cos(i * 0.785) * (3 + (i % 4) * 2), z: me.z + Math.sin(i * 0.785) * (3 + (i % 4) * 2), next: performance.now() + i * 53, n: 0 }));
          const vol = (f) => Math.max(0.15, 1 - Math.hypot(f.x - me.x, f.z - me.z) / 40);
          const t0 = performance.now();
          let shots = 0;
          await new Promise((res) => {
            const tick = () => {
              const now = performance.now();
              for (const f of foes) {
                if (now < f.next) continue;
                f.next = now + 420 + (f.n % 3 === 2 ? 180 : 0);
                f.n++;
                shots++;
                a.sfx('sword', vol(f) * 0.45 * 0.6, f, false, { rate: 1 });
                setTimeout(() => a.sfx(f.n % 5 === 0 ? 'crit' : 'hit', vol(f) * 0.5, f, true, { rate: 1 }), 200);
              }
              if (now - t0 < 10000) requestAnimationFrame(tick);
              else res();
            };
            requestAnimationFrame(tick);
          });
          return { shots };
        })()`)) as { shots: number };
        await sleep(600);
        const meter8 = await readMeter(pg, false);
        const dens8 = (await pg.evaluate(`(() => { const rows = window.__xuong.probe.rows; return { calls: rows.length, heard: rows.filter((r) => r.why === 'ok' || r.why === 'mute' || r.why === 'idle').length, throttled: rows.filter((r) => r.why === 'throttle').length }; })()`)) as Record<string, number>;
        console.log(`    8 người TỔNG HỢP (${synth.shots} đòn trong 10 giây) + mình đánh thật: ${meter8 ? `bus SFX đỉnh ${meter8.bus.sfx?.hold} dBFS, tổng ${meter8.bus.sum?.hold} dBFS, chạm trần ${meter8.bus.sum?.clips} lần` : 'không có đồng hồ'} · lời gọi ${JSON.stringify(dens8)}`);
        report.loud = { bots: joined, seen, meter, dens, limiter: lim, synth: { shots: synth.shots, meter: meter8, dens: dens8 } };
      } finally {
        await bots.stop();
      }
    }

    save();
    await gm(pg, 'labreset', 1500);
    await gm(pg, 'dvt');
  },
} satisfies Scenario;
