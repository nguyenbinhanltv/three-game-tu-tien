# Ô ngoại hình (skin) và skin thử Varkessa

Ô trang bị thứ 10, `skin`: **chỉ đổi hình toàn thân, không cộng chỉ số**. Mặc thì đè mọi trang phục, tháo thì về trang phục đang mặc. Skin thử đầu tiên: **Xích Diễm Ma Cơ** (`itm_skin_varkessa`).

Ảnh duyệt không commit vào repo (thư mục artifact của phiên làm việc: `skin-khao-sat/`, `skin-varkessa/`).

## Luật (server quyết định)

- `skin` là **ô ngoại hình** (`COSMETIC_SLOTS` trong `packages/shared/src/types.ts`), cố ý **không** nằm trong `EQUIP_SLOTS`. Mọi chỗ tính chỉ số, bộ, cường hóa, khảm, tẩy luyện, phân giải, Thăng Bậc duyệt `EQUIP_SLOTS` hoặc gọi `isEquipSlot` nên tự bỏ qua skin. `WEAR_SLOTS` = ô có chỉ số + ô ngoại hình, dùng ở chỗ lưu, đếm vật phẩm và mặc/tháo (`isWearSlot`).
- Vật phẩm skin: `kind: "skin"`, không có `stats`, trường `skin` trỏ mảnh áo phủ toàn thân (client nạp `<skin>_nam|nu`).
- **Giới hạn giới tính**: vật phẩm có `gender: "m" | "f"` chỉ nhân vật đúng giới mặc được (`wearableBy` trong `packages/shared/src/items.ts`). Server từ chối ở `onEquip` và `/gm skin` (báo `sys.equip_gender`, món vẫn ở trong túi); tooltip ghi "Chỉ dành cho nhân vật nữ/nam", tô đỏ khi nhân vật của mình không mặc được. Túi đồ tô xám món không mặc được (chấm đỏ ở góc), nút Trang bị bị vô hiệu kèm lý do, ô skin không nhận thả. Lúc nạp nhân vật, skin sai giới còn nằm ở ô (mặc từ trước khi có giới hạn, hoặc giới tính bị đổi) được **trả về túi** qua `settleMisplaced`; trong phiên đang chơi nếu giới tính đổi bằng lệnh GM thì `PlayerS.sn` về rỗng nên skin không hiển thị, món vẫn ở ô và tháo ra bình thường. **Varkessa chỉ cho nhân vật nữ** (quyết định người dùng).
- **Sở hữu** = món nằm trong túi của chính người chơi. Mặc/tháo đi chung đường với trang bị: `C.EQUIP {slot: <ô túi>, r}` và `C.UNEQUIP {slot: "skin", r}` → `GameSim.onEquip/onUnequip` → `Character.tx` (một transaction, khóa idem, ledger ghi dòng `noop` `equip:skin:<id>` / `unequip:skin:<id>`). Cùng các chặn của trang bị: đang chết, tỉ thí, tâm ma, giãn 200 ms.
- Lưu trong cột `characters.equip` (khóa `skin`), **không thêm cột DB**. `InvDraft`, `sanitizeEquip`, bước migrate trong `db.ts`, `equipCount` và `ledger:check` đều duyệt `WEAR_SLOTS`; thiếu một chỗ là món ở ô skin bị mất ở giao dịch kế tiếp hoặc lệch sổ cái.
- Hiển thị cho người khác: `PlayerS.sn` (id vật phẩm skin, `@view`). Client suy asset từ `ItemDef.skin`.
- Thử: `/gm skin <id|list|off>` (chỉ tài khoản thử; lấy món nếu chưa có rồi mặc, một transaction + ledger), hoặc `/gm give itm_skin_varkessa` rồi mặc từ túi.
- DB hỏng (món nằm sai ô trong cột `equip`) không bị lặng lẽ xóa lúc nạp nhân vật (`sanitizeEquip` + `settleMisplaced` trong `character.ts`): skin ở ô có chỉ số và món không phải skin ở ô skin được trả về túi; mẫu không còn tồn tại hoặc túi đầy thì ghi ledger -1 lý do `load:drop`, tất cả trong một transaction.
- Test: `apps/server/src/game/skin.test.ts` (mặc/tháo, chỉ số không đổi, khóa idem, không sở hữu thì không mặc được, còn nguyên sau khi nạp lại, bốn trường hợp DB hỏng, GM chỉ cho tài khoản thử).
- **Chưa có tủ đồ ngoại hình (transmog)** trong game nên không có gì để nối; khi làm transmog thì skin là lớp trên cùng (đè cả kết quả transmog).

## Client

- `PlayerLook.skin` (`game/character/playerSkins.ts`): skin là một "áo" phủ toàn thân đi qua đường áo bộ sẵn có (`dress()`): lưới skin bind vào bộ xương người chơi, thân nền bị ẩn **hết** kể cả đầu/cổ/tay (`skinKeep` trong `outfit.ts`; áo thường vẫn giữ các phần đó). Kiếm, vỏ lưng, hào quang cường hóa vẫn theo vũ khí đang cầm.
- Không vẽ phụ kiện bộ, không nhuộm màu đạo bào khi mặc skin.
- UI: ô thứ 10 "Ngoại hình" ở bảng nhân vật (`ui/character/Overview.tsx`), kéo thả/chuột phải từ túi như trang bị; skin xếp ở tab trang bị của túi.
- **Chưa hỗ trợ thân nền v2** (`?chr=v2`): asset skin mới dựng cho hai thân v1; ở v2 skin bị bỏ qua, nhân vật mặc trang phục như thường.

## Pipeline skin từ "tượng" nguồn ngoài

Model nguồn (Sketchfab) là lưới triệu tam giác, không xương, vũ khí dính liền tay, không ở tư thế chữ T. Hai bước:

1. **`tools/blender/skin_prep.py`** (chạy tay một lần, vài phút; cấu hình `tools/blender/skins/<tên>.json`): gộp + hàn → cắt vũ khí (`cut`) → giảm lưới (`triangles`) → UV mới → nướng màu (EMIT) và normal từ bản cao sang bản thấp → dựng xương tên Mixamo theo **dáng của chính model** (`joints`, đo từ ảnh chiếu thẳng) → trọng số tự động (bone heat; lỗi thì theo khoảng cách) → dọn trọng số lạc (`stray`) và cắt mặt bắc cầu tay ↔ hông/chân → ép vùng không có xương riêng (`zones`: đuôi theo hông, tóc theo đầu/ngực, sừng theo đầu) → xuất `3d/nhan-vat/<skin>/prep/rig_v01.glb` vào kho nguồn.

   ```
   blender --background --factory-startup --python tools/blender/skin_prep.py -- \
     tools/blender/skins/varkessa.json <dtl-asset-source> --preview <thư mục ảnh> [--cache <thư mục tạm>] [--stage cut|low|bake|rig]
   ```

2. **`retarget_set.py` chế độ `rig`** qua `pnpm assets:build --only set_skin_<tên>_<nam|nu>` (meta `import.kind: "external"`, `budgetClass: "skin"`, `retarget.rigidRoot: true`): đặt lại tư thế nghỉ theo từng thân nền, co giãn theo chiều dài xương. `rigidRoot` giữ hướng xương hông (hướng "trung bình xương con" của hông gần bằng 0 nên xoay rất nhiễu, làm đuôi hất ngang).

Cần `DTL_ASSET_SOURCE` trỏ tới kho nguồn và GLB thô của thân nền (`node tools/blender/run.mjs --only chr_kiem_tu_nam`, tương tự `_nu`).

## Varkessa: số đo

| | Nguồn | Trong game (`set_skin_varkessa_nu`) |
| --- | --- | --- |
| Tam giác | 1.952.526 (17 mảnh, 1 mặt liền) | LOD0 19.908 · LOD1 ~7.890 · LOD2 ~2.970 |
| Texture | 3 ảnh, 7,5 MB | màu + normal 1024² (WebP) |
| Dung lượng | 108 MB | ~2,03 MB |
| Xương | không | bộ xương người chơi (bind theo tên) |

Lớp ngân sách mới `skin` (`assets/budgets.json`): 8.000–25.000 tam giác, LOD như `player`, texture 1024², WebP.

Trong game (WebGPU, preset Cao, sân tông môn, một người mặc): draw call 103 → 103, tam giác khung hình +14–15 nghìn so với mặc bộ Liệt Mạch.

## Nguồn và giấy phép (CC BY 4.0, phải ghi công)

"VARKESSA // The Infernal Emberblade" của **Atahan3D** (https://sketchfab.com/Atahan3D), https://sketchfab.com/3d-models/varkessa-the-infernal-emberblade-13c07cff4b884037a08b7463df5bc996, CC BY 4.0. Dòng ghi công và danh sách chỗ đã sửa ở `assets/LICENSES.md` và `meta.json` của hai asset. Game chưa có màn ghi công; khi có phải đưa vào.

## Giới hạn đã biết của skin thử

- **Tóc và đuôi không có xương riêng**: đuôi cứng theo hông, tóc theo đầu/ngực. Tóc bên trái xuyên vai và tay khi tay buông; đuôi quét xuyên đất khi ngồi/ngã.
- **Bàn tay không có ngón** (một khối theo xương bàn tay); tay phải còn mẩu chuôi kiếm trong nắm tay sau khi cắt đại kiếm.
- **Chỉ có bản cho thân nữ** (`set_skin_varkessa_nu`); bản dựng thử trên thân nam đã gỡ khỏi repo vì skin giới hạn cho nhân vật nữ. Skin dùng chung hai giới sau này cần một asset cho mỗi thân (`<skin>_nam`, `<skin>_nu`).
- Khớp xương đo bằng tay từ ảnh; chiều sâu khớp bên trái lấy đối xứng bên phải.
- Trọng số chỉ được soát bằng mắt ở 6 tư thế × 2 giới (đứng, chạy, ngự kiếm, đả tọa, chém, chết), chưa chạy `outfit_check.py` và chưa soát từng clip K-3.
- Trang phục hở; tên hiển thị "Xích Diễm Ma Cơ" là đề xuất, chưa qua `lore-keeper`.
