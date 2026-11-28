// Dạ Họa: đo ĐỘ TÁCH NỀN của quái ở góc nhìn thật của game trong các cảnh mẫu của Diễn Võ Trường, để A/B một tham số phong cách bằng số.
//   pnpm shots daread --out <thư mục> [--query style=dahoa] [--only soi_thuong,tinh_anh,bay_dong,boss] [--key monrim] [--vals 0,0.7,1.2]
// Mỗi cảnh: dừng lớp hình, chụp một ảnh cho từng giá trị của tham số (`Game.labStyle(key, v)`), rồi ẩn mọi thân quái + vỏ viền mực và chụp ảnh nền.
// Mặt nạ thân = điểm ảnh đổi rõ giữa ảnh giá trị đầu tiên và ảnh nền. Trên mặt nạ đó, với từng giá trị:
//   - tách = trung bình |độ sáng thân − độ sáng nền ngay sau nó| (0–255);
//   - chìm = phần mặt nạ có chênh sáng dưới 10 (thân gần như lẫn vào nền);
//   - mép  = như "tách" nhưng chỉ trên dải 2 px sát mép mặt nạ (chỗ mắt dùng để nhận hình dáng).
// Ghi `daread.json`, in bảng, và xếp các ảnh cắt quanh giữa màn hình thành một tấm `daread-sheet.png` (hàng = cảnh, cột = giá trị).
import path from 'node:path';
import { LAB_SCENES } from '@dtl/content';
import { opt } from '../lib/env';
import { gm, perfSample, skipCutscene, waitLevel } from '../lib/game';
import type { Scenario } from '../lib/scenario';
import sharp from 'sharp';
import { sleep } from '../lib/devserver';
import { writeJson } from '../lib/shot';

const lumOf = (d: Buffer, i: number): number => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;

export default {
  name: 'daread',
  desc: 'Dạ Họa: đo độ tách nền của quái (thân so với nền sau nó) ở các cảnh mẫu, A/B một tham số phong cách',
  usage: '[--query style=dahoa] [--only soi_thuong,tinh_anh,bay_dong,boss] [--key monrim] [--vals 0,0.7,1.2]',
  env: { RATE_LIMIT_EXEMPT: 'loopback' },
  async run(r) {
    const key = opt('--key', 'monrim');
    const vals = opt('--vals', '0,0.7,1.2')
      .split(',')
      .map(Number)
      .filter((v) => Number.isFinite(v));
    const only = opt('--only', 'soi_thuong,tinh_anh,bay_dong,boss').split(',').filter(Boolean);
    const scenes = LAB_SCENES.filter((s) => only.includes(s.id));
    const { page: pg } = await r.open({
      name: 'DaRead',
      quality: 'high',
      viewport: [1280, 720],
      query: { cam: 'iso', quiet: 1 },
      extra: opt('--query', 'style=dahoa'),
      seenIntro: true,
      hide: 'hud',
    });
    await skipCutscene(pg, 20);
    await gm(pg, 'dvt');
    await waitLevel(pg, 'dien_vo');
    const step = async (frames = 3) => {
      await pg.evaluate((n) => void (window.__game!.stepLeft += n), frames);
      await sleep(350);
    };
    const hide = (on: boolean) =>
      pg.evaluate(`((on) => {
        var g = window.__game, layer = on ? 31 : 0;
        for (const m of g.ents.monsters.values()) m.model.root.traverse((o) => o.layers.set(layer));
        var hulls = g.ents.inkHulls && g.ents.inkHulls.hulls;
        if (hulls) for (const h of hulls.values()) if (h.mesh) h.mesh.traverse((o) => o.layers.set(layer));
      })(${on})`);
    const rows: Record<string, unknown>[] = [];
    const tiles: { input: Buffer; left: number; top: number }[] = [];
    const CW = 640;
    const CH = 360;
    for (let si = 0; si < scenes.length; si++) {
      const sc = scenes[si]!;
      await pg.evaluate(() => void (window.__game!.timeScale = 1));
      await gm(pg, `scene ${sc.id}`, 3800);
      await skipCutscene(pg, 12);
      // `face` quay mọi quái về một hướng và ĐÓNG BĂNG chúng (không dùng `freeze`: đó là công tắc, cảnh đã đóng băng sẵn thì bấm lại là bỏ).
      await gm(pg, 'face 90', 1500);
      await pg.evaluate(() => void window.__game!.setTarget?.('', 'mon'));
      await sleep(1500);
      await pg.evaluate(() => void (window.__game!.timeScale = 0));
      await sleep(300);
      const shots: Buffer[] = [];
      const bares: Buffer[] = [];
      const perf: unknown[] = [];
      // Mỗi giá trị chụp MỘT CẶP liền nhau: ảnh có thân rồi ảnh nền (ẩn thân). Quái đứng yên vẫn cử động nhẹ theo đồng hồ thật, nên dùng chung một
      // ảnh nền/mặt nạ cho mọi giá trị làm điểm tụt dần theo THỨ TỰ chụp (đã kiểm: ba lần cùng giá trị cho 40 → 33 → 32).
      for (const v of vals) {
        await pg.evaluate(([k, x]) => void window.__game!.labStyle(k as string, x as number), [key, v] as [string, number]);
        await step();
        shots.push(await pg.screenshot());
        await hide(true);
        await step(2);
        bares.push(await pg.screenshot());
        await hide(false);
        await step(2);
        perf.push(await perfSample(pg));
      }
      const raw = (b: Buffer) => sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let vi = 0; vi < vals.length; vi++) {
        const a = await raw(shots[vi]!);
        const bg = await raw(bares[vi]!);
        const W = bg.info.width;
        const H = bg.info.height;
        const mask = new Uint8Array(W * H);
        let n = 0;
        for (let p = 0, i = 0; p < W * H; p++, i += 3) {
          const d = Math.abs(a.data[i]! - bg.data[i]!) + Math.abs(a.data[i + 1]! - bg.data[i + 1]!) + Math.abs(a.data[i + 2]! - bg.data[i + 2]!);
          if (d > 30) {
            mask[p] = 1;
            n++;
          }
        }
        // Dải mép: điểm của mặt nạ có ít nhất một hàng xóm (cách 2 px) nằm ngoài mặt nạ.
        const edge = new Uint8Array(W * H);
        let ne = 0;
        for (let y = 2; y < H - 2; y++)
          for (let x = 2; x < W - 2; x++) {
            const p = y * W + x;
            if (!mask[p]) continue;
            if (!mask[p - 2] || !mask[p + 2] || !mask[p - 2 * W] || !mask[p + 2 * W]) {
              edge[p] = 1;
              ne++;
            }
          }
        let sum = 0;
        let sunk = 0;
        let es = 0;
        for (let p = 0, i = 0; p < W * H; p++, i += 3) {
          if (!mask[p]) continue;
          const d = Math.abs(lumOf(a.data, i) - lumOf(bg.data, i));
          sum += d;
          if (d < 10) sunk++;
          if (edge[p]) es += d;
        }
        const row = {
          scene: sc.id,
          [key]: vals[vi],
          maskPx: n,
          sep: n ? Math.round((sum / n) * 10) / 10 : 0,
          sunk: n ? Math.round((sunk / n) * 1000) / 10 : 0,
          edge: ne ? Math.round((es / ne) * 10) / 10 : 0,
          perf: perf[vi],
        };
        rows.push(row);
        console.log(`  ${sc.id.padEnd(12)} ${key}=${String(vals[vi]).padEnd(4)} thân ${n} px · tách ${row.sep} · chìm ${row.sunk}% · mép ${row.edge} · ${JSON.stringify(perf[vi])}`);
        tiles.push({
          input: await sharp(shots[vi]!)
            .extract({ left: Math.round((W - CW) / 2), top: 0, width: CW, height: CH })
            .png()
            .toBuffer(),
          left: vi * CW,
          top: si * CH,
        });
      }
      // Bảng tên: khóa quái đầu tiên, lấy hộp nhãn của nó; "nổi" = độ sáng phân vị 90% (chữ) trừ trung vị (nền quanh chữ) trong hộp, đo khi mặt nạ
      // hậu kỳ BẬT và TẮT TOÀN BỘ (`__vfxMask(false)`: mọi thứ trong mặt nạ, kể cả quái, bị nhuộm đêm).
      const rect = (await pg.evaluate(`(() => { var g = window.__game, id = g.ents.monsters.keys().next().value; if (id) g.setTarget(id, 'mon'); return g.lockedLabelRect(); })()`)) as { x: number; y: number; w: number; h: number } | null;
      const labelPop: Record<string, number> = {};
      if (rect) {
        for (const on of [true, false]) {
          await pg.evaluate((v) => (window as unknown as { __vfxMask?: (on: boolean) => void }).__vfxMask?.(v), on);
          await step();
          const full = await pg.screenshot();
          // Ảnh cắt nửa trên màn hình để soi bảng tên bằng mắt (bật/tắt mặt nạ).
          await sharp(full).extract({ left: 320, top: 0, width: 640, height: 300 }).png().toFile(path.join(r.out, `label-${sc.id}-${on ? 'mask' : 'cu'}.png`));
          const img = await sharp(full)
            .removeAlpha()
            .extract({ left: Math.max(0, Math.round(rect.x)), top: Math.max(0, Math.round(rect.y)), width: Math.max(4, Math.min(1280 - Math.max(0, Math.round(rect.x)), Math.round(rect.w))), height: Math.max(4, Math.min(720 - Math.max(0, Math.round(rect.y)), Math.round(rect.h))) })
            .raw()
            .toBuffer();
          const ls: number[] = [];
          for (let i = 0; i < img.length; i += 3) ls.push(lumOf(img, i));
          ls.sort((a, b) => a - b);
          labelPop[on ? 'maskOn' : 'maskOff'] = Math.round(ls[Math.floor(ls.length * 0.9)]! - ls[Math.floor(ls.length * 0.5)]!);
        }
        await pg.evaluate(() => (window as unknown as { __vfxMask?: (on: boolean) => void }).__vfxMask?.(true));
        console.log(`  ${sc.id.padEnd(12)} bảng tên: nổi ${labelPop.maskOn} (trong mặt nạ) so với ${labelPop.maskOff} khi TẮT TOÀN BỘ mặt nạ (quái cũng tối theo; ảnh "trước" trung thực là bộ gốc)`);
        rows.push({ scene: sc.id, labelPop });
        await pg.evaluate(() => void window.__game!.setTarget('', 'mon'));
      }
    }
    if (tiles.length)
      await sharp({ create: { width: CW * vals.length, height: CH * scenes.length, channels: 3, background: '#000' } })
        .composite(tiles)
        .png()
        .toFile(path.join(r.out, 'daread-sheet.png'));
    writeJson(r.out, 'daread.json', { key, vals, rows });
    await pg.evaluate(() => void (window.__game!.timeScale = 1));
    await gm(pg, 'dvt');
  },
} satisfies Scenario;
