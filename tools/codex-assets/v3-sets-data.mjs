// Dữ liệu concept nhân vật NGUYÊN KHỐI v3 theo từng bộ (dựng hàng loạt trên Tripo web). Dùng bởi chr-v3-sets-gen.mjs.
// Màu `look` lấy từ packages/content/data/equipment/sets.json (item/chỉ số giữ nguyên, chỉ đổi hình). Mô tả tiếng Anh, không dấu (tránh model vẽ chữ).
// Bài học v3/v3b (bắt buộc áp cho mọi bộ): vạt MỘT lớp, đối xứng trái/phải, xẻ tà hai bên (hoặc tấm giáp trước/sau tách đôi), KHÔNG có mảng vải/tua/hồ lô/túi treo
// lệch một bên; tay áo vừa phải (không loe rộng, không bồng) để ít xuyên vào thân; khe nách rõ ở tư thế chữ A; vai giáp gọn, không dính cổ.

export const COMMON_RULES =
  'Construction rules: the lower garment is a SINGLE simple layer, perfectly SYMMETRICAL left and right, with TWO tall side slits rising from the hem to the hip on BOTH sides (identical), or two clean separate front and back panels, so both legs are free to move; NO asymmetric cloth, NO single dangling panel, NO tassels or sash tails hanging on one side, NO pouch, NO gourd, NO bag, NO overlapping layers on one leg; sleeves are moderately wide but fitted (opening roughly a hand span and a half, NOT flowing or puffy), never touching the torso; shoulder pieces are compact and sit on the shoulders without touching the neck or the head.';

export const V3_SETS = {
  set_de_tu: {
    folder: 'set_de_tu',
    name: 'Do De Tu (dao bao de tu tan thu)',
    nameVi: 'Đồ Đệ Tử (tân thủ)',
    branch: 'chung ba nhánh',
    tier: 0,
    look: { hex: '#3B6584', trim: '#22364E', note: 'ngà #E6DDCB cho cổ trong' },
    outfit:
      'the plain outer-disciple starter outfit of a sword sect: a mid-calf robe (dao pao) in sect steel-blue (#3B6584) with a CROSSED collar showing a thin ivory (#E6DDCB) inner collar, dark navy (#22364E) trim along collar, cuffs and hem, modest fitted sleeves, a plain dark navy (#22364E) cloth belt tied in a simple flat knot at the center front with short symmetric ends, narrow dark navy trousers visible through two tall symmetric side slits, plain dark cloth boots with simple wraps; NO armor, NO ornaments, NO jewelry, NO embroidery, humble and clean, slightly worn cloth look',
    who: {
      nam: 'a young adult MAN about 19 years old, East Asian, honest plain open face with a clean-shaven jaw, slightly thick straight eyebrows, black hair in a simple low ponytail tied with a plain dark cloth band, a few short strands at the temples',
      nu: 'a young adult WOMAN about 19 years old, East Asian, fresh honest face with round eyes and soft cheeks, black hair in a simple high ponytail tied with a plain dark cloth band, a few short strands framing the face',
    },
    guide: [
      'Đồ đơn giản nhất, không phụ kiện: dễ dựng nhất, dựng ĐẦU TIÊN để thử tay/vạt.',
      'Không giáp, không trang sức; tóc buộc đuôi ngựa bằng dải vải (không trâm bạc).',
      'Vạt xẻ hai bên đối xứng, thấy quần xanh đen hẹp ở hai xẻ.',
      'Ảnh đã sinh: nam đuôi ngựa thấp, nữ đuôi ngựa cao dài tới giữa lưng (tóc nằm sau lưng, không dính áo): dựng đúng như ảnh.',
    ],
  },
  set_huyen_giap: {
    folder: 'set_huyen_giap',
    name: 'Huyen Giap Ho Phap',
    nameVi: 'Huyền Giáp Hộ Pháp',
    branch: 'Hộ pháp',
    tier: 1,
    look: { hex: '#2A2C32', trim: '#A9873F', blade: '#D6B45E' },
    outfit:
      'the Huyen Giap guardian (tank) outfit: black-steel half-armor (#2A2C32) over a knee-length black tunic, with gold (#A9873F) edge trim; THREE-TIER angular pauldrons shaped like overlapping hexagonal scales, gold-edged, compact and set well apart from the neck and head; short fitted black sleeves ending in steel bracers with raised plates and gold edges; a wide flat plate belt with a gold buckle and one small deep-red jewel at the center front; the lower tunic split into two clean separate FRONT and BACK tasset panels hanging to the knee, perfectly symmetric, with a flat black back cloth panel with thin gold stripes; tall black steel greaves (leg armor) with gold trim up to the knee, black boots; strong squared silhouette but NOT bulky, plates are thin and close to the body',
    who: {
      nam: 'a MAN about 32 years old, East Asian, stern calm face with a square jaw and thick straight eyebrows, a light short stubble, black hair pulled back into a short tight topknot held by a plain black steel band',
      nu: 'a WOMAN about 30 years old, East Asian, composed determined face with strong straight eyebrows and a firm jaw, black hair braided into a tight high bun held by a black steel hairpin, no loose strands',
    },
    guide: [
      'Giáp nửa người đen thép + viền vàng: nguy cơ lớn nhất là VAI GIÁP ba tầng dính cổ/đầu và tay dính vai giáp. Concept để vai giáp gọn, cách cổ rõ.',
      'Vạt = hai tấm giáp trước/sau TÁCH RỜI tới gối (không phải váy liền): nếu Tripo dựng thành váy bít hai chân, dựng lại.',
      'Không kiếm, không khiên (gắn bằng xương trong game). Ngọc đỏ ở đai chỉ là chi tiết nhỏ giữa đai.',
      'Ảnh đã sinh: nam tấm giáp trước/sau tách đôi rõ; nữ tấm trước liền ở giữa với hai xẻ bên (chấp nhận, miễn không bít hai chân).',
    ],
  },
  set_dan_tam: {
    folder: 'set_dan_tam',
    name: 'Dan Tam Y Bat',
    nameVi: 'Đan Tâm Y Bát',
    branch: 'Đan sư',
    tier: 1,
    look: { hex: '#4D7D68', trim: '#D8C58A', blade: '#9BE8A8' },
    outfit:
      'the Dan Tam alchemist-healer outfit: a calf-length soft jade-green (#4D7D68) robe with a CROSSED collar, pale-gold (#D8C58A) trim along collar, cuffs and hem, over an ivory inner robe seen at the collar; modest fitted sleeves with a slim pale-gold cuff band; a soft double-layer shoulder drape that stays flat and close to the shoulders; the robe skirt is a SINGLE layer with TWO tall symmetric side slits from hem to hip so narrow jade-dark trousers show; a jade-green sash belt tied flat at the center front with short symmetric ends; ONE small round jade disc pendant with a pale-gold rim hanging at the center of the chest on a thin V-shaped cord (centered, small); soft cloth shoes with pale-gold toe trim; gentle, calm, scholarly look; NO gourd, NO pouch, NO silk streamers, NO tassels',
    who: {
      nam: 'a MAN about 28 years old, East Asian, gentle scholarly face with soft almond eyes and thin eyebrows, clean-shaven, black hair half tied up with a small jade pin, the rest falling straight down the back to mid-back',
      nu: 'a WOMAN about 27 years old, East Asian, kind gentle face with soft eyes and a faint smile, black hair in a low loose bun with a small jade hairpin, two long strands falling in front of the shoulders and the rest straight down the back',
    },
    guide: [
      'Áo dài mềm xanh ngọc, cổ giao lĩnh, vạt MỘT lớp xẻ hai bên đối xứng (như Lạc Kiếm v3b).',
      'KHÔNG hồ lô, túi thuốc, dải lụa, tua: các thứ treo gắn riêng bằng xương/phụ kiện sau (nếu dựng vào model sẽ đung đưa lệch một bên và xuyên áo).',
      'Ngọc bội: MỘT đĩa ngọc nhỏ ở giữa ngực trên dây chữ V, đối xứng; nếu Tripo dựng thành mảng lớn hoặc lệch thì dựng lại.',
      'Ảnh đã sinh: cổ tay áo hơi loe (vừa phải): nếu Tripo dựng loe rộng hơn ảnh thì dựng lại; nữ có hai lọn tóc rũ trước vai: nếu dính vào áo thì dựng lại.',
    ],
  },
};
