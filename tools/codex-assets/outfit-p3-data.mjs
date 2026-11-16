// Dữ liệu concept trang phục bậc 4 Hóa Thần (gói P3-concept). Cùng định dạng outfit-data.mjs (T-3 Kết Đan), nhưng mỗi mảnh vẽ ở góc chính diện + 3/4 rồi cắt sẵn `_front.png`.
// Chủ đề bậc 4: hoàng giả cổ thành, vàng cổ, sao đêm, choàng dài, viền phân thân mờ. Bảng màu bậc: mực đêm + tím sao (dưới 5%) + vàng cổ.
// Chỉ lấy cảm hứng từ ảnh tham khảo (cấu trúc, tinh thần), không chép dáng, hoa văn, logo hay nhân vật nào.

const ORIGINAL = 'Original design for a Chinese fantasy cultivation game, not copied from any existing game, novel, artwork or character.';
const STYLE =
  'Semi-realistic cinematic painterly rendering with hand-painted material detail, believable cloth folds, engraved aged-gold metal, clear readable silhouette. Royal ancient-city night theme: deep ink-night cloth, old gold, star constellations; the outfit is slightly brighter and more eye-catching than the environment. Purple is only a tiny accent (under 5% of the image).';
const A = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const NOTEXT =
  'ABSOLUTELY NO text, letters, numbers, Chinese characters, captions, labels, watermark, logo, signature, UI icons with writing. Use only wordless graphic panels. No cel shading, no toon outlines, no anime chibi, no photograph, no glow bloom, no particles, no magic effects, no light rays.';

export const SETS = {
  tinh_khuyet: {
    name: 'Tinh Khuyết Kiếm Bào',
    method: 'Kiếm tu',
    element: 'Kim/Thủy (sao đêm)',
    dir: 'chr',
    srcId: 'set_tinh_khuyet_kiem_bao',
    ref: 'ref-04 (áo khoác dài, lót đậm, vai nhọn) + mẫu #119 Tinh Khuyết làm tham chiếu dáng (bản tạm)',
    palette: [
      ['Chính (áo ngoài, choàng)', '#1E2335', 'mực đêm'],
      ['Phụ (lớp lót, lớp dưới, ủng)', '#D9CFB6', 'ngà trăng'],
      ['Viền (kim loại, vai giáp, thêu)', '#B89B56', 'vàng cổ'],
      ['Nhấn phát sáng (chòm sao)', '#8E80D8', 'tím sao, chỉ ở chấm sao'],
    ],
    materials:
      'Lụa đen xanh mực dệt dày, ánh nhẹ (áo ngoài, choàng) · lụa ngà trăng (lớp lót, lớp dưới) · chỉ vàng cổ thêu chòm sao và viền · vàng cổ xỉn chạm khắc (vai trăng khuyết, khóa đai, trâm) · da thuộc đen (đai, ủng, hộ uyển) · tinh thạch tím sao nhỏ (chấm sao)',
    silhouette:
      'a tall royal swordsman look of an ancient star-city: a long ink-night outer coat with high side slits and a very long trailing back mantle (cape-like panel reaching the ground) with an old-gold border, a faint ghost-double outline embroidered a few centimeters outside the hem and sleeve edges in thin pale gold thread as if the garment had a faint twin, constellation lines embroidered across the coat in old-gold thread with tiny star-purple dots at the star points, an ivory-moon inner robe visible at the collar and slits, sharp upswept crescent-moon shaped old-gold pauldrons with a small eight-point star at the center, a wide black leather belt with a gold astrolabe-ring buckle and a hanging star pendant with tassels, tall black boots with gold star inlay, and a slim old-gold crown with a crescent-and-star ornament and a long hairpin',
    motif:
      'constellation line-and-dot patterns, concentric astrolabe rings and eight-point stars, with a faint doubled (ghost twin) outline along the hems, embroidered in old-gold thread on ink-night cloth',
    pieces: {
      ao_ngoai: {
        name: 'Áo ngoài (áo khoác + choàng dài)',
        look: 'a long ink-night swordsman outer coat with a crossed high collar, wide sleeves with ivory-moon lining at the cuffs, high side slits, and a very long trailing back mantle panel reaching the ground, old-gold border along all edges, constellation lines embroidered in old-gold thread with tiny star-purple dots, a faint ghost-double outline in thin pale gold thread a few centimeters outside the hem and sleeve edges',
        tris: '5000',
        bones: 'spine1/spine2 (thân), upperarm L/R, forearm L/R, neck. Choàng sau gắn spine2 và shoulder. Trọng số lấy từ thân nền',
        spring: 'Tay áo: 2 chuỗi × 3 xương mỗi bên. Choàng dài sau: 3 chuỗi × 4 xương. Vạt xẻ tà hai bên: 1 chuỗi × 2 xương mỗi bên',
        notes: 'Một mảnh liền, lụa dày KHÔNG xuyên sáng. Choàng dài là mảnh vải riêng thả từ vai tới đất. Viền phân thân mờ chỉ là thêu chỉ nhạt (texture), không dựng thành hình thứ hai. Mở thân dưới để lớp dưới thấy bên trong.',
      },
      lop_duoi: {
        name: 'Lớp dưới',
        look: 'ivory-moon inner robe hem and wide-leg ink-night trousers: a long ivory-moon under-skirt panel at front and back split in the middle, ink-night wide-leg trousers tucked into the boot tops, thin old-gold stitched hem trim with a few tiny embroidered stars',
        tris: '2000',
        bones: 'pelvis/hips, thigh L/R, calf L/R. Trọng số từ thân nền',
        spring: 'Vạt dưới trước và sau: 2 chuỗi × 2 xương',
        notes: 'Quần và vạt trong tối giản để áo ngoài là điểm nhấn. Phủ kín đùi tới bắp chân để cắt vùng ẩn của thân nền.',
      },
      vai_giap: {
        name: 'Vai giáp (cặp)',
        look: 'a matching pair of old-gold crescent-moon pauldrons: each a layered shoulder plate whose outer edge sweeps up into a sharp crescent horn, an engraved eight-point star at the center with a tiny star-purple gem, three stacked overlapping plates descending over the shoulder, black leather strap tabs underneath, mirrored left and right',
        tris: '1500',
        bones: 'clavicle/shoulder L và R (cứng, không co giãn); một mảnh có hai nửa đối xứng',
        spring: 'Không. Mảnh cứng',
        notes: 'Hai nửa đối xứng gửi cùng một ảnh (dựng cặp là đúng). Sừng trăng cao hơn vai không quá 14 cm. Ngọc tím sao là vật liệu phát sáng riêng.',
      },
      dai_tua: {
        name: 'Đai và tua',
        look: 'a wide black leather belt with a large old-gold astrolabe-ring buckle (concentric rings with an eight-point star at the center and one tiny star-purple gem), a second thin ivory-moon sash knot at the side, a hanging eight-point gold star pendant on a braided cord with a pale tassel, two more cords of different lengths ending in small gold stars',
        tris: '1200',
        bones: 'đai: hips/spine (cứng, quấn quanh eo). Tua: neo ở đai',
        spring: 'Tua: 2 chuỗi × 4 xương. Dải thắt nút: 1 chuỗi × 3 xương',
        notes: 'Đai là vòng kín quanh eo, dày ~2 cm để pipeline lồng đệm. Tua và dải để rời mesh gắn xương lò xo.',
      },
      ung: {
        name: 'Ủng (cặp)',
        look: 'a pair of tall black leather boots reaching below the knee, old-gold star inlay running up the outer side, an engraved old-gold band along the top edge, pointed gold-capped toes, one thin gold strap buckle, elegant and slim',
        tris: '1300',
        bones: 'foot L/R, toe L/R, calf L/R (cứng; ống ủng bám bắp chân)',
        spring: 'Không',
        notes: 'Đế phẳng, đặt chân đúng trục xương chân. Miệng ủng đủ rộng để lớp dưới chui vào.',
      },
      trang_suc_dau: {
        name: 'Trang sức đầu',
        look: 'a slim old-gold crown (guan) holding a topknot: a small tapered gold cap with a crescent-moon rising at the front around an eight-point star with a tiny star-purple gem, one long gold hairpin passing through it ending in a small star, two short ink-night ribbon tails hanging at the back with fine gold edges',
        tris: '700',
        bones: 'head (cứng). Ô trang sức đầu là ô trang bị thứ 9 (có thể ẩn/hiện)',
        spring: 'Dải ruy băng sau: 1 chuỗi × 3 xương mỗi dải',
        notes: 'Chỉ quan, trâm, dải. KHÔNG có đầu, tóc hay mặt. Nhìn từ trên xuống gọn trong vòng tròn ~8 cm.',
      },
    },
  },
  co_thanh: {
    name: 'Cổ Thành Huyền Giáp',
    method: 'Hộ pháp',
    element: 'Thổ (cổ thành)',
    dir: 'chr',
    srcId: 'set_co_thanh_huyen_giap',
    ref: 'ref-05 (dáng nặng, vai to, váy nhiều tầng), nhưng là tường thành cổ thay vì lông vũ hay vảy',
    palette: [
      ['Chính (giáp thân, choàng)', '#262B38', 'mực đá đêm'],
      ['Phụ (đá thành, lớp lót, ủng)', '#6F6A5E', 'đá cổ thành'],
      ['Viền (kim loại, thêu)', '#BA9A55', 'vàng cổ'],
      ['Nhấn phát sáng (đèn lồng, khe giáp)', '#E2BE62', 'vàng đèn lồng trời, chỉ ở khe giáp và đèn'],
    ],
    materials:
      'Thép đen rèn thủ công, bề mặt nhám (giáp thân, vai) · đá thành cổ xám sần (mảng ốp và váy giáp) · vàng cổ xỉn chạm khắc (viền, khóa cổng, quan) · vải len mực đá dày (lớp trong, choàng) · da thuộc tối (đai, ủng) · tinh thạch tím sao nhỏ (nhãn mắt khóa cổng)',
    silhouette:
      'a heavy royal guardian of an ancient fortress city: huge pauldrons shaped like crenellated city wall battlements with an arched gate niche carved on the front of each, a dark-steel breastplate with an old-gold gate-arch relief and a central portcullis grid pattern, a long heavy ink-stone cape from the shoulders to the ground with an old-gold border and a faint ghost-double outline stitched outside its edge, a tiered armored skirt of overlapping stone-wall segments like tower tiers to the knees, thick bracers, a broad belt with a gate-lock clasp in old gold, heavy grey greaves-boots, and a battlement crown-helm with two small hanging lantern drops',
    motif: 'crenellated battlements, arched city gates, portcullis grids and tiered tower roofs, engraved in old gold on dark steel and ancient grey stone, with a faint doubled (ghost twin) outline along the cape edge',
    pieces: {
      ao_ngoai: {
        name: 'Áo ngoài (giáp thân + choàng dài)',
        look: 'a heavy royal chest armor over a thick ink-stone wool tunic: a dark-steel breastplate with an old-gold gate-arch relief and a portcullis grid pattern at the center, old-gold edging, a high stone-grey collar, short wide sleeves, and a long heavy ink-stone cape reaching the ground from two gold clasp plates at the shoulders with an old-gold border and a faint ghost-double outline stitched outside its edge, no skirt included',
        tris: '5000',
        bones: 'spine1/spine2 (giáp ngực cứng gắn spine2), upperarm L/R (tay áo ngắn), neck. Choàng gắn spine2/shoulder. Trọng số từ thân nền',
        spring: 'Choàng dài: 3 chuỗi × 4 xương (nặng, biên độ nhỏ). Vạt vải dưới giáp ngực: 1 chuỗi × 2 xương',
        notes: 'Giáp ngực là khối cứng, tunic dưới là phần mềm. Choàng là vải len dày riêng, không xuyên sáng. Hoa văn cổng thành phải nổi khối thật, không chỉ là họa tiết. Để nửa dưới thân hở cho lớp dưới.',
      },
      lop_duoi: {
        name: 'Lớp dưới (váy giáp tầng tháp)',
        look: 'a tiered armored skirt of overlapping stone-wall segments: three tiers like tower roofs, each a row of plates with a notched battlement lower edge and old-gold trim, hanging from a belt line to the knees, split at front and back for walking, thick ink-stone wool trousers underneath tucked into the boots, small grey stone knee guards',
        tris: '2000',
        bones: 'pelvis/hips, thigh L/R. Các tầng váy gắn pelvis, trọng số mềm về thigh',
        spring: 'Mỗi tầng váy 1 xương treo (3 tầng × 2 bên, ~8 xương), biên độ nhỏ',
        notes: 'Các tầng váy là tấm cứng đặt chồng lên nhau, có khe nhỏ giữa tầng để xương xoay. Không dùng vải xuyên sáng.',
      },
      vai_giap: {
        name: 'Vai giáp (cặp)',
        look: 'a matching pair of huge pauldrons shaped like crenellated city wall battlements: dark steel and ancient grey stone, an arched gate niche carved on each with an old-gold gate relief inside, a row of square merlons along the top edge, two descending tiers over the upper arm, a small old-gold lantern hanging from the lower edge, mirrored left and right',
        tris: '2200',
        bones: 'clavicle/shoulder L/R (cứng); tầng dưới nối upperarm L/R',
        spring: 'Không. Tầng dưới có 1 xương xoay nhẹ theo cánh tay',
        notes: 'Vai to nhất trong bộ, đỉnh cao hơn vai ~15 cm. Kiểm tra không đâm vào cổ khi giơ tay. Đèn lồng nhỏ là mảnh rời treo nhẹ.',
      },
      dai_tua: {
        name: 'Đai và tua',
        look: 'a broad dark leather belt with a large old-gold gate-lock clasp (an arched gate with a portcullis grid and one tiny star-purple gem as a keyhole eye), studded stone-grey side plates, a short hanging apron of braided cord tassels, a small carved old-gold watchtower charm and a tiny lantern charm on cords',
        tris: '1500',
        bones: 'hips/spine (cứng). Tua và charm neo ở đai',
        spring: 'Tua và charm: 2 chuỗi × 3 xương',
        notes: 'Đai dày 3 cm vì giáp nặng. Khóa cổng thành là điểm nhận diện bộ.',
      },
      ung: {
        name: 'Ủng (cặp)',
        look: 'a pair of heavy grey stone-and-steel boots with riveted dark steel shin plates, old-gold trim bands at the ankle and top edge, thick reinforced toe caps shaped like small gate arches, wide sturdy soles',
        tris: '1500',
        bones: 'foot L/R, toe L/R, calf L/R (cứng)',
        spring: 'Không',
        notes: 'Ủng nặng nhưng ống không to hơn bắp chân quá 30% để vừa dáng hai giới.',
      },
      trang_suc_dau: {
        name: 'Trang sức đầu',
        look: 'a battlement crown-helm in circlet style (open face, no visor): a dark steel band with old-gold edging and a row of small square merlons on top, a central arched gate crest with one tiny star-purple gem, a short plume-less crest ridge, two thin old-gold chains on each side ending in small hanging lanterns',
        tris: '700',
        bones: 'head (cứng). Ô trang sức đầu là ô trang bị thứ 9 (có thể ẩn/hiện)',
        spring: 'Dây đèn lồng: 2 chuỗi × 2 xương mỗi bên',
        notes: 'Chỉ có vòng quan, để hở mặt và tóc. Tổng chiều cao quan không quá 12 cm.',
      },
    },
  },
  than_tang: {
    name: 'Thần Tàng Đan Bào',
    method: 'Đan sư',
    element: 'Mộc/Thủy (kho tàng, ngọc)',
    dir: 'chr',
    srcId: 'set_than_tang_dan_bao',
    ref: 'ref-01 và ref-06 (voan, tay áo lụa mỏng) nâng thành hoàng giả: vàng cổ, ngọc kho báu',
    palette: [
      ['Chính (áo ngoài, choàng sao)', '#212A38', 'mực đêm xanh'],
      ['Phụ (lớp lót, đai, lớp dưới)', '#DCD2B8', 'ngà cổ'],
      ['Viền (kim loại, trâm, thêu)', '#BC9C58', 'vàng cổ'],
      ['Nhấn (ngọc, thêu ấn)', '#6DB4A0', 'lục ngọc thần tàng; thêm chấm tím sao rất nhỏ'],
    ],
    materials:
      'Lụa mực đêm xanh bóng nhẹ (đạo bào) · voan mỏng xuyên sáng điểm sao vàng (choàng và dải lụa, tối đa 2 mảnh trong suốt cho cả bộ) · lụa ngà cổ thêu ấn kho (lớp lót) · vàng cổ chạm khắc (viền, khóa đai, trâm) · ngọc lục thần tàng (thẻ ngọc, hạt tua) · sơn mài đen viền vàng (hộp báu nhỏ) · tinh thạch tím sao nhỏ',
    silhouette:
      'a regal alchemist-sage look of a sealed treasury hall: a wide ink-night-blue robe with very wide sleeves and ivory-antique inner robe, a long translucent star-gauze mantle sprinkled with tiny old-gold stars falling from the shoulders to the ground with a faint ghost-double outline stitched outside its edge, old-gold treasure-seal embroidery (lock-and-key seal patterns and jade tablet motifs) on hem and cuffs, light old-gold shoulder pieces shaped like open scroll-lanterns with hanging jade strips, an ivory sash belt with a gold clasp and a hanging small black-lacquer sealed treasure casket, a jade tablet pendant and a small elixir gourd, soft ankle boots with gold trim, and a gold diadem with a front curtain of short hanging jade-bead strands',
    motif: 'treasury seal patterns (lock-and-key seals, jade tablets, scroll frames) and tiny star dots, embroidered in old-gold and jade-green thread, with a faint doubled (ghost twin) outline along the mantle edge',
    pieces: {
      ao_ngoai: {
        name: 'Áo ngoài (đạo bào + choàng sao)',
        look: 'a wide ink-night-blue alchemist-sage robe with crossed collar and very wide flowing sleeves, an ivory-antique inner collar visible, old-gold treasure-seal embroidery on the hem and cuffs, and a long translucent star-gauze mantle draped across both shoulders falling to the ground in two soft tails, sprinkled with tiny old-gold stars, thin old-gold border, a faint ghost-double outline stitched outside the mantle edge',
        tris: '5000',
        bones: 'spine1/spine2, upperarm L/R, forearm L/R, neck. Choàng sao gắn spine2 và shoulder',
        spring: 'Tay áo rộng: 3 chuỗi × 3 xương mỗi bên. Choàng sao: 2 đuôi × 5 xương. Vạt sau: 2 chuỗi × 3 xương',
        notes: 'Mảnh XUYÊN SÁNG thứ nhất của bộ (choàng sao). Dựng choàng là lớp mỏng riêng; worker dùng alpha-test hoặc dither. Đạo bào lụa thì đặc.',
      },
      lop_duoi: {
        name: 'Lớp dưới',
        look: 'a long ivory-antique under-robe skirt with a soft wrap front and old-gold treasure-seal embroidery near the hem, an ink-night-blue inner hem layer slightly shorter, soft loose trousers underneath, thin old-gold hem trim',
        tris: '2000',
        bones: 'pelvis/hips, thigh L/R, calf L/R',
        spring: 'Vạt trước và sau: 2 chuỗi × 3 xương',
        notes: 'Vạt dài tới mắt cá, hai lớp, cả hai đặc, không xuyên sáng.',
      },
      vai_giap: {
        name: 'Vai nhẹ (cặp)',
        look: 'a light decorative shoulder piece pair: old-gold open scroll-lantern shaped shoulder caps with filigree edges and a small jade tablet inlay, a few hanging jade strips and small jade beads on short gold cords, mirrored left and right; elegant, regal and delicate, not heavy armor',
        tris: '1500',
        bones: 'clavicle/shoulder L/R (cứng)',
        spring: 'Thẻ ngọc và chuỗi hạt: 1 chuỗi × 3 xương mỗi bên',
        notes: 'Vai nhẹ, chỉ làm điểm nhấn, đỉnh không cao hơn vai quá 6 cm.',
      },
      dai_tua: {
        name: 'Đai, hộp báu và dải lụa',
        look: 'an ivory-antique sash belt with an old-gold clasp, a long thin ink-night-blue silk ribbon dotted with tiny gold stars tied in a soft bow hanging down one side (translucent silk), a small black-lacquer sealed treasure casket with gold corners, a jade tablet pendant and a small elixir gourd hanging from gold cords at the hip, jade bead tassels',
        tris: '1400',
        bones: 'hips/spine (đai cứng). Hộp báu, thẻ ngọc và hồ lô neo ở đai',
        spring: 'Dải lụa: 1 chuỗi × 5 xương. Hộp báu, thẻ ngọc và hồ lô: 2 chuỗi × 3 xương. Tua: 1 chuỗi × 3 xương',
        notes: 'Mảnh XUYÊN SÁNG thứ hai (dải lụa) và là mảnh cuối được phép trong suốt cho cả bộ. Hộp báu dựng riêng một phần mesh để dễ gắn xương.',
      },
      ung: {
        name: 'Ủng (cặp)',
        look: 'a pair of soft ankle-high ink-night-blue cloth-and-leather boots with old-gold trim bands, slightly upturned pointed toes with gold caps, jade-green stitching, a tiny gold seal ornament at the ankle',
        tris: '1200',
        bones: 'foot L/R, toe L/R, calf L/R (cứng)',
        spring: 'Không',
        notes: 'Ủng thấp, nhẹ nhất bộ. Không có ống cao.',
      },
      trang_suc_dau: {
        name: 'Trang sức đầu',
        look: 'a regal gold diadem holding a topknot: a gold crown band with a small raised tablet-shaped front crest set with one jade stone and one tiny star-purple gem, a front curtain of short hanging jade-bead strands (about six strands) falling from the crest front, one long gold hairpin with a jade tip, two short ivory ribbon tails at the back',
        tris: '700',
        bones: 'head (cứng). Ô trang sức đầu là ô trang bị thứ 9 (có thể ẩn/hiện)',
        spring: 'Rèm hạt ngọc: 1 chuỗi × 2 xương cho cả rèm. Dải sau: 1 chuỗi × 3 xương mỗi dải',
        notes: 'Chỉ diadem, trâm, dải; không có đầu, tóc hay mặt. Rèm hạt ngắn, không che mắt, tổng không quá 18 hạt.',
      },
    },
  },
};

export const SWORD = {
  name: 'Tinh Khuyết Kiếm (dạng cuối +10 và vỏ kiếm)',
  dir: 'prop',
  srcId: 'prop_kiem_tinh_khuyet',
  base: 'Dạng gốc dùng model #119 có sẵn (`prop_kiem_tinh_khuyet`). Concept này chỉ là dạng cuối +10 và vỏ. Dùng chung cho cả ba công pháp (không làm kiếm riêng cho Hộ pháp/Đan sư).',
  items: {
    cuoi: {
      name: 'Dạng cuối +10',
      look: 'the final awakened form of a star-sky sword: a long slender double-edged blade (about 1.15 times longer than a normal sword) made of dark star-purple crystal with tiny pale constellation dots and thin branching lines inside along the fuller (solid, opaque dark facets, not transparent), a razor silver edge catching light, a few tiered crystal spikes near the base, a widened crossguard of old gold swept backward like two long curved horns (claw-like, tips curling back toward the grip) with engraved star lines, a stylized star-shaped eye gem (an eight-point star inside an eye outline) at the center of the guard, thin curved filaments of old gold and pale violet metal wrapping around the guard like trailing energy arcs but sculpted solid, a dark leather-wrapped grip with old-gold rings, a faceted old-gold pommel with a small star',
      tris: '4000',
      bones: 'prop gắn bone `dtl_sword` (xương cầm kiếm); điểm gốc tại giữa chuôi, trục dọc theo lưỡi. Phát sáng là vật liệu riêng',
      spring: 'Không',
      notes: 'Tinh thể thể hiện bằng khối đặc tối màu có rãnh vân; KHÔNG dùng trong suốt thật. Chấm sao, nhãn cầu sao và tia linh khí tách thành mặt nạ phát sáng để worker điều khiển. Tia linh khí là các sợi kim loại cong dựng cứng quanh chắn (không phải hạt). Dạng gốc (#119) giữ cho +0…+9; dạng cuối thay lúc cường hóa +10. Dùng chung cho Kiếm tu, Hộ pháp, Đan sư.',
    },
    vo: {
      name: 'Vỏ kiếm',
      look: 'a matching scabbard for the Tinh Khuyet star-sky sword: ink-night lacquered wood body with fine old-gold constellation lines and tiny dots running down its length, an engraved old-gold mouth piece (throat) with a small curved horn on each side echoing the sword guard, a gold chape at the tip with a small star, two gold suspension rings, a short ivory-and-gold cord with a star tassel, shown fully closed (no blade visible)',
      tris: '1500',
      bones: 'prop gắn ổ cắm lưng (`dtl_scabbard_back`, tạo bởi T-1/T-2); khi rút kiếm thì vỏ ở lại lưng',
      spring: 'Dây tua: 1 chuỗi × 3 xương',
      notes: 'Vỏ dài vừa khớp lưỡi dạng gốc (#119), kín hoàn toàn. Cửa vỏ ở ngang vai khi đeo chéo lưng.',
    },
  },
};

const sheetBase = (set, layout) =>
  `Use case: stylized-concept. ONE landscape 3:2 character design sheet for a Chinese fantasy cultivation game, dark slate-grey parchment background with faint ink-wash texture, thin old-gold chamfered frames separating wordless panels. ${ORIGINAL}
Outfit: "${A(set.name)}" (${A(set.method)} set, tier-4 royal ancient-city theme), design: ${set.silhouette}. Embroidery/pattern motif: ${set.motif}.
Color channels (use exactly): main ${set.palette[0][1]} ${A(set.palette[0][2])}, secondary ${set.palette[1][1]} ${A(set.palette[1][2])}, trim ${set.palette[2][1]} old gold, small glow accent ${set.palette[3][1]} (tiny accent only).
${layout}
${STYLE}
${NOTEXT} The characters are calm idealized young cultivators (neutral expression, hair tied up in a topknot), not any real or fictional person.`;

export function build() {
  const out = {};
  for (const [sid, set] of Object.entries(SETS)) {
    out[`${sid}_sheet`] = {
      kind: 'sheet',
      set: sid,
      title: `${set.name}: bảng thiết kế (trước, sau, 3/4, bóc lớp, bảng màu, chất liệu)`,
      prompt: sheetBase(
        set,
        `Layout: ONE combined wordless design sheet in three zones. Left half: three full-length figures of the SAME cultivator (one figure, three views) wearing the full outfit, side by side: front view, back view (showing the long trailing mantle), and three-quarter view; standing neutral relaxed pose, equal scale, feet visible, each completely inside its panel with 5% margin. Top right quarter: an exploded layer breakdown on a neat grid with each garment piece drawn alone, ghost-form, no body: inner under-robe, outer robe or armor with mantle, shoulder armor pair, belt with tassels, boots pair, and head ornament. Bottom right quarter: left side a vertical palette of exactly four large flat rectangular swatches using the exact colors given, right side a 2x3 grid of round material sample spheres painted realistically (cloth, mantle fabric, metal, leather, stone or gem, thread). No writing anywhere.`,
      ),
    };
    for (const [pid, p] of Object.entries(set.pieces)) {
      out[`${sid}_${pid}`] = {
        kind: 'piece',
        set: sid,
        piece: pid,
        title: `${set.name}: ${p.name}`,
        prompt: `Use case: stylized-concept. ONE landscape 3:2 image showing exactly ONE single garment/armor piece, drawn TWICE side by side as a 3D-modeling reference sheet: left half the piece in strict front view, right half the same piece in three-quarter view (turned about 35 degrees, slightly from above). ${ORIGINAL}
The piece: ${p.look}. Belongs to the "${A(set.name)}" outfit; colors: main ${set.palette[0][1]}, secondary ${set.palette[1][1]}, trim old gold ${set.palette[2][1]}, tiny accent ${set.palette[3][1]}. Embroidery/pattern motif: ${set.motif}.
Show it ALONE as a clean product-concept render, floating with the natural shape it has when worn (as if on an invisible body), NO person, NO mannequin, NO head, NO hands, NO body parts, no other garment pieces, no weapons. Whole piece fully inside its half with 8% margin, the two views separated by a clear empty vertical gap in the exact center of the image.
Render: neutral soft even studio lighting from the front-left, no strong directional shadows, no color cast, plain light grey seamless background (#D8D8D8), no floor, no cast shadow. Cloth folds simple and readable, metal and gem materials clearly distinct, large shapes first, restrained fine detail suitable for image-to-3D.
${STYLE}
${NOTEXT}`,
      };
    }
  }
  for (const [iid, it] of Object.entries(SWORD.items)) {
    out[`kiem_tinh_khuyet_${iid}`] = {
      kind: 'sword',
      set: 'tinh_khuyet',
      piece: iid,
      title: `Tinh Khuyết Kiếm: ${it.name}`,
      prompt: `Use case: stylized-concept. ONE landscape 3:2 image of a single fantasy sword-related prop, drawn TWICE as a 3D-modeling reference: left half the whole item shown vertically, tip pointing up (front view, blade face on), right half a three-quarter view of the same item turned about 35 degrees with the hilt/guard or mouth area emphasised and fully visible. ${ORIGINAL}
The item: ${it.look}. Colors: ink-night #1E2335 and dark star-purple crystal #3A3366, old gold #B89B56, ivory #D9CFB6 accents, silver edge, tiny star-purple glow #8E80D8 only at the star dots, eye gem and filaments.
Show it ALONE: no hand, no person, no mannequin, no other weapon. Whole item fully inside its half with 6% margin, the two views separated by a clear empty vertical gap in the exact center of the image.
Render: neutral soft even studio lighting from the front-left, no color cast, plain light grey seamless background (#D8D8D8), no floor, no cast shadow, no glow bloom, no particles, no energy swirl.
${STYLE}
${NOTEXT}`,
    };
  }
  return out;
}
