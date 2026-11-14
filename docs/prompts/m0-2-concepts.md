# Concept M0-2: 5 đối tượng thử pipeline

Mục tiêu M0-2: có 5 bộ concept được duyệt để chạy thử Tripo ở M0-3. Mỗi mục dưới đây là prompt đã ghép đủ khối đối tượng + khối phong cách + khối cấm từ [`codex.md`](codex.md), dán thẳng vào Codex.

| # | Asset id | Thư mục nguồn | Ảnh cần | Kênh Tripo (M0-3) | Báo giá dự kiến mỗi lần thử |
| --- | --- | --- | --- | --- | --- |
| 1 | `chr_de_tu_nam` | `chr/chr_de_tu_nam/` | trước, bên, sau | web app: multiview + rig + 3 clip | khoảng 95 (40 + rig 25 + 3 × 10) |
| 2 | `mon_soi_xam` | `mon/mon_soi_xam/` | bên, trước, sau | web app: multiview + rig + 3 clip | khoảng 95 |
| 3 | `prop_lo_dan` | `prop/prop_lo_dan/` | 3/4 | CLI: image→3D | 40 |
| 4 | `prop_linh_thao` | `prop/prop_linh_thao/` | 3/4 | CLI: image→3D | 40 |
| 5 | `prop_phi_kiem` | `prop/prop_phi_kiem/` | 3/4 | CLI: image→3D | 40 |

Báo giá theo bảng giá API; giá trên web app chưa kiểm chứng. Thư mục nguồn tính từ `DTL_ASSET_SOURCE` (runbook mục 2). Mỗi đối tượng sinh 3–4 phương án cho ảnh đầu tiên, người dùng chọn một, rồi mới sửa ra các góc còn lại.

Trong các prompt dưới đây, khối phong cách đã được rút gọn danh sách màu cho từng đối tượng; phần còn lại giữ nguyên văn.

---

## 1. Đệ tử nam Lạc Kiếm Tông (`chr_de_tu_nam`)

Model gốc cho người chơi nam, màu áo mặc định `attire_sect`. Đây cũng là model mẫu mua animation (tripo.md mục 3), nên tư thế A-pose phải chuẩn.

### 1a. Mặt trước

```text
SUBJECT: full body character turnaround reference, FRONT VIEW, a young male sword cultivator around twenty years old, disciple of a mountain sword sect,
friendly calm face with simple features, black hair tied in a high topknot held by a plain bronze hairpin, a small cinnabar red hair ribbon, short side bangs framing the face,
cross-collar long robe in sect blue (#3B6EA8) reaching mid-calf with side slits, ivory white inner collar visible at the neck,
dark teal (#2F5D62) trim on the collar edge and on the wide sleeve cuffs, wide deep navy (#1F3A5A) waist sash tied at the front,
loose dark grey (#48464B) trousers gathered at the ankles, simple dark grey cloth shoes with thick soles,
standing in a neutral A-pose: arms straight and lowered about 45 degrees away from the body, palms facing the thighs,
clear gap between the wide sleeves and the torso, feet shoulder-width apart, looking straight at the camera, calm neutral expression,
empty hands, no weapon, no scabbard, no backpack.
STYLE: stylized low-poly cel-shaded 3D game asset concept, ink-wash inspired Chinese fantasy cultivation world,
proportions about 6 heads tall, slightly large head, big clear readable shapes, chunky bevelled forms, small details painted not modelled,
clean flat colors, very soft and subtle shading only to show form, no texture noise,
limited palette: ivory paper white (#EDE6D6), ink greys (#48464B, #2B2B2E), sect blue (#3B6EA8), deep navy (#1F3A5A),
dark teal (#2F5D62), cinnabar red (#A8322D), bronze gold (#B8913F), skin (#F0CFA8).
RENDER: plain light grey seamless background (#D8D8D8), even flat studio lighting from the front, no cast shadow, no floor shadow,
orthographic camera, whole subject centered and fully inside the frame with margin on all sides.
AVOID: no text, no letters, no calligraphy, no seal script, no watermark, no logo, no signature,
no outline, no line art, no black contour lines, no glow, no bloom, no light rays, no particles, no sparks, no smoke, no fog,
no magic effects, no motion lines, no speed lines, no aura, no reflections, no specular highlights, no metallic shine,
no realistic skin pores, no fabric weave, no individual hair strands, no photorealism, no chibi,
no background scenery, no props on the floor, no second character, no cropped body parts.
```

### 1b, 1c. Góc bên, góc sau

Đính kèm ảnh 1a đã duyệt, dùng nguyên văn mẫu 3.2 (bên) và 3.3 (sau) trong `codex.md`, ghép lại khối STYLE/RENDER/AVOID ở trên.

Kiểm khi duyệt:

- [ ] Tỉ lệ khoảng 6 đầu; có khe hở giữa tay áo và thân.
- [ ] Áo chính là một mảng lam liền (để làm mặt nạ đổi màu áo), viền và đai khác màu rõ ràng.
- [ ] Không có kiếm, bao kiếm; tay không cầm gì.
- [ ] Ảnh bên đúng góc nghiêng 90° (một mắt, hai chân chồng nhau).

---

## 2. Sói Xám (`mon_soi_xam`)

Quái đầu tiên của vùng khởi đầu. Yêu Lang và U Minh Lang dùng chung bộ xương về sau, nên dáng phải trung tính.

### 2a. Góc bên

```text
SUBJECT: full body creature turnaround reference, SIDE PROFILE VIEW facing the RIGHT edge of the image,
a lean grey mountain wolf about 1.5 meters long, long muzzle, pointed upright ears, thick neck ruff shaped as one chunky mass,
fur painted in large flat patches: light warm grey (#B9B6AE) belly, chest and muzzle, mid grey (#8A8782) body, darker grey (#5F5D5C) stripe along the back and tail tip,
bushy tail as one solid chunky shape, bronze gold (#B8913F) eyes, dark ink grey (#2B2B2E) nose and paw pads,
standing in a neutral pose: all four legs straight and visible, weight even, head level, mouth closed, tail held straight back and slightly down,
strict orthographic profile.
STYLE: stylized low-poly cel-shaded 3D game asset concept, ink-wash inspired Chinese fantasy cultivation world,
big clear readable shapes, chunky bevelled forms, small details painted not modelled,
clean flat colors, very soft and subtle shading only to show form, no texture noise, no fur strands,
limited palette: ivory paper white (#EDE6D6), warm ink greys (#B9B6AE, #8A8782, #5F5D5C, #2B2B2E), bronze gold (#B8913F).
RENDER: plain light grey seamless background (#D8D8D8), even flat studio lighting from the front, no cast shadow, no floor shadow,
orthographic camera, whole subject centered and fully inside the frame with margin on all sides.
AVOID: no text, no letters, no calligraphy, no seal script, no watermark, no logo, no signature,
no outline, no line art, no black contour lines, no glow, no bloom, no light rays, no particles, no sparks, no smoke, no fog,
no magic effects, no motion lines, no speed lines, no aura, no reflections, no specular highlights, no metallic shine,
no individual hair strands, no photorealism, no chibi, no snarling, no visible teeth,
no background scenery, no props on the floor, no second creature, no cropped body parts.
```

Khổ ảnh ngang `1536×1024`.

### 2b, 2c. Góc trước, góc sau

Đính kèm ảnh 2a đã duyệt, dùng mẫu sửa ảnh của mục 4 trong `codex.md` (FRONT VIEW, BACK VIEW), ghép lại khối STYLE/RENDER/AVOID ở trên.

Kiểm khi duyệt:

- [ ] Bốn chân thẳng, tách rời nhau ở góc bên (để rig quadruped nhận đúng).
- [ ] Miệng ngậm; đuôi không cong lên lưng.
- [ ] Lông là mảng màu lớn, không có sợi.
- [ ] Miệng ngậm là cố ý (để rig); nanh được vẽ thêm ở bước texture, đúng art bible mục 2.2.

---

## 3. Lò đan (`prop_lo_dan`)

Đặt trong Đan Phòng của dược sư Tố Tâm; dùng cho tính năng luyện đan.

```text
SUBJECT: single game prop, a Chinese bronze ding-style alchemy furnace about 1.2 meters tall, three-legged, round body, with a domed lid,
bronze gold (#B8913F) body with two dark teal (#2F5D62) patina bands, a simple flat cloud pattern band painted on the belly (not carved),
two upright square handles on the rim, a domed lid with a small knob shaped like a closed lotus bud,
three short sturdy legs, a small square fire opening near the bottom that is dark (#2B2B2E) inside with no fire,
THREE-QUARTER VIEW from slightly above (about 30 degrees), the whole object complete in frame, standing upright on nothing,
simple solid construction, no loose small parts.
STYLE: stylized low-poly cel-shaded 3D game asset concept, ink-wash inspired Chinese fantasy cultivation world,
big clear readable shapes, chunky bevelled forms, small details painted not modelled,
clean flat colors, very soft and subtle shading only to show form, no texture noise,
limited palette: bronze gold (#B8913F), dark teal (#2F5D62), dark wood brown (#5A3D2A), ink grey (#2B2B2E).
RENDER: plain light grey seamless background (#D8D8D8), even flat studio lighting from the front, no cast shadow, no floor shadow,
orthographic camera, whole subject centered and fully inside the frame with margin on all sides.
AVOID: no text, no letters, no calligraphy, no seal script, no watermark, no logo, no signature,
no outline, no line art, no black contour lines, no glow, no bloom, no light rays, no particles, no sparks, no smoke, no fog, no fire, no flames,
no magic effects, no aura, no reflections, no specular highlights, no metallic shine, no rust texture, no witch cauldron, no photorealism,
no background scenery, no table, no floor, no second object, no cropped parts.
```

Kiểm: không có lửa hay khói; hoa văn là màu vẽ, không nổi khối; ba chân thấy rõ.

---

## 4. Linh thảo (`prop_linh_thao`)

Cây thuốc hái được ngoài rừng (vật phẩm Linh Thảo). Trong game, chóp lá ngọc sẽ được pipeline đánh dấu phát sáng nhẹ; trong concept chỉ là màu thường.

```text
SUBJECT: single game prop, a small magical medicinal herb clump about 40 centimeters tall,
6 broad pointed leaves in leaf green (#3A7A4C) fanning out from the center, each leaf tip painted jade green (#7FE3D0) as a flat color,
one straight central stem with a single closed flower bud in peach pink (#F3B6C9),
growing from a small low round mound of earth beige (#CDBF96) soil with two small grey pebbles,
THREE-QUARTER VIEW from slightly above (about 30 degrees), the whole object complete in frame,
thick chunky leaves with visible thickness, simple solid construction, no thin parts, no loose small parts.
STYLE: stylized low-poly cel-shaded 3D game asset concept, ink-wash inspired Chinese fantasy cultivation world,
big clear readable shapes, chunky bevelled forms, small details painted not modelled,
clean flat colors, very soft and subtle shading only to show form, no texture noise,
limited palette: leaf green (#3A7A4C), pine green (#275C3F), jade green (#7FE3D0), peach pink (#F3B6C9), earth beige (#CDBF96), ink grey (#8A8782).
RENDER: plain light grey seamless background (#D8D8D8), even flat studio lighting from the front, no cast shadow, no floor shadow,
orthographic camera, whole subject centered and fully inside the frame with margin on all sides.
AVOID: no text, no letters, no watermark, no logo,
no outline, no line art, no black contour lines, no glow, no bloom, no light rays, no particles, no sparkles, no fireflies, no smoke, no fog,
no magic effects, no aura, no reflections, no specular highlights, no photorealism, no leaf veins detail,
no background scenery, no pot, no grass around, no second plant, no cropped parts.
```

Kiểm: lá có độ dày (Tripo hay làm lá mỏng như giấy, gây lỗ thủng); không có hạt sáng quanh cây.

---

## 5. Phi kiếm (`prop_phi_kiem`)

Kiếm dùng cho chiêu Phi Kiếm Thuật và ngự kiếm. Mép lưỡi sẽ được pipeline đánh dấu phát sáng `spirit_sword` trong game; concept vẽ màu thường.

```text
SUBJECT: single game prop, a straight double-edged Chinese sword (jian) about 1 meter long,
pale grey (#B9B6AE) blade with a painted ivory (#EDE6D6) central ridge line, blade clearly thick enough to read as a solid shape,
a small flat bronze gold (#B8913F) jian hand guard shaped like a simple stylized cloud, grip wrapped in deep navy (#1F3A5A), round bronze pommel,
a short chunky cinnabar red (#A8322D) tassel hanging from the pommel, shaped as one solid teardrop with no loose strands,
three-quarter view, the blade pointing to the upper right at 45 degrees, the whole sword complete in frame,
simple solid construction, no loose small parts.
STYLE: stylized low-poly cel-shaded 3D game asset concept, ink-wash inspired Chinese fantasy cultivation world,
big clear readable shapes, chunky bevelled forms, small details painted not modelled,
clean flat colors, very soft and subtle shading only to show form, no texture noise,
limited palette: ink greys (#B9B6AE, #5F5D5C), ivory (#EDE6D6), bronze gold (#B8913F), deep navy (#1F3A5A), cinnabar red (#A8322D).
RENDER: plain light grey seamless background (#D8D8D8), even flat studio lighting from the front, no cast shadow, no floor shadow,
orthographic camera, whole subject centered and fully inside the frame with margin on all sides.
AVOID: no text, no letters, no engraved characters, no seal script, no watermark, no logo,
no outline, no line art, no black contour lines, no glow, no bloom, no light rays, no particles, no sparks, no smoke,
no sword energy trail, no magic effects, no aura, no reflections, no specular highlights, no metallic shine, no photorealism,
no crossguard, no European sword shapes, no scabbard, no hand holding it, no stand, no background scenery, no second object, no cropped parts.
```

Kiểm: lưỡi thẳng, đủ dày; chắn kiếm nhỏ kiểu kiếm Trung Hoa, không phải chắn chữ thập; tua kiếm là một khối; không có chữ khắc trên lưỡi. Nếu Tripo dựng lưỡi bị phồng hoặc cong, chuyển sang multiview (codex.md mục 6).

---

## Sau khi duyệt

Lưu ảnh đã chọn theo tên trong runbook mục 3 (`concept_front.png`, `concept_left.png`, `concept_back.png`, `concept_34.png`), ghi prompt vào `meta.json`, rồi sang M0-3 theo `docs/tripo-runbook.md`.
