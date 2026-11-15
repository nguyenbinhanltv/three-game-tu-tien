// Tham số kiểm thử từ URL (M1-10): `?god` (bất tử) và `?at=<địa điểm>` (vào game ở điểm đặt tên).
// Client chỉ gửi ý định trong options lúc join; server quyết định có cho hay không.
//
// Chỉ tài khoản thử được dùng: đăng nhập thử (`auth.dev`) VÀ server đang bật AUTH_DEV_BYPASS.
// `config.devBypass` tự tắt khi NODE_ENV=production hoặc có GOOGLE_CLIENT_ID, nên ở đó không có đường tắt
// kể cả khi một phiên dev cũ còn sót. Tài khoản Google thật luôn bị từ chối.
import { PLACE, PLACE_ID } from '@dtl/content/places';
import type { PlaceDef } from '@dtl/shared';

export interface TestFlags {
  god: boolean;
  /** Điểm đã kiểm (tồn tại trong bảng), hoặc null. */
  at: PlaceDef | null;
}

export type TestFlagsResult =
  | { kind: 'none' }
  | { kind: 'denied' }
  | { kind: 'bad_place'; id: string }
  | { kind: 'ok'; flags: TestFlags };

/** Có được dùng tham số kiểm thử / lệnh GM không. */
export function testAccess(dev: boolean, devBypass: boolean): boolean {
  return dev === true && devBypass === true;
}

/**
 * Đọc `god`/`at` trong options join. Không hỏi gì thì `none` (không báo gì cho người chơi thật).
 * `at` phải là id trong bảng địa điểm; id lạ hay sai kiểu thì không dịch chuyển.
 */
export function readTestFlags(options: unknown, dev: boolean, devBypass: boolean): TestFlagsResult {
  const o = (options ?? {}) as { god?: unknown; at?: unknown };
  const wantGod = o.god === true || o.god === 1 || o.god === '1';
  const hasAt = o.at !== undefined && o.at !== null && o.at !== '';
  if (!wantGod && !hasAt) return { kind: 'none' };
  if (!testAccess(dev, devBypass)) return { kind: 'denied' };
  let at: PlaceDef | null = null;
  if (hasAt) {
    const id = typeof o.at === 'string' ? o.at.slice(0, 32) : '';
    at = PLACE_ID.test(id) ? (PLACE.get(id) ?? null) : null;
    if (!at) return { kind: 'bad_place', id: id || '?' };
  }
  return { kind: 'ok', flags: { god: wantGod, at } };
}
