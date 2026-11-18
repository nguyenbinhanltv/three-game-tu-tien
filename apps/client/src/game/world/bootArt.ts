import { biomeAt, featureWeight, SUOI, VACH } from '@dtl/shared';
import { loadArtUrl } from '../../ui/Art';
import { levelId } from '../../base/levelCtx';

/**
 * Tranh nền màn tiêu đề và màn tải (ảnh Codex, nạp lười sau khung đầu). Màn tải chọn theo vùng người chơi đứng lần cuối
 * (lưu localStorage), lần đầu là Lạc Kiếm Tông. Thiếu ảnh hoặc tải lỗi thì giữ nền sương CSS của #boot.
 */
const KEY = 'dtl.lastZone';
const DEFAULT_ZONE = 'tong_mon';

/** Level riêng có một tranh màn tải chung (E2): bản đồ nào chưa có ảnh thì rơi về logic vùng Vân Lam. */
const LEVEL_ART: Record<string, string> = { doan_mach: 'doan_mach', phuc_mach_quat: 'phuc_mach_quat', van_hai: 'van_hai_phu_dao' };

/** Id ảnh theo vị trí: khớp tên vùng ở `zone.<id>` của i18n, riêng tông môn/Kiếm Trủng theo biome. */
function zoneArtId(x: number, z: number): string {
  const byLevel = LEVEL_ART[levelId()];
  if (byLevel) return byLevel;
  const biome = biomeAt(x, z);
  if (biome === 'sect') return 'tong_mon';
  if (biome === 'dungeon') return 'kiem_trung';
  if (biome === 'lake') return 'ho_suong_mu';
  if (biome === 'forest') return 'rung_linh_thao';
  if (biome === 'valley') return featureWeight(SUOI, x, z) > 0.35 ? 'suoi_thanh_khe' : 'thung_lung';
  return featureWeight(VACH, x, z) > 0.1 ? 'vach_da_ngoc' : 'thung_lung';
}

let last = '';
/** Gọi trước khi đổi level: màn tải của lần chuyển này hiện ngay tranh của level đích. */
export function rememberLevel(id: string): void {
  // Level không có tranh riêng thì về tranh mặc định (Kiếm Trủng theo biome), không giữ tranh của level trước;
  // `last` cập nhật theo để `rememberZone` ghi lại đúng vùng khi người chơi đã vào thế giới.
  const art = LEVEL_ART[id] ?? (id === 'kiem_trung' ? 'kiem_trung' : DEFAULT_ZONE);
  last = art;
  try {
    localStorage.setItem(KEY, art);
  } catch {
    /* localStorage bị chặn: bỏ qua */
  }
}

/** Gọi định kỳ khi đang chơi: ghi nhớ vùng hiện tại (chỉ ghi khi đổi). */
export function rememberZone(x: number, z: number): void {
  const id = zoneArtId(x, z);
  if (id === last) return;
  last = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* localStorage bị chặn: bỏ qua */
  }
}

export function lastZoneArt(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT_ZONE;
  } catch {
    return DEFAULT_ZONE;
  }
}

/** Đặt tranh nền cho #boot: `title` (màn đăng nhập) hoặc id vùng (màn tải). `zone` thì che cảnh 3D tiêu đề. */
export async function setBootArt(id: string, mode: 'title' | 'zone'): Promise<void> {
  const boot = document.getElementById('boot');
  if (!boot) return;
  const url = await loadArtUrl('loading', id);
  if (!url) return;
  let img = boot.querySelector<HTMLImageElement>('.ts-art');
  if (!img) {
    img = document.createElement('img');
    img.className = 'ts-art';
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    boot.insertBefore(img, boot.querySelector('.ts-scene'));
  }
  const el = img;
  const show = () => {
    boot.classList.add('art-on');
    boot.classList.toggle('art-zone', mode === 'zone');
    el.classList.add('ready');
  };
  if (el.getAttribute('src') === url) return show();
  el.classList.remove('ready');
  el.onload = show;
  // Lỗi tải/giải mã: trả về nền sương CSS (bỏ art-on/art-zone để hiện lại đồi và cảnh 3D).
  el.onerror = () => {
    boot.classList.remove('art-on', 'art-zone');
    el.classList.remove('ready');
    el.removeAttribute('src');
  };
  el.src = url;
}
