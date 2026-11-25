// Danh sách lỗi dùng chung của `content:check`, tách khỏi base.ts để module không chạy kiểm nào khi import
// (lệnh riêng như `pnpm i18n:orphans` chỉ cần `err`/`errors`).
export const errors: string[] = [];
export const err = (m: string) => errors.push(m);
