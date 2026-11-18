/**
 * Tên thư pháp dọc kiểu câu đối: mỗi CHỮ (một tiếng, vd "Lạc") viết thành một ô, các ô xếp từ trên xuống; tên dài hơn 4 chữ chia 2 cột
 * (cột đầu ở bên phải). Vẽ lên canvas MỘT LẦN rồi cache theo (tên, tông, màu), không tốn CPU mỗi khung.
 * Nét cọ giả lập từ đường nét của font có dấu Việt: độ dày đổi theo vị trí nét (phình ở đầu nét, mảnh dần về cuối), cuối nét xơ (cọ khô, vệt dọc),
 * mép nhám nhẹ, vết mực loang quanh nét. Dấu tiếng Việt thường nằm ở nửa trên ô nên được làm đậm, không bị cọ khô ăn mất.
 */

export type BrushTone = 'ink' | 'gold';
export interface BrushColors {
  /** Màu nét chính (mực đen hoặc vàng kim). */
  main: string;
  /** Màu quầng loang (nâu mực hoặc vàng ánh). */
  halo: string;
}

/** Số chữ tối đa trên một cột; dài hơn thì chia làm hai cột. */
export const BRUSH_MAX_ROWS = 4;
const CW = 232; // ô một chữ (px canvas, siêu mẫu; CSS co lại theo khung)
const CH = 128;

/** Chia tên thành các chữ (tách theo khoảng trắng; tên một khối như "Tg4436" là một chữ), tối đa 2 cột, cột đầu ở bên phải. */
export function brushColumns(name: string): string[][] {
  const words = name.normalize('NFC').split(/\s+/).filter(Boolean);
  if (words.length <= BRUSH_MAX_ROWS) return [words];
  const per = Math.ceil(words.length / 2);
  return [words.slice(0, per), words.slice(per)];
}

/** Nhiễu giá trị xác định theo seed (không dùng Math.random để cùng tên luôn ra cùng nét). */
function noiseFn(seed: number) {
  const h = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return (((n ^ (n >>> 16)) >>> 0) % 10000) / 10000;
  };
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
  };
}

/** Làm mờ hộp tách rời (bán kính r) trên mảng w×h. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / k;
      sum += src[y * w + Math.min(w - 1, x + r + 1)]! - src[y * w + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / k;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return out;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Vẽ một chữ (một tiếng) thành mặt nạ alpha 0–1 (CW×CH) với nét cọ. `seed` làm mỗi chữ khác nhau một chút. */
export function brushGlyphMask(word: string, family: string, seed: number): { a: Float32Array; halo: Float32Array } {
  const empty = () => ({ a: new Float32Array(CW * CH), halo: new Float32Array(CW * CH) });
  const cv = document.createElement('canvas');
  cv.width = CW;
  cv.height = CH;
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (!c) return empty();
  c.fillStyle = '#000';
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  // cỡ chữ lớn nhất vừa ô theo bề ngang (tiếng dài như "Nguyệt", "Thượng" tự co lại)
  let size = Math.round(CH * 0.78);
  c.font = `700 ${size}px ${family}`;
  const wMax = CW * 0.9;
  const w = c.measureText(word).width;
  if (w > wMax) {
    size = Math.floor((size * wMax) / w);
    c.font = `700 ${size}px ${family}`;
  }
  c.fillText(word, CW / 2, CH * 0.8);
  const px = c.getImageData(0, 0, CW, CH).data;
  const base = new Float32Array(CW * CH);
  for (let i = 0; i < CW * CH; i++) base[i] = px[i * 4 + 3]! / 255;
  const bl = boxBlur(boxBlur(base, CW, CH, 2), CW, CH, 2);
  const n1 = noiseFn(seed);
  const n2 = noiseFn(seed + 11);
  const a = new Float32Array(CW * CH);
  for (let y = 0; y < CH; y++) {
    const ty = y / CH; // 0 trên … 1 dưới
    for (let x = 0; x < CW; x++) {
      const i = y * CW + x;
      // ngưỡng thấp = nét phình (đậm đầu nét), cao = nét mảnh (cuối nét); mép nhám bởi nhiễu cao tần
      const edge = (n1(x * 0.2, y * 0.2) - 0.5) * 0.14 + (n1(x * 0.65, y * 0.65) - 0.5) * 0.06;
      const thr = 0.16 + 0.26 * smooth(0.2, 1, ty) + edge;
      let v = smooth(thr - 0.07, thr + 0.07, bl[i]!);
      // cọ khô: vệt dọc, càng xuống cuối nét càng nhiều khe hở (nửa trên, nơi có dấu, gần như không khô)
      const streak = n2(x * 0.5, y * 0.05);
      v *= 1 - smooth(0.5, 1, ty) * 0.8 * smooth(0.55, 0.25, streak);
      a[i] = v;
    }
  }
  const halo = boxBlur(boxBlur(a, CW, CH, 4), CW, CH, 3);
  return { a, halo };
}

const cache = new Map<string, HTMLCanvasElement>();

/** Vẽ cả tên ra một canvas. Cùng (tên, tông, font, màu) trả lại đúng canvas đã vẽ. */
export function renderBrushName(name: string, tone: BrushTone, family: string, colors: BrushColors): HTMLCanvasElement {
  const key = `${name}|${tone}|${family}|${colors.main}|${colors.halo}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cols = brushColumns(name);
  const rows = Math.max(...cols.map((c) => c.length), 1);
  const pad = 12;
  const gap = 18;
  const out = document.createElement('canvas');
  out.width = cols.length * CW + (cols.length - 1) * gap + pad * 2;
  out.height = rows * CH + pad * 2;
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  let seed = 3;
  for (const ch of name) seed = (seed * 31 + ch.codePointAt(0)!) % 100003;
  const [mr, mg, mb] = rgb(colors.main);
  const [hr, hg, hb] = rgb(colors.halo);
  const tmp = document.createElement('canvas');
  tmp.width = CW;
  tmp.height = CH;
  const tctx = tmp.getContext('2d');
  cols.forEach((col, ci) => {
    const x0 = pad + (cols.length - 1 - ci) * (CW + gap); // cột đầu ở bên phải (đọc từ phải sang trái)
    col.forEach((word, ri) => {
      const { a, halo } = brushGlyphMask(word, family, seed + ci * 7 + ri * 13);
      const img = new ImageData(CW, CH);
      for (let i = 0; i < CW * CH; i++) {
        const v = a[i]!;
        // loang: quầng mờ màu `halo` dưới nét, nét chính phủ lên
        const hl = Math.max(0, halo[i]! * 0.42 - v * 0.3);
        const outA = v + hl * (1 - v);
        if (outA <= 0.002) continue;
        img.data[i * 4] = (mr * v + hr * hl * (1 - v)) / outA;
        img.data[i * 4 + 1] = (mg * v + hg * hl * (1 - v)) / outA;
        img.data[i * 4 + 2] = (mb * v + hb * hl * (1 - v)) / outA;
        img.data[i * 4 + 3] = Math.min(255, outA * 255);
      }
      tctx?.putImageData(img, 0, 0);
      ctx.drawImage(tmp, x0, pad + ri * CH);
    });
  });
  cache.set(key, out);
  return out;
}

function rgb(css: string): [number, number, number] {
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return [20, 17, 13];
  c.fillStyle = '#000';
  c.fillStyle = css;
  c.fillRect(0, 0, 1, 1);
  const d = c.getImageData(0, 0, 1, 1).data;
  return [d[0]!, d[1]!, d[2]!];
}
