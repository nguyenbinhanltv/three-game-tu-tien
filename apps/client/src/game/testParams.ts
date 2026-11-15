// Tham số URL kiểm thử (M1-10). Client chỉ gửi ý định trong options lúc join; server quyết định
// (chỉ tài khoản thử trên server bật AUTH_DEV_BYPASS, xem apps/server/src/testflags.ts).
//   ?god            bất tử: vẫn nhận đòn, không mất máu
//   ?at=<địa điểm>  vào game ở điểm đặt tên (bảng địa điểm trong packages/content, chỉ server đọc), như `/gm tp <địa điểm>`
//   ?show=char      alias của trang xem asset cho model người chơi (?show=<id asset> cho asset khác)
//   ?show=skill&id=<id chiêu|id pose>[&model=char]  trang xem chiêu (K-1): phát/dừng, chậm, đầu dò số, khung xương

export interface TestJoinOptions {
  god?: true;
  at?: string;
}

/** Model mặc định của alias `?show=`. */
export const SHOW_ALIASES: Record<string, string> = {
  char: 'chr_kiem_tu_nam',
};

const ID = /^[a-z0-9_]{1,40}$/;

export function readTestParams(search: string): TestJoinOptions {
  const q = new URLSearchParams(search);
  const out: TestJoinOptions = {};
  const god = q.get('god');
  if (god !== null && god !== '0' && god !== 'false') out.god = true;
  const at = q.get('at')?.trim().toLowerCase();
  if (at && ID.test(at)) out.at = at;
  return out;
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
