import { defineConfig } from 'vitest/config';

// Test pipeline đọc/ghi GLB thật (tối ưu GLB kiến trúc tổng hợp, sinh collider từ hình học): vài giây mỗi test, dễ vượt 5 s mặc định khi các file test chạy song song trên máy CI.
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
