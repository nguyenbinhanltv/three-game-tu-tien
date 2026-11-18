/**
 * Truy cập mảng có kiểm (CLEAN-2, `noUncheckedIndexedAccess`): dùng cho chỗ chỉ số luôn hợp lệ theo dữ liệu/hằng số
 * (bảng cấu hình, tuple cố định). Thiếu phần tử là lỗi dữ liệu nên ném lỗi rõ ràng thay vì trả `undefined` âm thầm.
 * Vòng nóng hoặc chỗ thiếu là bình thường thì kiểm `=== undefined` tại chỗ, đừng dùng hàm này.
 * Module lá: không import gì để mọi file trong gói dùng được mà không tạo vòng phụ thuộc.
 */
export function at<T>(arr: ArrayLike<T>, i: number, what = 'mảng'): T {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`${what}[${i}] không tồn tại (độ dài ${arr.length})`);
  return v;
}
