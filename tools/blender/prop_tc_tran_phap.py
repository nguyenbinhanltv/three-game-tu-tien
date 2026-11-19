# Nhóm "Trận pháp" của PROP-1 (PR4): trận đồ khắc sàn, cột trận, tế đàn, bia trận, linh thạch.
# Chuẩn v3: đá PBR có rãnh khắc chìm, chữ Việt thư pháp (Charm Bold) thay phù văn khối, phát sáng chỉ ở nét mảnh bão hòa (hổ phách / ngọc lục / lam đậm), không pastel.
import math

from build_sect import Mat, paint
from prop_tc_lib import BRONZE, BRONZE_D, GILD, GREEN_BR, INK_TEXT, ROCK_D, ROCK_M, STONE_D, STONE_L, STONE_M, bs, CRYS_ICE, CRYS_JADE, crystal_cluster, ellipsoid, flat_ring, item, lathe, rock, set_text_res, tube

bs.MATERIALS['glow_amber'] = Mat(0.6, 0.0, None, 1.0, False, 0.0, (0xE58A1F, 1.1))
bs.MATERIALS['glow_jade2'] = Mat(0.6, 0.0, None, 1.0, False, 0.0, (0x0E8F62, 0.55))
bs.MATERIALS['glow_azure'] = Mat(0.6, 0.0, None, 1.0, False, 0.0, (0x1B52B0, 0.6))
AMBER = paint(0xE58A1F, 'glow_amber')
JADE_GLOW = paint(0x0E8F62, 'glow_jade2')
AZURE = paint(0x1B52B0, 'glow_azure')
GROOVE = paint(0x2C2F2B, 'stone')  # rãnh khắc chìm (tối)
SLATE = paint(0x3B3F44, 'stone')
GOLD_TXT = paint(0xD2A24A, 'metal')
DYE_PAPER = paint(0xD9B24E, 'cloth')
DYE_PAPER_B = paint(0x2E4263, 'cloth')


def _ring(b, cx, y, cz, r0, r1, color, seg=36, skip=0):
    """Vành phẳng nằm ngang; skip > 0 thì bỏ đoạn xen kẽ (nét đứt)."""
    for i in range(seg):
        if skip and i % skip == skip - 1:
            continue
        a0, a1 = i / seg * math.tau, (i + 1) / seg * math.tau
        b.face([(cx + math.cos(a1) * r0, y, cz + math.sin(a1) * r0), (cx + math.cos(a1) * r1, y, cz + math.sin(a1) * r1), (cx + math.cos(a0) * r1, y, cz + math.sin(a0) * r1), (cx + math.cos(a0) * r0, y, cz + math.sin(a0) * r0)], color)


def _bar(b, cx, cz, ang, r, length, width, y, color):
    """Thanh phẳng nằm trên sàn tại bán kính r theo hướng ang (một vạch của quẻ)."""
    c, s = math.cos(ang), math.sin(ang)
    px, pz = cx + c * r, cz + s * r
    tx, tz = -s, c
    hl, hw = length / 2, width / 2
    pts = [(px + tx * hl + c * hw, y, pz + tz * hl + s * hw), (px - tx * hl + c * hw, y, pz - tz * hl + s * hw), (px - tx * hl - c * hw, y, pz - tz * hl - s * hw), (px + tx * hl - c * hw, y, pz + tz * hl - s * hw)]
    b.face(pts[::-1], color)


@item('tran_do_khac_san')
def _(b, v):
    # Trận đồ khắc sàn: đĩa đá lát có vành, vòng rãnh khắc chìm, tám quẻ bát quái nét phát sáng mảnh, thái cực ở tâm; v: thêm vòng nét đứt.
    glow = AMBER if not v else JADE_GLOW
    R = 3.2
    b.cylinder(0, 0, 0, R + 0.2, 0.1, STONE_D, 32, R + 0.2)
    b.cylinder(0, 0.1, 0, R, 0.08, STONE_M, 32, R - 0.04)
    for r0, r1 in ((R - 0.28, R - 0.2), (R * 0.62, R * 0.62 + 0.07), (R * 0.28, R * 0.28 + 0.06)):  # rãnh khắc chìm (tối)
        _ring(b, 0, 0.185, 0, r0, r1, GROOVE, 40)
    _ring(b, 0, 0.19, 0, R - 0.2, R - 0.16, glow, 40, 5 if v else 0)  # nét sáng mảnh sát rãnh
    for k in range(8):  # quẻ: ba vạch, liền (dương) hoặc đứt (âm)
        a = k / 8 * math.tau + math.pi / 8
        for i, rr in enumerate((R * 0.74, R * 0.8, R * 0.86)):
            yin = ((k >> i) & 1) == 0
            if yin:
                for off in (-0.2, 0.2):
                    c, s = math.cos(a), math.sin(a)
                    _bar(b, -s * off, c * off, a, rr, 0.2, 0.05, 0.195, glow)
            else:
                _bar(b, 0, 0, a, rr, 0.65, 0.05, 0.195, glow)
    # thái cực: đĩa tâm đá sẫm, nửa sáng nửa tối
    lathe(b, [(0.0, 0.18), (R * 0.2, 0.18), (R * 0.2, 0.21), (0.0, 0.21)], SLATE, 24)
    for i in range(14):
        a0, a1 = i / 28 * math.tau, (i + 1) / 28 * math.tau
        b.face([(0, 0.215, 0), (math.cos(a1) * R * 0.19, 0.215, math.sin(a1) * R * 0.19), (math.cos(a0) * R * 0.19, 0.215, math.sin(a0) * R * 0.19)][::-1], glow)
    for k in range(4):  # đinh đồng ở bốn phương
        a = k * math.pi / 2
        ellipsoid(b, math.cos(a) * (R - 0.1), 0.15, math.sin(a) * (R - 0.1), 0.1, 0.06, 0.1, GILD, 8, 3)


def _hex_pillar(b, r, h, base_h, color, groove):
    """Trụ lục giác: chân vát, thân có sáu rãnh dọc khắc chìm, cổ cột, mũ."""
    lathe(b, [(0.0, 0.0), (r * 1.9, 0.0), (r * 1.9, base_h * 0.5), (r * 1.4, base_h)], STONE_D, 6, smooth=False, cap_top=False)
    lathe(b, [(r, base_h), (r * 0.94, h)], color, 6, smooth=False, cap_top=False)
    for k in range(6):  # rãnh dọc (bỏ mặt trước k = 1: dành cho chữ)
        if k == 1:
            continue
        a = (k + 0.5) / 6 * math.tau
        b.box(math.cos(a) * r * 0.8, base_h + (h - base_h) * 0.5, math.sin(a) * r * 0.8, 0.05, (h - base_h) * 0.8, 0.05, groove, yaw=-a)


@item('cot_tran')
def _(b, v):
    # Cột trận: trụ đá lục giác có rãnh khắc chìm và nét phát sáng mảnh chạy dọc, chữ Việt trên mặt trước, mũ cột + quả cầu đồng có vành sáng.
    glow = AMBER if not v else AZURE
    h = 3.4
    _hex_pillar(b, 0.5, h, 0.5, STONE_L, GROOVE)
    for k in range(6):  # nét phát sáng mảnh nằm trong rãnh, ngắt quãng
        if k == 1:
            continue
        a = (k + 0.5) / 6 * math.tau
        for j in range(3):
            b.box(math.cos(a) * 0.395, 1.1 + j * 0.8, math.sin(a) * 0.395, 0.03, 0.3, 0.03, glow, yaw=-a)
    set_text_res(2)
    words = ('Trận', 'Pháp') if not v else ('Phong', 'Ấn')
    b.box(0, 2.0, 0.41, 0.56, 1.7, 0.012, SLATE)  # tấm đá sẫm khắc chữ (chữ nằm chìm trên mặt tối)
    b.text(words[0], 0, 2.55, 0.425, 0.6, 0.0, GOLD_TXT, fit_w=0.46, fit_h=0.55)
    b.text(words[1], 0, 1.75, 0.425, 0.6, 0.0, GOLD_TXT, fit_w=0.46, fit_h=0.55)
    set_text_res(2)
    lathe(b, [(0.5, h), (0.62, h + 0.05), (0.62, h + 0.16), (0.42, h + 0.22)], STONE_M, 6, smooth=False)
    ellipsoid(b, 0, h + 0.55, 0, 0.3, 0.3, 0.3, BRONZE, 12, 6)
    for k in range(2):  # vòng sáng quanh quả cầu
        tube(b, [(math.cos(i / 16 * math.tau) * (0.4 + 0.03 * k), h + 0.55 + (0.12 if k else -0.12), math.sin(i / 16 * math.tau) * (0.4 + 0.03 * k)) for i in range(17)], 0.016, glow, 4, sub=1, cap=False)


@item('te_dan')
def _(b, v):
    # Tế đàn: ba bậc đá có bậc lên, mặt trên khắc vòng rãnh, đỉnh đồng ba chân đặt giữa, bốn trụ góc có chậu lửa, tấm bảng chữ Việt ở bậc dưới.
    glow = AMBER if not v else JADE_GLOW
    for k in range(3):
        s = 4.8 - k * 1.2
        b.box(0, 0.22 + k * 0.44, 0, s, 0.44, s, STONE_M if k % 2 == 0 else STONE_L)
        b.box(0, 0.44 + k * 0.44 - 0.005, 0, s + 0.06, 0.03, s + 0.06, GROOVE)  # mạch khe giữa bậc
    for k in range(3):  # bậc lên phía nam
        b.box(0, 0.12 + k * 0.1, 2.75 + (2 - k) * 0.3, 1.5, 0.24 + k * 0.2, 0.4, STONE_L)
    _ring(b, 0, 1.325, 0, 0.62, 0.7, GROOVE, 28)
    _ring(b, 0, 1.33, 0, 0.7, 0.74, glow, 28, 3)
    for k in range(3):  # đỉnh đồng ba chân
        a = k / 3 * math.tau
        b.cylinder(math.cos(a) * 0.3, 1.32, math.sin(a) * 0.3, 0.07, 0.3, BRONZE_D, 6, 0.05)
    lathe(b, [(0.0, 1.6), (0.36, 1.62), (0.46, 1.85), (0.4, 2.1), (0.3, 2.16)], BRONZE, 16)
    b.cylinder(0, 2.1, 0, 0.3, 0.02, glow, 12)
    for dx, dz in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        b.cylinder(dx * 2.2, 0, dz * 2.2, 0.28, 1.2, STONE_D, 8, 0.24)
        lathe(b, [(0.0, 1.2), (0.3, 1.2), (0.22, 1.36), (0.0, 1.34)], BRONZE_D, 10, dx * 2.2, dz * 2.2)
        ellipsoid(b, dx * 2.2, 1.42, dz * 2.2, 0.13, 0.17, 0.13, glow, 8, 4)  # ngọn lửa trong chậu
    set_text_res(1)
    b.text('Thiên Địa' if not v else 'Tế Đàn', 0, 0.3, 2.98, 0.4, 0.0, INK_TEXT, fit_w=1.2, fit_h=0.3)
    set_text_res(2)


@item('bia_tran')
def _(b, v):
    # Bia trận: phiến bia đá đen dày, viền rãnh khắc chìm, chữ Việt thư pháp vàng đồng, ba vạch quẻ phát sáng mảnh dưới chữ, đế đá có bậc.
    glow = AMBER if not v else AZURE
    h = 2.8 if v else 2.4
    b.box(0, 0.15, 0, 1.5, 0.3, 0.8, STONE_D)
    b.box(0, 0.4, 0, 1.2, 0.2, 0.6, STONE_M)
    b.box(0, 0.5 + h / 2, 0, 0.95, h, 0.26, SLATE)
    b.box(0, 0.5 + h + 0.06, 0, 1.1, 0.12, 0.34, STONE_M)
    fy = 0.5 + h * 0.5
    for dy in (-h * 0.46, h * 0.46):
        b.box(0, fy + dy, 0.135, 0.8, 0.04, 0.012, GROOVE)
    for dx in (-0.4, 0.4):
        b.box(dx, fy, 0.135, 0.04, h * 0.92, 0.012, GROOVE)
    set_text_res(2)
    b.text('Trận' if not v else 'Phong', 0, 0.5 + h * 0.72, 0.14, 0.5, 0.0, GOLD_TXT, fit_w=0.6, fit_h=0.5)
    b.text('Pháp' if not v else 'Ấn', 0, 0.5 + h * 0.46, 0.14, 0.5, 0.0, GOLD_TXT, fit_w=0.6, fit_h=0.5)
    for i, yin in enumerate((False, True, False)):  # quẻ Khảm/Ly: vạch liền / đứt, nét sáng mảnh
        y = 0.5 + h * (0.26 - i * 0.055)
        if yin:
            for dx in (-0.2, 0.2):
                b.box(dx, y, 0.14, 0.26, 0.025, 0.012, glow)
        else:
            b.box(0, y, 0.14, 0.7, 0.025, 0.012, glow)


@item('linh_thach')
def _(b, v):
    # Linh thạch: cụm tinh thể gradient (chân tối → lõi sáng, fresnel ở client) mọc từ đống đá tối, trụ giữa cao, trụ bên nghiêng, mảnh vụn quanh gốc.
    crystal_cluster(b, 1.9 if not v else 2.2, 700 + v * 17, CRYS_JADE if not v else CRYS_ICE, rock_color=ROCK_D)


@item('xich_bua')
def _(b, v):
    # Dây xích bùa nối hai trụ trận (dài 9,2 m, cao ~3,1 m): xích sắt võng, năm lá bùa giấy vàng vạch đỏ + chữ Việt thư pháp rủ xuống; v: bùa xanh chàm.
    L = 9.2
    n = 14
    pts = [(-L / 2 + L * i / n, 3.15 - 0.9 * math.sin(math.pi * i / n) ** 1.2, 0.0) for i in range(n + 1)]
    tube(b, pts, 0.028, SLATE, 5, sub=2)
    for i in range(1, n):  # mắt xích: hạt nhỏ xen kẽ
        if i % 2:
            ellipsoid(b, pts[i][0], pts[i][1], 0.0, 0.05, 0.035, 0.05, GOLD_TXT, 6, 3)
    paper = DYE_PAPER if not v else DYE_PAPER_B
    for k in range(5):
        t0 = (k + 0.5) / 5
        i = int(t0 * n)
        x, y = pts[i][0], pts[i][1]
        h = 0.62
        b.box(x, y - h / 2 - 0.02, 0.0, 0.2, h, 0.012, paper)
        b.box(x, y - h / 2 - 0.02, 0.008, 0.035, h * 0.8, 0.006, INK_TEXT)
        set_text_res(1)
        b.text('Phù' if k % 2 else 'Trận', x, y - h * 0.55, 0.016, 0.3, 0.0, INK_TEXT, fit_w=0.16, fit_h=0.2)
        set_text_res(2)
