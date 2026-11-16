# Túi đồ (TD-A): giao thức cho client

Gói TD-A (shared + server). UI do TD-B làm theo tài liệu này. Không có thay đổi giao diện trong gói này.

## Dung lượng

- `INV_PAGE = 30`, `INV_PAGES = 4`, `INV_SIZE = 120` (`packages/shared/src/types.ts`). **Mở sẵn cả 120 ô**, không có lệnh mở trang, không có cột `inv_pages`.
- Trang `p` (0–3) gồm ô `p*30 … p*30+29`. Client chỉ việc chia trang; mọi lệnh dùng chỉ số ô tuyệt đối 0–119.
- Đồ cũ ở ô 0–29 giữ nguyên. Lệnh nào nhận ô đều kiểm `0 ≤ ô < INV_SIZE` và số nguyên.

## Dữ liệu một ô (`InvItem`)

`{ id, n, plus?, inst?, lk? }`. `lk: true` = ô đang **khóa** (không có thì mở). Cờ khóa lưu ở DB (`items.locked`, DB v5), chỉ có ở túi: khi mặc đồ, cờ bị bỏ.

Món khóa:

- không bán (`sell` trả `sys.item_locked`), không phân giải (`upg` `salvage` bị hủy);
- không bị trừ làm nguyên liệu: `InvDraft.count/remove` bỏ qua ô khóa (cường hóa, khảm, tẩy luyện, Thăng Bậc, chế tạo, đột phá…); ô khóa cũng không nhận thêm khi nhặt/mua;
- không bị gộp khi sắp xếp hay khi kéo chồng lên chồng (kéo chỉ đổi chỗ);
- vẫn dùng được, mặc được, và là **đích** của cường hóa/Thăng Bậc (khóa được giữ lại).

## Lệnh client → server

Hằng số trong `C` (`packages/shared/src/protocol.ts`). Lệnh sai kiểu/ngoài phạm vi bị bỏ im lặng.

| Lệnh | Tên | Payload | Ghi chú |
| --- | --- | --- | --- |
| `C.INV_SORT` | `isort` | `{ r }` | `r`: khóa idempotency (chuỗi 4–40 ký tự, như các lệnh khác). Giãn ≥ 1 s. |
| `C.INV_LOCK` | `ilock` | `{ slot, on }` | `on` là boolean tường minh (không toggle) nên gửi lặp vô hại. Giãn ≥ 0,1 s. Không cần `r`. |
| `C.INV_SPLIT` | `isplit` | `{ slot, n, to?, r }` | Tách `n` (nguyên, `1 ≤ n < số trong ô`) sang ô trống `to` (bỏ trống = ô trống đầu tiên). Đồ không chồng được, `to` đã có đồ, túi đầy → báo `sys.inv_split_fail`. Chồng khóa → chồng mới cũng khóa. Giãn ≥ 0,15 s. |
| `C.MOVE_ITEM` | `mv` | `{ a, b }` | Có sẵn; đích ở mọi trang. Cùng loại cùng `plus` thì gộp (trừ ô khóa), ngược lại đổi chỗ. |

Mỗi lệnh sắp xếp/tách là **một transaction**, ghi ledger một dòng `noop` mang khóa idempotency (tổng vật phẩm không đổi nên `ledger:check` vẫn khớp). Gửi lại cùng `r` thì không chạy lần hai.

### Thứ tự sắp xếp

Gộp chồng (cùng id, cùng `plus`, không khóa, không phải đồ roll) rồi xếp: **loại → phẩm → bậc → cấp yêu cầu → tên → +cấp → số lượng**; loại và phẩm/bậc/cấp cao đứng trước; ô trống dồn về cuối. Hàm thuần `planSort(inv, ctx)` ở `packages/shared/src/inventory.ts` (client có thể dùng để xem trước, nhưng chỉ server quyết định).

## Server → client: `S.INV`

```ts
interface InvMsg { inv?: InvSlot[]; d?: [number, InvSlot][]; equip: Equipment }
```

- Tin `S.INV` **đầu tiên** của phiên là ảnh đầy đủ (`inv`, 120 ô). Sau đó nếu ≤ 24 ô đổi thì chỉ gửi `d` (danh sách `[ô, món|null]`), nếu nhiều hơn (sắp xếp, nhặt hàng loạt) lại gửi `inv` đầy đủ. `equip` luôn đầy đủ.
- Client áp bằng `applyInvMsg(túiCũ, msg)` (đã dùng ở `engine.ts`, trả mảng mới). `InitMsg.inv` vẫn là ảnh đầy đủ lúc vào.
- Cuối một lần đổi lớn payload ≈ ảnh đầy đủ; đổi một ô ≈ vài chục byte (test kiểm delta < ¼ ảnh đầy đủ).

## Phân loại và lực chiến (shared)

- `itemCategory(def)` → `'gear' | 'pill' | 'material' | 'quest' | 'other'`: trang bị theo ô (`isEquipSlot(kind)`), `consumable` → pill, `material` → material, cờ `quest: true` trong `items.json` → quest (ưu tiên cao nhất), còn lại other. `CATEGORY_ORDER` là thứ tự tab/sắp xếp. Hiện chưa vật phẩm nào gắn `quest`; thêm cờ ở `items.json` khi có.
- `combatPower(stats)`: `(công·4 + thủ·3 + khí huyết·0,2 + linh lực·0,1) × (1 + tỉ lệ bạo kích·(hệ số bạo−1)) × (1 + giảm hồi chiêu·0,5 + hút máu·2 + hồi phục nhận·0,3 + sát thương tinh anh·0,3)`, làm tròn. Trọng số ở `POWER_W`; nhận `PlayerStats` hoặc tập con (`hp, mp, atk, def` bắt buộc, còn lại tùy chọn) nên tính được cả cho món trang bị để so sánh +/−.

## Kiểm tra đã chạy

- `apps/server/src/game/inventory.test.ts`: 120 ô, túi đầy, ô khóa (nguyên liệu, nhặt, gộp, bán), sort (gộp, khóa, idempotency, spam), split (từ chối, replay, túi đầy), delta, migration DB v4 → v5; `upgrade.test.ts` thêm phân giải/cường hóa với ô khóa; `packages/shared/src/inventory.test.ts`.
- `pnpm --filter @dtl/bot-client security`: thêm mục 15 (slot ngoài phạm vi/kiểu lạ, tách số âm, sort spam, bán ô khóa).
- 100 bot + `ledger:check`: khớp, 0 dòng `refId`.
