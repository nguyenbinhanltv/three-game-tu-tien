// Dữ liệu concept trang phục Kết Đan (T-3). Nguồn duy nhất cho: outfit.json (gen.mjs outfit), docs/outfit-concepts/README.md, trang HTML xem nhanh.
// Chỉ lấy cảm hứng từ ảnh tham khảo (cấu trúc, tinh thần), không chép dáng, hoa văn, logo hay nhân vật nào.

export const ORIGINAL =
  'Original design for a Chinese fantasy cultivation game, not copied from any existing game, novel, artwork or character.';
export const STYLE =
  'Semi-realistic cinematic painterly rendering with hand-painted material detail, believable cloth folds, engraved metal, clear readable silhouette, muted misty-dawn palette overall but the outfit itself is slightly brighter and more eye-catching than the environment.';
export const A = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'); // prompt không chứa dấu tiếng Việt (tránh model vẽ chữ)
export const NOTEXT =
  'ABSOLUTELY NO text, letters, numbers, Chinese characters, captions, labels, watermark, logo, signature, UI icons with writing. Use only wordless graphic panels. No purple tint, no cel shading, no toon outlines, no anime chibi, no photograph, no glow bloom, no particles, no magic effects.';

export const SETS = {
  liet_mach: {
    name: 'Liệt Mạch Kiếm Y',
    method: 'Kiếm tu',
    element: 'Thổ/Kim (mạch đất nứt)',
    dir: 'chr',
    srcId: 'set_liet_mach_kiem_y',
    ref: 'ref-04 (áo khoác dài nền sáng, lót đậm, viền kim loại chạm, vai nhọn)',
    palette: [
      ['Chính (áo ngoài, vạt)', '#E6DDCB', 'ngà'],
      ['Phụ (lớp lót, đai, ủng)', '#9A4A32', 'đất son'],
      ['Viền (kim loại, vai giáp)', '#B07A3C', 'đồng cũ'],
      ['Nhấn phát sáng (vân mạch)', '#E8A33D', 'hổ phách, chỉ ở vân mạch'],
    ],
    materials:
      'Lụa dày dệt chéo (áo ngoài, sheen nhẹ theo chiều sợi) · vải đay mịn (lớp lót) · da thuộc son (đai, ủng) · đồng cũ chạm khắc, rỉ xanh nhẹ ở khe (vai giáp, khóa đai, mũi ủng) · hổ phách sáng đục (vân mạch trên đai và vai)',
    silhouette:
      'a tall slender swordsman look: a long ivory outer coat with high side slits, narrow and tidy at the torso, long trailing back panel that flares into a swallow-tail hem, wide sleeves with a cinnabar-earth lining visible at the cuffs, sharp angular bronze shoulder armor shaped like cracked cliff strata, a wide bronze-and-leather belt with thin glowing amber vein lines like cracks in rock, a jade-free design (no jade pendant), tall cinnabar leather boots with bronze toe caps, and a slim bronze hair crown with a short upswept amber-stone pin',
    motif:
      'branching crack-vein patterns (fault lines in rock) and layered stratified-stone chevrons, embroidered in darker ivory-gold thread on the coat hem and sleeves',
    pieces: {
      ao_ngoai: {
        name: 'Áo ngoài',
        look: 'a long ivory outer swordsman coat (dao pao): crossed collar, wide sleeves with cinnabar-earth lining cuffs, high side slits, long back panel ending in a swallow-tail hem, bronze-thread crack-vein embroidery along the hem and sleeve edges, thin cinnabar piping on the collar',
        tris: '5000',
        bones: 'spine1/spine2 (thân), upperarm L/R, forearm L/R, cổ áo gắn neck. Trọng số lấy từ thân nền',
        spring:
          'Tay áo: 2 chuỗi × 3 xương mỗi bên (cổ tay trở ra). Vạt sau: 3 chuỗi × 3 xương. Vạt xẻ tà hai bên: 1 chuỗi × 2 xương mỗi bên',
        notes:
          'Một mảnh liền, mặt ngoài lụa dày KHÔNG xuyên sáng. Phần lót cinnabar là lớp riêng thấy được ở cổ tay và xẻ tà. Mở thân dưới (hở) để lớp dưới thấy bên trong.',
      },
      lop_duoi: {
        name: 'Lớp dưới',
        look: 'wide-leg trousers in plain dark cinnabar-brown linen, with a front-and-back long ivory under-skirt panel (inner robe hem) split at the middle, tucked cinnabar-leather leg wraps below the knees, simple stitched hem trim in bronze thread',
        tris: '2000',
        bones: 'pelvis/hips, thigh L/R, calf L/R. Trọng số từ thân nền',
        spring: 'Vạt dưới trước và sau: 2 chuỗi × 2 xương (nhẹ, để vạt áo ngoài lướt lên)',
        notes: 'Quần và vạt áo trong tối giản để áo ngoài là điểm nhấn. Cần phủ kín đùi tới bắp chân để cắt vùng ẩn của thân nền.',
      },
      vai_giap: {
        name: 'Vai giáp',
        look: 'a matching pair of angular bronze shoulder armor plates (pauldrons) shaped like cracked cliff strata: three stacked overlapping plates rising to a sharp upward point, engraved crack-vein lines inlaid with thin amber glow, small bronze rivets, cinnabar leather strap tabs underneath, mirrored left and right',
        tris: '1500',
        bones: 'clavicle/shoulder L và R (cứng, không co giãn); một mảnh có hai nửa đối xứng',
        spring: 'Không. Mảnh cứng',
        notes:
          'Hai nửa đối xứng gửi cùng một ảnh (chỉ cần dựng một bên rồi lật). Vân hổ phách đặt làm vật liệu riêng (mặt nạ phát sáng) để worker bật theo cấp cường hóa.',
      },
      dai_tua: {
        name: 'Đai và tua',
        look: 'a wide cinnabar leather belt with a large rectangular bronze buckle plate engraved with branching crack veins and a small amber stone in the center, a second thinner sash knot at the side, two hanging braided cords ending in amber-bead tassels of different lengths, no jade ring',
        tris: '1200',
        bones: 'đai: hips/spine (cứng, quấn quanh eo). Tua: neo ở đai',
        spring: 'Tua: 2 chuỗi × 4 xương. Dải thắt nút: 1 chuỗi × 3 xương',
        notes: 'Đai là vòng kín quanh eo, độ dày ~2 cm, để pipeline lồng đệm. Tua và dải để rời mesh để gắn xương lò xo.',
      },
      ung: {
        name: 'Ủng',
        look: 'a pair of tall cinnabar leather riding boots reaching below the knee, bronze-capped pointed toes, bronze strap buckles and a thin engraved bronze band along the top edge, subtle stratified-stone stitching, stylish but practical for a swordsman',
        tris: '1300',
        bones: 'foot L/R, toe L/R, calf L/R (cứng; ống ủng bám bắp chân)',
        spring: 'Không',
        notes: 'Đế phẳng, đặt chân đúng trục xương chân. Phần miệng ủng đủ rộng để lớp dưới chui vào.',
      },
      trang_suc_dau: {
        name: 'Trang sức đầu',
        look: 'a slim bronze hair crown (guan) that holds a topknot: a small tapered bronze cap with engraved crack-vein lines, one long bronze hairpin passing through it ending in an amber stone, two short cinnabar ribbon tails hanging at the back',
        tris: '700',
        bones: 'head (cứng). Ô trang sức đầu là ô trang bị MỚI (thứ 9, có thể ẩn/hiện)',
        spring: 'Dải ruy băng sau: 1 chuỗi × 3 xương mỗi dải',
        notes:
          'Chỉ có quan, trâm, dải. KHÔNG có đầu, tóc hay mặt: tóc thuộc model nhân vật gốc. Tâm quan đặt ở đỉnh đầu, nhìn từ trên xuống phải gọn trong vòng tròn đường kính ~8 cm.',
      },
    },
  },
  dia_long: {
    name: 'Địa Long Hộ Giáp',
    method: 'Hộ pháp',
    element: 'Thổ',
    dir: 'chr',
    srcId: 'set_dia_long_ho_giap',
    ref: 'ref-05 (dáng nặng, vai to, váy nhiều tầng), nhưng bằng vảy đá thay lông vũ',
    palette: [
      ['Chính (giáp thân, váy giáp)', '#244A3E', 'ngọc bích sẫm'],
      ['Phụ (đá, lớp lót, ủng)', '#7B817D', 'đá xám'],
      ['Viền (kim loại, vảy)', '#B59A55', 'vàng cổ'],
      ['Nhấn phát sáng (khe vảy)', '#D9A441', 'vàng đất, chỉ ở khe vảy'],
    ],
    materials:
      'Vảy đá mài nhám (vai, giáp ngực) · thép đen rèn thủ công (khung giáp) · vàng cổ xỉn chạm khắc (viền vảy, khóa) · vải len dệt dày ngọc bích sẫm (lớp trong, váy) · da thuộc tối (đai, ủng) · đá nhám xám (sừng quan)',
    silhouette:
      'a heavy guardian look: huge layered shoulders made of overlapping stone dragon scales, a half-breastplate of dark jade scale armor over a thick dark jade-green tunic, a tiered armored skirt of overlapping scale plates reaching the knees, thick stone-grey bracers, a broad belt with a dragon-head clasp in old gold, heavy stone-grey boots with scale-plated shins, and a helm-crown with two short swept-back stone dragon horns',
    motif: 'overlapping dragon scales and coiled earth-dragon spine ridges, engraved in old gold lines on the dark jade and stone grey',
    pieces: {
      ao_ngoai: {
        name: 'Áo ngoài (giáp thân)',
        look: 'a heavy guardian chest armor over a thick dark jade-green tunic: a half-breastplate of overlapping dark jade scale plates with old gold edging and a central ridged spine line, gold-lined stone-grey collar, short wide dark jade sleeves, a gold dragon-spine ridge running down the center chest, no skirt included',
        tris: '5000',
        bones: 'spine1/spine2 (giáp ngực cứng gắn spine2), upperarm L/R (tay áo ngắn), neck. Trọng số từ thân nền',
        spring: 'Gần như không: 1 chuỗi × 2 xương cho vạt vải dưới giáp ngực. Giáp ngực cứng',
        notes:
          'Giáp ngực là khối cứng, vải tunic bên dưới là phần mềm. Để nửa dưới thân hở cho lớp dưới. Vảy phải là khối nổi thật, không phải họa tiết.',
      },
      lop_duoi: {
        name: 'Lớp dưới (váy giáp)',
        look: 'a tiered armored skirt: three overlapping rows of dark jade scale plates with old gold edging hanging from a belt line to the knees, split at the front and back for walking, thick dark jade wool trousers underneath tucked into the boots, small stone-grey knee guards',
        tris: '2000',
        bones: 'pelvis/hips, thigh L/R. Các tầng váy gắn pelvis, trọng số mềm về thigh',
        spring: 'Mỗi tầng váy 1 xương treo (3 tầng × 2 bên, tổng ~8 xương), biên độ nhỏ cho giáp nặng',
        notes: 'Các tầng váy là tấm cứng đặt chồng lên nhau, có khoảng hở nhỏ giữa tầng để xương xoay. Không dùng vải xuyên sáng.',
      },
      vai_giap: {
        name: 'Vai giáp',
        look: 'a matching pair of huge shoulder guards built from overlapping stone dragon scales in dark jade and stone grey with old gold edging, rising in a sweeping crest like a coiled earth dragon head over each shoulder, three descending tiers hanging over the upper arm, mirrored left and right',
        tris: '2200',
        bones: 'clavicle/shoulder L/R (cứng); tầng dưới nối upperarm L/R',
        spring: 'Không. Tầng dưới có 1 xương xoay nhẹ theo cánh tay',
        notes: 'Vai to nhất trong ba bộ, đỉnh cao hơn vai ~15 cm. Kiểm tra không đâm vào cổ khi giơ tay, để pipeline tạo lồng đệm.',
      },
      dai_tua: {
        name: 'Đai và tua',
        look: 'a broad dark leather belt with a large old-gold dragon-head clasp, studded stone-grey side plates, a hanging short apron tassel of braided cord with a small carved stone-dragon charm, thick cord tassels',
        tris: '1500',
        bones: 'hips/spine (cứng). Tua và charm neo ở đai',
        spring: 'Tua và charm: 2 chuỗi × 3 xương',
        notes: 'Đai dày 3 cm vì giáp nặng. Đầu rồng ở khóa là điểm nhận diện bộ.',
      },
      ung: {
        name: 'Ủng',
        look: 'a pair of heavy stone-grey boots with dark jade scale-plated shins, old gold trim bands at the ankle and top, thick reinforced toe caps carved like stone claws, wide sturdy sole',
        tris: '1500',
        bones: 'foot L/R, toe L/R, calf L/R (cứng)',
        spring: 'Không',
        notes: 'Ủng nặng nhưng ống không được to hơn bắp chân quá 30% để vừa dáng hai giới.',
      },
      trang_suc_dau: {
        name: 'Trang sức đầu',
        look: 'a stone-grey helm-crown (circlet style, open face, no visor): a band with old gold edging and a center scale crest, two short swept-back stone dragon horns on the sides with gold tips, a small dark jade gem at the forehead',
        tris: '700',
        bones: 'head (cứng). Ô trang sức đầu là ô trang bị MỚI (thứ 9, có thể ẩn/hiện)',
        spring: 'Không',
        notes: 'Chỉ có vòng quan và sừng, để hở mặt và tóc. Sừng ngắn, hướng ra sau, không vượt quá 12 cm.',
      },
    },
  },
  phuc_mach: {
    name: 'Phục Mạch Đan Bào',
    method: 'Đan sư',
    element: 'Mộc',
    dir: 'chr',
    srcId: 'set_phuc_mach_dan_bao',
    ref: 'ref-01 và ref-06 (lớp voan, tay áo lụa mỏng), hồ lô bên hông',
    palette: [
      ['Chính (áo ngoài, voan)', '#EDE6D2', 'ngà'],
      ['Phụ (lớp lót, đai)', '#A8D6C2', 'xanh ngọc nhạt'],
      ['Viền (kim loại, trâm)', '#C4CCCA', 'bạc'],
      ['Nhấn (thêu lá thuốc)', '#5FA58A', 'lục thảo, chỉ ở họa tiết thêu'],
    ],
    materials:
      'Lụa mịn bóng nhẹ (áo ngoài) · voan mỏng xuyên sáng (choàng và dải lụa, tối đa 2 mảnh trong suốt cho cả bộ) · vải đay thêu (lớp lót) · bạc chạm khắc (trâm, khóa đai, viền) · hồ lô đan tre phủ sơn (treo đai) · ngọc lục nhạt (hạt tua, lá trâm)',
    silhouette:
      'a graceful alchemist look: a wide ivory robe with very wide sleeves and an inner pale jade-green robe, a long translucent gauze shawl draped over the shoulders and trailing behind, a pale jade sash belt tied with a long silk ribbon, a small woven gourd and herb pouch hanging at the hip, soft slippers-style boots with silver trim, and a leaf-shaped jade-and-silver hairpin; embroidery of medicinal herb leaves on the hem',
    motif: 'embroidered medicinal-herb leaves and vines with tiny seed pods in jade-green thread on the hem, cuffs and shawl border',
    pieces: {
      ao_ngoai: {
        name: 'Áo ngoài (đạo bào + voan choàng)',
        look: 'a wide ivory alchemist robe with crossed collar and very wide flowing sleeves, a pale jade-green inner collar visible, herb-leaf embroidery on the hem and cuffs, and a long translucent gauze shawl draped across both shoulders and falling behind in two soft tails with a thin silver-thread border',
        tris: '5000',
        bones: 'spine1/spine2, upperarm L/R, forearm L/R, neck. Voan choàng gắn spine2 và shoulder',
        spring: 'Tay áo rộng: 3 chuỗi × 3 xương mỗi bên. Voan choàng: 2 đuôi × 4 xương. Vạt sau: 2 chuỗi × 3 xương',
        notes:
          'Đây là mảnh XUYÊN SÁNG thứ nhất của bộ (voan). Dựng voan là lớp mỏng riêng; worker dùng alpha-test hoặc dither. Phần đạo bào lụa thì đặc.',
      },
      lop_duoi: {
        name: 'Lớp dưới',
        look: 'a long pale jade-green under-robe skirt with a soft wrap front, an ivory inner hem layer slightly longer than the jade layer, soft loose trousers underneath, herb-leaf embroidery in jade thread along the lower hem',
        tris: '2000',
        bones: 'pelvis/hips, thigh L/R, calf L/R',
        spring: 'Vạt trước và sau: 2 chuỗi × 3 xương',
        notes: 'Vạt dài tới mắt cá, hai lớp (xanh ngọc ngắn hơn ngà). Cả hai đặc, không xuyên sáng.',
      },
      vai_giap: {
        name: 'Vai giáp (vai nhẹ)',
        look: 'a light decorative shoulder piece pair: curved silver filigree leaf-shaped shoulder caps with pale jade inlay, a few hanging jade bead strings, and small herb-leaf shaped silver plates, mirrored left and right; elegant and delicate, not heavy armor',
        tris: '1500',
        bones: 'clavicle/shoulder L/R (cứng)',
        spring: 'Chuỗi hạt ngọc: 1 chuỗi × 3 xương mỗi bên',
        notes: 'Vai của đan sư nhẹ nhất ba bộ: chỉ làm điểm nhấn, đỉnh không cao hơn vai quá 6 cm.',
      },
      dai_tua: {
        name: 'Đai, hồ lô và dải lụa',
        look: 'a pale jade sash belt with a small silver clasp, a long thin silk ribbon tied in a soft bow hanging down one side (translucent ivory silk), a small woven bamboo gourd (hu lu) lacquered deep green and a tiny herb pouch hanging from silver cords at the hip, jade bead tassels',
        tris: '1400',
        bones: 'hips/spine (đai cứng). Hồ lô và túi neo ở đai',
        spring: 'Dải lụa: 1 chuỗi × 5 xương. Hồ lô và túi: 2 chuỗi × 3 xương. Tua: 1 chuỗi × 3 xương',
        notes:
          'Đây là mảnh XUYÊN SÁNG thứ hai (dải lụa mỏng) và cũng là mảnh cuối cùng được phép trong suốt cho cả bộ. Hồ lô dựng riêng một phần mesh để dễ gắn xương.',
      },
      ung: {
        name: 'Ủng',
        look: 'a pair of soft ankle-high ivory cloth-and-leather boots with silver trim bands and slightly upturned pointed toes, pale jade stitching, a tiny herb-leaf silver ornament at the ankle',
        tris: '1200',
        bones: 'foot L/R, toe L/R, calf L/R (cứng)',
        spring: 'Không',
        notes: 'Ủng thấp, nhẹ nhất ba bộ. Không có ống cao.',
      },
      trang_suc_dau: {
        name: 'Trang sức đầu',
        look: 'a leaf-shaped hairpin and hair ornament set: a silver circlet-style hair clip holding a topknot, one tall hairpin with a leaf-shaped pale jade tip, two thin silver chains with tiny jade beads hanging on one side, two short ivory silk ribbon tails at the back',
        tris: '700',
        bones: 'head (cứng). Ô trang sức đầu là ô trang bị MỚI (thứ 9, có thể ẩn/hiện)',
        spring: 'Chuỗi hạt: 2 chuỗi × 3 xương. Dải sau: 1 chuỗi × 3 xương mỗi dải',
        notes: 'Chỉ trâm, kẹp và dây; không có đầu hay tóc. Hạt ngọc nhỏ, tổng không quá 12 hạt để giữ tam giác.',
      },
    },
  },
};

export const SWORD = {
  name: 'Kiếm Liệt Mạch (dạng cuối +10 và vỏ kiếm)',
  dir: 'prop',
  srcId: 'prop_kiem_liet_mach',
  base: 'Dạng gốc dùng model #119 có sẵn (`prop_kiem_liet_mach`). Concept này chỉ là dạng cuối và vỏ.',
  items: {
    cuoi: {
      name: 'Dạng cuối +10',
      look: 'the final awakened form of an earth-vein sword: a long slender double-edged blade (about 1.15 times longer than a normal sword) made of dark translucent crystal with branching glowing amber crack-veins running inside along the fuller, a razor silver edge catching light, tiered crystal spikes near the base, a widened crossguard swept upward like cliff strata wings in dark aged bronze with engraved crack lines and an amber gem eye at the center, a dark leather-wrapped grip with bronze rings, a faceted bronze pommel',
      tris: '4000',
      bones: 'prop gắn bone `dtl_sword` (xương cầm kiếm); điểm gốc tại giữa chuôi, trục dọc theo lưỡi. Phát sáng là vật liệu riêng',
      spring: 'Không',
      notes:
        'Tinh thể thể hiện bằng khối đặc tối màu có rãnh vân; KHÔNG dùng trong suốt thật. Vân hổ phách tách thành mặt nạ phát sáng để worker điều khiển. Dạng gốc (#119) vẫn giữ cho +0…+9; dạng cuối thay lúc cường hóa +10.',
    },
    vo: {
      name: 'Vỏ kiếm',
      look: 'a matching scabbard for the Liet Mach earth-vein sword: dark cinnabar-lacquered wood body, engraved bronze mouth piece (chape) and tip, two bronze suspension rings, thin amber-veined inlay lines running down the length like cracks in rock, a short ivory-and-bronze cord with a tassel, shown fully closed (no blade visible)',
      tris: '1500',
      bones: 'prop gắn ổ cắm lưng (`dtl_scabbard_back`, tạo bởi T-1/T-2); khi rút kiếm thì vỏ ở lại lưng',
      spring: 'Dây tua: 1 chuỗi × 3 xương',
      notes: 'Vỏ dài vừa khớp lưỡi dạng gốc (#119), kín hoàn toàn. Cửa vỏ ở ngang vai khi đeo chéo lưng.',
    },
  },
};

export const sheetBase = (set, extra) =>
  `Use case: stylized-concept. ONE landscape 3:2 character design sheet for a Chinese fantasy cultivation game, dark slate-grey parchment background with faint ink-wash texture, thin bronze chamfered frames separating wordless panels. ${ORIGINAL}
Outfit: "${A(set.name)}" (${set.method} set, ${set.element}), design: ${set.silhouette}. Embroidery/pattern motif: ${set.motif}.
Color channels (use exactly): main ${set.palette[0][1]} ${set.palette[0][2]}, secondary ${set.palette[1][1]} ${set.palette[1][2]}, trim ${set.palette[2][1]} ${set.palette[2][2]}, small glow accent ${set.palette[3][1]} ${set.palette[3][2]}.
${extra}
${STYLE}
${NOTEXT} The characters are calm idealized young cultivators (neutral expression, hair tied up in a topknot or simple style), not any real or fictional person.`;

export function build() {
  return buildFrom(SETS, SWORD);
}

export function buildFrom(SETS, SWORD) {
  const out = {};
  for (const [sid, set] of Object.entries(SETS)) {
    out[`${sid}_views`] = {
      kind: 'sheet',
      set: sid,
      title: `${set.name}: ba góc nhìn nam và nữ`,
      prompt: sheetBase(
        set,
        `Layout: two rows. Top row: the MALE cultivator wearing the full outfit in three full-body views side by side: front, three-quarter side, back. Bottom row: the FEMALE cultivator in the same outfit (slightly adapted cut, same design language) in three full-body views: front, three-quarter side, back. Six full-length figures standing in a neutral relaxed pose, equal scale, feet visible, each figure completely inside its panel with 5% margin, consistent lighting from front-left, empty dark background.`,
      ),
    };
    out[`${sid}_layers`] = {
      kind: 'sheet',
      set: sid,
      title: `${set.name}: bóc lớp áo`,
      prompt: sheetBase(
        set,
        `Layout: an exploded layer breakdown on a neat grid, with each garment piece drawn alone (no body, no person, ghost-form), separated by gaps: inner under-robe and trousers, outer robe or armor, lower skirt or under-layer, shoulder armor pair, belt with tassels and hanging accessories, boots pair, and head ornament (crown, hairpin). Top row shows the MALE cut, bottom row shows the FEMALE cut of the same pieces. Each piece shown from the front, same scale per row, wordless, plain dark background.`,
      ),
    };
    out[`${sid}_detail`] = {
      kind: 'sheet',
      set: sid,
      title: `${set.name}: chi tiết, bảng màu, chất liệu`,
      prompt: sheetBase(
        set,
        `Layout: a wordless detail board. Left two thirds: a 3x2 grid of six close-up painted detail panels: (1) embroidered pattern on the fabric, (2) engraved metal trim and edge, (3) shoulder armor close-up, (4) belt buckle and tassels, (5) boot close-up, (6) head ornament close-up. Right third, top: a vertical color palette of exactly four large flat rectangular swatches (main, secondary, trim, glow accent) stacked, using the exact colors given, with no writing. Right third, bottom: a 2x3 grid of round material sample spheres, painted realistically: the cloth, the gauze or leather, the metal, the stone or gem, the lacquer or wood, the thread, no writing.`,
      ),
    };
    for (const [pid, p] of Object.entries(set.pieces)) {
      out[`${sid}_${pid}`] = {
        kind: 'piece',
        set: sid,
        piece: pid,
        title: `${set.name}: ${p.name}`,
        prompt: `Use case: stylized-concept. ONE landscape 3:2 image showing exactly ONE single garment/armor piece, drawn TWICE side by side as a 3D-modeling reference sheet: left half the piece in strict front view, right half the same piece in three-quarter view (turned about 35 degrees, slightly from above). ${ORIGINAL}
The piece: ${p.look}. Belongs to the "${A(set.name)}" outfit; colors: main ${set.palette[0][1]}, secondary ${set.palette[1][1]}, trim ${set.palette[2][1]}, tiny glow accent ${set.palette[3][1]}. Embroidery/pattern motif: ${set.motif}.
Show it ALONE as a clean product-concept render, floating with the natural shape it has when worn (as if on an invisible body), NO person, NO mannequin, NO head, NO hands, NO body parts, no other garment pieces, no weapons. Whole piece fully inside its half with 8% margin.
Render: neutral soft even studio lighting from the front-left, no strong directional shadows, no color cast, plain light grey seamless background (#D8D8D8), no floor, no cast shadow. Cloth folds simple and readable, metal and gem materials clearly distinct, large shapes first, restrained fine detail suitable for image-to-3D.
${STYLE}
${NOTEXT}`,
      };
    }
  }
  for (const [iid, it] of Object.entries(SWORD.items)) {
    out[`kiem_${SWORD.id ?? 'liet_mach'}_${iid}`] = {
      kind: 'sword',
      set: SWORD.id ?? 'liet_mach',
      piece: iid,
      title: `${SWORD.short ?? 'Kiếm Liệt Mạch'}: ${it.name}`,
      prompt: `Use case: stylized-concept. ONE landscape 3:2 image of a single fantasy sword-related prop, drawn TWICE as a 3D-modeling reference: left half the whole item shown vertically, tip pointing up (front view, blade face on), right half a three-quarter view of the same item turned about 35 degrees with the hilt/guard or mouth area emphasised and fully visible. ${ORIGINAL}
The item: ${it.look}. ${SWORD.colors ?? 'Colors: dark aged bronze #B07A3C and cinnabar #9A4A32, ivory #E6DDCB accents, silver edge, amber glow #E8A33D only in the vein lines and the gem.'}
Show it ALONE: no hand, no person, no mannequin, no other weapon. Whole item fully inside the frame with 6% margin.
Render: neutral soft even studio lighting from the front-left, no color cast, plain light grey seamless background (#D8D8D8), no floor, no cast shadow, no glow bloom, no particles, no energy swirl.
${STYLE}
${NOTEXT}`,
    };
  }
  return out;
}
