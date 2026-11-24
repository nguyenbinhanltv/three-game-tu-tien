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

/**
 * Atlas sprite vẽ tay của VFX (Họa Pháp Lô 2): `public/hoa-truc/vfx_sprites.webp`, lưới `SPRITE_COLS × SPRITE_ROWS` ô vuông nền trong suốt, thứ tự theo `FX_SPRITES`
 * (hàng trên trước). Dựng bằng `tools/vfx-forge/sprite-pack.mjs` từ bảng Codex nền xanh chroma. Nạp bất đồng bộ; chưa nạp thì trong suốt. Không có `document` (test) thì texture rỗng.
 */
export const SPRITE_COLS = 4;
export const SPRITE_ROWS = 6;
let spriteTex: THREE.Texture | null = null;

export function spriteAtlas(): THREE.Texture {
  if (spriteTex) return spriteTex;
  if (typeof document === 'undefined') {
    spriteTex = new THREE.DataTexture(new Uint8Array(16), 2, 2);
    spriteTex.needsUpdate = true;
    return spriteTex;
  }
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  const t = new THREE.TextureLoader().load(`${base}hoa-truc/vfx_sprites.webp`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  spriteTex = t;
  return t;
}

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
