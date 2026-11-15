// Tham số kiểm thử từ URL (M1-10, mở rộng ở PR "debug F3"):
//   `?god`            bất tử
//   `?at=<địa điểm>`  vào game ở điểm đặt tên; `?at=x,z` vào ở tọa độ (client gửi thành `pos: [x, z]`)
//   `?realm=nk15`     đặt cảnh giới lúc vào (`nk1`…`nk15`, `tc`, `tc1`…`tc3` hoặc số cấp)
//   `?tribulation=1`  kích độ kiếp ngay sau khi vào (client gửi `trib: true`)
// Client chỉ gửi ý định trong options lúc join; server quyết định có cho hay không.
//
// Chỉ tài khoản thử được dùng: đăng nhập thử (`auth.dev`) VÀ server đang bật AUTH_DEV_BYPASS.
// `config.devBypass` tự tắt khi NODE_ENV=production hoặc có GOOGLE_CLIENT_ID, nên ở đó không có đường tắt
// kể cả khi một phiên dev cũ còn sót. Tài khoản Google thật luôn bị từ chối.
import { PLACE, PLACE_ID } from '@dtl/content/places';
import { parseRealmCode, type PlaceDef, WORLD_SIZE } from '@dtl/shared';

export interface TestFlags {
  god: boolean;
  /** Điểm đã kiểm (tồn tại trong bảng), hoặc null. */
  at: PlaceDef | null;
  /** Tọa độ đã kiểm (hữu hạn, trong bản đồ), hoặc null. `at` có thì bỏ qua `pos`. */
  pos?: { x: number; z: number } | null;
  /** Cấp cần đặt lúc vào (đã kiểm 1…MAX_LEVEL), hoặc null. */
  realm?: number | null;
  /** Kích độ kiếp ngay sau khi vào. */
  trib?: boolean;
}

export type TestFlagsResult =
  | { kind: 'none' }
  | { kind: 'denied' }
  | { kind: 'bad_place'; id: string }
  | { kind: 'bad_realm'; id: string }
  | { kind: 'ok'; flags: TestFlags };

/** Có được dùng tham số kiểm thử / lệnh GM không. */
export function testAccess(dev: boolean, devBypass: boolean): boolean {
  return dev === true && devBypass === true;
}

const truthy = (v: unknown): boolean => v === true || v === 1 || v === '1';
const asked = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && v !== false;

/** `[x, z]` hữu hạn, nằm trong bản đồ. Sai kiểu hoặc ngoài khoảng thì null. */
function readPos(v: unknown): { x: number; z: number } | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [x, z] = v as unknown[];
  if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (x < 0 || z < 0 || x > WORLD_SIZE || z > WORLD_SIZE) return null;
  return { x, z };
}

/**
 * Đọc tham số kiểm thử trong options join. Không hỏi gì thì `none` (không báo gì cho người chơi thật).
 * `at` phải là id trong bảng địa điểm; `pos` phải nằm trong bản đồ; `realm` phải là mã cảnh giới hợp lệ.
 * Giá trị sai thì không áp gì cả (trả `bad_place` / `bad_realm`), không áp một nửa.
 */
export function readTestFlags(options: unknown, dev: boolean, devBypass: boolean): TestFlagsResult {
  const o = (options ?? {}) as { god?: unknown; at?: unknown; pos?: unknown; realm?: unknown; trib?: unknown };
  const wantGod = truthy(o.god);
  const wantTrib = truthy(o.trib);
  const hasAt = asked(o.at);
  const hasPos = asked(o.pos);
  const hasRealm = asked(o.realm);
  if (!wantGod && !wantTrib && !hasAt && !hasPos && !hasRealm) return { kind: 'none' };
  if (!testAccess(dev, devBypass)) return { kind: 'denied' };
  let at: PlaceDef | null = null;
  if (hasAt) {
    const id = typeof o.at === 'string' ? o.at.slice(0, 32) : '';
    at = PLACE_ID.test(id) ? (PLACE.get(id) ?? null) : null;
    if (!at) return { kind: 'bad_place', id: id || '?' };
  }
  let pos: { x: number; z: number } | null = null;
  if (hasPos && !at) {
    pos = readPos(o.pos);
    if (!pos) return { kind: 'bad_place', id: 'x,z' };
  }
  let realm: number | null = null;
  if (hasRealm) {
    realm = parseRealmCode(o.realm);
    if (realm === null) return { kind: 'bad_realm', id: typeof o.realm === 'string' ? o.realm.slice(0, 8) : '?' };
  }
  return { kind: 'ok', flags: { god: wantGod, at, pos, realm, trib: wantTrib } };
}
