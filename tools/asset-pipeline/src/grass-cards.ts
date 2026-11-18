// Dựng atlas thẻ cỏ alpha cho Đoạn Mạch Cổ Cốc (E2-I) từ ảnh concept `docs/asset-concepts/prop_co_*.webp` (nền xám phẳng).
//   tsx src/grass-cards.ts      (lệnh gốc repo: pnpm assets:grass-cards)
// Không dùng Tripo: tách nền bằng khoảng cách màu so với màu nền ở bốn góc, đổi màu về tông cỏ khô/bụi gai sa thạch, xếp 4 thẻ vào
// một atlas 2×2 (mỗi ô 512×384, gốc bụi ở giữa đáy ô). Ra `apps/client/public/grass-ochre/cards.<hash>.webp` + `manifest.json`.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './config.js';

const CW = 512;
const CH = 384;
const NIGHT = process.argv.includes('--set') && process.argv[process.argv.indexOf('--set') + 1] === 'night';
const OUT = path.join(ROOT, 'apps', 'client', 'public', NIGHT ? 'grass-night' : 'grass-ochre');

type RGB = readonly [number, number, number];
interface CardDef {
  id: string;
  src: string;
  /** Trộn màu gốc về `tone` theo độ sáng: 0 = giữ nguyên, 1 = đơn sắc theo `tone`. */
  recolor: number;
  tone: RGB;
  mul: RGB;
}

/** Thứ tự = chỉ số ô trong atlas (hàng trước, cột sau); khớp `CARD_*` ở `game/grassCards.ts`. */
export const CARDS: CardDef[] = [
  { id: 'hoang_coc', src: 'prop_co_hoang_coc', recolor: 0.0, tone: [1, 0.8, 0.5], mul: [0.95, 0.9, 0.82] },
  { id: 'linh_rung', src: 'prop_co_linh_rung', recolor: 0.82, tone: [1.12, 0.86, 0.5], mul: [0.9, 0.86, 0.78] },
  { id: 'van_hai', src: 'prop_co_van_hai', recolor: 0.6, tone: [1.0, 0.86, 0.66], mul: [0.98, 0.9, 0.78] },
  /** Bụi gai sa thạch: co_thanh sẫm, ngả nâu ô-liu khô. */
  { id: 'gai_sa_thach', src: 'prop_co_co_thanh', recolor: 0.8, tone: [1.0, 0.86, 0.58], mul: [0.95, 0.9, 0.8] },
];

/**
 * Atlas cỏ sao cho Thiên Khuyết (E4-I, `--set night`): thẻ 0 là cỏ cổ thành (xanh lam sẫm, hoa sao) giữ nguyên sắc concept, ba thẻ còn lại ngả lam xỉn để không lộ lặp.
 * Nguồn: concept do dự án tự làm (không có giấy phép ngoài).
 */
const CARDS_NIGHT: CardDef[] = [
  { id: 'co_thanh', src: 'prop_co_co_thanh', recolor: 0.25, tone: [0.62, 0.9, 1.0], mul: [0.82, 0.92, 1.0] },
  { id: 'linh_rung', src: 'prop_co_linh_rung', recolor: 0.8, tone: [0.6, 0.92, 0.95], mul: [0.8, 0.92, 1.0] },
  { id: 'van_hai', src: 'prop_co_van_hai', recolor: 0.75, tone: [0.7, 0.9, 1.0], mul: [0.84, 0.92, 1.0] },
  { id: 'hoang_coc', src: 'prop_co_hoang_coc', recolor: 0.8, tone: [0.7, 0.88, 0.92], mul: [0.82, 0.9, 0.98] },
];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

async function card(def: CardDef): Promise<Buffer> {
  const file = path.join(ROOT, 'docs', 'asset-concepts', `${def.src}.webp`);
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const at = (x: number, y: number, c: number) => data[(y * W + x) * 3 + c];
  // Màu nền: trung bình bốn góc 12×12.
  const bg = [0, 0, 0];
  let n = 0;
  for (const [x0, y0] of [
    [0, 0],
    [W - 12, 0],
    [0, H - 12],
    [W - 12, H - 12],
  ]) {
    for (let y = y0; y < y0 + 12; y++) for (let x = x0; x < x0 + 12; x++) for (let c = 0; c < 3; c++) bg[c] += at(x, y, c);
    n += 144;
  }
  for (let c = 0; c < 3; c++) bg[c] /= n;
  const rgba = Buffer.alloc(W * H * 4);
  let minX = W,
    maxX = 0,
    minY = H,
    maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = at(x, y, 0),
        g = at(x, y, 1),
        b = at(x, y, 2);
      // Nền xám có gradient nhẹ: so với nền cục bộ (cùng hàng ở mép trái/phải) rồi lấy chênh lệch lớn nhất theo kênh.
      const d = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
      // Độ bão hòa cũng góp (lá nhạt gần xám nền vẫn có sắc).
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const a = smooth(12, 34, Math.max(d, sat * 1.4));
      const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
      let R = r / 255,
        G = g / 255,
        B = b / 255;
      R = R + (lum * def.tone[0] - R) * def.recolor;
      G = G + (lum * def.tone[1] - G) * def.recolor;
      B = B + (lum * def.tone[2] - B) * def.recolor;
      // Gỡ viền xám: pha lẫn nền theo (1 − a) được trừ ngược.
      if (a > 0.02 && a < 0.98) {
        const k = (1 - a) * 0.6;
        R = Math.max(0, (R - (bg[0] / 255) * k) / (1 - k));
        G = Math.max(0, (G - (bg[1] / 255) * k) / (1 - k));
        B = Math.max(0, (B - (bg[2] / 255) * k) / (1 - k));
      }
      const o = (y * W + x) * 4;
      rgba[o] = Math.min(255, R * def.mul[0] * 255);
      rgba[o + 1] = Math.min(255, G * def.mul[1] * 255);
      rgba[o + 2] = Math.min(255, B * def.mul[2] * 255);
      rgba[o + 3] = Math.round(a * 255);
      if (a > 0.35) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const crop = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize(CW - 8, CH - 6, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Đặt vào ô: giữa đáy.
  const cell = Buffer.alloc(CW * CH * 4);
  const ox = (CW - crop.info.width) >> 1;
  const oy = CH - 3 - crop.info.height;
  // Màu trung bình vùng đặc, đổ vào điểm ảnh trong suốt để mipmap không kéo xám/đen vào mép lá.
  let sr = 0,
    sg = 0,
    sb = 0,
    sn = 0;
  for (let i = 0; i < crop.info.width * crop.info.height; i++) {
    const a = crop.data[i * 4 + 3];
    if (a > 200) {
      sr += crop.data[i * 4];
      sg += crop.data[i * 4 + 1];
      sb += crop.data[i * 4 + 2];
      sn++;
    }
  }
  const avg = sn ? [sr / sn, sg / sn, sb / sn] : [160, 130, 80];
  for (let i = 0; i < CW * CH; i++) {
    cell[i * 4] = avg[0];
    cell[i * 4 + 1] = avg[1];
    cell[i * 4 + 2] = avg[2];
  }
  for (let y = 0; y < crop.info.height; y++) {
    for (let x = 0; x < crop.info.width; x++) {
      const s = (y * crop.info.width + x) * 4;
      const d = ((oy + y) * CW + ox + x) * 4;
      cell.set(crop.data.subarray(s, s + 4), d);
    }
  }
  return cell;
}

async function main(): Promise<void> {
  const atlas = Buffer.alloc(CW * 2 * CH * 2 * 4);
  const list = NIGHT ? CARDS_NIGHT : CARDS;
  for (let i = 0; i < list.length; i++) {
    const cell = await card(list[i]);
    const cx = (i % 2) * CW;
    const cy = Math.floor(i / 2) * CH;
    for (let y = 0; y < CH; y++) atlas.set(cell.subarray(y * CW * 4, (y + 1) * CW * 4), ((cy + y) * CW * 2 + cx) * 4);
  }
  const webp = await sharp(atlas, { raw: { width: CW * 2, height: CH * 2, channels: 4 } })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  await mkdir(OUT, { recursive: true });
  const name = `cards.${createHash('sha1').update(webp).digest('hex').slice(0, 10)}.webp`;
  await writeFile(path.join(OUT, name), webp);
  await writeFile(
    path.join(OUT, 'manifest.json'),
    JSON.stringify({ atlas: name, cell: [CW, CH], cols: 2, rows: 2, cards: list.map((c) => c.id) }, null, 2) + '\n',
  );
  console.log(`[grass-cards] ${name}: ${(webp.length / 1024) | 0} KB`);
}

void main();
