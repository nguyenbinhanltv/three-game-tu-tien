// Test cơ chế chiến đấu/quái đặt người và quái ở toạ độ cố định trên bản đồ thật; prop thật (cây, đá, tường: COL-1) nay chặn đúng chỗ đó.
// Dọn bộ hình va chạm của mọi level trước mỗi file test; test va chạm tự đăng ký hình riêng bằng `registerCollision`.
import { INST_BY_LEVEL } from '@dtl/content';
import { collisionOf } from '@dtl/shared';

for (const level of Object.keys(INST_BY_LEVEL)) collisionOf(level).clear();
