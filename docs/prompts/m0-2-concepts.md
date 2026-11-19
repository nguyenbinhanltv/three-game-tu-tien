# Concept M0-2: 5 đối tượng thử pipeline

Phiên bản 3 (2026-11-15): hướng bán tả thực điện ảnh. Concept sinh theo hướng cel-shaded cũ **không dùng nữa**, phải sinh lại.

Mục tiêu M0-2: có 5 bộ concept được duyệt để chạy thử Tripo ở M0-3. Mỗi mục dưới đây là prompt đã ghép đủ khối đối tượng + phong cách + chụp + cấm từ [`codex.md`](codex.md), dán thẳng vào Codex. Danh sách màu trong khối STYLE đã rút gọn cho từng đối tượng; phần còn lại giữ nguyên văn.

| # | Asset id | Thư mục nguồn | Ảnh cần | Kênh Tripo (M0-3) | Báo giá dự kiến mỗi lần thử |
| --- | --- | --- | --- | --- | --- |
| 1 | `chr_de_tu_nam` | `3d/nhan-vat/chr_de_tu_nam/` | trước, bên, sau | web app: multiview + rig + 3 clip | khoảng 105 (50 + rig 25 + 3 × 10) |
| 2 | `mon_soi_xam` | `3d/quai/mon_soi_xam/` | bên, trước, sau | web app: multiview + rig + 3 clip | khoảng 105 |
| 3 | `prop_lo_dan` | `3d/prop/prop_lo_dan/` | 3/4 | CLI: image→3D | 50 |
| 4 | `prop_linh_thao` | `3d/prop/prop_linh_thao/` | 3/4 | CLI: image→3D | 50 |
| 5 | `prop_phi_kiem` | `3d/vu-khi/prop_phi_kiem/` | 3/4 | CLI: image→3D | 50 |

Báo giá theo bảng giá API (`make --dry-run`); giá trên web app chưa kiểm chứng. Thư mục nguồn tính từ `DTL_ASSET_SOURCE` (runbook mục 2). Mỗi đối tượng sinh 3–4 phương án cho ảnh đầu tiên, người dùng chọn một, rồi mới sửa ra các góc còn lại.

---

## 1. Đệ tử nam Lạc Kiếm Tông (`chr_de_tu_nam`)

Model gốc cho người chơi nam, màu áo mặc định `attire_sect`. Đây cũng là model mẫu mua animation, nên A-pose phải chuẩn.

### 1a. Mặt trước

```text
SUBJECT: full body character turnaround reference, FRONT VIEW, a young male sword cultivator around twenty years old, disciple of a mountain sword sect,
handsome calm face with refined natural features, black hair tied in a high topknot held by a plain bronze hairpin, a small cinnabar red hair ribbon, a few loose strands framing the face,
cross-collar long robe of matte woven cloth in sect blue (#3B6584) reaching mid-calf with side slits, soft natural folds,
ivory white inner collar visible at the neck, dark teal (#2B5552) trim with a subtle woven cloud pattern on the collar edge and on the wide sleeve cuffs,
wide deep navy (#22364E) waist sash tied at the front, loose ink black (#29292C) trousers gathered at the ankles, black cloth shoes with thick soles,
standing in a neutral A-pose: arms straight and lowered about 45 degrees away from the body, palms facing the thighs,
clear gap between the wide sleeves and the torso, feet shoulder-width apart, looking straight at the camera, calm neutral expression,
empty hands, no weapon, no scabbard, no backpack.
STYLE: semi-realistic stylized 3D game asset concept for a Chinese fantasy cultivation world, cinematic painterly quality,
realistic human proportions about 7 heads tall, idealized but believable features,
believable materials with hand-painted detail: woven cloth with soft folds, leather, bronze,
clear readable silhouette, large shapes first and fine detail second,
color guide (use only what the subject needs): ivory cloth (#E6DDCB), sect blue (#3B6584), deep navy (#22364E), dark teal (#2B5552),
cinnabar red (#9D392E), bronze (#AE8B49), skin (#E6BF9C), ink black hair (#29292C).
RENDER: neutral flat even studio lighting, soft diffuse light from the front, no strong directional shadows, no dramatic lighting,
no colored rim light, no color cast, neutral white balance,
plain light grey seamless background (#D8D8D8), no floor shadow,
orthographic camera, whole subject centered and fully inside the frame with margin on all sides.
AVOID: no text, no letters, no calligraphy, no seal script, no watermark, no logo, no signature,
no glow, no bloom, no light rays, no particles, no sparks, no smoke, no fog, no snow,
no magic effects, no motion lines, no aura,
no cel shading, no toon outlines, no black contour lines, no flat cartoon colors, no anime style, no chibi,
no photograph, no photorealistic skin pores, no oily shiny skin, no plastic look,
no baked dramatic shadows, no night scene,
no background scenery, no props on the floor, no second character, no cropped body parts.
```

### 1b, 1c. Góc bên, góc sau

Đính kèm ảnh 1a đã duyệt, dùng nguyên văn mẫu 4.2 (bên) và 4.3 (sau) trong `codex.md`, ghép lại khối STYLE/RENDER/AVOID ở trên.

Kiểm khi duyệt:

- [ ] Tỉ lệ khoảng 7 đầu; mặt thanh, không kiểu anime, không kiểu ảnh chụp.
- [ ] Có khe hở giữa tay áo và thân.
- [ ] Áo chính là một vùng lam liền (để làm mặt nạ đổi màu áo), viền và đai khác màu rõ.
- [ ] Ánh sáng phẳng, không có bóng đổ gắt hay viền sáng màu.
- [ ] Không có kiếm, bao kiếm; tay không cầm gì.
- [ ] Ảnh bên đúng góc nghiêng 90° (một mắt, hai chân chồng nhau).

---

## 2. Sói Xám (`mon_soi_xam`)

Quái đầu tiên của vùng khởi đầu. Yêu Lang, U Minh Lang và Huyết Lang Vương dùng chung bộ xương về sau, nên dáng phải trung tính.

### 2a. Góc bên

```text
SUBJECT: full body creature turnaround reference, SIDE PROFILE VIEW facing the RIGHT edge of the image,
a lean grey mountain wolf about 1.5 meters long, long muzzle, pointed upright ears, thick neck ruff,
dense fur painted in soft clumps with visible fur direction: pale warm grey (#BDB6A4) belly, chest and muzzle, mid grey (#7D786C) body,
darker grey (#464540) saddle along the back and tail tip, bushy tail, bronze (#AE8B49) eyes, ink black (#29292C) nose and paw pads,
standing in a neutral pose: all four legs straight and visible, weight even, head level, mouth closed, tail held straight back and slightly down,
strict orthographic profile.
STYLE: semi-realistic stylized 3D game asset concept for a Chinese fantasy cultivation world, cinematic painterly quality,
believable anatomy and materials with hand-painted detail: fur, claws,
clear readable silhouette, large shapes first and fine detail second,
color guide (use only what the subject needs): stone greys (#BDB6A4, #7D786C, #464540), bronze (#AE8B49), ink black (#29292C), ivory (#E6DDCB).
RENDER: neutral flat even studio lighting, soft diffuse light from the front, no strong directional shadows, no dramatic lighting,
no colored rim light, no color cast, neutral white balance,
plain light grey seamless background (#D8D8D8), no floor shadow,
orthographic camera, whole subject centered and fully inside the frame with margin on all sides.
AVOID: no text, no letters, no calligraphy, no seal script, no watermark, no logo, no signature,
no glow, no bloom, no light rays, no particles, no sparks, no smoke, no fog, no snow,
no magic effects, no motion lines, no aura,
no cel shading, no toon outlines, no black contour lines, no flat cartoon colors, no anime style, no chibi,
no photograph, no plastic look, no baked dramatic shadows, no night scene, no snarling, no visible teeth,
no background scenery, no props on the floor, no second creature, no cropped body parts.
```

Khổ ảnh ngang `1536×1024`.

### 2b, 2c. Góc trước, góc sau

Đính kèm ảnh 2a đã duyệt, dùng mẫu sửa ảnh của mục 5 trong `codex.md` (FRONT VIEW, BACK VIEW), ghép lại khối STYLE/RENDER/AVOID ở trên.

Kiểm khi duyệt:

- [ ] Bốn chân thẳng, tách rời nhau ở góc bên (để rig quadruped nhận đúng).
- [ ] Miệng ngậm là cố ý (để rig); nanh được thêm ở bước texture hoặc clip tấn công.
- [ ] Lông có hướng và mảng, không phải lông thật từng sợi; đuôi không cong lên lưng.

---

## 3. Lò đan (`prop_lo_dan`)

Đặt trong Đan Phòng của dược sư Tố Tâm; dùng cho tính năng luyện đan.

```text
SUBJECT: single game prop, a Chinese bronze ding-style alchemy furnace about 1.2 meters tall, three-legged, round body, with a domed lid,
cast bronze (#AE8B49) with aged dark teal (#2B5552) patina in the recesses, a band of low relief cloud pattern around the belly,
two upright square handles on the rim, a small knob shaped like a closed lotus bud on the lid,
three short sturdy legs, a small square fire opening near the bottom that is dark inside with no fire,
THREE-QUARTER VIEW from slightly above (about 30 degrees), the whole object complete in frame, standing upright on nothing,
solid construction, no loose small parts.
STYLE: semi-realistic stylized 3D game asset concept for a Chinese fantasy cultivation world, cinematic painterly quality,
believable materials with hand-painted detail: cast bronze, patina, soot,
clear readable silhouette, large shapes first and fine detail second,
color guide (use only what the subject needs): bronze (#AE8B49), dark teal (#2B5552), dark wood (#4D3324), stone dark (#464540).
RENDER: neutral flat even studio lighting, soft diffuse light from the front, no strong directional shadows, no dramatic lighting,
no colored rim light, no color cast, neutral white balance,
plain light grey seamless background (#D8D8D8), no floor shadow,
orthographic camera, whole subject centered and fully inside the frame with margin on all sides.
AVOID: no text, no letters, no calligraphy, no seal script, no watermark, no logo, no signature,
no glow, no bloom, no light rays, no particles, no sparks, no smoke, no fog, no fire, no flames,
no magic effects, no aura, no witch cauldron,
no cel shading, no toon outlines, no flat cartoon colors, no photograph, no mirror-like metallic reflections,
no background scenery, no table, no floor, no second object, no cropped parts.
```

Kiểm: không có lửa hay khói; hoa văn là phù điêu thấp (normal map), không có chữ; ba chân thấy rõ; đồng thau mờ, không bóng gương.

---

## 4. Linh thảo (`prop_linh_thao`)

Cây thuốc hái được ngoài rừng (vật phẩm Linh Thảo). Trong game, chóp lá ngọc được pipeline đánh dấu phát sáng nhẹ; trong concept chỉ là màu thường.

```text
SUBJECT: single game prop, a small magical medicinal herb clump about 40 centimeters tall,
6 broad pointed leaves in leaf green (#3E7552) with natural veins, each leaf tip fading into a pale jade green (#7FE3D0) as painted color,
one straight central stem with a single closed flower bud in peach pink (#E9B4C0),
growing from a small low mound of dark rich soil with moss and two small grey pebbles,
THREE-QUARTER VIEW from slightly above (about 30 degrees), the whole object complete in frame,
leaves with visible thickness, solid construction, no thin floating parts.
STYLE: semi-realistic stylized 3D game asset concept for a Chinese fantasy cultivation world, cinematic painterly quality,
believable materials with hand-painted detail: leaves, moss, soil, stone,
clear readable silhouette, large shapes first and fine detail second,
color guide (use only what the subject needs): leaf green (#3E7552), pine green (#23503F), jade green (#7FE3D0), peach pink (#E9B4C0), dark wood (#4D3324), stone (#7D786C).
RENDER: neutral flat even studio lighting, soft diffuse light from the front, no strong directional shadows, no dramatic lighting,
no colored rim light, no color cast, neutral white balance,
plain light grey seamless background (#D8D8D8), no floor shadow,
orthographic camera, whole subject centered and fully inside the frame with margin on all sides.
AVOID: no text, no letters, no watermark, no logo,
no glow, no bloom, no light rays, no particles, no sparkles, no fireflies, no smoke, no fog,
no magic effects, no aura,
no cel shading, no toon outlines, no flat cartoon colors, no photograph,
no background scenery, no pot, no grass around, no second plant, no cropped parts.
```

Kiểm: lá có độ dày (Tripo hay làm lá mỏng như giấy, gây lỗ thủng); không có hạt sáng quanh cây; chóp lá ngọc là màu, không phát sáng trong ảnh.

---

## 5. Phi kiếm (`prop_phi_kiem`)

Kiếm dùng cho chiêu Phi Kiếm Thuật và ngự kiếm. Mép lưỡi được pipeline đánh dấu phát sáng `spirit_sword` trong game; concept vẽ kim loại thường.

```text
SUBJECT: single game prop, a straight double-edged Chinese sword (jian) about 1 meter long,
polished steel blade with a satin finish and a clearly visible central ridge, blade thick enough to read as a solid shape,
a small flat bronze (#AE8B49) jian hand guard shaped like a stylized cloud, grip wrapped in deep navy (#22364E) cord, round bronze pommel,
a short cinnabar red (#9D392E) silk tassel hanging from the pommel, gathered into one compact solid shape,
three-quarter view, the blade pointing to the upper right at 45 degrees, the whole sword complete in frame,
solid construction, no loose small parts.
STYLE: semi-realistic stylized 3D game asset concept for a Chinese fantasy cultivation world, cinematic painterly quality,
believable materials with hand-painted detail: steel, bronze, silk cord,
clear readable silhouette, large shapes first and fine detail second,
color guide (use only what the subject needs): cool steel grey for the blade, bronze (#AE8B49), deep navy (#22364E), cinnabar red (#9D392E).
RENDER: neutral flat even studio lighting, soft diffuse light from the front, no strong directional shadows, no dramatic lighting,
no colored rim light, no color cast, neutral white balance,
plain light grey seamless background (#D8D8D8), no floor shadow,
orthographic camera, whole subject centered and fully inside the frame with margin on all sides.
AVOID: no text, no letters, no engraved characters, no seal script, no watermark, no logo,
no glow, no bloom, no light rays, no particles, no sparks, no smoke,
no sword energy trail, no magic effects, no aura,
no cel shading, no toon outlines, no flat cartoon colors, no photograph, no mirror-like reflections,
no crossguard, no European sword shapes, no scabbard, no hand holding it, no stand,
no background scenery, no second object, no cropped parts.
```

Kiểm: lưỡi thẳng, đủ dày; chắn kiếm nhỏ kiểu kiếm Trung Hoa, không phải chắn chữ thập; tua kiếm là một khối; không có chữ khắc. Nếu Tripo dựng lưỡi bị phồng hoặc cong, chuyển sang multiview (codex.md mục 6).

---

## Sau khi duyệt

Lưu ảnh đã chọn theo tên trong runbook mục 3 (`concept_front.png`, `concept_left.png`, `concept_back.png`, `concept_34.png`), ghi prompt vào `meta.json`, rồi sang M0-3 theo `docs/tripo-runbook.md`.
