# Asset 2D Codex

Kiểm kê: `audit.md`. Sinh: `node tools/codex-assets/gen.mjs <icons|portraits|loading|ui> [id…] [--jobs 4] [--force]` (dùng `codex exec` + công cụ ảnh tích hợp, không Tripo/API key). Nguồn + prompt: `D:/METAGRIT/dtl-asset-source/2d/<nhóm>/<id>.png|.prompt.txt`. Chủ thể: `tools/codex-assets/<nhóm>.json`.

## PR1 Icon (94 ảnh, atlas 8×18, 136 ô)

- 22 icon còn thiếu (3 chiêu K-2, 4 vật phẩm, 15 linh ngọc), 28 icon trang bị vẽ lại thay render Blender, 18 biến thức A/B, 3 công pháp, 5 linh căn, 3 vai trò, 3 buff, linh thạch, 9 nút HUD, 2 dấu nhiệm vụ.
- Atlas WebP 711 KB (trước: 272 KB), nạp cùng lúc với atlas cũ.
- Ảnh UI: `bag-icons.png` (túi đồ, linh thạch, linh ngọc, thanh chiêu), `method-panel.png` (công pháp).
- `build.mjs` ưu tiên `2d/icons/` hơn `icons/`, nhận icon phụ từ `tools/codex-assets/icons.json`, và dùng `icon` làm khóa (K-2 đổi id chiêu nhưng giữ icon cũ nên bản cũ không build được).

## E-0 Concept asset cho Tripo

Nhóm `concepts` (`node tools/codex-assets/gen.mjs concepts [id…]`, chủ thể là object trong `tools/codex-assets/concepts.json`): 59 ảnh concept 3:2 (tinh anh, boss, quái, cỏ, prop môi trường, kiếm/pháp bảo, bộ trang bị bậc mới) cho người dùng dựng trên Tripo web. `node tools/codex-assets/concepts-doc.mjs [--html <file>]` dựng lại `docs/ASSET_CONCEPTS.md` (và bản HTML). Ảnh nén WebP: `docs/asset-concepts/`. Chi tiết: `docs/ASSET_CONCEPTS.md`, thiết kế: `docs/EXPANSION_DESIGN.md`.
