// Quote tham số cho cmd.exe (thuần, không import nặng để test nhanh).
/** Bọc một tham số cho cmd.exe khi chạy qua shell (Windows): có dấu cách/ký tự đặc biệt thì đặt trong ngoặc kép. */
export function quoteArg(a: string): string {
  return /^[\w@%+=:,./\-]+$/.test(a) && !/[%^&|<>]/.test(a) ? a : `"${a.replace(/"/g, '\\"').replace(/%/g, '%%')}"`;
}
