// Tham số URL kiểm thử (M1-10). Client chỉ gửi ý định trong options lúc join; server quyết định
// (chỉ tài khoản thử trên server bật AUTH_DEV_BYPASS, xem apps/server/src/testflags.ts).
//   ?god            bất tử: vẫn nhận đòn, không mất máu
//   ?at=<địa điểm>  vào game ở điểm đặt tên (bảng địa điểm trong packages/content, chỉ server đọc), như `/gm tp <địa điểm>`
//   ?show=char      alias của trang xem asset cho model người chơi (?show=<id asset> cho asset khác)
//   ?show=skill&id=<id chiêu|id pose>[&model=char]  trang xem chiêu (K-1): phát/dừng, chậm, đầu dò số, khung xương

//   ?at=x,z         vào game ở tọa độ (mét), gửi thành `pos: [x, z]`
//   ?realm=nk15     đặt cảnh giới lúc vào: nk1…nk15, tc, tc1…tc3 hoặc số cấp (như `/gm realm`)
//   ?tribulation=1  kích độ kiếp Trúc Cơ ngay sau khi vào (như `/gm trib`)
//   ?debug=1        cho mở bảng gỡ lỗi F3 ở bản build (bản dev luôn mở được); chỉ là hiển thị, không gửi server

import { parseRealmCode } from '@dtl/shared';

export interface TestJoinOptions {
  god?: true;
  at?: string;
  pos?: [number, number];
  realm?: number;
  trib?: true;
}

/** Model mặc định của alias `?show=`. */
export const SHOW_ALIASES: Record<string, string> = {
  char: 'chr_kiem_tu_nam',
};

const ID = /^[a-z0-9_]{1,40}$/;

export function readTestParams(search: string): TestJoinOptions {
  const q = new URLSearchParams(search);
  const out: TestJoinOptions = {};
  if (on(q.get('god'))) out.god = true;
  const at = q.get('at')?.trim().toLowerCase();
  const xz = at ? /^(-?\d{1,5}(?:\.\d{1,3})?),(-?\d{1,5}(?:\.\d{1,3})?)$/.exec(at) : null;
  if (xz) out.pos = [Number(xz[1]), Number(xz[2])];
  else if (at && ID.test(at)) out.at = at;
  const realm = parseRealmCode(q.get('realm') ?? '');
  if (realm !== null) out.realm = realm;
  if (on(q.get('tribulation'))) out.trib = true;
  return out;
}

const on = (v: string | null): boolean => v !== null && v !== '0' && v !== 'false';

/** Bảng gỡ lỗi F3 và nút test chỉ mở được ở bản dev hoặc khi URL có `?debug` (khác `0`/`false`). */
export function debugAllowed(search: string, dev: boolean): boolean {
  return dev || on(new URLSearchParams(search).get('debug'));
}

/** `?show=<alias|id>` → id asset trong manifest, hoặc null nếu không có / không hợp lệ. */
export function showAssetId(search: string): string | null {
  const v = new URLSearchParams(search).get('show')?.trim().toLowerCase();
  if (!v) return null;
  if (v === 'skill') return null;
  const id = SHOW_ALIASES[v] ?? v;
  return ID.test(id) ? id : null;
}

/** `?show=skill` → trang xem chiêu (K-1), không phải asset. */
export function isSkillViewer(search: string): boolean {
  return new URLSearchParams(search).get('show')?.trim().toLowerCase() === 'skill';
}
