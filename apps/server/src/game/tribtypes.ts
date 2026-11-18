// Kiểu dùng chung của hệ độ kiếp (R-7): trạng thái, cấu hình hộ pháp. Không phụ thuộc entities.
import type { TribId } from '@dtl/shared';

/** Trạng thái một lần độ kiếp của một người (chỉ server giữ; client chỉ nhận cờ PF_TRIBULATION và vùng đã báo). */
export interface TribState {
  /** Kiếp nào; thiếu = Trúc Cơ (test cũ dựng trạng thái không có trường này). */
  id?: TribId;
  endAt: number;
  nextAt: number;
  /** Số đợt đã phát. */
  n: number;
  /** Tia khóa mệnh của pha cuối đã thả. */
  fin: boolean;
  /** Số đan hồi phục đã dùng. */
  pills: number;
  /** Pha hiện tại (đổi pha thì chạy `enter`/`exit` của cơ chế). */
  pi?: number;
  /** Mốc thả bóng tâm ma kế tiếp. */
  shadowAt?: number;
  /** Mốc ô lửa kế tiếp và tâm lưới (đặt lúc vào pha lửa đầu tiên). */
  hoaAt?: number;
  anchor?: { x: number; z: number };
  /** Chỗ cho cơ chế riêng giữ trạng thái (khóa = id cơ chế). Chỉ server giữ. */
  mech?: Record<string, unknown>;
}

export interface GuardCfg {
  share: number;
  max: number;
  r: number;
}
