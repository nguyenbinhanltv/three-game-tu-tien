// Dữ liệu concept trang phục Nguyên Anh bậc 3 (gói P2-concept). Cùng khuôn với outfit-data.mjs (Kết Đan), dùng buildFrom chung.
// Chủ đề bậc 3: voan xuyên sáng, gương, bạc lạnh, quan đầu; Vân Hải / Kính Nguyệt. Chỉ lấy cảm hứng, không chép dáng, hoa văn, logo hay nhân vật nào.
import { buildFrom } from './outfit-data.mjs';

export const SETS = {
  kinh_quang: {
    name: 'Kính Quang Kiếm Y',
    method: 'Kiếm tu',
    element: 'Kim (gương, ánh bạc)',
    dir: '3d/nhan-vat',
    srcId: 'set_kinh_quang_kiem_y',
    ref: 'ref-04 (áo khoác dài nền sáng, lót đậm, viền kim loại) và ref-01/02 (tay áo voan xuyên sáng); dáng tham chiếu: mẫu #119 Kính Quang',
    palette: [
      ['Chính (áo ngoài, vạt)', '#ECEFF1', 'trắng bạc'],
      ['Phụ (lớp lót, đai, ủng)', '#5E8FA8', 'lam gương'],
      ['Viền (kim loại, vai giáp)', '#BFC8CF', 'bạc lạnh'],
      ['Nhấn phát sáng (mép gương)', '#8FD8E8', 'lam băng, chỉ ở mép gương và vân bạc'],
    ],
    materials:
      'Lụa trắng bạc dệt chéo, bóng nhẹ (áo ngoài) · voan mỏng xuyên sáng (nửa dưới tay áo, tối đa 2 mảnh trong suốt cho cả bộ) · vải đay lam gương (lớp lót) · bạc lạnh chạm khắc, đánh bóng như gương (vai giáp, hộ uyển, khóa đai, mũi ủng) · mảnh gương bạc tròn (khóa đai, tâm vai) · ngọc lam nhạt (hạt tua)',
    silhouette:
      'a tall elegant swordsman look: a long white-silver outer coat with high side slits, narrow at the torso, a long back panel with a swallow-tail hem, wide sleeves whose lower half is a sheer translucent gauze that flows and catches light, a pale mirror-blue inner collar and lining, a leaf-shaped polished silver mirror pauldron on each shoulder, polished silver bracers, a mirror-blue sash belt with a round silver mirror disc clasp and a short tassel with a pale blue bead, tall white boots with silver trim lines, and a slim silver hair crown (guan) with a small mirror disc at the front and a long silver pin',
    motif:
      'faint cloud-sea wave swirls and thin radiating mirror-ray lines, woven tone-on-tone in pale silver-blue on the coat hem and sleeve gauze',
    pieces: {
      ao_ngoai: {
        name: 'Áo ngoài',
        look: 'a long white-silver outer swordsman coat: crossed high collar with mirror-blue lining visible, narrow torso, high side slits, long back panel ending in a swallow-tail hem, wide sleeves whose lower half is a sheer translucent gauze with a thin silver piping edge, tone-on-tone cloud-wave swirl pattern along the hem',
        tris: '5000',
        bones: 'spine1/spine2 (thân), upperarm L/R, forearm L/R, cổ áo gắn neck. Trọng số lấy từ thân nền',
        spring:
          'Tay áo voan: 2 chuỗi × 4 xương mỗi bên (nửa dưới tay áo). Vạt sau: 3 chuỗi × 3 xương. Vạt xẻ tà hai bên: 1 chuỗi × 2 xương mỗi bên',
        notes:
          'Đây là mảnh XUYÊN SÁNG thứ nhất của bộ: nửa dưới tay áo là lớp voan mỏng riêng (dựng như vải mỏng đặc, worker đổi sang alpha-test hoặc dither). Thân áo lụa đặc. Mở thân dưới (hở) cho lớp dưới thấy bên trong.',
      },
      lop_duoi: {
        name: 'Lớp dưới',
        look: 'wide-leg trousers in plain pale mirror-blue linen with a long white inner under-skirt panel split at the middle front and back, white leg wraps below the knees, thin silver stitched hem trim, simple and tidy',
        tris: '2000',
        bones: 'pelvis/hips, thigh L/R, calf L/R. Trọng số từ thân nền',
        spring: 'Vạt dưới trước và sau: 2 chuỗi × 2 xương',
        notes:
          'Quần và vạt trong tối giản để áo ngoài là điểm nhấn. Phủ kín đùi tới bắp chân để cắt vùng ẩn của thân nền. Đặc, không xuyên sáng.',
      },
      vai_giap: {
        name: 'Vai giáp',
        look: 'a matching pair of polished silver mirror pauldrons: each a fan of overlapping leaf-shaped mirror-polished silver plates rising to an upward point, thin engraved cloud-wave lines on the edges, one small round mirror disc inlaid at the center, mirror-blue leather strap tabs underneath, mirrored left and right',
        tris: '1500',
        bones: 'clavicle/shoulder L và R (cứng, không co giãn); một mảnh có hai nửa đối xứng',
        spring: 'Không. Mảnh cứng',
        notes:
          'Hai nửa đối xứng, chỉ cần dựng một cặp. Bạc đánh bóng như gương: worker bật phản chiếu giả. Mép lam băng là vật liệu phát sáng riêng.',
      },
      dai_tua: {
        name: 'Đai và tua',
        look: 'a mirror-blue sash belt wrapped twice with a round polished silver mirror disc clasp framed by a thin engraved silver ring, a second thin white sash knot at the side, two hanging cords ending in pale blue bead tassels of different lengths, a small silver mirror charm',
        tris: '1300',
        bones: 'đai: hips/spine (cứng, quấn quanh eo). Tua: neo ở đai',
        spring: 'Tua: 2 chuỗi × 4 xương. Dải thắt nút: 1 chuỗi × 3 xương',
        notes:
          'Đai là vòng kín quanh eo, dày ~2 cm để pipeline lồng đệm. Tua và dải để rời mesh gắn xương lò xo. Gương tròn ở khóa là điểm nhận diện của bộ.',
      },
      ung: {
        name: 'Ủng',
        look: 'a pair of tall white leather riding boots reaching below the knee, polished silver pointed toe caps, thin silver engraved bands along the top edge and ankle, a pale mirror-blue stitched wave line along the shaft, sleek and elegant',
        tris: '1300',
        bones: 'foot L/R, toe L/R, calf L/R (cứng; ống ủng bám bắp chân)',
        spring: 'Không',
        notes: 'Đế phẳng, đặt chân đúng trục xương chân. Miệng ủng đủ rộng để lớp dưới chui vào.',
      },
      trang_suc_dau: {
        name: 'Trang sức đầu',
        look: 'a slim polished silver hair crown (guan) holding a topknot: a small tapered silver cap with engraved cloud-wave lines and a small round mirror disc at the front, one long silver hairpin with a pale blue stone tip passing through it, two short pale mirror-blue ribbon tails hanging at the back',
        tris: '800',
        bones: 'head (cứng). Ô trang sức đầu là ô trang bị MỚI (thứ 9, có thể ẩn/hiện)',
        spring: 'Dải ruy băng sau: 1 chuỗi × 3 xương mỗi dải',
        notes:
          'Chỉ có quan, trâm, dải. KHÔNG có đầu, tóc hay mặt: tóc thuộc model nhân vật gốc. Gọn trong vòng tròn ~8 cm nhìn từ trên xuống.',
      },
    },
  },
  van_kinh: {
    name: 'Vân Kình Thiết Giáp',
    method: 'Hộ pháp',
    element: 'Thủy/Kim (kình ngư trong biển mây)',
    dir: '3d/nhan-vat',
    srcId: 'set_van_kinh_thiet_giap',
    ref: 'ref-05 (dáng nặng, vai to, váy nhiều tầng) nhưng bằng thép lạnh và vảy kình ngư biển mây; kế thừa khối nặng của Địa Long ở bậc 2',
    palette: [
      ['Chính (giáp thân, váy giáp)', '#3E4F63', 'thép xanh sương'],
      ['Phụ (lớp lót, ủng, vải)', '#D9DEE2', 'trắng mây'],
      ['Viền (kim loại, vảy)', '#B9C2CA', 'bạc lạnh'],
      ['Nhấn phát sáng (khe vảy, sóng)', '#7FC6DC', 'lam sóng, chỉ ở khe vảy'],
    ],
    materials:
      'Thép xanh sương rèn, đánh nhám mờ (giáp ngực, vai, váy giáp) · bạc lạnh chạm sóng mây (viền vảy, khóa) · vải len dệt dày trắng mây (lớp trong) · da thuộc xám xanh (đai, ủng) · vây bạc kình (quan) · khe vảy phát sáng lam sóng',
    silhouette:
      'a heavy guardian look in cold steel: huge layered pauldrons of overlapping steel whale-scale plates swept like rolling wave crests with a whale-fluke tip over each shoulder, a half-breastplate of blue-grey steel scale armor with a central ridge over a thick cloud-white wool tunic, a tiered armored skirt of overlapping plates reaching the knees with a thin silver wave edge, wide steel bracers, a broad belt with a stylized whale-head silver clasp, heavy grey-blue boots with plated shins, and a helm-crown with a swept-back silver whale-fin crest',
    motif: 'overlapping whale scales and rolling cloud-sea wave crests, engraved in thin cold-silver lines on blue-grey steel',
    pieces: {
      ao_ngoai: {
        name: 'Áo ngoài (giáp thân)',
        look: 'a heavy guardian chest armor over a thick cloud-white wool tunic: a half-breastplate of overlapping blue-grey steel whale-scale plates with cold silver edging and a central ridged spine line, silver-lined high steel collar, short wide tunic sleeves, a silver wave-crest ornament on the chest, no skirt included',
        tris: '5000',
        bones: 'spine1/spine2 (giáp ngực cứng gắn spine2), upperarm L/R (tay áo ngắn), neck. Trọng số từ thân nền',
        spring: 'Gần như không: 1 chuỗi × 2 xương cho vạt vải dưới giáp ngực. Giáp ngực cứng',
        notes:
          'Giáp ngực là khối cứng, vải tunic bên dưới là phần mềm. Để nửa dưới thân hở cho lớp dưới. Vảy phải là khối nổi thật, không phải họa tiết. Đặc hoàn toàn.',
      },
      lop_duoi: {
        name: 'Lớp dưới (váy giáp)',
        look: 'a tiered armored skirt: three overlapping rows of blue-grey steel scale plates with thin cold-silver edging hanging from a belt line to the knees, split at the front and back for walking, thick cloud-white wool trousers underneath tucked into the boots, small steel knee guards',
        tris: '2000',
        bones: 'pelvis/hips, thigh L/R. Các tầng váy gắn pelvis, trọng số mềm về thigh',
        spring: 'Mỗi tầng váy 1 xương treo (3 tầng × 2 bên, tổng ~8 xương), biên độ nhỏ cho giáp nặng',
        notes: 'Các tầng váy là tấm cứng chồng lên nhau, khoảng hở nhỏ giữa tầng để xương xoay. Không xuyên sáng.',
      },
      vai_giap: {
        name: 'Vai giáp',
        look: 'a matching pair of huge shoulder guards built from overlapping blue-grey steel whale-scale plates, rising in a sweeping rolling-wave crest that ends in a whale-fluke tip over each shoulder, three descending tiers hanging over the upper arm, cold silver wave-line edging, mirrored left and right',
        tris: '2200',
        bones: 'clavicle/shoulder L/R (cứng); tầng dưới nối upperarm L/R',
        spring: 'Không. Tầng dưới có 1 xương xoay nhẹ theo cánh tay',
        notes: 'Vai to nhất ba bộ bậc 3, đỉnh cao hơn vai ~15 cm. Kiểm tra không đâm vào cổ khi giơ tay, để pipeline tạo lồng đệm.',
      },
      dai_tua: {
        name: 'Đai và tua',
        look: 'a broad grey-blue leather belt with a large cold-silver stylized whale-head clasp, studded steel side plates, a short hanging apron of braided cord with a small silver whale-fluke charm and cloud-white cord tassels',
        tris: '1400',
        bones: 'hips/spine (cứng). Tua và charm neo ở đai',
        spring: 'Tua và charm: 2 chuỗi × 3 xương',
        notes: 'Đai dày 3 cm vì giáp nặng. Đầu kình ngư ở khóa là điểm nhận diện bộ.',
      },
      ung: {
        name: 'Ủng',
        look: 'a pair of heavy grey-blue boots with blue-grey steel scale-plated shins, cold silver trim bands at the ankle and top, thick reinforced toe caps shaped like whale-fluke tips, wide sturdy sole',
        tris: '1400',
        bones: 'foot L/R, toe L/R, calf L/R (cứng)',
        spring: 'Không',
        notes: 'Ủng nặng nhưng ống không được to hơn bắp chân quá 30% để vừa dáng hai giới.',
      },
      trang_suc_dau: {
        name: 'Trang sức đầu',
        look: 'a cold-steel helm-crown (circlet style, open face, no visor): a band with cold silver edging and a center scale crest, a swept-back silver whale-fin crest at the back and two short swept-back fin horns on the sides with pale tips, a small pale blue gem at the forehead',
        tris: '700',
        bones: 'head (cứng). Ô trang sức đầu là ô trang bị MỚI (thứ 9, có thể ẩn/hiện)',
        spring: 'Không',
        notes: 'Chỉ có vòng quan và vây, để hở mặt và tóc. Vây ngắn, hướng ra sau, không vượt quá 12 cm.',
      },
    },
  },
  luu_ly: {
    name: 'Lưu Ly Đan Y',
    method: 'Đan sư',
    element: 'Thủy (lưu ly trong suốt)',
    dir: '3d/nhan-vat',
    srcId: 'set_luu_ly_dan_y',
    ref: 'ref-01 và ref-06 (lớp voan, tay áo lụa mỏng, dải lụa) ở bậc 3: lưu ly trong như thủy tinh',
    palette: [
      ['Chính (áo ngoài, voan)', '#E9F1F2', 'trắng lưu ly'],
      ['Phụ (lớp lót, đai)', '#7FB9C4', 'lam lưu ly'],
      ['Viền (kim loại, trâm)', '#C9D0D6', 'bạc'],
      ['Nhấn phát sáng (hạt, mép gương)', '#A6E3E0', 'xanh ngọc băng, chỉ ở hạt lưu ly và mép'],
    ],
    materials:
      'Lụa trắng lưu ly mịn (áo ngoài) · voan mỏng xuyên sáng như thủy tinh (choàng vai và dải lụa, tối đa 2 mảnh trong suốt cho cả bộ) · vải đay thêu (lớp lót) · bạc chạm khắc (trâm, khóa đai, viền) · hồ lô lưu ly thủy tinh lam nhạt (treo đai) · hạt lưu ly (tua, chuỗi)',
    silhouette:
      'a graceful alchemist look: a wide white robe with very wide sleeves over a pale glass-blue inner robe, a long translucent glass-like gauze mantle draped over the shoulders with a thin silver border and trailing behind in two tails, a pale blue sash belt with a long translucent silk ribbon, a small glazed glass-blue gourd and a herb pouch hanging from silver cords at the hip, soft ivory ankle boots with silver trim, and a silver hair crown (guan) with a tall hairpin ending in a glass bead and fine hanging chains of tiny glass beads',
    motif:
      'delicate medicinal-herb sprigs and drifting glass-bubble circles, embroidered in pale blue-silver thread on the hem, cuffs and mantle border',
    pieces: {
      ao_ngoai: {
        name: 'Áo ngoài (đạo bào + voan choàng)',
        look: 'a wide white alchemist robe with crossed collar and very wide flowing sleeves, a pale glass-blue inner collar visible, herb-sprig and bubble-circle embroidery on the hem and cuffs, and a long translucent glass-like gauze mantle draped across both shoulders and falling behind in two soft tails with a thin silver-thread border',
        tris: '5000',
        bones: 'spine1/spine2, upperarm L/R, forearm L/R, neck. Voan choàng gắn spine2 và shoulder',
        spring: 'Tay áo rộng: 3 chuỗi × 3 xương mỗi bên. Voan choàng: 2 đuôi × 4 xương. Vạt sau: 2 chuỗi × 3 xương',
        notes:
          'Đây là mảnh XUYÊN SÁNG thứ nhất của bộ (voan choàng). Dựng voan thành lớp mỏng riêng; worker dùng alpha-test hoặc dither. Phần đạo bào lụa thì đặc.',
      },
      lop_duoi: {
        name: 'Lớp dưới',
        look: 'a long pale glass-blue under-robe skirt with a soft wrap front, a white inner hem layer slightly longer than the blue layer, soft loose trousers underneath, herb-sprig embroidery in pale silver-blue thread along the lower hem',
        tris: '2000',
        bones: 'pelvis/hips, thigh L/R, calf L/R',
        spring: 'Vạt trước và sau: 2 chuỗi × 3 xương',
        notes: 'Vạt dài tới mắt cá, hai lớp (lam ngắn hơn trắng). Cả hai đặc, không xuyên sáng.',
      },
      vai_giap: {
        name: 'Vai giáp (vai nhẹ)',
        look: 'a light decorative shoulder piece pair: curved silver filigree shoulder caps shaped like frozen water ripples with pale glass-blue glass inlay, a few hanging strings of tiny glass beads, small round bubble-shaped silver plates, mirrored left and right; elegant and delicate, not heavy armor',
        tris: '1500',
        bones: 'clavicle/shoulder L/R (cứng)',
        spring: 'Chuỗi hạt lưu ly: 1 chuỗi × 3 xương mỗi bên',
        notes: 'Vai của đan sư nhẹ nhất ba bộ: chỉ làm điểm nhấn, đỉnh không cao hơn vai quá 6 cm.',
      },
      dai_tua: {
        name: 'Đai, hồ lô và dải lụa',
        look: 'a pale glass-blue sash belt with a small silver clasp, a long thin translucent white silk ribbon tied in a soft bow hanging down one side, a small glazed glass-blue gourd (hu lu) and a tiny herb pouch hanging from silver cords at the hip, glass bead tassels',
        tris: '1500',
        bones: 'hips/spine (đai cứng). Hồ lô và túi neo ở đai',
        spring: 'Dải lụa: 1 chuỗi × 5 xương. Hồ lô và túi: 2 chuỗi × 3 xương. Tua: 1 chuỗi × 3 xương',
        notes:
          'Đây là mảnh XUYÊN SÁNG thứ hai (dải lụa) và là mảnh cuối cùng được phép trong suốt cho cả bộ. Hồ lô lưu ly dựng đặc màu lam nhạt (worker làm bóng như thủy tinh), phần mesh riêng để gắn xương.',
      },
      ung: {
        name: 'Ủng',
        look: 'a pair of soft ankle-high ivory-white cloth-and-leather boots with silver trim bands and slightly upturned pointed toes, pale blue stitching, a tiny silver bubble ornament at the ankle',
        tris: '1200',
        bones: 'foot L/R, toe L/R, calf L/R (cứng)',
        spring: 'Không',
        notes: 'Ủng thấp, nhẹ nhất ba bộ. Không có ống cao.',
      },
      trang_suc_dau: {
        name: 'Trang sức đầu',
        look: 'a silver hair crown (guan) holding a topknot: a small tapered silver cap with a pale blue glass bead at the front, one tall hairpin with a round glass-bead tip, two thin silver chains with tiny glass beads hanging on one side, two short white silk ribbon tails at the back',
        tris: '800',
        bones: 'head (cứng). Ô trang sức đầu là ô trang bị MỚI (thứ 9, có thể ẩn/hiện)',
        spring: 'Chuỗi hạt: 2 chuỗi × 3 xương. Dải sau: 1 chuỗi × 3 xương mỗi dải',
        notes: 'Chỉ quan, trâm và dây; không có đầu hay tóc. Hạt nhỏ, tổng không quá 12 hạt để giữ tam giác.',
      },
    },
  },
};

export const SWORD = {
  id: 'kinh_quang',
  short: 'Kính Quang Kiếm',
  name: 'Kính Quang Kiếm (dạng cuối +10 và vỏ kiếm)',
  dir: '3d/vu-khi',
  srcId: 'prop_kiem_kinh_quang',
  base: 'Dạng gốc dùng model #119 có sẵn (`prop_kiem_kinh_quang`), giữ nguyên cho +0…+9. Concept này chỉ là dạng cuối +10 và vỏ. Một kiếm chung cho cả ba công pháp (đã chốt 16/11).',
  colors:
    'Colors: mirror-polished silver #BFC8CF blade, dark aged silver-grey metal #5A6670 for the guard, mirror-blue #5E8FA8 accents, white-silver #ECEFF1 cord, cold glow #8FD8E8 only along the blade edge and in the gem.',
  items: {
    cuoi: {
      name: 'Dạng cuối +10',
      look: 'the final awakened form of a mirror sword: a SINGLE long slender double-edged blade (about 1.15 times longer than a normal sword), ONE blade tip only, the blade exists ONLY ABOVE the crossguard; below the crossguard there is ONLY a short pale leather-wrapped grip that ends in a faceted silver pommel at the very bottom (NO blade, NO spike, NO second blade below the grip, NOT a double-ended sword). The blade is of mirror-polished silver whose flat faces reflect like a mirror, razor edges with a thin cold translucent pale-blue rim glow, a shallow central fuller, a widened crossguard swept upward like a pair of thin wing-shaped feathered plates in dark aged silver-grey metal with engraved cloud-wave lines and a round blue-gem mirror eye at the center, a short white-wrapped grip with silver rings ending in the pommel, a faceted silver pommel at the bottom end, a white-silver jade-bead tassel hanging from the guard',
      tris: '4000',
      bones: 'prop gắn bone `dtl_sword` (xương cầm kiếm); điểm gốc tại giữa chuôi, trục dọc theo lưỡi. Phát sáng là vật liệu riêng',
      spring: 'Không',
      notes:
        'Lưỡi bạc gương là khối đặc có độ dày thật, mép xuyên sáng lạnh chỉ là viền mảnh dựng đặc (worker làm phát sáng bằng vật liệu riêng); KHÔNG dùng trong suốt thật. Chắn hình cánh mỏng phải có độ dày. Dạng gốc (#119) vẫn giữ cho +0…+9; dạng cuối thay lúc cường hóa +10.',
    },
    vo: {
      name: 'Vỏ kiếm',
      look: 'a matching scabbard for the Kinh Quang mirror sword: pale silver-white lacquered wood body, engraved polished silver mouth piece (chape) and tip with cloud-wave lines, two silver suspension rings, thin mirror-blue inlay lines running down the length, a small round silver mirror disc near the mouth, a short white-silver cord with a pale blue bead tassel, shown fully closed (no blade visible)',
      tris: '1500',
      bones: 'prop gắn ổ cắm lưng (`dtl_scabbard_back`, tạo bởi T-1/T-2); khi rút kiếm thì vỏ ở lại lưng',
      spring: 'Dây tua: 1 chuỗi × 3 xương',
      notes: 'Vỏ dài vừa khớp lưỡi dạng gốc (#119), kín hoàn toàn. Cửa vỏ ở ngang vai khi đeo chéo lưng.',
    },
  },
};

export const build3 = () => buildFrom(SETS, SWORD);
