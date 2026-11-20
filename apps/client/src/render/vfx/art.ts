import * as THREE from 'three/webgpu';

/**
 * Atlas tranh pháp tướng vẽ tay (RFX-1 v3): ba tranh nền trong suốt của Thiên Giải (`public/hoa-truc/phap_tuong_*.webp`) xếp ngang, mỗi ô `CELL_W × CELL_H`.
 * Tranh nạp bất đồng bộ; ô nào chưa nạp thì trong suốt. Dựng một lần, nạp lười ở lần đầu shader `art` biên dịch. Không có `document` (test) thì trả texture trống.
 */
export const ART_COUNT = 3;
const ART_FILES = ['phap_tuong_kiem_long', 'phap_tuong_huyen_vu', 'phap_tuong_chu_tuoc'] as const;
/** Ô tranh: tỉ lệ 3:4 (tranh gốc ~570×760). */
const CELL_W = 512;
const CELL_H = 683;

let atlas: THREE.Texture | null = null;

export function artAtlas(): THREE.Texture {
  if (atlas) return atlas;
  if (typeof document === 'undefined') {
    atlas = new THREE.DataTexture(new Uint8Array(16), 2, 2);
    atlas.needsUpdate = true;
    return atlas;
  }
  const cv = document.createElement('canvas');
  cv.width = CELL_W * ART_COUNT;
  cv.height = CELL_H;
  const g = cv.getContext('2d')!;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  ART_FILES.forEach((name, i) => {
    const img = new Image();
    img.onload = () => {
      g.clearRect(i * CELL_W, 0, CELL_W, CELL_H);
      g.drawImage(img, i * CELL_W, 0, CELL_W, CELL_H);
      t.needsUpdate = true;
    };
    img.src = `${base}hoa-truc/${name}.webp`;
  });
  atlas = t;
  return t;
}
