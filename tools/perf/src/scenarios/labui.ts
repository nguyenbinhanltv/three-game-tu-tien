// Diễn Võ Trường, khu Giao diện (V2c): kiểm CÔNG CỤ giao diện của phòng thử bằng bấm nút thật + hai phép đo tự động.
//   pnpm shots labui --out <thư mục> [--query style=dahoa] [--only tools,contrast,motion,windows]
// - tools: bấm các nút mới của tab Diễn Võ (nhật ký điều khiển, khoảnh khắc đợt hai, máu/linh lực giả, kiểm máy yếu) rồi đối chiếu trạng thái game.
// - contrast: TƯƠNG PHẢN CHỮ của HUD trên nền game thật (WCAG): chụp HUD với chữ trong suốt để lấy nền ngay dưới từng dòng chữ, tính tỉ lệ tương phản
//   của màu chữ với từng điểm ảnh nền; báo dòng có phân vị 10% dưới 4,5 (chữ thường) hoặc 3 (chữ lớn ≥ 24 px, hoặc ≥ 18,7 px đậm).
//   Giới hạn: WCAG không tính bóng chữ, nên chữ có bóng đậm đọc được hơn con số ở đây. Chữ có VIỀN từ 1,5 px vẽ dưới nét chữ thì tính chữ so với viền.
//   Bỏ qua chữ đang mờ dần (độ đục dưới 0,9 ở chính nó hoặc khối cha: dòng chat sắp tan, thông báo đang hiện) vì màu đo được là màu giữa chừng.
// - windows: dựng nhân vật đủ đồ rồi mở TỪNG cửa sổ ở năm cỡ màn hình; báo cửa sổ tràn khỏi khung nhìn và dòng chữ bị cắt (tràn ngang trong ô ẩn phần thừa).
// - sound: xưởng âm thanh — bấm nút thật (đầu dò tiếng, ép nhạc boss), in bảng lệch tiếng so với mốc trúng của mọi chiêu `skl_*` (đo từ dữ liệu).
// - anim: xưởng animation — diễn một pose, dừng hình ở đỉnh đòn và đối chiếu đồng hồ pose với mốc.
// - panel: soát MỌI nhóm con của tab Diễn Võ (kể cả công cụ của worker khác gắn vào): nút nằm trong khung 720p, bấm vào không sinh lỗi console;
//   bấm nút thật các lệnh cân bằng / sân boss (hình nộm, gọi boss, pha, tua máu).
// - motion: bật "Giảm chuyển động", gọi mọi khoảnh khắc rồi đếm animation CSS còn chạy trong HUD (phải bằng 0, trừ danh sách cho phép).
import { num, opt } from '../lib/env';
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
  /** Màu viền chữ (r, g, b) khi chữ có viền từ 1,5 px vẽ DƯỚI nét chữ; null = không viền. */
  stroke: number[] | null;
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
  usage: '[--query style=dahoa] [--only tools,contrast,motion,windows,sound,anim,panel] [--win char,wardrobe] [--winwait 900]',
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
      // Chip cạnh thanh chiêu (nhắc chọn nhánh, phân thân) phải nằm trên MỘT dòng, không bị ép thành cột chữ.
      const chips = await pg.evaluate(() =>
        [...document.querySelectorAll('.u2h-chips .branch-chip, .u2h-chips .clone-chip')].map((e) => {
          const r = e.getBoundingClientRect();
          return { cls: e.className.split(' ')[0]!, w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), lh: parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.4 };
        }),
      );
      check('chip cạnh thanh chiêu nằm trên một dòng và trong khung nhìn', chips.length > 0 && chips.every((c) => c.h <= c.lh * 1.9 + 8 && c.right <= 1280), chips.map((c) => `${c.cls} ${c.w}×${c.h}`).join(', ') || 'không có chip');
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

      await btn(/^Nhịp và HUD$/).click();
      await sleep(250);
      const outside2 = await pg.evaluate(() => {
        const lim = Math.min(innerHeight, document.querySelector('.debug-panel')!.getBoundingClientRect().bottom) + 1;
        return [...document.querySelectorAll('.debug-panel button')].filter((b) => b.getBoundingClientRect().bottom > lim).length;
      });
      check('mọi nút của nhóm Nhịp và HUD nằm trong khung 720p', outside2 === 0, `${outside2} nút ngoài khung`);
      // Tốc độ hiệu ứng giao diện: 10% thì thông báo nổi vừa gọi phải đang phát ở tốc độ 0,1; token thời lượng chỉnh được và trả về được.
      await btn(/^10%$/).click();
      await pg.evaluate(() => void window.__game!.labMoment('toast'));
      await sleep(300);
      const rates = await pg.evaluate(() => document.getAnimations().map((a) => a.playbackRate));
      check('nút "10%" làm chậm mọi animation giao diện', rates.length > 0 && rates.every((x) => Math.abs(x - 0.1) < 1e-6), `${rates.length} animation, tốc độ ${[...new Set(rates)].join(', ')}`);
      await btn(/^100%$/).click();
      await sleep(200);
      const rates1 = await pg.evaluate(() => document.getAnimations().map((a) => a.playbackRate));
      check('nút "100%" trả tốc độ animation về 1', rates1.every((x) => x === 1), `${rates1.length} animation`);
      const tk0 = await pg.evaluate(() => window.__game!.labx.uiTokenGet('--u-dur-open'));
      await pg.locator('.debug-panel [data-k="--u-dur-open"] button', { hasText: '+' }).click();
      await sleep(150);
      const tk1 = await pg.evaluate(() => window.__game!.labx.uiTokenGet('--u-dur-open'));
      await btn('Về mặc định').click();
      await sleep(150);
      const tk2 = await pg.evaluate(() => window.__game!.labx.uiTokenGet('--u-dur-open'));
      check('token "Mở bảng": nút + tăng 20 ms, "Về mặc định" trả lại', tk1 === tk0 + 20 && tk2 === tk0, `${tk0} → ${tk1} → ${tk2} ms`);
      await snap(pg, r.out, 'tools-0b-nhip.png', { wait: 200 });

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
      await btn(/^Giao diện$/).click();
      await sleep(250);
      await btn('Lời mời').click();
      await sleep(500);
      check('nút "Lời mời" hiện hai thẻ mời', (await pg.locator('.pty-invite').count()) === 2);
      // Lời mời không được đè khung mục tiêu / khối thanh boss (HUD nặng có thanh boss giả).
      await pg.evaluate(() => void window.__game!.labHudLoad(true));
      await sleep(900);
      const inv = await pg.evaluate(() => {
        const b = document.querySelector('.pty-invites')?.getBoundingClientRect();
        if (!b) return null;
        let over = 0;
        for (const f of document.querySelectorAll('.hud .target-frame, .hud [class^="u2h-boss"]')) {
          const r = f.getBoundingClientRect();
          const w = Math.min(r.right, b.right) - Math.max(r.left, b.left);
          const h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
          if (r.width > 0 && w > 1 && h > 1) over += w * h;
        }
        return { top: Math.round(b.top), over: Math.round(over) };
      });
      check('chồng lời mời không đè khung mục tiêu và thanh boss', !!inv && inv.over === 0, inv ? `mép trên ${inv.top} px, đè ${inv.over} px²` : 'không thấy chồng lời mời');
      await snap(pg, r.out, 'tools-3b-loi-moi-boss.png', { wait: 0 });
      await pg.evaluate(() => void window.__game!.labHudLoad(false));
      await sleep(300);
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
          for (var p = e; p && p !== document.body; p = p.parentElement) { var ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden' || Number(ps.opacity) < 0.9) { vis = false; break; } }
          if (!vis) continue;
          var range = document.createRange(); range.selectNodeContents(n);
          var r = range.getBoundingClientRect();
          if (r.width < 6 || r.height < 6 || r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) continue;
          // Chữ tô bằng nền cắt theo chữ (gradient vàng của tên boss...) không có một màu chữ để đo: bỏ qua, đếm riêng.
          if ((cs.webkitBackgroundClip || cs.backgroundClip) === 'text' || cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)') { out.push({ skip: true, text: txt.slice(0, 28) }); continue; }
          var m = cs.color.match(/[\\d.]+/g) || ['255', '255', '255'];
          var name = (typeof e.className === 'string' ? e.className : '').trim().split(/\\s+/)[0] || e.tagName.toLowerCase();
          var par = e.parentElement && typeof e.parentElement.className === 'string' ? e.parentElement.className.trim().split(/\\s+/)[0] : '';
          out.push({ text: txt.slice(0, 28), sel: (par ? par + ' > ' : '') + name, x: r.left, y: r.top, w: r.width, h: r.height, c: [Number(m[0]), Number(m[1]), Number(m[2]), m.length > 3 ? Number(m[3]) : 1], px: parseFloat(cs.fontSize), bold: Number(cs.fontWeight) >= 600, shadow: cs.textShadow !== 'none', stroke: parseFloat(cs.webkitTextStrokeWidth) >= 1.5 && cs.paintOrder.indexOf('stroke') === 0 ? (cs.webkitTextStrokeColor.match(/[\\d.]+/g) || []).slice(0, 3).map(Number) : null });
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
          // Chữ có viền mực vẽ dưới nét chữ: nền sát chữ là chính viền đó, nên tương phản tính giữa màu chữ và màu viền (không phụ thuộc nền phía sau).
          if (b.stroke && b.stroke.length === 3) {
            const k = contrast(lum(b.c[0], b.c[1], b.c[2]), lum(b.stroke[0]!, b.stroke[1]!, b.stroke[2]!));
            ratios.length = 0;
            ratios.push(k);
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

    if (want('windows')) {
      // Dữ liệu nặng: ba bộ đồ đủ món (túi nhiều ô), đủ chiêu, HUD nặng (tổ đội bốn người, sáu nhiệm vụ).
      await gm(pg, 'kit 4 kiem +10 m', 1500);
      await gm(pg, 'kit 3 hophap +7 m', 1500);
      await gm(pg, 'kit 2 dansu m', 1500);
      await gm(pg, 'skills all', 1200);
      await pg.evaluate(() => {
        window.__game!.labMoment('clear');
        window.__game!.labHudLoad(true);
      });
      // Chờ bốn thông báo nổi của HUD nặng tan hết (3,2 s) để chúng không đè lên cửa sổ trong ảnh.
      await sleep(3600);
      // `--win a,b`: chỉ các cửa sổ đó; `--winwait ms`: chờ sau khi mở (mặc định 900; tăng lên để soi khung xem trước 3D đã dựng xong).
      const pickWin = opt('--win', '').split(',').filter(Boolean);
      const winWait = num('--winwait', 900);
      const wins = ['char', 'bag', 'method', 'quests', 'map', 'party', 'wardrobe', 'settings', 'help'].filter((k) => !pickWin.length || pickWin.includes(k));
      const errAt: Record<string, number> = {};
      const sizes: [number, number][] = [
        [1280, 720],
        [1366, 768],
        [1600, 900],
        [1920, 1080],
        [2560, 1440],
      ];
      const report: unknown[] = [];
      let badWin = 0;
      let cut = 0;
      for (const [w, h] of sizes) {
        await pg.setViewportSize({ width: w, height: h });
        await sleep(600);
        for (const id of wins) {
          const e0 = r.errors.length;
          const opened = await pg.evaluate((k) => window.__game!.labx.window(k), id);
          await sleep(winWait);
          if (r.errors.length > e0) errAt[id] = (errAt[id] ?? 0) + r.errors.length - e0;
          const m = (await pg.evaluate(`(() => {
            var win = document.querySelector('.u2-win'); if (!win) return null;
            var vw = innerWidth, vh = innerHeight, r = win.getBoundingClientRect();
            var out = Math.max(0, -r.left, -r.top, r.right - vw, r.bottom - vh);
            var clipped = [];
            for (const e of win.querySelectorAll('*')) {
              if (!e.childNodes.length || ![...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim())) continue;
              var cs = getComputedStyle(e);
              if (cs.display === 'inline' || cs.visibility === 'hidden') continue;
              var hide = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
              if (hide && e.scrollWidth > e.clientWidth + 1) clipped.push((e.textContent || '').trim().slice(0, 32) + ' [' + ((typeof e.className === 'string' ? e.className : '').trim().split(' ')[0] || e.tagName.toLowerCase()) + ']');
            }
            return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), out: Math.round(out), clipped: clipped };
          })()`)) as { x: number; y: number; w: number; h: number; out: number; clipped: string[] } | null;
          const file = `win/${id}-${w}x${h}.png`;
          await snap(pg, r.out, file, { wait: 0 });
          if (!opened || !m) {
            badWin++;
            console.log(`  HỎNG ${w}×${h} ${id}: cửa sổ không mở`);
          } else {
            if (m.out > 1) badWin++;
            cut += m.clipped.length;
            if (m.out > 1 || m.clipped.length) console.log(`  ${m.out > 1 ? 'HỎNG' : 'CẮT '} ${w}×${h} ${id}: ${m.w}×${m.h} px${m.out > 1 ? ', tràn ' + m.out + ' px' : ''}${m.clipped.length ? '; chữ bị cắt: ' + m.clipped.slice(0, 4).join(' | ') + (m.clipped.length > 4 ? ` (+${m.clipped.length - 4})` : '') : ''}`);
          }
          report.push({ w, h, id, file, ...m });
        }
      }
      await pg.evaluate(() => {
        window.__game!.labx.window('');
        window.__game!.labHudLoad(false);
      });
      await pg.setViewportSize({ width: 1280, height: 720 });
      await sleep(500);
      check('mọi cửa sổ mở được và nằm trọn trong khung nhìn ở năm cỡ màn', badWin === 0, `${badWin} lượt hỏng trên ${wins.length * sizes.length}`);
      console.log(`[shots:labui] cửa sổ: ${wins.length} cửa sổ × ${sizes.length} cỡ màn, ${badWin} tràn/không mở, ${cut} dòng chữ bị cắt`);
      check('mở các cửa sổ không sinh lỗi console', Object.keys(errAt).length === 0, Object.entries(errAt).map(([k, n]) => `${k}: ${n} lỗi`).join(', ') || 'không lỗi');
      writeJson(r.out, 'labui-windows.json', { query, badWin, cut, errAt, rows: report });
    }

    if (want('sound')) {
      await pg.keyboard.press('F3');
      await sleep(500);
      await btn(/^Âm thanh$/).click();
      await sleep(300);
      const outS = await pg.evaluate(() => {
        const lim = Math.min(innerHeight, document.querySelector('.debug-panel')!.getBoundingClientRect().bottom) + 1;
        return [...document.querySelectorAll('.debug-panel button')].filter((b) => b.getBoundingClientRect().bottom > lim).length;
      });
      check('mọi nút của nhóm Âm thanh nằm trong khung 720p', outS === 0, `${outS} nút ngoài khung`);
      // Đầu dò: bật, phát một tiếng bằng nút, ra một chiêu; nhật ký phải đếm được dù đang tắt tiếng.
      await btn('Đo tiếng').click();
      await sleep(200);
      await btn(/^Phát$/).click();
      await pg.keyboard.press('Digit2');
      await sleep(1200);
      const au = await pg.evaluate(() => window.__game!.labx.audio());
      check('đầu dò đếm lời gọi phát tiếng (kể cả khi tắt tiếng)', au.probe && au.stats.calls >= 1, `${au.stats.calls} tiếng trong 2 giây, dồn nhất ${au.stats.burst}/0,1 s, nhiều nhất: ${au.stats.top.map((x) => x.name + '×' + x.n).join(', ')}`);
      check('dòng số đo hiện trên bảng', (await pg.locator('[data-testid="lab-snd-stats"]').count()) === 1);
      // Tám lần gọi dồn trong một khung: đỉnh dồn phải thấy được.
      await pg.evaluate(() => {
        for (let i = 0; i < 8; i++) window.__game!.labx.sfx('hit');
      });
      const au2 = await pg.evaluate(() => window.__game!.labx.audio());
      check('tám tiếng cùng lúc hiện thành đỉnh dồn ≥ 8', au2.stats.burst >= 8, `dồn nhất ${au2.stats.burst}, tổng âm lượng ${au2.stats.burstVol}`);
      // Nhạc: ép boss rồi trả về.
      await btn('Đánh boss').click();
      await sleep(2500);
      const mu = await pg.evaluate(() => window.__game!.labx.audio().music);
      check('nút "Đánh boss" đưa đạo diễn nhạc vào trạng thái boss', mu.force === 'boss' && mu.boss, JSON.stringify(mu));
      await btn('Theo trận').click();
      await sleep(300);
      check('nút "Theo trận" bỏ ép nhạc', (await pg.evaluate(() => window.__game!.labx.audio().music.force)) === null);
      await snap(pg, r.out, 'sound-0-nhom.png', { wait: 200 });
      await btn('Đo tiếng').click();
      // Bảng lệch tiếng của mọi chiêu (từ dữ liệu timeline).
      const rows = await pg.evaluate(() => window.__game!.labx.fxAudioAll());
      const by = (v: string) => rows.filter((x) => x.verdict === v);
      console.log(`[shots:labui] tiếng so với mốc trúng: ${rows.length} chiêu — khớp ${by('ok').length}, sớm ${by('early').length}, muộn ${by('late').length}, không tiếng ${by('silent').length}, không mốc trúng ${by('nohit').length}`);
      for (const x of rows.filter((y) => y.verdict !== 'ok')) console.log(`  ${x.verdict.padEnd(6)} ${x.id}${x.nearestMs === null ? '' : ' (' + (x.nearestMs > 0 ? '+' : '') + x.nearestMs + ' ms)'}`);
      check('đọc được bảng lệch tiếng của mọi chiêu', rows.length >= 100, `${rows.length} chiêu`);
      writeJson(r.out, 'labui-sound.json', { rows });
      await pg.keyboard.press('F3');
      await sleep(300);
    }

    if (want('anim')) {
      await pg.keyboard.press('F3');
      await sleep(500);
      await btn(/^Động tác$/).click();
      await sleep(300);
      const outA = await pg.evaluate(() => {
        const lim = Math.min(innerHeight, document.querySelector('.debug-panel')!.getBoundingClientRect().bottom) + 1;
        return [...document.querySelectorAll('.debug-panel button')].filter((b) => b.getBoundingClientRect().bottom > lim).length;
      });
      check('mọi nút của nhóm Động tác nằm trong khung 720p', outA === 0, `${outA} nút ngoài khung`);
      // Chọn pose của chiêu đầu tiên có pose (qua ô tìm), diễn, rồi dừng ở đỉnh đòn.
      // Ô chọn pose = ô chọn đầu tiên của bảng có giá trị là một pose (các công cụ gắn thêm phía dưới cũng có ô chọn riêng).
      const pose = await pg.evaluate(() => {
        for (const sel of document.querySelectorAll<HTMLSelectElement>('.debug-panel select')) if (window.__game!.labx.poseInfo(sel.value)) return sel.value;
        return '';
      });
      const info = await pg.evaluate((p) => window.__game!.labx.poseInfo(p), pose);
      check('ô chọn có pose và đọc được thông tin', !!info && info.duration > 0, info ? `${pose}: dài ${info.duration} s, khung trúng ${info.hit ? info.hit.join('–') : 'không khai'}, chiêu ${info.skill ?? 'không'}` : 'không có');
      await btn(/^Diễn$/).click();
      await sleep(250);
      const c0 = await pg.evaluate(() => window.__game!.labx.poseClock());
      check('nút "Diễn" làm nhân vật diễn pose', !!c0 && c0.skill === pose, c0 ? `đồng hồ ${c0.t.toFixed(2)} s` : 'không có đồng hồ pose');
      await snap(pg, r.out, 'anim-0-dien.png', { wait: 0 });
      await sleep(1500);
      await btn('Đỉnh đòn').click();
      await sleep(900);
      const st = await pg.evaluate(() => ({ ts: window.__game!.timeScale, left: window.__game!.stepLeft, c: window.__game!.labx.poseClock() }));
      const peak = info?.moments.find((m) => m.name === 'dinh')?.at ?? 0;
      check('nút "Đỉnh đòn" dừng hình đúng mốc', st.ts === 0 && st.left === 0 && !!st.c && Math.abs(st.c.t - peak) <= 0.04, st.c ? `đồng hồ pose ${st.c.t.toFixed(3)} s, mốc ${peak.toFixed(3)} s` : 'không có đồng hồ pose');
      await snap(pg, r.out, 'anim-1-dinh-don.png', { wait: 200 });
      await pg.evaluate(() => void (window.__game!.timeScale = 1));
      await pg.keyboard.press('F3');
      await sleep(300);
    }

    if (want('panel')) {
      await pg.keyboard.press('F3');
      await sleep(500);
      const tabs = (await pg.evaluate(`(() => {
        var rows = [...document.querySelectorAll('.debug-tools .debug-row')];
        // Hàng nhóm con = hàng thứ ba của nhóm Diễn Võ (sau hàng nhóm GM và hàng vào/rời phòng).
        return rows[2] ? [...rows[2].querySelectorAll('button')].map((b) => (b.textContent || '').trim()) : [];
      })()`)) as string[];
      check('tab Diễn Võ có đủ nhóm con', tabs.length >= 12, tabs.join(' | '));
      for (const name of tabs) {
        const e0 = r.errors.length;
        await pg.locator('.debug-tools .debug-row').nth(2).locator('button', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).click();
        await sleep(450);
        const out = await pg.evaluate(() => {
          const lim = Math.min(innerHeight, document.querySelector('.debug-panel')!.getBoundingClientRect().bottom) + 1;
          const all = [...document.querySelectorAll('.debug-panel button, .debug-panel select, .debug-panel input')];
          return { n: all.length, out: all.filter((b) => b.getBoundingClientRect().bottom > lim).length };
        });
        check(`nhóm "${name}": mọi nút/ô nằm trong khung 720p, mở không lỗi console`, out.out === 0 && r.errors.length === e0, `${out.n} nút/ô, ${out.out} ngoài khung, ${r.errors.length - e0} lỗi console`);
        await snap(pg, r.out, `panel/${tabs.indexOf(name)}.png`, { wait: 0 });
      }
      // Lớp vùng trúng thật (nằm trong nhóm Chỉnh phòng): bấm bật rồi tắt, nút phải đổi trạng thái và không sinh lỗi console.
      if (tabs.includes('Chỉnh phòng')) {
        await btn(/^Chỉnh phòng$/).click();
        await sleep(600);
        const zb = pg.locator('.debug-panel [data-act="zones"]').first();
        const eZ = r.errors.length;
        const p0 = await zb.getAttribute('data-pressed');
        await zb.click();
        await sleep(700);
        const p1 = await zb.getAttribute('data-pressed');
        await snap(pg, r.out, 'panel/vung-trung.png', { wait: 200 });
        await zb.click();
        await sleep(400);
        const p2 = await zb.getAttribute('data-pressed');
        check('nút "Vùng trúng thật" bật rồi tắt được, không lỗi console', p0 !== p1 && p2 === p0 && r.errors.length === eZ, `data-pressed ${p0} → ${p1} → ${p2}, ${r.errors.length - eZ} lỗi console`);
      }
      // Cân bằng / sân boss: bấm nút thật, đối chiếu quái trong phòng.
      const mons = () => pg.evaluate(() => [...window.__game!.view.monsters.values()].filter((m) => m.st !== 4).map((m) => ({ t: m.t, hp: m.hp / m.mhp })));
      await btn(/^Cân bằng$/).click();
      await sleep(300);
      await btn('Đặt hình nộm').click();
      await sleep(2500);
      const d1 = await mons();
      check('nút "Đặt hình nộm" để lại đúng một quái', d1.length === 1, d1.map((m) => m.t).join(', '));
      await btn('Gọi vào hố boss').click();
      await sleep(3000);
      const b1 = await mons();
      check('nút "Gọi vào hố boss" gọi một boss/tinh anh', b1.length === 1 && b1[0]!.t !== d1[0]?.t, b1.map((m) => m.t).join(', '));
      await btn(/^25%$/).click();
      await sleep(1800);
      const b2 = await mons();
      check('nút tua máu "25%" đưa máu quái về 25%', b2.length === 1 && Math.abs(b2[0]!.hp - 0.25) < 0.03, b2.map((m) => Math.round(m.hp * 100) + '%').join(', '));
      await snap(pg, r.out, 'panel/can-bang.png', { wait: 200 });
      await btn('Bỏ hình nộm').click();
      await sleep(1200);
      await gm(pg, 'labreset', 1500);
      await pg.keyboard.press('F3');
      await sleep(300);
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
