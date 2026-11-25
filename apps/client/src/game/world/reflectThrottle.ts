/**
 * Giảm tần số vẽ lượt phản chiếu phẳng (sàn gương Kính Nguyệt): mỗi lượt là vẽ lại cả cảnh vào một render target (~67 draw/khung
 * ở cảnh đánh, baseline 25/11). Phản chiếu cập nhật mỗi `every` khung NẾU CAMERA ĐỨNG YÊN; các khung giữa dùng lại texture phản chiếu khung trước.
 *
 * Camera chéo đi theo người chơi liên tục: texture phản chiếu được lấy mẫu theo UV màn hình của khung hiện tại, nên một khung bỏ qua lúc camera
 * đã dịch làm phản chiếu lệch một khung rồi "giật" lại ở khung cập nhật (thấy như mặt gương rung 30 Hz). Vì vậy HỄ camera đổi (ma trận thế giới
 * hoặc chiếu khác lần vẽ trước) thì vẽ ngay; chỉ bỏ khung khi camera không đổi (đứng yên, ra chiêu tại chỗ), lúc đó phản chiếu lệch duy nhất là
 * của vật chuyển động (quái, người), không thể thấy.
 *
 * Khung đầu luôn vẽ. `every <= 1` = mỗi khung (không đổi hành vi). `cam` là mảng số mô tả camera (ví dụ ma trận thế giới + hai phần tử chiếu).
 */
export function reflectionThrottle(every: number, epsilon = 1e-4): (cam?: ArrayLike<number>) => boolean {
  const n = Math.max(1, Math.floor(every));
  let i = 0;
  let last: number[] | null = null;
  return (cam) => {
    const idx = i++;
    if (n <= 1) return true;
    const moved = !cam || !last || last.length !== cam.length || changed(last, cam, epsilon);
    if (moved || idx % n === 0) {
      last = cam ? Array.from(cam) : null;
      return true;
    }
    return false;
  };
}

function changed(a: ArrayLike<number>, b: ArrayLike<number>, eps: number): boolean {
  for (let k = 0; k < a.length; k++) if (Math.abs(a[k]! - b[k]!) > eps) return true;
  return false;
}
