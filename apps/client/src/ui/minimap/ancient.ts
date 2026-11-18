import { logger } from '../../base/log';

const minimapLog = logger('minimap');
// Nền bản đồ cổ dựng sẵn lúc build (`pnpm minimap:build` → public/map/van_lam.webp). Nạp lười, có mip để thu nhỏ không rỗ nét.
/** Khớp `MinimapMeta` trong tools/asset-pipeline/src/minimap.ts: ảnh phủ vuông từ (x0, z0), cạnh `size` m, `px` pixel. */
export interface MinimapMeta {
  x0: number;
  z0: number;
  size: number;
  px: number;
}

export interface AncientMap {
  meta: MinimapMeta;
  /** mips[0] là ảnh gốc, mỗi mức sau nhỏ một nửa. */
  mips: HTMLCanvasElement[];
}

let cur: (AncientMap & { name: string }) | null = null;
let curName = '';
let pending: Promise<void> | null = null;
let failedAt = 0;
let attempts = 0;
/** Nạp lỗi thì thử lại sau chừng này ms, tối đa MAX_ATTEMPTS lần rồi bỏ (minimap dùng ảnh địa hình dự phòng). */
const RETRY_MS = 30_000;
const MAX_ATTEMPTS = 3;

/** Trả bản đồ nếu đã nạp; lần đầu gọi sẽ bắt đầu nạp ngầm (ảnh ~0,5 MB, không chặn khung đầu). */
export function ancientMap(name = 'van_lam'): AncientMap | null {
  // Đổi level (E1-D): bỏ nền level cũ (các canvas mip được GC) và nạp nền mới; `name` rỗng = level chưa có nền (dùng ảnh dự phòng).
  if (name !== curName) {
    cur = null;
    curName = name;
    attempts = 0;
    pending = null;
  }
  if (!name) return null;
  if (cur || pending || attempts >= MAX_ATTEMPTS) return cur;
  if (attempts > 0 && performance.now() - failedAt < RETRY_MS) return cur;
  attempts++;
  const want = name;
  pending = load(name, () => want === curName)
    .catch((e) => {
      failedAt = performance.now();
      if (attempts === 1) minimapLog.warn('không nạp được nền bản đồ cổ, dùng ảnh địa hình dự phòng', e);
    })
    .finally(() => {
      pending = null;
    });
  return cur;
}

async function load(name: string, still: () => boolean): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const [meta, img] = await Promise.all([
    fetch(`${base}map/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`${name}.json ${r.status}`);
      return r.json() as Promise<MinimapMeta>;
    }),
    new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('minimap image'));
      im.src = `${base}map/${name}.webp`;
    }),
  ]);
  const mips: HTMLCanvasElement[] = [];
  let src: CanvasImageSource = img;
  for (let size = meta.px; size >= 256; size = Math.round(size / 2)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, size, size);
    mips.push(cv);
    src = cv;
  }
  if (still()) cur = { name, meta, mips };
}

/** Mức mip hợp với tỉ lệ vẽ: `pxPerM` = số px màn hình (thiết bị) trên một mét thế giới. */
export function mipFor(m: AncientMap, pxPerM: number): HTMLCanvasElement {
  const srcPerM = m.meta.px / m.meta.size;
  let i = 0;
  while (i + 1 < m.mips.length && srcPerM / 2 ** i / pxPerM >= 1.6) i++;
  return m.mips[i]!;
}
