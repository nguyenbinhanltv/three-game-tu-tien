# Nhóm "Chợ / làng" của PROP-1: sạp hàng, vò rượu, giỏ thuốc, lồng đèn giấy, xe kéo, thùng gỗ, hàng rào tre, giếng nước, lu nước.
import math

from build_sect import paint
from prop_tc_lib import (BAMBOO, BAMBOO_D, CLOTH_B, CLOTH_D, CLOTH_R, CLOTH_W, CLOTH_Y, IRON, LAMP, STONE_D, STONE_L, STONE_M, STRAW, WOOD, WOOD_D, WOOD_L, ellipsoid, flat_ring, item, lathe, tube, wheel)

CLAY = paint(0x8A5A3A, 'stone')
CLAY_D = paint(0x6E5444, 'stone')
WATER = paint(0x3C6A7A, 'stone')


@item('sap_hang')
def _(b, v):
    # Sạp hàng: bốn cột gỗ, mái vải hai dốc (sọc), quầy gỗ, hàng bày trên quầy.
    w, d = (3.2, 2.0) if v else (2.8, 1.8)
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.box(sx * w / 2, 1.2 + (0.2 if sz < 0 else 0), sz * d / 2, 0.1, 2.4 + (0.4 if sz < 0 else 0), 0.1, WOOD_D)
    cols = [CLOTH_B, CLOTH_Y] if v else [CLOTH_R, CLOTH_W]
    n = 6
    for i in range(n):
        x0, x1 = -w / 2 - 0.2 + i * (w + 0.4) / n, -w / 2 - 0.2 + (i + 1) * (w + 0.4) / n
        b.face([(x0, 2.9, -d / 2 - 0.1), (x1, 2.9, -d / 2 - 0.1), (x1, 2.35, d / 2 + 0.4), (x0, 2.35, d / 2 + 0.4)], cols[i % 2])
    b.box(0, 0.5, d / 2 - 0.2, w - 0.2, 0.9, 0.6, WOOD)
    b.box(0, 0.97, d / 2 - 0.2, w, 0.07, 0.7, WOOD_L)
    for k in range(4):
        x = -w / 2 + 0.5 + k * (w - 1.0) / 3
        if k % 2:
            lathe(b, [(0.0, 1.0), (0.2, 1.0), (0.26, 1.22), (0.2, 1.4), (0.0, 1.4)], STRAW, 10, x, d / 2 - 0.2)
        else:
            lathe(b, [(0.0, 1.0), (0.18, 1.02), (0.22, 1.2), (0.12, 1.34), (0.0, 1.36)], CLAY, 10, x, d / 2 - 0.2)
    b.box(0, 0.35, -d / 2 + 0.3, w - 0.6, 0.7, 0.5, WOOD_D)


@item('vo_ruou')
def _(b, v):
    # Vò rượu: ba chum sành nút vải đỏ đai trắng.
    spots = ((-0.9, 0, 0.9), (0, 0, 1.05), (0.95, 0.1, 0.8)) if v else ((-0.55, 0, 1.0), (0.45, 0.1, 0.85), (0.0, -0.75, 0.95))
    for x, z, s in spots:
        lathe(b, [(0.0, 0), (0.32 * s, 0.02), (0.45 * s, 0.35 * s), (0.5 * s, 0.7 * s), (0.4 * s, 1.0 * s), (0.22 * s, 1.15 * s), (0.25 * s, 1.22 * s)], CLAY, 12, x, z)
        lathe(b, [(0.25 * s, 1.22 * s), (0.3 * s, 1.28 * s), (0.26 * s, 1.4 * s), (0.0, 1.42 * s)], CLOTH_R, 10, x, z)
        b.cylinder(x, 0.62 * s, z, 0.505 * s, 0.07, CLOTH_W, 12)


@item('gio_thuoc')
def _(b, v):
    # Giỏ thuốc đan hai quai đầy thảo dược; biến thể thêm nong phơi dược liệu.
    leaf = paint(0x6E9A4A, 'cloth')
    root = paint(0x9A7A3A, 'cloth')
    lathe(b, [(0.0, 0.0), (0.38, 0.0), (0.5, 0.45), (0.46, 0.5)], STRAW, 12, cap_top=False)
    for k in range(7):
        a = k / 7 * math.tau
        tube(b, [(math.cos(a) * 0.1, 0.42, math.sin(a) * 0.1), (math.cos(a) * 0.3, 0.72, math.sin(a) * 0.3), (math.cos(a) * 0.46, 0.55, math.sin(a) * 0.46)], 0.03, leaf if k % 2 else root, 4)
    tube(b, [(-0.46, 0.5, 0), (-0.3, 0.95, 0), (0.3, 0.95, 0), (0.46, 0.5, 0)], 0.035, WOOD_D, 5)
    if v:
        lathe(b, [(0.0, 0.0), (0.7, 0.03), (0.8, 0.07)], STRAW, 14, cx=1.2, cz=0.4, cap_bot=True)
        for k in range(6):
            b.box(1.2 + math.cos(k) * 0.35, 0.09, 0.4 + math.sin(k) * 0.35, 0.18, 0.05, 0.1, root, yaw=k)


@item('long_den_giay')
def _(b, v):
    # Lồng đèn giấy treo trên cột tre cong: 1 hoặc 3 lồng.
    b.cylinder(0, 0, 0, 0.05, 2.6, BAMBOO_D, 6, 0.04)
    b.cylinder(0, 0, 0, 0.18, 0.12, STONE_M, 8, 0.1)
    tube(b, [(0, 2.6, 0), (0.25, 2.85, 0), (0.6, 2.8, 0)], 0.035, BAMBOO_D, 5)
    for k in range(3 if v else 1):
        x, y = 0.6, 2.35 - k * 0.75
        ellipsoid(b, x, y, 0, 0.3, 0.38, 0.3, LAMP, 10, 6)
        b.cylinder(x, y + 0.36, 0, 0.1, 0.06, WOOD_D, 8)
        b.cylinder(x, y - 0.42, 0, 0.1, 0.06, WOOD_D, 8)
        b.cylinder(x, y - 0.7, 0, 0.012, 0.3, CLOTH_R, 4)


@item('xe_keo')
def _(b, v):
    # Xe kéo tay hai bánh: thùng gỗ, càng, hàng chất trên xe.
    for sx in (-1, 1):
        wheel(b, sx * 0.72, 0.45, 0, 0.45, 0.07, WOOD_D)
    b.box(0, 0.45, 0, 1.4, 0.07, 0.07, IRON)
    b.box(0, 0.62, -0.1, 1.2, 0.1, 1.6, WOOD)
    for sz in (-1, 1):
        b.box(0, 0.9, -0.1 + sz * 0.78, 1.2, 0.5, 0.06, WOOD_L)
    for sx in (-1, 1):
        b.box(sx * 0.6, 0.9, -0.1, 0.06, 0.5, 1.6, WOOD_L)
        b.beam(sx * 0.5, 0.65, 0.7, sx * 0.4, 0.55, 2.2, 0.07, WOOD_D)
    b.box(0, 0.55, 2.15, 1.0, 0.06, 0.07, WOOD_D)
    for i in range(3):
        if v:
            ellipsoid(b, -0.3 + i * 0.3, 1.2, -0.3, 0.22, 0.28, 0.22, STRAW, 8, 5)
        else:
            lathe(b, [(0, 1.1), (0.28, 1.1), (0.28, 1.6), (0, 1.6)], WOOD, 10, -0.25 + (i % 2) * 0.5, -0.5 + (i // 2) * 0.55)


@item('thung_go')
def _(b, v):
    # Thùng gỗ đai sắt: thùng lớn + các thùng nhỏ xếp cạnh/chồng.
    def barrel(x, z, s, y0=0.0):
        lathe(b, [(0.0, y0), (0.36 * s, y0), (0.44 * s, y0 + 0.4 * s), (0.46 * s, y0 + 0.5 * s), (0.44 * s, y0 + 0.6 * s), (0.36 * s, y0 + 1.0 * s), (0.0, y0 + 1.0 * s)], WOOD, 14, x, z)
        for yy in (0.15, 0.85):
            b.cylinder(x, y0 + yy * s - 0.03, z, 0.4 * s, 0.07, IRON, 14)

    barrel(0, 0, 1.0)
    barrel(0.9, 0.1, 0.8)
    barrel(0.45, 0.05, 0.75, 0.8) if v else barrel(-0.85, 0.2, 0.7)


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
    # Giếng nước: thành đá tròn, hai trụ gỗ + xà có ròng rọc, gàu treo; biến thể có mái vải.
    b.cylinder(0, 0, 0, 0.95, 0.85, STONE_M, 16, 0.85)
    flat_ring(b, 0, 0.86, 0, 0.55, 0.93, STONE_L, 16)
    lathe(b, [(0.55, 0.86), (0.55, 0.2)], STONE_D, 16, cap_top=False)
    b.cylinder(0, 0.2, 0, 0.55, 0.01, WATER, 16)
    for sx in (-1, 1):
        b.box(sx * 0.95, 1.4, 0, 0.12, 1.2, 0.12, WOOD_D)
    b.box(0, 2.05, 0, 2.2, 0.12, 0.14, WOOD)
    b.cylinder(0, 1.2, 0.0, 0.025, 0.85, WOOD_L, 5)
    lathe(b, [(0.0, 0.0), (0.18, 0.0), (0.22, 0.28), (0.0, 0.28)], WOOD, 10, 0, 0, 0.75, cap_top=False)
    if v:
        for sz in (-1, 1):
            b.face([(-1.3, 2.9, sz * 0.2), (1.3, 2.9, sz * 0.2), (1.3, 2.1, sz * 1.0), (-1.3, 2.1, sz * 1.0)][::sz], CLOTH_D)
        b.box(0, 2.92, 0, 2.7, 0.08, 0.14, WOOD_D)


@item('lu_nuoc')
def _(b, v):
    # Lu nước sành miệng rộng, nắp gỗ, có gáo; biến thể: hai lu.
    for x, z, s in (((-0.55, 0, 1.0), (0.55, 0.1, 0.8)) if v else ((0, 0, 1.0),)):
        lathe(b, [(0.0, 0), (0.45 * s, 0.03), (0.62 * s, 0.4 * s), (0.66 * s, 0.75 * s), (0.5 * s, 1.1 * s), (0.5 * s, 1.18 * s), (0.56 * s, 1.2 * s)], CLAY_D, 14, x, z)
        b.cylinder(x, 1.2 * s, z, 0.5 * s, 0.04, WATER, 14)
    b.box(0.1, 1.28, 0.15, 0.5, 0.03, 0.05, WOOD_D, yaw=0.4)
