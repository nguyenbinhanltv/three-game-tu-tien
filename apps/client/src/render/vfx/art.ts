import * as THREE from 'three/webgpu';
import { FX_SPRITES } from '@dtl/shared';
import { ASSET_BASE, ASSET_CROSS_ORIGIN } from '../../base/assetBase';

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
 * Atlas sprite vẽ tay của VFX (Họa Pháp Lô 2) TÁCH THEO HƯỚNG TU: mỗi nhóm (tiền tố tên sprite: `hon_`, `loi_`, `kiem_`, `hp_`) một file `public/hoa-truc/vfx_sprites_<nhóm>.<hash10>.webp`
 * lưới `cols × rows` ô vuông 512 px nền trong suốt, thứ tự ô trong nhóm = thứ tự các tên cùng tiền tố trong `FX_SPRITES`. Dựng bằng `tools/vfx-forge/sprite-pack.mjs --base <atlas nhóm>` từ bảng Codex nền xanh chroma.
 * R2 BẤT BIẾN: đổi nội dung nhóm thì đóng ra TÊN MỚI theo hash, `assets:push` khóa mới rồi sửa hằng này (khóa cũ giữ nguyên). Cạnh mỗi atlas ≤ 8192 px (giới hạn WebGPU).
 * Chỉ NẠP nhóm đang dùng (`useSpriteGroup`): hướng của người chơi nạp sẵn, hướng khác nạp khi có chiêu của họ hiện trong tầm nhìn; nhóm không dùng quá `SPRITE_IDLE_MS` bị giải phóng khi đang giữ quá `SPRITE_MAX_RESIDENT` nhóm.
 * Nạp bất đồng bộ; chưa nạp thì trong suốt. Không có `document` (test) thì texture rỗng.
 */
export const SPRITE_GROUPS = {
  hon: { file: 'hoa-truc/vfx_sprites_hon.ec4ebc360d.webp', cols: 4, rows: 6 },
  loi: { file: 'hoa-truc/vfx_sprites_loi.147ce2e73d.webp', cols: 4, rows: 4 },
  kiem: { file: 'hoa-truc/vfx_sprites_kiem.22301e4193.webp', cols: 4, rows: 4 },
  hp: { file: 'hoa-truc/vfx_sprites_hp.dc9596e2f9.webp', cols: 4, rows: 4 },
  dao: { file: 'hoa-truc/vfx_sprites_dao.5a78c4fab5.webp', cols: 4, rows: 4 },
  cth: { file: 'hoa-truc/vfx_sprites_cth.20e47ff06f.webp', cols: 4, rows: 4 },
  // Vân Hải (A2): nước `thuy_*` + trăng `nguyet_*`; tinh anh chương 2–3 (A3): xương `cot_*`, đá `tho_*`, đất-độc `doc_*`, sét tím `tim_*`. Gom theo kiểu quái, không theo hướng tu.
  hai: { file: 'hoa-truc/vfx_sprites_hai.c8709e04fc.webp', cols: 4, rows: 4 },
  tinh: { file: 'hoa-truc/vfx_sprites_tinh.2c4a99f7e9.webp', cols: 4, rows: 6 },
  // Tinh anh Vân Lam (A4): lửa ma ám tím `lua_*` + đá khe hổ phách `ham_*`.
  lam: { file: 'hoa-truc/vfx_sprites_lam.0c7b3f53ef.webp', cols: 4, rows: 3 },
  // Đan sư (24 sprite `dan_*`: lò đan, khói, lửa thuốc lục, sen, lá, hạc, đan khổng lồ). Tên file sẽ đổi theo hash khi đóng atlas.
  dan: { file: 'hoa-truc/vfx_sprites_dan.04e3c91a7f.webp', cols: 4, rows: 6 },
  guong: { file: 'hoa-truc/vfx_sprites_guong.ab4d31a334.webp', cols: 4, rows: 4 },
  dong: { file: 'hoa-truc/vfx_sprites_dong.508bc97f8f.webp', cols: 4, rows: 6 },
  kieu: { file: 'hoa-truc/vfx_sprites_kieu.27c9c1ffe4.webp', cols: 4, rows: 6 },
} as const;
export type SpriteGroup = keyof typeof SPRITE_GROUPS;
/** Hướng tu (`PATHS[].id`) → nhóm atlas của nó. Thêm một dòng khi thêm hướng mới. */
export const PATH_SPRITE_GROUP: Record<string, SpriteGroup> = {
  hon_tu: 'hon',
  loi_tu: 'loi',
  kiem_tu: 'kiem',
  the_tu: 'hp',
  dao_tu: 'dao',
  co_than: 'cth',
  dan_su: 'dan',
};
/** Số nhóm tối đa giữ trong GPU cùng lúc (không tính nhóm của người chơi) và thời gian rỗi (ms) trước khi một nhóm bị giải phóng. */
export const SPRITE_MAX_RESIDENT = 3;
export const SPRITE_IDLE_MS = 90_000;

/** Tiền tố tên sprite → nhóm atlas khi nhóm KHÔNG trùng tiền tố (sprite của quái gom chung một atlas nhỏ). */
const PREFIX_GROUP: Record<string, SpriteGroup> = {
  thuy: 'hai',
  nguyet: 'hai',
  cot: 'tinh',
  tho: 'tinh',
  doc: 'tinh',
  tim: 'tinh',
  lua: 'lam',
  ham: 'lam',
  // A6: nhóm gương (guong_ + mac_), nhóm đồng đỉnh (dong_ + phu_ + tuq_), nhóm cầu đá (kieu_ + sa_ + may_)
  mac: 'guong',
  phu: 'dong',
  tuq: 'dong',
  sa: 'kieu',
  may: 'kieu',
};
export const spriteGroupOf = (name: string): SpriteGroup => {
  const pre = name.split('_')[0]!;
  return PREFIX_GROUP[pre] ?? (pre as SpriteGroup);
};
const CELL = new Map<string, { group: SpriteGroup; idx: number }>();
{
  const count: Record<string, number> = {};
  for (const n of FX_SPRITES) {
    const g = spriteGroupOf(n);
    CELL.set(n, { group: g, idx: (count[g] = (count[g] ?? -1) + 1) });
  }
}
/** Nhóm atlas và chỉ số ô TRONG nhóm của một sprite. */
export const spriteCell = (name: string): { group: SpriteGroup; idx: number } => CELL.get(name) ?? { group: 'hon', idx: 0 };

interface GroupState {
  tex: THREE.Texture;
  /** 0 = chưa nạp, 1 = đang nạp, 2 = đã nạp. */
  state: 0 | 1 | 2;
  last: number;
  token: number;
}
const groupState = new Map<SpriteGroup, GroupState>();
const makeTex = (): THREE.Texture => {
  if (typeof document === 'undefined') {
    const t = new THREE.DataTexture(new Uint8Array(16), 2, 2);
    t.needsUpdate = true;
    return t;
  }
  const t = new THREE.Texture();
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  return t;
};
const stateOf = (g: SpriteGroup): GroupState => {
  let st = groupState.get(g);
  if (!st) groupState.set(g, (st = { tex: makeTex(), state: 0, last: 0, token: 0 }));
  return st;
};

/** Texture của nhóm (đối tượng ổn định để gắn vào material; KHÔNG tự nạp ảnh: gọi `useSpriteGroup` khi cần). */
export function spriteAtlas(g: SpriteGroup): THREE.Texture {
  return stateOf(g).tex;
}

/** Đánh dấu nhóm đang dùng và nạp ảnh nếu chưa (bất đồng bộ qua `ASSET_BASE`). */
export function useSpriteGroup(g: SpriteGroup, now = performance.now()): void {
  const st = stateOf(g);
  st.last = now;
  if (st.state !== 0 || typeof document === 'undefined') return;
  st.state = 1;
  const token = ++st.token;
  const img = new Image();
  img.crossOrigin = ASSET_CROSS_ORIGIN ?? null;
  img.onload = () => {
    if (st.token !== token) return; // đã bị giải phóng trong lúc nạp
    // Đổi từ canvas 1×1 sang ảnh thật: `dispose` trước để WebGPU bỏ texture GPU kích thước cũ rồi dựng lại đúng cỡ (nếu không: copy vượt biên 1×1).
    st.tex.dispose();
    st.tex.image = img;
    st.tex.needsUpdate = true;
    st.state = 2;
  };
  img.src = `${ASSET_BASE}${SPRITE_GROUPS[g].file}`;
}

/** Nạp sẵn nhóm của hướng tu (hướng của người chơi). */
export function preloadSpritesForPath(pathId: string | undefined): void {
  const g = pathId ? PATH_SPRITE_GROUP[pathId] : undefined;
  if (g) {
    useSpriteGroup(g);
    keepGroup = g;
  }
}
let keepGroup: SpriteGroup | null = null;

let tinyCanvas: HTMLCanvasElement | null = null;
/**
 * Giải phóng nhóm: huỷ lần nạp dở, `dispose` texture GPU và thay ảnh bằng canvas 1×1 (KHÔNG để `image = null`: texture đã từng nạp mà không có ảnh làm `Textures.updateTexture`
 * của WebGPU ném lỗi → mất khung hình/màn đen; đã gặp ở phòng thử `--reload`). Lần dùng kế `useSpriteGroup` nạp lại ảnh thật.
 */
function releaseGroup(st: GroupState): void {
  st.token++;
  st.tex.dispose();
  if (typeof document !== 'undefined') {
    if (!tinyCanvas) {
      tinyCanvas = Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
      tinyCanvas.getContext('2d'); // WebGPU `copyExternalImageToTexture` không nhận canvas chưa có ngữ cảnh vẽ
    }
    st.tex.image = tinyCanvas;
    st.tex.needsUpdate = true;
  }
  st.state = 0;
}

/** Giải phóng nhóm rỗi quá `SPRITE_IDLE_MS` khi đang giữ quá `SPRITE_MAX_RESIDENT` nhóm (trừ nhóm của người chơi). Gọi định kỳ. */
export function sweepSpriteGroups(now = performance.now()): void {
  const loaded = [...groupState.entries()].filter(([, st]) => st.state !== 0);
  if (loaded.length <= SPRITE_MAX_RESIDENT) return;
  const idle = loaded.filter(([g, st]) => g !== keepGroup && now - st.last > SPRITE_IDLE_MS).sort((a, b) => a[1].last - b[1].last);
  for (const [, st] of idle.slice(0, loaded.length - SPRITE_MAX_RESIDENT)) {
    releaseGroup(st);
  }
}

/** Phòng thử (`?vfxlab=1`): giải phóng NGAY mọi nhóm đang giữ (kể cả của người chơi) để kiểm vòng nạp lại; trả tên các nhóm đã giải phóng. */
export function evictSpriteGroups(): SpriteGroup[] {
  const out: SpriteGroup[] = [];
  for (const [g, st] of groupState) {
    if (st.state === 0) continue;
    releaseGroup(st);
    out.push(g);
  }
  return out;
}

/** Bộ nhớ GPU ước tính (byte, RGBA8 + chuỗi mipmap) của một nhóm / của mọi nhóm đang giữ: dùng cho số đo và test. */
export const spriteGroupBytes = (g: SpriteGroup): number =>
  Math.round(SPRITE_GROUPS[g].cols * 512 * SPRITE_GROUPS[g].rows * 512 * 4 * (4 / 3));
export const residentSpriteGroups = (): SpriteGroup[] => [...groupState.entries()].filter(([, st]) => st.state !== 0).map(([g]) => g);

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
  const base = ASSET_BASE;
  ART_FILES.forEach((name, i) => {
    const img = new Image();
    img.crossOrigin = ASSET_CROSS_ORIGIN ?? null;
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
