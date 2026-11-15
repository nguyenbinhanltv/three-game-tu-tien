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

let cur: AncientMap | null = null;
let pending: Promise<void> | null = null;

/** Trả bản đồ nếu đã nạp; lần đầu gọi sẽ bắt đầu nạp ngầm (ảnh ~0,5 MB, không chặn khung đầu). */
export function ancientMap(): AncientMap | null {
  if (!cur && !pending) pending = load().catch(() => void (pending = null));
  return cur;
}

async function load(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const [meta, img] = await Promise.all([
    fetch(`${base}map/van_lam.json`).then((r) => r.json() as Promise<MinimapMeta>),
    new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('minimap image'));
      im.src = `${base}map/van_lam.webp`;
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
  cur = { meta, mips };
}

/** Mức mip hợp với tỉ lệ vẽ: `pxPerM` = số px màn hình (thiết bị) trên một mét thế giới. */
export function mipFor(m: AncientMap, pxPerM: number): HTMLCanvasElement {
  const srcPerM = m.meta.px / m.meta.size;
  let i = 0;
  while (i + 1 < m.mips.length && srcPerM / 2 ** i / pxPerM >= 1.6) i++;
  return m.mips[i];
}
