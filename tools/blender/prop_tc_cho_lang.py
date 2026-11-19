# Nhóm "Chợ / làng" của PROP-1 (PR2, bản sửa theo duyệt ảnh): sạp hàng mái vải bố võng, chum/vại gốm men, giỏ đan tre, lồng đèn giấy có nan,
# xe kéo càng liền bánh nan hoa, thùng/xô gỗ đai tre, hàng rào tre, giếng nước có gàu gỗ + ròng rọc, lu nước men.
# Ít vật liệu = ít draw call: men gốm, vải, đan nan, gỗ là các vật liệu duy nhất (mỗi món 1–3).
import math

from build_sect import paint, srgb
from prop_tc_lib import (
    BAMBOO,
    BAMBOO_D,
    CLOTH_D,
    CLOTH_R,
    LAMP,
    STONE_D,
    STONE_L,
    STONE_M,
    STRAW,
    WOOD,
    WOOD_D,
    WOOD_L,
    bs,
    ellipsoid,
    flat_ring,
    item,
    lathe,
    spoked_wheel,
    tube,
)

# men gốm (vật liệu `glaze`: bóng, men rạn nhẹ theo mặt)
GLAZE_BROWN = paint(0x4A2A18, 'glaze')
GLAZE_AMBER = paint(0x7A4824, 'glaze')
GLAZE_TEAL = paint(0x2F5E78, 'glaze')
GLAZE_DARK = paint(0x2A1A12, 'glaze')
ROPE = paint(0x6E5A3C, 'cloth')
HANDLE = paint(0x4D3324, 'cloth')
IRON_W = paint(0x3C4046, 'wood')
WEAVE = paint(0xC9A55C, 'weave')
WEAVE_D = paint(0x8E6B34, 'weave')
RED_LAMP = bs.Paint(srgb(0xC0372B), 'lamp')
DYE_BLUE = paint(0x2E4263, 'cloth')
DYE_BLUE_E = paint(0x1F2E45, 'cloth')
DYE_TURMERIC = paint(0xC99A2E, 'cloth')
DYE_TURMERIC_E = paint(0x8A6A1C, 'cloth')
DYE_EARTH = paint(0x7A5A3A, 'cloth')


def _canopy(b, w, d, y_back, y_front, col, edge, sag=0.16, cx=0.0, cz=0.0):
    """Mái vải bố võng (xệ giữa), viền sờn và tua mép trước."""
    nu, nv = 10, 5
    pts = {}
    for i in range(nu + 1):
        for j in range(nv + 1):
            u, v = i / nu, j / nv
            y = y_back + (y_front - y_back) * v - sag * math.sin(u * math.pi) * (0.4 + 0.6 * math.sin(v * math.pi))
            pts[(i, j)] = (cx + (u - 0.5) * w, y, cz + (v - 0.5) * d)
    for i in range(nu):
        for j in range(nv):
            c = edge if j == nv - 1 else col
            b.face([pts[(i, j)], pts[(i + 1, j)], pts[(i + 1, j + 1)], pts[(i, j + 1)]][::-1], c)
    for i in range(nu):  # tua sờn mép trước: dải dài ngắn xen kẽ
        a, bb = pts[(i, nv)], pts[(i + 1, nv)]
        ln = 0.1 + 0.07 * ((i * 7) % 3)
        b.face([a, bb, (bb[0], bb[1] - ln, bb[2] + 0.02), (a[0], a[1] - ln * 0.8, a[2] + 0.02)][::-1], edge)
        b.face([a, bb, (bb[0], bb[1] - ln, bb[2] + 0.02), (a[0], a[1] - ln * 0.8, a[2] + 0.02)], edge)


@item('sap_hang')
def _(b, v):
    # Sạp hàng: bốn cột gỗ, mái vải bố chàm / vàng nghệ võng, quầy gỗ, hàng bày (giỏ đan, trái cây, chum nhỏ).
    w, d = (3.2, 2.0) if v else (2.8, 1.8)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box(sx * w / 2, 1.2 + (0.2 if sz < 0 else 0), sz * d / 2, 0.1, 2.4 + (0.4 if sz < 0 else 0), 0.1, WOOD_D)
    col, edge = (DYE_TURMERIC, DYE_TURMERIC_E) if v else (DYE_BLUE, DYE_BLUE_E)
    _canopy(b, w + 0.5, d + 0.9, 2.95, 2.4, col, edge, 0.17, 0, 0.15)
    for sx in (-1, 1):  # xà đỡ mái
        b.box(sx * w / 2, 2.62, 0, 0.07, 0.07, d + 0.2, WOOD)
    b.box(0, 0.5, d / 2 - 0.2, w - 0.2, 0.9, 0.6, WOOD)
    b.box(0, 0.97, d / 2 - 0.2, w, 0.07, 0.7, WOOD_L)
    for k in range(4):
        x = -w / 2 + 0.5 + k * (w - 1.0) / 3
        if k % 2:
            lathe(b, [(0.0, 1.0), (0.22, 1.0), (0.28, 1.2), (0.2, 1.38), (0.0, 1.4)], STRAW, 10, x, d / 2 - 0.2)
        else:
            ellipsoid(b, x, 1.15, d / 2 - 0.2, 0.2, 0.17, 0.2, DYE_EARTH if k == 0 else DYE_TURMERIC, 8, 4)
    b.box(0, 0.35, -d / 2 + 0.3, w - 0.6, 0.7, 0.5, WOOD_D)


def _jar(b, x, z, s, glaze, lid=CLOTH_R, y0=0.0, big=False):
    """Chum gốm men: đáy chân đế, bụng tròn, vai có hai đường chỉ, miệng gờ, nắp vải buộc dây."""
    prof = [(0.0, y0), (0.3 * s, y0), (0.34 * s, y0 + 0.06 * s), (0.46 * s, y0 + 0.4 * s), (0.5 * s, y0 + 0.68 * s), (0.4 * s, y0 + 0.96 * s), (0.22 * s, y0 + 1.1 * s), (0.25 * s, y0 + 1.15 * s), (0.31 * s, y0 + 1.18 * s), (0.3 * s, y0 + 1.23 * s), (0.25 * s, y0 + 1.24 * s)]
    lathe(b, prof, glaze, 20 if big else 14, x, z)
    for ry, rr in ((0.86 * s, 0.46 * s), (0.9 * s, 0.44 * s)):  # đường chỉ ở vai
        lathe(b, [(rr, y0 + ry), (rr + 0.014 * s, y0 + ry + 0.01), (rr + 0.014 * s, y0 + ry + 0.025), (rr, y0 + ry + 0.035)], GLAZE_DARK, 20 if big else 14, x, z, cap_top=False)
    lathe(b, [(0.25 * s, y0 + 1.24 * s), (0.28 * s, y0 + 1.27 * s), (0.26 * s, y0 + 1.33 * s), (0.0, y0 + 1.36 * s)], lid, 12, x, z)  # nắp vải đỏ
    tube(b, [(x + math.cos(i / 12 * math.tau) * 0.285 * s, y0 + 1.25 * s, z + math.sin(i / 12 * math.tau) * 0.285 * s) for i in range(13)], 0.014 * s, ROPE, 4, sub=1, cap=False)  # dây buộc
    ellipsoid(b, x + 0.285 * s, y0 + 1.25 * s, z, 0.03 * s, 0.03 * s, 0.03 * s, ROPE, 5, 3)


@item('vo_ruou')
def _(b, v):
    # Chum rượu: ba chum gốm men nâu / hổ phách / lam, nắp vải đỏ buộc dây.
    cols = (GLAZE_BROWN, GLAZE_TEAL, GLAZE_AMBER) if v else (GLAZE_BROWN, GLAZE_AMBER, GLAZE_DARK)
    spots = ((-0.9, 0, 0.9), (0, 0, 1.05), (0.95, 0.1, 0.8)) if v else ((-0.55, 0, 1.0), (0.45, 0.1, 0.85), (0.0, -0.75, 0.95))
    for (x, z, s), c in zip(spots, cols):
        _jar(b, x, z, s, c, CLOTH_R if c is not GLAZE_TEAL else DYE_BLUE)


@item('gio_thuoc')
def _(b, v):
    # Giỏ thuốc: giỏ đan tre/mây (texture đan nan + normal), miệng viền, quai cong, đầy thảo dược; v: thêm nong phơi.
    lathe(b, [(0.0, 0.0), (0.36, 0.0), (0.48, 0.2), (0.52, 0.46), (0.5, 0.5)], WEAVE, 14, cap_top=False)
    lathe(b, [(0.5, 0.5), (0.54, 0.5), (0.54, 0.55), (0.5, 0.55)], WEAVE_D, 14, cap_top=False)
    leaf, root = paint(0x6E9A4A, 'cloth'), paint(0x9A7A3A, 'cloth')
    for k in range(7):
        a = k / 7 * math.tau
        tube(b, [(math.cos(a) * 0.1, 0.42, math.sin(a) * 0.1), (math.cos(a) * 0.3, 0.74, math.sin(a) * 0.3), (math.cos(a) * 0.46, 0.58, math.sin(a) * 0.46)], 0.03, leaf if k % 2 else root, 4)
    tube(b, [(-0.52, 0.52, 0), (-0.42, 0.86, 0), (0, 1.04, 0), (0.42, 0.86, 0), (0.52, 0.52, 0)], 0.035, WEAVE_D, 6)  # quai cong
    if v:
        lathe(b, [(0.0, 0.0), (0.7, 0.03), (0.8, 0.07)], WEAVE, 14, cx=1.2, cz=0.4, cap_bot=True)
        for k in range(6):
            b.box(1.2 + math.cos(k) * 0.35, 0.09, 0.4 + math.sin(k) * 0.35, 0.18, 0.05, 0.1, root, yaw=k)


@item('long_den_giay')
def _(b, v):
    # Cột tre có cần ngang, hai lồng đèn giấy (đỏ, kem) có nan dọc + vòng, đáy/đỉnh gỗ, tua đỏ, treo bằng dây từ cần ngang.
    b.cylinder(0, 0, 0, 0.05, 3.0, BAMBOO_D, 6, 0.04)
    b.cylinder(0, 0, 0, 0.18, 0.12, HANDLE, 8, 0.1)
    b.box(0.55, 2.9, 0, 1.3, 0.05, 0.05, BAMBOO_D)
    for dx, y, paper in ((0.5, 2.2, LAMP), (1.1, 2.4, RED_LAMP)):
        top = 2.9
        tube(b, [(dx, top, 0), (dx, y + 0.42, 0)], 0.012, ROPE, 3, sub=1, cap=False)  # dây treo từ cần ngang
        b.cylinder(dx, y + 0.34, 0, 0.1, 0.06, HANDLE, 8)
        ellipsoid(b, dx, y, 0, 0.3, 0.36, 0.3, paper, 12, 6)
        for k in range(12):  # nan dọc
            a = k / 12 * math.tau
            tube(b, [(dx + math.cos(a) * 0.3 * math.sin(t * math.pi), y + 0.36 - t * 0.72, math.sin(a) * 0.3 * math.sin(t * math.pi)) for t in (0.08, 0.3, 0.5, 0.7, 0.92)], 0.007, HANDLE, 3, sub=1, cap=False)
        for ry in (-0.18, 0.0, 0.18):  # vòng ngang
            rr = 0.3 * math.sqrt(max(0.0, 1 - (ry / 0.36) ** 2)) + 0.005
            tube(b, [(dx + math.cos(i / 12 * math.tau) * rr, y + ry, math.sin(i / 12 * math.tau) * rr) for i in range(13)], 0.007, HANDLE, 3, sub=1, cap=False)
        b.cylinder(dx, y - 0.4, 0, 0.1, 0.06, HANDLE, 8)
        for k in range(7):  # tua đỏ
            a = k / 7 * math.tau
            b.cylinder(dx + math.cos(a) * 0.05, y - 0.62, math.sin(a) * 0.05, 0.008, 0.22, CLOTH_R, 3)
        ellipsoid(b, dx, y - 0.4, 0, 0.04, 0.04, 0.04, CLOTH_R, 5, 3)


@item('xe_keo')
def _(b, v):
    # Xe kéo tay: thùng gỗ, hai càng dài liền một thanh + thanh ngang, bánh gỗ nan hoa có đai sắt, hàng chất trên xe.
    for sx in (-1, 1):
        spoked_wheel(b, sx * 0.72, 0.45, 0, 0.45, 0.07, WOOD_D, IRON_W)
    b.box(0, 0.45, 0, 1.5, 0.07, 0.07, IRON_W)  # trục
    b.box(0, 0.62, -0.1, 1.2, 0.1, 1.6, WOOD)
    for sz in (-1, 1):
        b.box(0, 0.9, -0.1 + sz * 0.78, 1.2, 0.5, 0.06, WOOD_L)
    for sx in (-1, 1):
        b.box(sx * 0.6, 0.9, -0.1, 0.06, 0.5, 1.6, WOOD_L)
        b.box(sx * 0.5, 0.58, 0.9, 0.07, 0.07, 3.2, WOOD_D)  # càng liền từ gầm thùng ra đầu xe
    b.box(0, 0.58, 2.45, 1.1, 0.07, 0.07, WOOD_D)  # thanh kéo
    for i in range(3):
        if v:
            ellipsoid(b, -0.3 + i * 0.3, 1.2, -0.3, 0.22, 0.28, 0.22, STRAW, 8, 5)
        else:
            lathe(b, [(0, 1.1), (0.28, 1.1), (0.28, 1.6), (0, 1.6)], WOOD, 10, -0.25 + (i % 2) * 0.5, -0.5 + (i // 2) * 0.55)


def _bucket(b, x, z, s, y0=0.0, tub=False):
    """Xô/thùng gỗ đai tre: thân thon nhẹ, ba đai tre, miệng viền, quai dây; tub: thùng thấp rộng."""
    h = (0.55 if tub else 0.9) * s
    rb, rt = (0.5 * s, 0.56 * s) if tub else (0.3 * s, 0.38 * s)
    lathe(b, [(0.0, y0), (rb, y0), (rt, y0 + h), (rt - 0.03 * s, y0 + h)], WOOD, 14, x, z, cap_top=False)
    lathe(b, [(rt - 0.03 * s, y0 + h), (rb - 0.02 * s, y0 + 0.06 * s), (0.0, y0 + 0.06 * s)], WOOD_D, 14, x, z, cap_top=False)
    for t in (0.12, 0.5, 0.88):  # đai tre
        rr = rb + (rt - rb) * t + 0.012
        lathe(b, [(rr, y0 + h * t - 0.025), (rr + 0.012, y0 + h * t - 0.02), (rr + 0.012, y0 + h * t + 0.02), (rr, y0 + h * t + 0.025)], BAMBOO, 14, x, z, cap_top=False)
    if not tub:
        tube(b, [(x - rt, y0 + h, z), (x - rt * 0.8, y0 + h + 0.28 * s, z), (x, y0 + h + 0.4 * s, z), (x + rt * 0.8, y0 + h + 0.28 * s, z), (x + rt, y0 + h, z)], 0.02 * s, ROPE, 4)


@item('thung_go')
def _(b, v):
    # Xô gỗ đai tre: xô lớn + xô nhỏ + một thùng thấp (không còn dáng thùng rượu vang).
    _bucket(b, 0, 0, 1.0)
    _bucket(b, 0.8, 0.1, 0.8)
    _bucket(b, 0.4, 0.05, 0.75, 0.0, tub=True) if v else _bucket(b, -0.85, 0.2, 0.9, 0.0, tub=True)


@item('hang_rao_tre')
def _(b, v):
    # Đoạn hàng rào tre dài 3 m: cọc tre đứng sát nhau, hai thanh ngang buộc dây.
    n = 12
    for i in range(n):
        x = -1.5 + i * 3.0 / (n - 1)
        h = 1.35 + 0.12 * math.sin(i * 1.7) + (0.2 if v and i % 3 == 0 else 0)
        b.cylinder(x, 0, 0, 0.055, h, BAMBOO, 6, 0.045)
        b.cylinder(x, h * 0.45, 0, 0.062, 0.03, BAMBOO_D, 6)
    for y in (0.35, 0.95):
        b.box(0, y, 0.07, 3.1, 0.06, 0.05, BAMBOO_D)
        for x in (-1.4, 0, 1.4):
            b.box(x, y, 0.1, 0.07, 0.09, 0.03, CLOTH_D)
    for x in (-1.5, 1.5):
        b.cylinder(x, 0, 0.0, 0.09, 1.6, BAMBOO_D, 6)


@item('gieng_nuoc')
def _(b, v):
    # Giếng nước: thành đá tròn, hai trụ + xà, ròng rọc nan hoa, dây thừng, gàu gỗ đai tre có quai; v: có mái vải.
    b.cylinder(0, 0, 0, 0.95, 0.85, STONE_M, 16, 0.85)
    flat_ring(b, 0, 0.86, 0, 0.55, 0.93, STONE_L, 16)
    lathe(b, [(0.55, 0.86), (0.55, 0.2)], STONE_D, 16, cap_top=False)
    for sx in (-1, 1):
        b.box(sx * 0.95, 1.4, 0, 0.12, 1.2, 0.12, WOOD_D)
    b.box(0, 2.05, 0, 2.2, 0.12, 0.14, WOOD)
    spoked_wheel(b, 0.0, 1.78, 0.0, 0.24, 0.08, WOOD_D, IRON_W, 6, 12)  # ròng rọc treo dưới xà
    tube(b, [(0.0, 2.0, 0.0), (0.0, 1.9, 0.0)], 0.03, WOOD_D, 4, sub=1)
    tube(b, [(0.0, 1.54, 0.0), (0.0, 1.5, 0.0), (0.0, 1.46, 0.0)], 0.018, ROPE, 4, sub=1)  # dây thừng xuống gàu (vắt qua ròng rọc)
    tube(b, [(0.24, 1.78, 0.0), (0.4, 1.4, 0.0), (0.7, 1.15, 0.0), (0.88, 1.0, 0.0)], 0.018, ROPE, 4, sub=2)  # đầu dây kia buộc cọc
    b.cylinder(0.88, 0.9, 0.0, 0.03, 0.2, WOOD_D, 5)
    _bucket(b, 0.0, 0.0, 0.5, 1.0)
    if v:
        for sz in (-1, 1):
            b.face([(-1.3, 2.9, sz * 0.2), (1.3, 2.9, sz * 0.2), (1.3, 2.1, sz * 1.0), (-1.3, 2.1, sz * 1.0)][::sz], DYE_EARTH)
        b.box(0, 2.92, 0, 2.7, 0.08, 0.14, WOOD_D)


@item('lu_nuoc')
def _(b, v):
    # Lu nước gốm men miệng rộng có gờ, nắp gỗ có núm, gáo tre cán dài; v: hai lu.
    for (x, z, s), c in zip(((-0.55, 0, 1.0), (0.55, 0.1, 0.8)) if v else ((0, 0, 1.0),), (GLAZE_BROWN, GLAZE_TEAL)):
        prof = [(0.0, 0), (0.4 * s, 0.0), (0.46 * s, 0.08 * s), (0.62 * s, 0.4 * s), (0.66 * s, 0.75 * s), (0.5 * s, 1.1 * s), (0.5 * s, 1.16 * s), (0.58 * s, 1.2 * s), (0.58 * s, 1.26 * s), (0.5 * s, 1.27 * s)]
        lathe(b, prof, c, 18, x, z)
        for ry in (0.9 * s, 0.95 * s):
            lathe(b, [(0.55 * s, ry), (0.565 * s, ry + 0.01), (0.565 * s, ry + 0.025), (0.55 * s, ry + 0.035)], GLAZE_DARK, 18, x, z, cap_top=False)
        lathe(b, [(0.0, 1.27 * s), (0.5 * s, 1.27 * s), (0.5 * s, 1.3 * s), (0.0, 1.31 * s)], HANDLE, 14, x, z)
        ellipsoid(b, x, 1.34 * s, z, 0.06 * s, 0.05 * s, 0.06 * s, ROPE, 6, 3)
    tube(b, [(0.35, 1.33, 0.4), (0.7, 1.33, 0.65), (1.1, 1.3, 0.85)], 0.018, BAMBOO, 4, sub=2)  # gáo tre cán dài
    ellipsoid(b, 0.3, 1.34, 0.38, 0.12, 0.06, 0.12, BAMBOO, 7, 3)
