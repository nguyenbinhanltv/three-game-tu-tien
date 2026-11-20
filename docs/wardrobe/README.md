# P4 · Tủ ngoại trang (transmog) — thiết kế

Trạng thái: **đã duyệt** (20/11): **miễn phí, người dùng đã chốt** (không có `cost`, không động tới linh thạch), không nhận `artifact`, nhuộm một bộ ba cho cả người, chưa có mở khóa thành tựu. P4-1 (shared: `packages/shared/src/wardrobe.ts`) đã làm; server/client chưa. Nguồn yêu cầu: `ke-hoach-tong-trang-phuc-vu-khi.md` mục 8.4 (người dùng chốt 16/11): *mặc đồ chỉ số này nhưng hiện dáng bộ khác đã sở hữu, kèm nhuộm 3 kênh riêng*.

## 1. Hiện trạng (đã đọc code)

- Hiển thị người chơi chỉ qua `PlayerS` (`@view`): `sk` (bộ quyết định màu áo/ánh kiếm, `lookSet(c.stats.sets)`), `sa` (mã phụ kiện theo ô, `accessoryCode`), `wp` (id kiếm), `wg` (độ sáng cường hóa), `sn` (skin ô 10), `dye`/`hair`/`g` (chọn lúc tạo nhân vật). Tất cả tính ở `PlayersSystem.syncPublic` từ `c.equip`; client dựng ở `entityVis.ts` (`PlayerLook`).
- Skin (#202, `docs/skin/README.md`): ô thứ 10, sở hữu = món nằm trong túi, mặc/tháo qua `C.EQUIP/C.UNEQUIP` → `Character.tx` (idem + ledger `noop`). Skin đè toàn thân.
- `appearance.json` đã có 6 màu nhuộm (`hex` + `trim`), tên i18n `appearance.dye.<id>`; màu chọn một lần lúc tạo nhân vật, không đổi được.
- DB: `characters` (cột JSON `equip`, `appearance`), `items`, `ledger`; cột mới thêm bằng `ADDED_COLUMNS`, dữ liệu cũ bằng `DATA_VERSION` + hàm migrate.

## 2. Nguyên tắc (khóa cứng)

1. **Không đổi chỉ số.** Chỉ số, bộ, cường hóa, khảm chỉ tính từ `c.equip` thật. Tủ ngoại trang chỉ thay thứ gửi vào `syncPublic` cho các trường hiển thị.
2. **Chỉ dùng được ngoại hình đã mở khóa**, mở khóa theo nhân vật, vĩnh viễn, server ghi.
3. **Hạn chế giống skin:** `wearableBy` (giới tính) áp cho từng mục; không có hạn chế phái/công pháp ngoài những gì `ItemDef` đã khai (không thêm luật mới).
4. **Skin ô 10 vẫn đè lên trên cùng**: có skin thì transmog không hiển thị (vẫn lưu, tháo skin là hiện lại).
5. **Client chỉ gửi ý định**, server kiểm id có trong tủ, đúng ô, đúng giới. Không có chuỗi màu tự do: chỉ nhận id màu trong `appearance.json`.
6. Không phụ thuộc nhân vật v3: tủ chỉ nói "ô nào hiện *id vật phẩm* nào + 3 màu"; việc dựng mesh là của lớp hiển thị. v1 dùng được ngay; v3 đọc lại đúng các trường này.

## 3. Dữ liệu

### 3.1 Bộ sưu tập (mở khóa)

Mục sưu tập = **id vật phẩm trang bị** (có `kind` ∈ ô hiển thị) đã từng có ở túi/trang bị của nhân vật. Lấy id vật phẩm làm khóa (không tạo id "ngoại hình" riêng) vì: bộ/phụ kiện/skin hiện đã suy từ id vật phẩm; tên, icon, tooltip dùng lại được; v3 gắn mảnh theo cùng id.

- **Ô hiển thị**: `weapon`, `robe`, `bracer`, `boots`, `belt`, `head` (mô hình thấy được). `jade`, `ring`, `artifact` không có hình trên người (artifact có hình bay quanh người, để vòng sau) nên không vào tủ. `skin` giữ riêng như hiện tại.
- **Mở khóa**: một điểm duy nhất, **bên trong** `db.transaction` của `Character.tx` (không phải sau commit): tính các id mới từ `d.inv` + `d.equip` của bản nháp so với tủ đang có, rồi `INSERT OR IGNORE` vào `wardrobe` cùng transaction với việc ghi túi. Nhờ vậy món vào túi và món vào tủ cùng thành công hoặc cùng bị hủy; không có cửa sổ "đã vào túi nhưng chưa vào tủ" để người chơi bán/phân giải mất mở khóa. Chỉ sau khi commit thành công mới cập nhật tủ trong bộ nhớ và gửi `S.WARDROBE`. Bao trùm mọi nguồn (rơi đồ, chế tạo, mua, GM, thư) mà không phải sửa từng hệ; đúng điều yêu cầu "nhặt/mặc lần đầu".
- **Vật phẩm bị bán/phân giải vẫn còn trong tủ.** Đây là lý do chính của tủ.
- Nạp nhân vật cũ: migrate `DATA_VERSION 7` điền tủ từ túi + trang bị hiện có (không đụng vật phẩm/tiền nên không ghi ledger, giống các migrate trước).

### 3.2 Lựa chọn đang áp dụng

```ts
interface OutfitLook {
  /** Ô → id vật phẩm hiển thị thay cho món đang mặc. Thiếu ô = hiện đúng món đang mặc. */
  over: Partial<Record<DisplaySlot, string>>;
  /** Nhuộm 3 kênh: [chính, phụ, viền]; id trong `appearance.json`. Thiếu = màu gốc của bộ/màu chọn lúc tạo. */
  dye?: [string, string, string];
}
```

Kênh nhuộm: 1 = vải chính, 2 = vải phụ/lót, 3 = viền kim loại/tua. `appearance.json` thêm `dyes[].tags`? Không cần: dùng lại 6 màu hiện có cho MVP, mở rộng bảng màu là việc dữ liệu (theo bảng `assets/palette.json`, `content:check` đã so khớp hex). Vì sao một bộ ba chung cho cả người: nhuộm theo từng ô nhân đôi giao diện; làm sau nếu cần (dạng `dye` đổi thành map ô → bộ ba, tương thích ngược vì đọc `dye` mảng là "mọi ô").

### 3.3 Lưu DB

- Bảng mới `wardrobe (char_id INTEGER, item_id TEXT, at INTEGER, PRIMARY KEY (char_id, item_id))` + khai bằng Drizzle `wardrobe`.
- Cột mới `characters.look TEXT NOT NULL DEFAULT ''` (JSON `OutfitLook`; rỗng = không dùng) → `ADDED_COLUMNS` + DDL.
- Khi nạp nhân vật: `sanitizeOutfitLook` bỏ mục không còn trong tủ / sai ô / sai giới / mẫu đã bị xóa khỏi content (không ghi ledger, không phải vật phẩm).

## 4. Hiển thị (server tính, client không đổi quyết định)

`syncPublic` thêm một bước: dựng **`visualEquip`** = `c.equip` với `look.over` đè lên từng ô (nếu skin ô 10 thì skin thắng). Sau đó:

| Trường | Nay | Sau |
| --- | --- | --- |
| `sk` | `lookSet(c.stats.sets)` | `lookSet(setStatuses(SETS, ids của visualEquip))` |
| `sa` | `accessoryCode(SETS, c.equip)` | `accessoryCode(SETS, visualEquip)` |
| `wp` | `c.equip.weapon.id` | `visualEquip.weapon.id` (chỉ model kiếm; `wg` vẫn theo kiếm thật) |
| `dye3` (mới) | – | chuỗi `"a,b,c"` hoặc `''`, `@view` |

Chỉ thêm 1 trường `dye3` vào `PlayerS`; `sk/sa/wp` giữ nguyên tên nên client v1 và v3 đều tự đúng. Client v1: kênh 1 → `hex`, kênh 2 → `trim` (v1 chỉ có hai màu); kênh 3 dành cho v3. Hơn nữa khi `dye3` rỗng, client dùng `dye` cũ như hiện nay. Dòng hiển thị này còn dùng cho người *khác* nhìn thấy, nên mọi thứ qua `StateView` (AOI) như `sn`; kiểm chứng bằng `pnpm bots --count 100` không có `refId`.

Với v3: tủ chỉ đổi *id vật phẩm hiển thị*; lớp v3 (worker -226) map id → mảnh mô-đun và đọc `dye3` cho 3 kênh, không cần đổi giao thức.

## 5. Giao thức

Thêm vào `packages/shared/src/protocol.ts` (kiểu + kiểm hợp lệ ở shared, dùng chung server/client):

| Hướng | Mã | Nội dung | Ghi chú |
| --- | --- | --- | --- |
| C→S | `C.LOOK_SET` (`'lk'`) | `{ slot: DisplaySlot, id: string \| null, r }` | `null` = trả về hiện đúng món đang mặc |
| C→S | `C.LOOK_DYE` (`'lkd'`) | `{ dye: [string,string,string] \| null, r }` | `null` = bỏ nhuộm |
| C→S | `C.LOOK_RESET` (`'lkr'`) | `{ r }` | xóa hết override + nhuộm |
| S→C | `S.WARDROBE` | `{ owned: string[], look: OutfitLook }` | gửi riêng cho chủ khi vào phòng, khi mở khóa món mới, khi đổi |

Server (`apps/server/src/game/wardrobe/index.ts`, một `WardrobeSystem` + giao diện hẹp `WardrobeCtx` theo mẫu `economy`):

1. Chặn giống `onEquip`: đang chết, tỉ thí, tâm ma; giãn 200 ms; `rateOk` chung; `idem(p, r)` (khóa chống trùng).
2. `LOOK_SET`: id phải ∈ tủ của chính nhân vật, `ItemDef.kind === slot`, `wearableBy(def, g)`; không kiểm `reqLevel` (mục đích tủ là thấy dáng đã thích; chỉ số thật vẫn theo món đang mặc).
3. `LOOK_DYE`: mỗi phần tử phải là id trong `appearance.json`.
4. Ghi qua `Character.tx` (một transaction, khóa idem, ledger dòng `noop` `look:<slot>:<id>` / `look:dye`), cập nhật `characters.look`, `syncPublic` đẩy ra người xem.
5. Mở khóa **không đi theo yêu cầu của client** (không có tin nhắn "mở khóa"): chỉ do hook ở `Character.tx`.

### Có tốn tiền/vật phẩm không?

Người dùng đã chốt: **miễn phí đổi ngoại hình và nhuộm**. Không có trường `cost`, không trừ linh thạch/vật phẩm, nên các thao tác `LOOK_*` chỉ ghi dòng `noop` vào ledger. Nếu sau này thu phí thì thêm `cost` trong `appearance.json` và trừ trong cùng transaction; hiện chưa làm.

## 6. Giao diện (UI Kit 2.0)

- Vào từ bảng nhân vật (`ui/character/Overview.tsx`), cạnh ô "Ngoại hình": nút **Tủ ngoại trang** mở cửa sổ mới dùng `u2/win` (Panel, Header, Tabs, Slot, Button, Segmented, Tooltip, Modal), token `--u-*`/`--u-p-*`, không viết cứng chữ: khóa i18n `wardrobe.*` trong `packages/content/data/i18n/`, tên vật phẩm dùng i18n sẵn có.
- Bố cục: trái là xem trước nhân vật (dựng bằng đường `PlayerLook` sẵn có, xoay được); giữa là lưới theo tab ô (Áo, Đầu, Kiếm, Ủng, Hộ uyển, Đai), ô chưa dùng mờ, ô đang dùng viền ngọc; phải là 3 hàng chọn màu cho 3 kênh (lấy từ bảng `dyes`) + nút "Về mặc định".
- Xem trước **cục bộ**, không gửi lên server cho tới khi bấm Áp dụng; Áp dụng gửi các tin ở mục 5.
- Món sai giới: xám + lý do (giống túi). Ô skin đang mặc: banner "Skin đang che ngoại hình này".
- Phím tắt/nút mở dùng `UI-Kit` có sẵn; bàn phím/Esc/chuyển tab theo `Panel`. Ảnh duyệt 720p + 1080p để ở artifact phiên (không commit).

## 7. Bảo mật và kiểm thử

- Test server (`wardrobe.test.ts`): mở khóa khi nhặt/chế/GM (một hook); **giao dịch thất bại (hủy, trùng idem, lỗi DB) thì không mở khóa và túi cũng không đổi**; ghi `wardrobe` lỗi thì cả giao dịch lùi lại; không mở khóa theo tin client; chọn món chưa có → từ chối; sai ô, sai giới → từ chối; chỉ số không đổi khi áp dụng; idem trùng không ghi lần hai; còn nguyên sau khi nạp lại; mẫu bị xóa khỏi content → bị dọn; skin đè; migrate điền tủ từ đồ cũ.
- `ledger:check` vẫn sạch (chỉ dòng `noop`). `pnpm bots --count 100`: 0 dòng `refId`. Security bot (`pnpm security`): thêm ca gửi `LOOK_SET` với id lạ/kiểu sai/spam.
- Test shared: `parseOutfitLook`, `displaySlot` guard, xây `visualEquip`.

## 8. Kế hoạch PR (nhỏ theo lớp)

| PR | Nội dung |
| --- | --- |
| P4-0 | Tài liệu thiết kế này (docs-only) |
| P4-1 | `shared`: kiểu `OutfitLook`/`DisplaySlot`, `parseOutfitLook`, `visualEquip`, protocol + test |
| P4-2 | Server: DDL/Drizzle/`ADDED_COLUMNS`/migrate v7, `WardrobeSystem`, hook mở khóa, `syncPublic`, `dye3` + test |
| P4-3 | Client: state `S.WARDROBE`, đường hiển thị `dye3`, cửa sổ Tủ ngoại trang + i18n |
| P4-4 | Security bot, bot 100, ảnh 720p/1080p, handbook `gameplay-systems.md`/`client-ui.md` |

## 9. Câu hỏi đã duyệt (cũ)

1. Nhuộm/đổi ngoại hình miễn phí hay thu linh thạch? → **miễn phí** (người dùng chốt).
2. Tủ có nhận cả `artifact` (pháp bảo bay quanh người) ở vòng này không? (đề xuất: không, vòng sau)
3. Nhuộm: một bộ ba cho cả người (đề xuất) hay theo từng ô?
4. Có cần mục "mở khóa bằng thành tựu/sự kiện" không có trong túi? (đề xuất: chưa; vẫn đi qua hook tx khi món vào túi)
