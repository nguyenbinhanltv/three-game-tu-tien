/**
 * Giảm tần số vẽ lượt phản chiếu phẳng (sàn gương Kính Nguyệt): mỗi lượt là vẽ lại cả cảnh vào một render target (~67 draw/khung
 * ở cảnh đánh, baseline 25/11). Phản chiếu cập nhật mỗi `every` khung; các khung giữa dùng lại texture phản chiếu khung trước.
 * Khung đầu luôn vẽ (texture phải có nội dung). `every <= 1` = mỗi khung (không đổi hành vi).
 */
export function reflectionThrottle(every: number): () => boolean {
  const n = Math.max(1, Math.floor(every));
  let i = 0;
  return () => i++ % n === 0;
}
