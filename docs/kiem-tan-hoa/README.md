# Kiếm Tẫn Hỏa (`prop_kiem_tan_hoa`): kiếm của boss chương 5

Asset kiếm cho boss chương 5 **Tẫn Hỏa Kiếm Cơ** (quyết định người dùng, mục 15 của #196). **Không phải vũ khí người chơi**: không có vật phẩm, không nằm trong `SWORD_MODELS`, `/gm weapon` không lấy được. PR này chỉ nhập asset; gắn vào boss là việc của DV-3.

## Nguồn và giấy phép (CC BY 4.0, phải ghi công)

- "Sword of Miracle Free" của **Art_workshop** (https://sketchfab.com/art_workshop), https://sketchfab.com/3d-models/sword-of-miracle-free-a163029fb3d74626bbb1711bd8840c46
- Giấy phép: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Dòng ghi công nằm ở `assets/LICENSES.md` và `assets/source/prop/prop_kiem_tan_hoa/meta.json` (`license.spdx`, `license.url`). Nếu sau này game có màn ghi công, phải đưa dòng này vào.
- Đã sửa so với bản gốc: gộp lưới, bỏ hai lưới ngọc trong suốt, giảm tam giác, hạ texture, bỏ map kim loại.
- File gốc (8,7 MB) ở `../dtl-asset-source/prop/prop_kiem_tan_hoa/sketchfab/sword_of_miracle_free.glb`, không commit.

## Số đo

| | Bản gốc | Trong game |
| --- | --- | --- |
| Tam giác | 26.068 (3 lưới, 3 vật liệu) | 3.000 (1 lưới, 1 vật liệu, 1 draw call) |
| Texture | 3 × 2048² PNG (màu, ORM, normal) | 2 × 512² (màu, normal) |
| Dung lượng | 8,7 MB | 538 KB |
| Dài | (đơn vị tùy ý, nằm chéo) | 0,951 m, mũi +Y, cầu chuôi ở Y = 0 |

Cùng lớp ngân sách `weapon` với kiếm người chơi (1.000–3.000 tam giác, texture 512²; các kiếm hiện có 2.364–2.930 tam giác, khoảng 450 KB).

## Pipeline

- `import.kind: "external"` (mới): model nguồn ngoài đi cùng bước chuẩn hóa `import_tripo.py` như GLB Tripo; `run.mjs` và `meta.schema.json` nhận thêm giá trị này. Asset `external` phải ghi `license.spdx` và `license.url`.
- `import.post: tools/blender/ext_sword.py` (mới), dùng lại được cho kiếm nguồn ngoài khác:
  1. bỏ lưới phụ không có texture màu (ở đây là vỏ ngọc `KHR_materials_transmission` và lõi phát sáng, 64 tam giác mỗi cái);
  2. gộp phần còn lại thành một lưới một vật liệu;
  3. đặt vật liệu không kim loại (Metallic 0, Roughness 0,6, gỡ map ORM): game không có envMap nên kim loại ra đen;
  4. gọi `orient_sword.py`: xoay đứng, đặt gốc ở cầu chuôi, ghi extras `dtl.blade` `{ len 0.951, grip 0.126, guard 0.252, bladeStart 0.2805 }` (mét, dọc mũi).
- Dựng lại: `DTL_ASSET_SOURCE=<đường dẫn dtl-asset-source> pnpm assets:build --only prop_kiem_tan_hoa` rồi `pnpm assets:validate --only prop_kiem_tan_hoa`. Worktree không nằm cạnh `dtl-asset-source` thì phải đặt `DTL_ASSET_SOURCE`, nếu không bước Blender bị bỏ qua có cảnh báo.

## Xem thử

- Trình duyệt: `pnpm dev` rồi mở `/?mute=1&show=prop_kiem_tan_hoa`.
- Ảnh: `pnpm shots asset --ids prop_kiem_tan_hoa --zoom 0.6 --out <thư mục>` (`--zoom` < 1 kéo camera lại gần vật nhỏ).

## Ghi chú cho DV-3 (gắn vào boss)

- Quy ước giống kiếm người chơi nên dùng lại được `bladeInfoOf`/`bladeLocal` của `apps/client/src/game/character/swordModel.ts`: tay nắm ở `grip`, lưỡi bắt đầu ở `bladeStart`. Kiếm dài 0,95 m ở cỡ người; boss lớn thì phóng theo tỉ lệ thân boss.
- Vật liệu đã không kim loại, không cần ép `metalness` hay nhân màu như `SWORD_TINT`.
- Chắn kiếm có họa tiết thập tự kiểu Âu (trong texture gốc) và hai lưới ngọc đã bỏ để lại một hốc nhỏ ở chắn. Cần ngọc lửa cho hợp tên "Tẫn Hỏa" thì thêm một lưới phát sáng riêng hoặc VFX ở vị trí đó khi làm boss.
- Chưa thử kiếm này trên tay boss (boss chưa có); đã thử cầm ở cỡ người trong lúc làm, tỉ lệ và hướng đúng.
