// Diễn Võ Trường, khu Giao diện (V2c): kiểm CÔNG CỤ giao diện của phòng thử bằng bấm nút thật + hai phép đo tự động.
//   pnpm shots labui --out <thư mục> [--query style=dahoa] [--only tools,contrast,motion]
// - tools: bấm các nút mới của tab Diễn Võ (nhật ký điều khiển, khoảnh khắc đợt hai, máu/linh lực giả, kiểm máy yếu) rồi đối chiếu trạng thái game.
// - contrast: TƯƠNG PHẢN CHỮ của HUD trên nền game thật (WCAG): chụp HUD với chữ trong suốt để lấy nền ngay dưới từng dòng chữ, tính tỉ lệ tương phản
//   của màu chữ với từng điểm ảnh nền; báo dòng có phân vị 10% dưới 4,5 (chữ thường) hoặc 3 (chữ lớn ≥ 24 px, hoặc ≥ 18,7 px đậm).
//   Giới hạn: WCAG không tính bóng chữ/viền chữ, nên chữ có bóng đậm đọc được hơn con số ở đây.
// - motion: bật "Giảm chuyển động", gọi mọi khoảnh khắc rồi đếm animation CSS còn chạy trong HUD (phải bằng 0, trừ danh sách cho phép).
import { opt } from '../lib/env';
import { gm, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import sharp from 'sharp';
import { sleep } from '../lib/devserver';
import { snap, writeJson } from '../lib/shot';

interface TextBox {
  text: string;
  sel: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Màu chữ đã tính (r, g, b, a). */
  c: [number, number, number, number];
  px: number;
  bold: boolean;
  shadow: boolean;
}

const lin = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
/** Tỉ lệ tương phản WCAG giữa hai độ chói tương đối. */
export const contrast = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export default {
  name: 'labui',
  desc: 'Diễn Võ Trường, khu Giao diện: bấm nút công cụ mới, đo tương phản chữ HUD trên nền thật, kiểm giảm chuyển động',
  usage: '[--query style=dahoa] [--only tools,contrast,motion]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const query = opt('--query', '');
    const only = opt('--only', '')
      .split(',')
      .filter(Boolean);
    const want = (k: string) => !only.length || only.includes(k);
    const { page: pg } = await r.open({
      name: 'LabUi',
      quality: 'high',
      viewport: [1280, 720],
      query: { cam: 'iso', quiet: 1 },
      extra: query,
      seenIntro: true,
    });
    await skipCutscene(pg, 20);
    await gm(pg, 'dvt');
    await waitLevel(pg, 'dien_vo');
    await gm(pg, 'scene soi_thuong', 3500);
    await gm(pg, 'face 90', 900);
    await gm(pg, 'lockhp', 900);
    await pg.evaluate(`(() => { var g = window.__game, id = g.ents.monsters.keys().next().value; if (id) g.setTarget(id, 'mon'); })()`);
    const checks: { name: string; ok: boolean; note?: string }[] = [];
    const check = (name: string, ok: boolean, note?: string) => {
      checks.push({ name, ok, note });
      console.log(`  ${ok ? 'ĐẠT ' : 'HỎNG'} ${name}${note ? ' — ' + note : ''}`);
    };
    const btn = (name: string | RegExp) => pg.locator('.debug-panel button', { hasText: name }).first();

    if (want('tools')) {
      await pg.keyboard.press('F3');
      await sleep(600);
      await btn(/^Giao diện$/).click();
      await sleep(250);
      // Mọi nút của nhóm Giao diện phải nằm trong khung 720p (bảng F3 không cuộn được).
      // Nút bị khuất = đáy nút nằm dưới đáy phần nhìn thấy của bảng (bảng có chiều cao tối đa, phần thừa bị cắt) hoặc dưới mép màn hình.
      const outside = await pg.evaluate(() => {
        const lim = Math.min(innerHeight, document.querySelector('.debug-panel')!.getBoundingClientRect().bottom) + 1;
        return [...document.querySelectorAll('.debug-panel button')].filter((b) => b.getBoundingClientRect().bottom > lim).length;
      });
      check('mọi nút của nhóm Giao diện nằm trong khung 720p', outside === 0, `${outside} nút ngoài khung`);
      await snap(pg, r.out, 'tools-0-nhom.png', { wait: 200 });

      // Nhật ký điều khiển: bật, ra một chiêu bằng phím, đọc dòng ghi được; rồi bật ping giả 150 ms và so khứ hồi.
      await btn('Nhật ký điều khiển').click();
      await sleep(400);
      check('nút "Nhật ký điều khiển" hiện lớp phủ', (await pg.locator('.lab-trace').count()) === 1);
      const cast = async (key: string) => {
        await pg.evaluate(() => window.__game!.labTrace?.clear());
        await pg.keyboard.press(key);
        await sleep(1900);
        return pg.evaluate(() => {
          const row = (window.__game!.labTrace?.rows ?? []).find((x) => x.type === 'sk' && x.key !== null);
          return row ? { key: row.key, hold: row.keyAt === null ? null : row.sendAt - row.keyAt, ack: row.ackAt === null ? null : row.ackAt - row.sendAt, hit: row.hitAt === null ? null : row.hitAt - row.sendAt, label: row.label } : null;
        });
      };
      const t0 = await cast('Digit2');
      check('bấm phím chiêu ghi một dòng có phím, có server trả lời', !!t0 && t0.key === 'Digit2' && t0.ack !== null, t0 ? `${t0.label}: chờ ${Math.round(t0.hold ?? -1)} ms, server ${Math.round(t0.ack ?? -1)} ms, trúng ${t0.hit === null ? '—' : Math.round(t0.hit) + ' ms'}` : 'không có dòng nào');
      await pg.evaluate(() => void (window.__game!.fakePing = 150));
      await sleep(1200);
      const t1 = await cast('Digit3');
      check('ping giả 150 ms: khứ hồi server ít nhất 140 ms và dài hơn lúc không có ping giả', !!t0 && !!t1 && t0.ack !== null && t1.ack !== null && t1.ack >= 140 && t1.ack > t0.ack + 60, t0 && t1 ? `${Math.round(t0.ack ?? -1)} → ${Math.round(t1.ack ?? -1)} ms` : 'thiếu dòng');
      await pg.evaluate(() => void (window.__game!.fakePing = 0));
      await snap(pg, r.out, 'tools-1-nhat-ky.png', { wait: 200 });
      await btn('Nhật ký điều khiển').click();
      await sleep(300);
      check('bấm lại thì lớp phủ tắt và engine thôi ghi', (await pg.locator('.lab-trace').count()) === 0 && (await pg.evaluate(() => window.__game!.labTrace === null)));

      // Máu / linh lực giả trên HUD.
      const hpText = () => pg.evaluate(() => (document.querySelector('[data-testid="vitals-dock"] .u2-bar__text')?.textContent ?? '').match(/(\d+)\s*\/\s*(\d+)/)?.slice(1, 3).map(Number) ?? null);
      const real = await hpText();
      await btn('Máu 10%').click();
      await sleep(500);
      const fake = await hpText();
      check('nút "Máu 10%" đổi số máu trên HUD', !!fake && fake[1]! > 0 && Math.abs(fake[0]! / fake[1]! - 0.1) < 0.02, `${real?.join('/')} → ${fake?.join('/')}`);
      const srvHp = await pg.evaluate(() => {
        const me = window.__game!.me?.() as { hp: number; mhp: number } | undefined;
        return me ? me.hp / me.mhp : -1;
      });
      check('máu thật của nhân vật (state server) không đổi', srvHp > 0.5, `máu thật ${Math.round(srvHp * 100)}%`);
      await snap(pg, r.out, 'tools-2-mau-thap.png', { wait: 200 });
      await btn('Số thật').click();
      await sleep(500);
      const back = await hpText();
      check('nút "Số thật" trả HUD về máu thật', !!back && !!real && back[0] === real[0], `${back?.join('/')}`);

      // Khoảnh khắc đợt hai.
      await btn('Lời mời').click();
      await sleep(500);
      check('nút "Lời mời" hiện hai thẻ mời', (await pg.locator('.pty-invite').count()) === 2);
      await btn('Thẻ chiêu cuối').click();
      await sleep(200);
      check('nút "Thẻ chiêu cuối" hiện thẻ', (await pg.locator('.ult-card').count()) >= 1);
      await snap(pg, r.out, 'tools-3-loi-moi.png', { wait: 0 });
      await btn('Bảng tổng kết').click();
      await sleep(700);
      check('nút "Bảng tổng kết" hiện bảng bốn dòng', (await pg.locator('[data-testid="recap-row"]').count()) === 4);
      await snap(pg, r.out, 'tools-4-tong-ket.png', { wait: 200 });
      await pg.keyboard.press('Escape');
      await sleep(500);
      if ((await pg.locator('[data-testid="recap-row"]').count()) > 0) await pg.locator('button', { hasText: 'Đóng' }).first().click().catch(() => undefined);
      await sleep(300);

      // Kiểm máy yếu: đổi preset ngay tại chỗ.
      await btn(/^Nền và màu$/).click();
      await sleep(250);
      await btn(/^Thấp$/).click();
      await sleep(1200);
      const q1 = await pg.evaluate(() => [localStorage.getItem('dtl.quality'), localStorage.getItem('dtl.qualityLock')]);
      check('nút preset "Thấp" đổi preset và khóa', q1[0] === 'low' && q1[1] === '1', q1.join(', '));
      await snap(pg, r.out, 'tools-5-preset-thap.png', { wait: 300 });
      await btn(/^Cao$/).click();
      await sleep(1200);
      check('nút preset "Cao" trả về', (await pg.evaluate(() => localStorage.getItem('dtl.quality'))) === 'high');
      const href = await pg.locator('.debug-panel [data-lab-renderer="webgl2"]').getAttribute('data-href');
      check('nút "WebGL2 (tải lại)" trỏ tới URL có renderer=webgl2', !!href && /[?&]renderer=webgl2/.test(href), href ?? 'không có');
      await pg.keyboard.press('F3');
      await sleep(400);
    }

    if (want('contrast')) {
      // HUD nặng nhất để có đủ loại chữ (tổ đội, nhiệm vụ, thanh boss, thông báo, nhật ký).
      await pg.evaluate(() => {
        window.__game!.labMoment('clear');
        window.__game!.labHudLoad(true);
      });
      await sleep(1200);
      const boxes = (await pg.evaluate(`(() => {
        var out = [], vw = innerWidth, vh = innerHeight;
        var walker = document.createTreeWalker(document.querySelector('.hud'), NodeFilter.SHOW_TEXT);
        var seen = new Set();
        for (var n = walker.nextNode(); n; n = walker.nextNode()) {
          var txt = (n.textContent || '').trim();
          var e = n.parentElement;
          if (!txt || !e || seen.has(e) || e.closest('.debug-panel, .lab-trace')) continue;
          seen.add(e);
          var cs = getComputedStyle(e), vis = true;
          for (var p = e; p && p !== document.body; p = p.parentElement) { var ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden' || Number(ps.opacity) < 0.5) { vis = false; break; } }
          if (!vis) continue;
          var range = document.createRange(); range.selectNodeContents(n);
          var r = range.getBoundingClientRect();
          if (r.width < 6 || r.height < 6 || r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) continue;
          // Chữ tô bằng nền cắt theo chữ (gradient vàng của tên boss...) không có một màu chữ để đo: bỏ qua, đếm riêng.
          if ((cs.webkitBackgroundClip || cs.backgroundClip) === 'text' || cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)') { out.push({ skip: true, text: txt.slice(0, 28) }); continue; }
          var m = cs.color.match(/[\\d.]+/g) || ['255', '255', '255'];
          var name = (typeof e.className === 'string' ? e.className : '').trim().split(/\\s+/)[0] || e.tagName.toLowerCase();
          var par = e.parentElement && typeof e.parentElement.className === 'string' ? e.parentElement.className.trim().split(/\\s+/)[0] : '';
          out.push({ text: txt.slice(0, 28), sel: (par ? par + ' > ' : '') + name, x: r.left, y: r.top, w: r.width, h: r.height, c: [Number(m[0]), Number(m[1]), Number(m[2]), m.length > 3 ? Number(m[3]) : 1], px: parseFloat(cs.fontSize), bold: Number(cs.fontWeight) >= 600, shadow: cs.textShadow !== 'none' || (cs.webkitTextStrokeWidth && cs.webkitTextStrokeWidth !== '0px') });
        }
        return out;
      })()`)) as (TextBox & { skip?: boolean })[];
      const skipped = boxes.filter((b) => b.skip).map((b) => b.text);
      await snap(pg, r.out, 'contrast-0-hud.png', { wait: 0 });
      // Chữ trong suốt (kể cả bóng, viền chữ) → ảnh chỉ còn NỀN dưới từng dòng chữ.
      const style = await pg.addStyleTag({ content: '.hud, .hud * { color: transparent !important; text-shadow: none !important; -webkit-text-stroke-color: transparent !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; }' });
      await sleep(250);
      const bg = await pg.screenshot();
      await style.evaluate((e) => (e as HTMLElement).remove());
      const { data, info } = await sharp(bg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const rows = boxes
        .filter((b) => !b.skip)
        .map((b) => {
          const ratios: number[] = [];
          const x0 = Math.max(0, Math.floor(b.x));
          const y0 = Math.max(0, Math.floor(b.y));
          const x1 = Math.min(info.width, Math.ceil(b.x + b.w));
          const y1 = Math.min(info.height, Math.ceil(b.y + b.h));
          for (let y = y0; y < y1; y += 2)
            for (let x = x0; x < x1; x += 2) {
              const i = (y * info.width + x) * 3;
              const [br, bgc, bb] = [data[i]!, data[i + 1]!, data[i + 2]!];
              // Chữ bán trong suốt: trộn với nền trước khi tính.
              const a = b.c[3];
              const fg = lum(b.c[0] * a + br * (1 - a), b.c[1] * a + bgc * (1 - a), b.c[2] * a + bb * (1 - a));
              ratios.push(contrast(fg, lum(br, bgc, bb)));
            }
          ratios.sort((p, q) => p - q);
          const at = (f: number) => ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * f))] ?? 0;
          const large = b.px >= 24 || (b.px >= 18.66 && b.bold);
          const need = large ? 3 : 4.5;
          return { ...b, p10: Math.round(at(0.1) * 100) / 100, median: Math.round(at(0.5) * 100) / 100, need, ok: at(0.1) >= need };
        })
        .filter((x) => x.w * x.h >= 60);
      const bad = rows.filter((x) => !x.ok).sort((a, b) => a.p10 - b.p10);
      console.log(`[shots:labui] tương phản chữ HUD: ${rows.length} dòng chữ, ${bad.length} dưới ngưỡng WCAG AA (phân vị 10%); ${skipped.length} dòng tô bằng nền cắt theo chữ không đo được`);
      for (const x of bad.slice(0, 40))
        console.log(`  HỎNG ${x.p10.toFixed(2)} (giữa ${x.median.toFixed(2)}, cần ${x.need}) ${x.px}px${x.bold ? ' đậm' : ''}${x.shadow ? ' có bóng' : ''} "${x.text}" [${x.sel}]`);
      // Ảnh đánh dấu: khung đỏ quanh dòng hỏng.
      const marks = bad
        .map((x) => `<rect x="${Math.round(x.x) - 1}" y="${Math.round(x.y) - 1}" width="${Math.round(x.w) + 2}" height="${Math.round(x.h) + 2}" fill="none" stroke="${x.shadow ? '#ffb020' : '#ff3030'}" stroke-width="1.5"/>`)
        .join('');
      await sharp(await pg.screenshot())
        .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${marks}</svg>`), left: 0, top: 0 }])
        .png()
        .toFile(`${r.out}/contrast-1-danh-dau.png`);
      writeJson(r.out, 'labui-contrast.json', { query, total: rows.length, bad: bad.length, skipped, rows });
      await pg.evaluate(() => void window.__game!.labHudLoad(false));
    }

    if (want('motion')) {
      const running = () =>
        pg.evaluate(`(() => document.getAnimations().filter((a) => {
          var t = a.effect && a.effect.target; if (!t || !t.closest || !t.closest('.hud') || t.closest('.debug-panel, .lab-trace')) return false;
          var tm = a.effect.getComputedTiming(); if (a.playState !== 'running' || Number(tm.duration) <= 50) return false;
          // Mờ dần / đổi màu không phải chuyển động (WCAG 2.3.3 nói về dịch chuyển, phóng, xoay): chỉ tính animation có thuộc tính khác nhóm đó.
          var calm = { opacity: 1, color: 1, backgroundColor: 1, borderColor: 1, visibility: 1, filter: 1, boxShadow: 1, offset: 1, easing: 1, composite: 1, computedOffset: 1 };
          return a.effect.getKeyframes().some((k) => Object.keys(k).some((p) => !calm[p]));
        }).map((a) => { var t = a.effect.target; return (a.animationName || a.transitionProperty || 'anim') + ' @ ' + ((typeof t.className === 'string' ? t.className : '').trim().split(/\\s+/).slice(0, 2).join('.') || t.tagName.toLowerCase()); }))()`) as Promise<string[]>;
      const fire = async () => {
        await pg.evaluate(() => {
          const g = window.__game!;
          g.labHudLoad(true);
          for (const k of ['toast', 'log', 'bossline', 'loot', 'invite', 'ult', 'chapter']) g.labMoment(k);
          g.labNumbers('mix', 10, 40);
        });
        await sleep(450);
      };
      await pg.evaluate(() => void (document.documentElement.dataset.reduceMotion = 'false'));
      await fire();
      const normal = await running();
      await sleep(4500);
      await pg.evaluate(() => void (document.documentElement.dataset.reduceMotion = 'true'));
      await sleep(300);
      await fire();
      const reduced = await running();
      await snap(pg, r.out, 'motion-giam.png', { wait: 0 });
      const uniq = [...new Set(reduced)].sort();
      console.log(`[shots:labui] giảm chuyển động: thường ${normal.length} animation có dịch chuyển đang chạy trong HUD, khi bật giảm còn ${reduced.length}`);
      for (const s of uniq) console.log(`  CÒN CHẠY ${s} ×${reduced.filter((x) => x === s).length}`);
      check('bật giảm chuyển động thì HUD không còn animation dịch chuyển/phóng/xoay', reduced.length === 0, `${reduced.length} còn chạy (${uniq.length} loại)`);
      writeJson(r.out, 'labui-motion.json', { normal: [...new Set(normal)].sort(), reduced: uniq });
      await pg.evaluate(() => {
        document.documentElement.dataset.reduceMotion = 'false';
        window.__game!.labHudLoad(false);
      });
    }

    const fail = checks.filter((c) => !c.ok).length;
    writeJson(r.out, 'labui.json', { query, checks });
    console.log(`[shots:labui] ${checks.length - fail}/${checks.length} mục đạt`);
    await gm(pg, 'dvt');
  },
} satisfies Scenario;
