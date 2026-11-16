// Móc cơ chế riêng của độ kiếp (E1-F). `tribulations.json` ghi `mechanic: "<id>"` trên một pha; khi pha bắt đầu/đang chạy/kết thúc,
// `TribSystem` gọi `enter`/`tick`/`exit` của cơ chế đó. Các cơ chế dưới đây là CHỖ TRỐNG có chủ: chưa làm gì ngoài ghi log một lần,
// để E2-D (Kết Đan), E3 (Nguyên Anh), E4 (Hóa Thần) cài thật bằng `registerMechanic` mà không phải đụng lõi.
//
//   dan_tran    Kết Đan, pha Ngưng đan: vòng Đan Trận 4 m, thanh ngưng đan 0→100 trong 20 s khi đứng yên trong vòng, ra khỏi vòng tụt 3%/s.
//   tia_xich    Nguyên Anh, pha Lôi: tia xích nối giữa hai tia.
//   xuat_khieu  Nguyên Anh, pha Hỏa: phím X cho nguyên anh rời thân 6 s (hồi 20 s), thân đứng yên chịu lửa, nguyên anh không chịu lửa.
//   tam_canh    Nguyên Anh, pha Tâm ma: thanh tâm cảnh (giảm khi bị đánh trúng, hồi khi đánh trúng); Tâm Ma Ảnh dùng 2 chiêu của người chơi.
//   ngu_hanh    Hóa Thần, pha Ngũ hành lôi: tia mang hành xoay Kim→Mộc→Thủy→Hỏa→Thổ mỗi 5 s, 5 trận môn, đứng đúng trận môn giảm 80% (cờ `ke`).
//   phan_than   Hóa Thần, pha Thần niệm / Hợp nhất: phím G tạo phân thân thần niệm; phân thân chắn thay 40% ở pha cuối.
//
// Quy ước: trạng thái của cơ chế nằm ở `tr.mech[<id>]` (chỉ server giữ). Mọi lệnh phím (X, G) phải qua `GameSim.rateOk` và kiểm trạng thái kiếp ở server.

import { TRIB_MECHANIC_IDS, type TribDef, type TribPhaseDef } from '@dtl/shared';
import type { PlayerEnt } from './sim';
import type { TribHost, TribState } from './trib';

export interface TribMechCtx {
  /** Cổng vào sim (hành động server). */
  host: TribHost;
  p: PlayerEnt;
  tr: TribState;
  def: TribDef;
  phase: TribPhaseDef;
  phaseIdx: number;
  /** Giây từ lúc bắt đầu kiếp. */
  elapsed: number;
  now: number;
}

export interface TribMechanic {
  enter?(c: TribMechCtx): void;
  tick?(c: TribMechCtx): void;
  exit?(c: TribMechCtx): void;
}

const registry = new Map<string, TribMechanic>();
const warned = new Set<string>();

/** Cài (hoặc thay) cơ chế `id`. Dùng ở E2-D/E3/E4. */
export function registerMechanic(id: string, impl: TribMechanic): void {
  registry.set(id, impl);
}

export function hasMechanic(id: string): boolean {
  return registry.has(id);
}

for (const id of TRIB_MECHANIC_IDS) {
  registerMechanic(id, {
    enter(c) {
      if (warned.has(id)) return;
      warned.add(id);
      console.log(`[trib] cơ chế "${id}" (kiếp ${c.def.id}, pha ${c.phase.id}) chưa cài: chạy pha chung`);
    },
  });
}

export function runMechanic(id: string | undefined, hook: keyof TribMechanic, c: TribMechCtx): void {
  if (!id) return;
  const m = registry.get(id);
  if (!m) {
    if (!warned.has(id)) {
      warned.add(id);
      console.warn(`[trib] cơ chế "${id}" không có trong registry`);
    }
    return;
  }
  m[hook]?.(c);
}
