# Skin v3: Tẫn Ngữ Ma Cơ (nữ) và Xích Huyết Tử Kỵ (nam)

Hai skin toàn thân CC BY 4.0 chạy trên nhân vật v3 (`?chr=v3`, bộ xương UE5 Mannequin, clip UAL phát trực tiếp). Ảnh/video duyệt không commit (artifact phiên). Giấy phép đã kiểm ở báo cáo `danh-gia-assets-online-2.md`.

| Vật phẩm | Giới | Asset v3 | Nguồn (CC BY 4.0) | Tam giác LOD0/1/2 | GLB |
| --- | --- | --- | --- | --- | --- |
| `itm_skin_duskrella` Tẫn Ngữ Ma Cơ | nữ | `chr_v3_duskrella_nu` | "DUSKRELLA the Ashen Whisper", Atahan3D, https://sketchfab.com/3d-models/1df2e0ecd2364312a8d7821e45d180b2 | 19.940 / 9.969 / 3.972 | 5,1 MB |
| `itm_skin_crimson_knight` Xích Huyết Tử Kỵ | nam | `chr_v3_crimson_nam` | "Crimson Death Knight - Dual Falchions", Pigcraft, https://sketchfab.com/3d-models/crimson-death-knight-dual-falchions-08a29190cc7d458dbaf1085991520ef5 | 21.994 / 10.996 / 4.399 | 5,6 MB |

Ghi công: `packages/content/data/credits.json` (màn Ghi công), `assets/LICENSES.md`, `meta.json` của hai asset.

## Quy trình

1. Zip Sketchfab không có metadata: tự ghi `meta.json` (tác giả + URL). Giải nén vào thư mục tạm, không đụng kho `dtl-asset-source` ngoài việc thêm `chr/skin_<tên>/prep/rig_v01.glb`.
2. `skin_prep.py` (cấu hình `tools/blender/skins/duskrella.json`, `crimson.json`): giảm lưới, nướng màu + normal 2048, xương Mixamo đo từ ảnh chiếu, trọng số. Thêm hai tùy chọn: `view {scale, center}` (khung ảnh đo cho model khác đơn vị Varkessa; log in `bbox`) và `cut.fill: false` (không vá lỗ, cần khi model có mép hở thật như áo choàng rách).
3. `pnpm assets:build --only chr_v3_duskrella_nu` / `chr_v3_crimson_nam` (job trong `tools/blender/run.mjs`, `chr_v3.py --height 1.8 / 1.9`, lớp `player_v3`, KTX2 2048).

Death Knight: hai đao dính liền găng và cùng một mảnh lưới nên cắt bằng hộp (lưỡi, chắn tay, rồi hai đảo nhỏ còn lại là núm chuôi); mũ kín mặt, áo choàng giữ nguyên.

## Nối vào game

- `mannequin.ts`: `V3_SKINS` (skin → asset), `v3AssetOf(g, skin)`; `MannequinPlayers.create/createShadow/pending` nhận skin; `playerSkins.ts` truyền `look.skin`. Skin sai giới (server không cho mặc) rơi về model mặc định. Varkessa nữ vẫn là model nữ v3 mặc định.
- v1/v2: hai skin mới **chỉ có bản v3** (`V3_ONLY_SKINS`): ở v1/v2 server vẫn cho mặc nhưng client hiện trang phục thường. Varkessa giữ bản v1.
- Ô Skin (#202) không đổi: `gender` `f`/`m` ở `items.json`, `check.ts` nay bắt buộc skin có `gender` và tên khớp `glossary.skins`.

## Kiểm

- `pnpm typecheck`, `pnpm test` (server 700, client 764), `pnpm content:check`, `pnpm assets:validate` (0 lỗi). Không sửa `rooms.ts` nên không chạy bot security.
- `pnpm shots skinv3 --out <thư mục tuyệt đối>`: video đứng/chạy/chém/đả tọa/ngự kiếm + ảnh ba hướng. `pnpm shots skin --refuse --genders m --ids itm_skin_duskrella` (và `f` + `itm_skin_crimson_knight`): ảnh túi khóa + thông báo từ chối.
- Xuyên thân (cặp mặt chồng tăng so với tư thế nghỉ, 12 tư thế UAL; chỉ số tương đối): Duskrella Idle 63, Jog 0/282, Sword 15/7, Sitting 354, Death 13, Roll 318, Hit_Chest 258. Death Knight (giáp và áo choàng dày nên cao hơn): Idle 447, Jog 411/320, Sword 224/30, Sitting 1011, Death 1227, Roll 263, Hit_Chest 683.

## Giới hạn

- Chưa có xương lò xo: áo choàng Death Knight và vạt váy sau của Duskrella cứng theo cột sống/hông (`chr_v3.py --springs` chọn đỉnh theo vòng quanh trục thân nên không hợp áo choàng chỉ ở lưng; cần mở rộng pipeline). Áo choàng xuyên đùi/mông khi ngồi, ngã, lăn.
- Xương đo tay từ ảnh; bàn tay không có ngón (một khối); Duskrella còn vài mảnh nhỏ rời quanh người (có sẵn trong nguồn).
- Mặt nạ nhuộm màu không áp cho skin. Tên hiển thị đang chờ duyệt lore.

## Việc sau

- Noxavyra (nữ, Atahan3D, CC BY, cắt hai katana, tay sát hông), Korvaden (nam, Atahan3D, CC BY, thế khom, cắt hai rìu).
- Kings Demon (nữ, neilhancart/Wilson, **CC BY-NC 4.0**): người dùng chấp nhận vì game không thương mại; khi làm phải ghi rõ "NC" ở `credits.json` (`license: "CC-BY-NC-4.0"`) và `LICENSES.md`, và gỡ nếu game có thu tiền. 64k tam giác, 19 ảnh cần nướng về một atlas.
- Xương lò xo cho áo choàng; bản v1/v2 của hai skin nếu cần.

## Đợt 2: Huyết Nhận Yêu Cơ (Noxavyra) và Cổ Giác Ma Hậu (Kings Demon); Korvaden bỏ qua

| Vật phẩm | Giới | Asset v3 | Nguồn | Tam giác LOD0/1/2 | GLB |
| --- | --- | --- | --- | --- | --- |
| `itm_skin_noxavyra` Huyết Nhận Yêu Cơ | nữ | `chr_v3_noxavyra_nu` | "NOXAVYRA // The Crimson Twinblade", Atahan3D, CC BY 4.0, https://sketchfab.com/3d-models/noxavyra-the-crimson-twinblade-194340bf60d1496eb723fa89909d44bf | 21.975 / 10.986 / 4.394 | 4,7 MB |
| `itm_skin_kings_demon` Cổ Giác Ma Hậu | nữ | `chr_v3_kings_demon_nu` | "Kings Demon", Wilson (neilhancart), **CC BY-NC 4.0**, https://sketchfab.com/3d-models/kings-demon-1c8a4b2cd3ce4492ac0cff2fdfe4e59d | 23.947 / 11.972 / 4.789 | 5,4 MB |

**Kings Demon là phi thương mại (NC)**: người dùng chấp nhận vì game không thương mại. `credits.json` có `license: "CC-BY-NC-4.0"` + `note: "nc"` (màn Ghi công hiện "CC BY-NC 4.0, phi thương mại — gỡ nếu game có thu tiền"), `LICENSES.md` ghi đậm cùng điều kiện; `content:check` bắt buộc mọi mục CC BY-NC có `note: "nc"`. **Gỡ skin (asset, item, mục ghi công) nếu game có thu tiền.**

### Thay đổi `skin_prep.py`
- `cut.capsules` `{a,b,r}`: bỏ mặt có tâm cách đoạn a→b không quá r (katana chéo thân: cán sau hông không bọc được bằng hộp trục).
- `cut.dropMaterials`: bỏ cả vật liệu nguồn (Kings Demon: `lambert19` alpha 0).
- Nướng **nhiều vật liệu nguồn vào một atlas** (màu = texture nối vào Base Color hoặc hệ số màu). Kings Demon: 8 vật liệu/19 ảnh → 1 atlas 2048 màu + normal.

### Noxavyra
Hai katana là một khối liền với nắm tay. Cắt: hộp cho lưỡi + tsuba (x ≥ 0,345 / 0,325 / 0,285 theo độ cao) và hai capsule cho cán chạy sau hông (kashira nằm trên lưng váy, dính váy). Trang phục giữ nguyên thiết kế gốc (váy da bó, vớ ren), không thêm gì. Còn một mẩu cán nhỏ trong nắm tay. Tay buông sát hông nên xuyên thân cao hơn Duskrella (Idle 444, Jog 749/693, Sword 1064/780, Sitting 646, Death 1075, Roll 89, Hit_Chest 914; chỉ số tương đối của `chr_v3.py`).

### Kings Demon
- Tóc là thẻ alpha 26k tam giác, hệ số màu đen: nướng thành **vỏ tóc đặc màu đen** (mất sợi tóc).
- Váy dài ôm chân là một ống liền, không tách chân: khi chạy/ngự kiếm váy căng như vải thun (đuôi váy phía sau đi theo hông/chân). Xuyên thân Sitting 1107, Roll 652, Jog 398/116, Death 666.

### Korvaden: bỏ qua (đợt 2; đã làm ở đợt 3 bên dưới)
Thế khom chiến đấu (chân dạng rộng, thân nghiêng, hai tay gập ra trước giữ rìu) cộng hai rìu dính tay chéo thân và áo choàng rách bất đối xứng khổng lồ dính lưng. Đưa về chữ A cần sửa tư thế bằng tay (không đo khớp từ ảnh chiếu thẳng được) và cắt rìu bằng capsule trong không gian 3D chéo; không đạt chất lượng nếu làm vội. Chưa có asset/item nào của Korvaden trong PR này. Nguồn nếu làm sau: https://sketchfab.com/3d-models/56b55945548942f28359c76820b4e910 (Atahan3D, CC BY 4.0; zip không metadata, tự ghi meta.json).

### Chung
- Chưa có xương lò xo (tóc Noxavyra dài tới hông, vạt váy Kings Demon): `MannequinCharacter` chưa mô phỏng chuỗi `dtl_o_*`.
- `pnpm shots skinv3 --ids itm_skin_noxavyra,itm_skin_kings_demon --out <thư mục tuyệt đối>`; ảnh từ chối: `pnpm shots skin --refuse --genders m --ids itm_skin_noxavyra,itm_skin_kings_demon`. Tờ khung 8 tư thế: `chr_v3.py ... --sheet <thư mục>`.
- Kiểm: `pnpm typecheck`, `pnpm test` (server 725, client 765), `pnpm content:check`, `pnpm assets:validate` (0 lỗi).

## Đợt 3: Dạ Lang Chiến Tướng (Shadow Wolf) và Phù Văn Phủ Tướng (Korvaden)

Noxavyra (`itm_skin_noxavyra`) đã vào từ đợt 2 nên không làm lại. Hai skin nam mới, cùng CC BY 4.0 (giấy phép đã kiểm: `asset.extras` trong GLB Shadow Wolf; Korvaden là zip không có extras, theo báo cáo `danh-gia-assets-online-2.md`).

| Vật phẩm | Giới | Asset v3 | Nguồn (CC BY 4.0) | Tam giác LOD0/1/2 | GLB |
| --- | --- | --- | --- | --- | --- |
| `itm_skin_shadow_wolf` Dạ Lang Chiến Tướng | nam | `chr_v3_shadow_wolf_nam` | "Shadow Wolf Warlord Knight", Pigcraft, https://sketchfab.com/3d-models/shadow-wolf-warlord-knight-2838faddd383439cb0c067402cb4c61f | 21.928 / 10.964 / 4.381 | 5,2 MB |
| `itm_skin_korvaden` Phù Văn Phủ Tướng | nam | `chr_v3_korvaden_nam` | "KORVADEN // The Runebound Axemaster", Atahan3D, https://sketchfab.com/3d-models/56b55945548942f28359c76820b4e910 | 21.988 / 10.993 / 4.371 | 5,6 MB |

### Thay đổi `skin_prep.py`
- `yaw` (độ, quanh Z): model nguồn không quay mặt về -Y. Shadow Wolf quay +X nên `yaw -90`; Korvaden thế khom, thân quay chéo nên `yaw -40` (ảnh chiếu trước khi đó gần chính diện).

### Shadow Wolf
Đại kiếm cầm tay trái, chéo thân. Tìm trục kiếm bằng PCA trên các đỉnh phía trước thân (trục `c=(-0,093; -0,192; -0,274)`, hướng `(-0,644; -0,537; -0,545)`), cắt hai capsule dọc lưỡi + một capsule chuôi, rồi xóa các đảo rời (móng chắn tay, núm chuôi); nắm tay giữ nguyên. Áo choàng đi theo Spine/Spine2 (vùng `ao_choang`), đầu sói theo Head (vùng `dau_soi`). Trọng số lùi về theo khoảng cách (bone heat bỏ 11k đỉnh vì lưới nhiều mảnh). Xuyên thân (chỉ số tương đối của `chr_v3.py`): Idle 616, Jog 342/279, Sword 349/23, Sitting 590, Death 1203, Roll 64, Hit_Chest 580.

### Korvaden
Thế khom chân dạng rộng, hai tay giữ rìu. Quay thân (`yaw -40`), đo 24 khớp 3D từ ảnh chiếu trước + cạnh (500 px/đơn vị), để `chr_v3.py` đặt lại tư thế nghỉ theo Mannequin (hướng xương giữ như Mannequin, nên chân dạng và tay gập duỗi về chữ A). Hai rìu cắt bằng **dải mỏng** (`cut.bands`) ngay trước và sau mỗi nắm tay (cán đi theo trục Y của thân sau khi quay), rồi xóa các đảo rời (`cut.islands`): lưỡi rìu và núm cán. Áo choàng vá giữ nguyên, đi theo Spine/Spine2 từ z ≥ -0,2; phần đuôi áo dưới đó theo xương chân gần nhất nên có thể kéo nhẹ ở động tác ngồi/lăn. Xuyên thân: Idle 759, Jog 91/137, Sword 484/231, Sitting 458, Death 419, Roll 568, Hit_Chest 632.

### Chung
- `pnpm shots skinv3 --ids itm_skin_shadow_wolf,itm_skin_korvaden --size 1280x720 --dist 2.8 --out <thư mục tuyệt đối>` (và `1920x1080`): kịch bản nay chụp thêm `-chay`, `-chieu`, `-nhanvat` (bảng Nhân vật, phím C) và có `--dist`.
- Icon vật phẩm hai skin tạm dùng emoji dự phòng (`iconFallback`), chưa có tranh trong sheet icon; cần sinh tranh mới ở `tools/icons/v2/sheets.v2.json`.
- Chưa có xương lò xo (áo choàng cả hai skin cứng theo cột sống). Tên hiển thị đang chờ duyệt lore.
- Kiểm: `pnpm typecheck`, `pnpm test`, `pnpm content:check`, `pnpm assets:validate` (0 lỗi), `pnpm lint`, `node tools/docs/check-paths.mjs`.
