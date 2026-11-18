/**
 * Truy cập mảng/bảng có kiểm (CLEAN-2, `noUncheckedIndexedAccess`): dùng cho chỗ chỉ số/khóa luôn hợp lệ theo dữ liệu/hằng số
 * (bảng cấu hình, tuple cố định, `LEVELS.van_lam`). Thiếu phần tử là lỗi dữ liệu nên ném lỗi rõ ràng thay vì trả `undefined` âm thầm.
 * Vòng nóng hoặc chỗ thiếu là bình thường thì kiểm `=== undefined` tại chỗ, đừng dùng hàm này.
 * Module lá: không import gì để mọi file trong gói dùng được mà không tạo vòng phụ thuộc.
 */
export function at<T>(arr: ArrayLike<T>, i: number, what?: string): T;
export function at<T>(rec: Readonly<Record<string, T>>, key: string, what?: string): T;
export function at<T>(coll: ArrayLike<T> | Readonly<Record<string, T>>, key: number | string, what = 'bảng'): T {
  const v = (coll as Record<string | number, T | undefined>)[key];
  if (v === undefined) throw new RangeError(`${what}[${String(key)}] không tồn tại`);
  return v;
}

/** Giá trị mặc định cho destructuring khi thiếu phần tử là lỗi dữ liệu: `const [a = missing('a')] = list` (chủ yếu dùng trong test). */
export function missing(what: string): never {
  throw new RangeError(`thiếu ${what}`);
}
