# Nhóm "Tông môn" của PROP-1: 10 món × 2 biến thể (đỉnh lư đồng, giá kiếm, bia khắc, cờ phướn, lò luyện đan,
# chuông đồng, trống, đèn đá, lư hương, bàn ghế đá). Gốc ở tâm đáy, mặt trước +z.
import math

from prop_tc_lib import *  # noqa: F401,F403
from prop_tc_lib import (BRONZE, BRONZE_D, CLOTH_B, CLOTH_R, CLOTH_W, CLOTH_Y, GILD, GILD_TEXT, GLOW_R, GREEN_BR, INK, IRON, JADE, JADE_G, JADE_SH, LAMP, STEEL, STONE_D, STONE_L, STONE_M, VERM, VERM_D, WOOD, WOOD_D, WOOD_L, crystal, ellipsoid, item, lathe, lathe_x, tube)  # noqa: F401


def _feet(b, n, r, h, color, w=0.14, spread=1.0):
    for i in range(n):
        a = i / n * math.tau + math.pi / n
        x, z = math.cos(a) * r * spread, math.sin(a) * r * spread
        b.box(x, h / 2, z, w, h, w, color, yaw=-a)
        b.box(x, 0.05, z, w * 1.5, 0.1, w * 1.5, color, yaw=-a)


@item('dinh_lu_dong')
def _(b, v):
    # Đỉnh lư đồng: ba (hoặc bốn) chân, bụng phình, hai quai, nắp có sư tử nhỏ trên đỉnh.
    n = 4 if v else 3
    _feet(b, n, 0.62, 0.55, BRONZE_D, 0.17)
    lathe(b, [(0.0, 0.5), (0.5, 0.55), (0.8, 0.9), (0.9, 1.3), (0.78, 1.75), (0.62, 1.9), (0.7, 1.95)], BRONZE, 18)
    lathe(b, [(0.7, 1.95), (0.62, 2.1), (0.2, 2.5), (0.16, 2.62)], GREEN_BR, 14, cap_top=True)
    ellipsoid(b, 0, 2.75, 0, 0.2, 0.16, 0.22, GILD, 8, 4)
    for sx in (-1, 1):
        tube(b, [(sx * 0.7, 1.9, 0), (sx * 0.98, 2.15, 0), (sx * 1.05, 1.75, 0), (sx * 0.9, 1.5, 0)], 0.045, BRONZE_D, 5)
    lathe(b, [(0.92, 1.1), (0.97, 1.13), (0.97, 1.22), (0.92, 1.25)], GILD, 18)  # đai vàng quanh bụng


@item('gia_kiem')
def _(b, v):
    # Giá kiếm: hai trụ gỗ, ba thanh ngang, 3–5 thanh kiếm cắm nghiêng nhẹ.
    w = 2.8 if v else 2.2
    for sx in (-1, 1):
        b.box(sx * w / 2, 0.9, 0, 0.14, 1.8, 0.14, WOOD_D)
        b.box(sx * w / 2, 0.06, 0, 0.5, 0.12, 0.9, WOOD_D)
        b.cylinder(sx * w / 2, 1.8, 0, 0.1, 0.12, GILD, 8, 0.06)
    for y in (0.5, 1.0, 1.45):
        b.box(0, y, 0, w, 0.07, 0.1, WOOD)
    n = 5 if v else 4
    for k in range(n):
        x = -w / 2 + 0.3 + k * (w - 0.6) / (n - 1)
        b.sword_up(x, 0.0, 0.62, 1.15, 0.12, tilt=0.06 * ((k % 3) - 1), color=STEEL)
    b.box(0, 1.84, 0, w + 0.2, 0.08, 0.2, VERM)


@item('bia_khac')
def _(b, v):
    # Bia khắc chữ thư pháp trên đế rùa/bệ đá; mặt chữ hướng +z.
    h = 2.6 if v else 2.2
    b.box(0, 0.12, 0, 1.7, 0.24, 0.9, STONE_D)
    b.box(0, 0.4, 0, 1.4, 0.32, 0.72, STONE_M)
    b.box(0, 0.56 + h / 2, 0, 1.0, h, 0.26, STONE_L)
    b.box(0, 0.56 + h + 0.07, 0, 1.12, 0.14, 0.34, STONE_M)
    b.box(0, 0.56 + h + 0.2, 0, 0.9, 0.14, 0.3, STONE_L)
    b.box(0, 0.56 + h * 0.5, 0.135, 0.82, h * 0.82, 0.02, JADE_G)
    b.text('Kiếm Đạo' if not v else 'Đạp Thiên', 0, 0.56 + h * 0.62, 0.15, 0.4, 0.04, GILD_TEXT, fit_w=0.7)
    b.text('Lạc Kiếm' if not v else 'Lộ', 0, 0.56 + h * 0.36, 0.15, 0.3, 0.04, GILD_TEXT, fit_w=0.55)


@item('co_phuong')
def _(b, v):
    # Cờ phướn: cột gỗ sơn son, xà ngang, phướn vải dọc rủ cong; biến thể có hai phướn.
    b.cylinder(0, 0, 0, 0.12, 5.0, VERM, 10, 0.09)
    b.cylinder(0, 0, 0, 0.3, 0.3, STONE_M, 10, 0.2)
    b.box(0.55, 4.7, 0, 1.3, 0.08, 0.08, WOOD_D)
    b.cylinder(0, 5.0, 0, 0.14, 0.14, GILD, 8, 0.02)
    flags = [(0.55, CLOTH_R)] + ([(1.0, CLOTH_B)] if v else [])
    for k, (dx, col) in enumerate(flags):
        L = 3.3
        top = 4.65
        for i in range(8):
            t0, t1 = i / 8, (i + 1) / 8
            w0 = dx + math.sin(t0 * 3.1 + k) * 0.12
            w1 = dx + math.sin(t1 * 3.1 + k) * 0.12
            wd = 0.42
            b.face([(w0 - wd / 2, top - t0 * L, 0.01 * i), (w0 + wd / 2, top - t0 * L, 0.01 * i), (w1 + wd / 2, top - t1 * L, 0.01 * (i + 1)), (w1 - wd / 2, top - t1 * L, 0.01 * (i + 1))], col)
        b.text('Kiếm' if k == 0 else 'Tông', dx, top - L * 0.38, 0.03, 0.34, 0.015, GILD_TEXT, fit_w=0.3)


@item('lo_luyen_dan')
def _(b, v):
    # Lò luyện đan: thân tròn ba chân, cửa lò phát sáng, ống khói/nắp cao, hai quai.
    s = 1.15 if v else 1.0
    _feet(b, 3, 0.85 * s, 0.45, IRON, 0.22)
    lathe(b, [(0.0, 0.42), (0.75 * s, 0.45), (0.95 * s, 0.9), (0.9 * s, 1.5), (0.7 * s, 1.95), (0.5 * s, 2.15)], BRONZE, 18)
    lathe(b, [(0.5 * s, 2.15), (0.42 * s, 2.45), (0.3 * s, 2.55), (0.12 * s, 2.9), (0.0, 2.95)], GREEN_BR, 12)
    b.box(0, 0.95, 0.9 * s, 0.5, 0.45, 0.1, IRON)
    b.box(0, 0.95, 0.95 * s, 0.34, 0.3, 0.04, GLOW_R)
    for sx in (-1, 1):
        tube(b, [(sx * 0.82 * s, 1.55, 0), (sx * 1.12 * s, 1.7, 0), (sx * 1.1 * s, 1.35, 0), (sx * 0.92 * s, 1.2, 0)], 0.05, BRONZE_D, 5)
    lathe(b, [(0.93 * s, 1.15), (0.97 * s, 1.2), (0.97 * s, 1.3), (0.93 * s, 1.35)], GILD, 18)


@item('chuong_dong')
def _(b, v):
    # Chuông đồng treo trong giá gỗ chữ A (hai trụ + xà), có dùi.
    s = 1.25 if v else 1.0
    for sx in (-1, 1):
        b.box(sx * 1.3 * s, 1.6 * s, 0.4, 0.2, 3.2 * s, 0.2, VERM_D, yaw=0)
        b.box(sx * 1.3 * s, 1.6 * s, -0.4, 0.2, 3.2 * s, 0.2, VERM_D)
        b.box(sx * 1.3 * s, 0.1, 0, 0.5, 0.2, 1.4, STONE_M)
    b.box(0, 3.25 * s, 0, 2.9 * s, 0.24, 0.3, WOOD_D)
    b.box(0, 3.45 * s, 0, 3.3 * s, 0.1, 0.5, VERM)
    for sx in (-1, 1):
        b.box(sx * 1.1 * s, 3.45 * s, 0, 0.3, 0.3, 0.55, GILD)
    b.cylinder(0, 2.9 * s, 0, 0.07, 0.4, BRONZE_D, 6)
    lathe(b, [(0.1, 2.9 * s), (0.45 * s, 2.7 * s), (0.62 * s, 1.7 * s), (0.75 * s, 0.95 * s), (0.85 * s, 0.82 * s), (0.78 * s, 0.78 * s)], BRONZE, 16)
    lathe(b, [(0.7 * s, 2.15 * s), (0.72 * s, 2.2 * s), (0.72 * s, 2.3 * s), (0.69 * s, 2.35 * s)], GILD, 16)
    b.box(0, 0.9 * s, 1.0, 0.1, 0.1, 1.3, WOOD)  # dùi


@item('trong')
def _(b, v):
    # Trống lớn nằm ngang trên giá gỗ: thân phình, hai mặt da, hàng đinh đồng.
    s = 1.3 if v else 1.0
    b.box(0, 0.12, 0, 1.6 * s, 0.24, 1.2 * s, WOOD_D)
    for sz in (-1, 1):
        b.box(0, 0.5, sz * 0.4 * s, 1.4 * s, 0.5, 0.14, WOOD)
    lathe_x(b, [(0.0, -0.8 * s), (0.64 * s, -0.78 * s), (0.78 * s, -0.4 * s), (0.82 * s, 0.0), (0.78 * s, 0.4 * s), (0.64 * s, 0.78 * s), (0.0, 0.8 * s)], VERM_D, 18, cy=1.0 * s)
    for sx in (-1, 1):  # vành đồng + đinh ở hai mặt
        lathe_x(b, [(0.66 * s, sx * 0.76 * s), (0.7 * s, sx * 0.8 * s), (0.0, sx * 0.8 * s)], CLOTH_W, 18, cy=1.0 * s)
        for k in range(12):
            a = k / 12 * math.tau
            b.cylinder(sx * 0.79 * s, 1.0 * s + math.sin(a) * 0.66 * s, math.cos(a) * 0.66 * s, 0.03, 0.03, GILD, 5)
    b.cylinder(0, 0.4, 0, 0.1, 0.1, GILD, 6)


@item('den_da')
def _(b, v):
    # Đèn đá nhiều tầng: đế, trụ, hộp lửa phát sáng, nón mái, ngọc bảo châu.
    s = 1.0 if not v else 1.25
    lathe(b, [(0.0, 0.0), (0.38 * s, 0.0), (0.38 * s, 0.14 * s), (0.26 * s, 0.2 * s)], STONE_D, 8, smooth=False)
    b.cylinder(0, 0.2 * s, 0, 0.14 * s, 0.9 * s, STONE_M, 8)
    b.cylinder(0, 1.1 * s, 0, 0.36 * s, 0.1 * s, STONE_L, 8, smooth=False)
    b.box(0, 1.35 * s, 0, 0.42 * s, 0.4 * s, 0.42 * s, LAMP)
    for dx, dz in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        b.box(dx * 0.22 * s, 1.35 * s, dz * 0.22 * s, 0.07 * s, 0.44 * s, 0.07 * s, STONE_M)
    lathe(b, [(0.62 * s, 1.58 * s), (0.5 * s, 1.68 * s), (0.2 * s, 1.95 * s), (0.0, 2.0 * s)], STONE_L, 8, smooth=False)
    ellipsoid(b, 0, 2.08 * s, 0, 0.07 * s, 0.1 * s, 0.07 * s, STONE_M, 6, 4)


@item('lu_huong')
def _(b, v):
    # Lư hương đồng: ba chân, bụng tròn, hai tai, nắp thủng, cắm ba nén hương.
    s = 1.0 if not v else 0.85
    _feet(b, 3, 0.4 * s, 0.35 * s, BRONZE_D, 0.12)
    lathe(b, [(0.0, 0.3 * s), (0.42 * s, 0.35 * s), (0.6 * s, 0.6 * s), (0.58 * s, 0.9 * s), (0.5 * s, 1.0 * s)], BRONZE, 16, cap_top=False)
    lathe(b, [(0.5 * s, 1.0 * s), (0.42 * s, 1.0 * s), (0.42 * s, 0.94 * s)], BRONZE_D, 16)
    for sx in (-1, 1):
        tube(b, [(sx * 0.55 * s, 0.95 * s, 0), (sx * 0.78 * s, 1.1 * s, 0), (sx * 0.74 * s, 0.8 * s, 0)], 0.04 * s, BRONZE_D, 5)
    for k in range(3):
        x = (k - 1) * 0.16
        b.cylinder(x, 0.94 * s, 0.0 + 0.05 * (k % 2), 0.014, 0.5 * s, VERM, 5)
        b.cylinder(x, 0.94 * s + 0.5 * s, 0.05 * (k % 2), 0.02, 0.025, GLOW_R, 5)


@item('ban_ghe_da')
def _(b, v):
    # Bàn đá vuông hai chân phiến + bốn ghế trống đá; biến thể: bàn tròn.
    if v:
        b.cylinder(0, 0, 0, 0.24, 0.62, STONE_M, 10, 0.2)
        b.cylinder(0, 0.62, 0, 0.9, 0.12, STONE_L, 16, 0.9)
        b.cylinder(0, 0.0, 0, 0.45, 0.08, STONE_D, 10)
    else:
        for sx in (-1, 1):
            b.box(sx * 0.62, 0.34, 0, 0.18, 0.68, 0.7, STONE_M)
        b.box(0, 0.74, 0, 1.7, 0.12, 0.95, STONE_L)
    for a in (0.0, math.pi / 2, math.pi, 3 * math.pi / 2):
        x, z = math.cos(a) * 1.25, math.sin(a) * 1.0
        b.cylinder(x, 0, z, 0.26, 0.42, STONE_M, 10, 0.22)
        b.cylinder(x, 0.42, z, 0.27, 0.05, STONE_L, 10)
