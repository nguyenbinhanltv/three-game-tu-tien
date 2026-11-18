// Serializer Schema có StateView, sửa lỗi cắt gói của Colyseus 0.16 (L1, "refId not found" ở bot khi 100 người).
//
// `SchemaSerializer.applyPatches` gốc dùng chung MỘT iterator `it` cho mọi client: byte view của client sau nối tiếp
// byte view của client trước trong cùng `sharedBuffer`. Khi tổng vượt `Encoder.BUFFER_SIZE`, `Encoder.encode` cấp
// bộ đệm mới nhưng `encodeView` vẫn cắt `Buffer.concat` từ bộ đệm cũ (đã bị cắt cụt), nên client nhận gói kết thúc bằng
// một SWITCH_TO_STRUCTURE thiếu refId → client báo `"refId" not found: undefined` và bỏ phần còn lại của gói.
// Ở đây (vá prototype, không thay serializer của room vì dựng Encoder thứ hai làm hỏng đồng bộ) mỗi client được mã hóa từ cùng `sharedOffset` (kết quả đã được `Buffer.concat` sao chép, nên ghi đè an toàn),
// nên bộ đệm chỉ cần chứa MỘT client chứ không phải 100.
import { ClientState, Protocol, SchemaSerializer } from '@colyseus/core';
import { Encoder } from '@colyseus/schema';
import type { Client } from '@colyseus/core';
import type { StateView } from '@colyseus/schema';
import { log } from './log';

type Ser = {
  encoder: import('@colyseus/schema').Encoder;
  hasFilters: boolean;
  needFullEncode: boolean;
};

// `encodeView` ghi byte hiển thị (thêm/bớt thực thể) rồi mới gọi `encode`; nếu một client đơn lẻ đã vượt bộ đệm thì `encode`
// cấp bộ đệm mới nhưng gói bị cắt, không sửa được từ ngoài. Nên giữ BUFFER_SIZE đủ rộng (VIEW_BUFFER_SIZE) và báo lỗi to nếu
// vẫn tràn, thay vì để client âm thầm mất thực thể.
export const VIEW_BUFFER_SIZE = 128 * 1024;

function encodeViewChecked(enc: Ser['encoder'], view: StateView, sharedOffset: number): Buffer {
  const buf = enc.sharedBuffer;
  const it = { offset: sharedOffset };
  const out = enc.encodeView(view, sharedOffset, it, buf);
  // `it` còn giữ offset của lượt mã hóa đầu (lượt ghi lại khi tràn dùng iterator riêng), nên vượt cỡ bộ đệm nghĩa là đã tràn.
  if (it.offset > buf.byteLength) {
    log.error(`[viewSerializer] bộ đệm mã hóa bị tràn (${buf.byteLength} B, cần ${it.offset} B): gói của một client có thể bị cắt. Tăng VIEW_BUFFER_SIZE.`);
  }
  return out;
}

function applyPatches(this: Ser, clients: Client[]): boolean {
  let n = clients.length;
  if (n === 0) {
    this.encoder.discardChanges();
    return false;
  }
  const joined = (c: Client) => c.state === ClientState.JOINED;
  const sharedOffset0 = 1;
  if (!this.encoder.hasChanges) {
    if (this.hasFilters) {
      const withView = clients.filter((c) => joined(c) && (c.view?.changes.size ?? 0) > 0);
      if (withView.length > 0) {
        this.encoder.sharedBuffer[0] = Protocol.ROOM_STATE_PATCH;
        for (const c of withView) c.raw(encodeViewChecked(this.encoder, c.view!, sharedOffset0));
      }
    }
    return false;
  }
  this.needFullEncode = true;
  const it = { offset: 1 };
  this.encoder.sharedBuffer[0] = Protocol.ROOM_STATE_PATCH;
  const shared = this.encoder.encode(it);
  if (!this.hasFilters) {
    while (n--) if (joined(clients[n])) clients[n].raw(shared);
  } else {
    const sharedOffset = it.offset;
    while (n--) {
      const c = clients[n];
      if (!joined(c)) continue;
      c.raw(c.view ? encodeViewChecked(this.encoder, c.view, sharedOffset) : shared);
    }
  }
  this.encoder.discardChanges();
  return true;
}

let installed = false;
export function installViewPatchFix(): void {
  if (installed) return;
  const proto = SchemaSerializer.prototype as unknown as { applyPatches?: unknown };
  // Thư viện được ghim bằng dấu mũ: nếu bản nâng cấp đổi hình dạng thì phải báo ngay, không được bỏ qua bản vá trong im lặng.
  if (typeof proto.applyPatches !== 'function' || !('encodeView' in Encoder.prototype)) {
    throw new Error('viewSerializer: SchemaSerializer.applyPatches/Encoder.encodeView không còn như @colyseus 0.16, cần xem lại bản vá L1.');
  }
  installed = true;
  // Bộ đệm này nằm trên mỗi room (không phải mỗi client), nên chi phí bộ nhớ nhỏ. Phải đặt trước khi tạo room.
  if (Encoder.BUFFER_SIZE < VIEW_BUFFER_SIZE) Encoder.BUFFER_SIZE = VIEW_BUFFER_SIZE;
  proto.applyPatches = applyPatches;
}
