// Serializer Schema có StateView, sửa lỗi cắt gói của Colyseus 0.16 (L1, "refId not found" ở bot khi 100 người).
//
// `SchemaSerializer.applyPatches` gốc dùng chung MỘT iterator `it` cho mọi client: byte view của client sau nối tiếp
// byte view của client trước trong cùng `sharedBuffer`. Khi tổng vượt `Encoder.BUFFER_SIZE`, `Encoder.encode` cấp
// bộ đệm mới nhưng `encodeView` vẫn cắt `Buffer.concat` từ bộ đệm cũ (đã bị cắt cụt), nên client nhận gói kết thúc bằng
// một SWITCH_TO_STRUCTURE thiếu refId → client báo `"refId" not found: undefined` và bỏ phần còn lại của gói.
// Ở đây (vá prototype, không thay serializer của room vì dựng Encoder thứ hai làm hỏng đồng bộ) mỗi client được mã hóa từ cùng `sharedOffset` (kết quả đã được `Buffer.concat` sao chép, nên ghi đè an toàn),
// nên bộ đệm chỉ cần chứa MỘT client chứ không phải 100.
import { ClientState, Protocol, SchemaSerializer } from '@colyseus/core';
import type { Client } from '@colyseus/core';

type Ser = {
  encoder: import('@colyseus/schema').Encoder;
  hasFilters: boolean;
  needFullEncode: boolean;
};

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
        for (const c of withView) c.raw(this.encoder.encodeView(c.view!, sharedOffset0, { offset: sharedOffset0 }));
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
      c.raw(c.view ? this.encoder.encodeView(c.view, sharedOffset, { offset: sharedOffset }) : shared);
    }
  }
  this.encoder.discardChanges();
  return true;
}

let installed = false;
export function installViewPatchFix(): void {
  if (installed) return;
  installed = true;
  (SchemaSerializer.prototype as unknown as { applyPatches: typeof applyPatches }).applyPatches = applyPatches;
}
