/**
 * Ngân sách hiệu ứng chiêu của người chơi khác (M6-3). Mỗi lưới hiệu ứng là một draw call; giữa trận 50–100 người
 * cùng ra chiêu, chỉ riêng hiệu ứng của người khác đã 120–180 draw call (đo bằng `pnpm bench:crowd`), đẩy cả khung
 * vượt 300 draw và CPU vượt 8 ms. Khi pool hiệu ứng đã đông, bỏ phần trang trí không dính tới mình (chiêu của người
 * khác, quái cắn người khác): vẫn giữ hiệu ứng của mình, đòn nhắm vào mình, chiêu/vùng nổ của quái và boss (báo nguy
 * hiểm, đi đường S.HAZARD), niệm chú, động tác chiêu và âm thanh.
 * Chỉ là lớp hình, không đổi gì về luật chơi.
 */

/** Số lưới hiệu ứng đang sống mà từ đó bỏ hiệu ứng chiêu mới của người khác. */
export const OTHERS_FX_LIVE_MAX = 30;
/** Xa hơn (m, tính từ nhân vật mình) thì luôn bỏ hiệu ứng chiêu của người khác (tầm nhìn đông người đã bị che lấp). */
export const OTHERS_FX_DIST = 45;

/** Loại S.FX chỉ trang trí: chiêu người chơi và cú cắn của quái (không phải trạng thái cần đọc như niệm chú, độ kiếp). */
const COSMETIC_FX: ReadonlySet<string> = new Set(['sword', 'slash', 'thunder', 'rain', 'heal', 'shield', 'bite', 'kanh', 'vankiem', 'transon', 'kimcuong', 'xuanphong', 'hoithien']);

export interface OthersFx {
  /** Mình là nguồn hoặc đích. */
  involvesMe: boolean;
  /** Số lưới hiệu ứng đang sống. */
  live: number;
  /** Khoảng cách (m) từ nhân vật mình tới chỗ hiệu ứng. */
  dist: number;
}

/** Có bỏ hiệu ứng loại `t` này không. */
export function skipOthersFx(t: string, o: OthersFx): boolean {
  if (o.involvesMe || !COSMETIC_FX.has(t)) return false;
  return o.dist > OTHERS_FX_DIST || o.live >= OTHERS_FX_LIVE_MAX;
}
