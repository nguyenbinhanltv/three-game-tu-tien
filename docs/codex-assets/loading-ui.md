# PR3 Màn tải và chất liệu UI (12 ảnh)

- Sinh: `node tools/codex-assets/gen.mjs loading|ui`; đóng gói: `node tools/codex-assets/pack.mjs loading ui` → `apps/client/public/assets/art/{loading,ui}/<id>.<hash>.webp` (22 ảnh gồm chân dung = 1,27 MB). Không nằm trong tải đầu.
- **Màn tải** (`loading/`, 1600×900): `title` (màn đăng nhập), `tong_mon`, `thung_lung`, `suoi_thanh_khe`, `rung_linh_thao`, `vach_da_ngoc`, `ho_suong_mu`, `kiem_trung`. `game/bootArt.ts` nhớ vùng người chơi đứng lần cuối (`localStorage dtl.lastZone`, ghi bởi `rememberZone` ở nhịp HUD), màn tải dùng ảnh vùng đó, lần đầu là Lạc Kiếm Tông. Ảnh gắn vào `#boot` như lớp `.ts-art` (CSS ở `styles.css`), thiếu ảnh thì giữ nền sương CSS cũ. Tiêu đề và dòng phụ đổi sang chữ sáng khi có tranh.
- **Chất liệu UI** (`ui/`): `applyUiArt()` (`ui/Art.tsx`) đặt biến CSS `--art-paper`, `--art-corner`, `--art-seal`, `--art-map` sau khi manifest về; `ui/kit/kit.css` dùng chúng: vân giấy nhẹ (soft-light) trên mọi bảng, hoa văn góc (trên-trái, dưới-phải) cho bảng cỡ lớn, triện đỏ ở chân bảng tông giấy. `--art-map` (nền bản đồ lớn) để sẵn cho M-4, chưa dùng.
- Ảnh UI thật: `title-screen.png`, `loading-screen.png`, `panel-material.png`.
- Không có chữ trong ảnh: mọi chữ vẫn do i18n vẽ.
