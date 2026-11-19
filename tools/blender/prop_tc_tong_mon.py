# Nhóm "Tông môn" của PROP-1: 10 món × 2 biến thể (đỉnh lư đồng, giá kiếm, bia khắc, cờ phướn, lò luyện đan,
# chuông đồng, trống, đèn đá, lư hương, bàn ghế đá). Gốc ở tâm đáy, mặt trước +z.
# Đồng: PBR green_metal_rust + patina xanh theo mặt (prop_tc_lib), đai lôi văn và phù văn dát nổi; chữ là phù văn (không dùng chữ Latin nghiêng).
import math

from build_sect import paint

from prop_tc_lib import (
    _GLYPHS,
    BLADE_STEEL,
    BRONZE,
    BRONZE_D,
    CLOTH_B,
    CLOTH_R,
    CLOTH_W,
    CLOTH_Y,
    GILD,
    GILD_TEXT,
    GLOW_R,
    GLOW_Y,
    GREEN_BR,
    INK_TEXT,
    IRON,
    JADE_G,
    LAMP,
    STEEL,
    STONE_D,
    STONE_L,
    STONE_M,
    VERM,
    VERM_D,
    WOOD,
    WOOD_D,
    arch_outline,
    cloth_quad,
    set_text_res,
    weight_from,
    ellipsoid,
    item,
    lathe,
    lathe_x,
    meander,
    rune,
    rune_column,
    tube,
)

GRIP_A = paint(0x6B4A30, 'cloth')  # chuôi quấn vải nâu (hai tông xen kẽ)
GRIP_B = paint(0x4E3623, 'cloth')


def _paw_legs(b, n, r, h, color, w=0.2):
    """Chân thú: đùi thon phình, bàn chân bè có ba móng."""
    for i in range(n):
        a = i / n * math.tau + math.pi / n
        x, z = math.cos(a) * r, math.sin(a) * r
        lathe(b, [(0.0, 0.0), (w * 0.9, 0.0), (w * 0.62, h * 0.35), (w * 0.8, h * 0.8), (w * 0.55, h)], color, 8, x, z, 0.0)
        ellipsoid(b, x + math.cos(a) * w * 0.35, w * 0.35, z + math.sin(a) * w * 0.35, w * 1.15, w * 0.35, w * 1.15, color, 8, 4)
        for k in (-1, 0, 1):
            ax = a + k * 0.5
            b.cylinder(x + math.cos(ax) * w * 1.2, 0.0, z + math.sin(ax) * w * 1.2, w * 0.18, w * 0.3, BRONZE_D, 5, w * 0.06)


def _ear(b, sx, y, r, hgt, color, t=0.09):
    """Quai tai đỉnh truyền thống: hai trụ đứng + xà ngang tạo vòng chữ nhật ở miệng, giữa có thanh nối."""
    for dz in (-0.1, 0.1):
        b.box(sx * r, y + hgt / 2, dz, t, hgt, t, color)
    b.box(sx * r, y + hgt, 0, t * 1.3, t, 0.2 + t, color)
    b.box(sx * r, y + hgt * 0.35, 0, t * 0.8, t * 0.8, 0.2, color)


@item('dinh_lu_dong')
def _(b, v):
    # Đỉnh lư đồng: bụng tròn trên ba chân thú (v: bốn chân, thân vuông), hai quai tai đỉnh, nắp sen, băng hoa văn khắc liền mạch.
    sq = bool(v)
    _paw_legs(b, 4 if sq else 3, 0.62, 0.62, BRONZE_D, 0.17)
    if sq:
        b.box(0, 1.3, 0, 1.5, 1.2, 1.5, BRONZE)
        b.box(0, 1.95, 0, 1.7, 0.12, 1.7, BRONZE_D)
        b.box(0, 0.74, 0, 1.64, 0.1, 1.64, BRONZE_D)
        for k in range(4):  # mặt khắc chìm: hai khung chỉ vàng lồng nhau
            a = k * math.pi / 2
            ox, oz = math.sin(a) * 0.752, math.cos(a) * 0.752
            tx, tz = math.cos(a), -math.sin(a)  # hướng ngang trên mặt
            for w_, h_ in ((1.1, 0.9), (0.9, 0.7)):
                for ds, dy, ln, ht in ((0, h_ / 2, w_, 0.025), (0, -h_ / 2, w_, 0.025), (w_ / 2, 0, 0.025, h_), (-w_ / 2, 0, 0.025, h_)):
                    b.box(ox + tx * ds, 1.3 + dy, oz + tz * ds, ln, ht, 0.025, GILD, yaw=a)
        r_ear = 0.82
    else:
        lathe(b, [(0.0, 0.6), (0.52, 0.62), (0.82, 0.95), (0.92, 1.35), (0.82, 1.75), (0.7, 1.9), (0.82, 1.98), (0.82, 2.06), (0.7, 2.08)], BRONZE, 20)
        meander(b, 1.12, 0.93, 0.2, GILD, 18)
        meander(b, 1.62, 0.88, 0.12, GILD, 14)
        r_ear = 0.78
    top = 2.06
    for sx in (-1, 1):
        _ear(b, sx, top - 0.04, r_ear, 0.5, BRONZE_D)
    lathe(b, [(0.7, top), (0.6, top + 0.12), (0.38, top + 0.34), (0.34, top + 0.46), (0.42, top + 0.52), (0.2, top + 0.68), (0.12, top + 0.86)], GREEN_BR, 14)
    ellipsoid(b, 0, top + 0.98, 0, 0.14, 0.16, 0.14, GILD, 8, 4)
    for k in range(8):
        a = k / 8 * math.tau
        ellipsoid(b, math.cos(a) * 0.36, top + 0.3, math.sin(a) * 0.36, 0.08, 0.2, 0.08, BRONZE, 5, 3, yaw=a)


@item('gia_kiem')
def _(b, v):
    # Giá kiếm: hai trụ gỗ sơn son đầu vàng, ba thanh ngang, 4–5 thanh kiếm thép lưỡi xanh nhẹ, chuôi quấn vải, chắn + đầu chuôi vàng, đế đá.
    w = 2.8 if v else 2.2
    for sx in (-1, 1):
        b.box(sx * w / 2, 0.9, 0, 0.14, 1.8, 0.14, VERM_D)
        b.box(sx * w / 2, 0.08, 0, 0.6, 0.16, 1.0, STONE_M)
        b.cylinder(sx * w / 2, 1.8, 0, 0.1, 0.12, GILD, 8, 0.06)
        ellipsoid(b, sx * w / 2, 1.98, 0, 0.12, 0.1, 0.12, GILD, 6, 4)
    for y in (0.5, 1.0, 1.45):
        b.box(0, y, 0, w, 0.07, 0.1, WOOD)
    n = 5 if v else 4
    for k in range(n):
        x = -w / 2 + 0.3 + k * (w - 0.6) / (n - 1)
        tl = 0.06 * ((k % 3) - 1)
        b.sword_up(x, 0.0, 0.62, 1.15, 0.12, tilt=tl, color=BLADE_STEEL, hilt=False)
        b.box(x, 0.62, 0.0, 0.2, 0.05, 0.12, GILD)
        for j in range(6):  # chuôi quấn vải: vòng dây đỏ/trắng xen kẽ
            b.cylinder(x, 0.2 + j * 0.07, 0.0, 0.034, 0.06, GRIP_A if j % 2 == 0 else GRIP_B, 6)
        ellipsoid(b, x, 0.14, 0.0, 0.05, 0.04, 0.05, GILD, 6, 3)
    b.box(0, 1.84, 0, w + 0.2, 0.08, 0.2, VERM)


@item('bia_khac')
def _(b, v):
    # Bia khắc: bệ bậc, thân bia dày, mặt lõm ngọc lục khắc chữ Việt thư pháp (Charm Bold), viền chỉ vàng, mái bia ba tầng.
    h = 2.6 if v else 2.2
    b.box(0, 0.12, 0, 1.7, 0.24, 0.9, STONE_D)
    b.box(0, 0.4, 0, 1.4, 0.32, 0.72, STONE_M)
    ellipsoid(b, 0, 0.5, 0, 0.5, 0.22, 0.3, STONE_L, 10, 4)
    b.box(0, 0.56 + h / 2, 0, 1.0, h, 0.28, STONE_L)
    b.box(0, 0.56 + h + 0.07, 0, 1.14, 0.14, 0.38, STONE_M)
    b.box(0, 0.56 + h + 0.2, 0, 0.94, 0.14, 0.32, STONE_L)
    b.box(0, 0.56 + h + 0.34, 0, 0.6, 0.12, 0.26, STONE_M)
    b.box(0, 0.56 + h * 0.5, 0.145, 0.82, h * 0.82, 0.02, JADE_G)
    fy, fh = 0.56 + h * 0.5, h * 0.82
    for dy in (-fh / 2 + 0.04, fh / 2 - 0.04):
        b.box(0, fy + dy, 0.158, 0.76, 0.03, 0.012, GILD)
    for dx in (-0.34, 0.34):
        b.box(dx, fy, 0.158, 0.03, fh - 0.06, 0.012, GILD)
    words = ('Lạc Kiếm', 'Kiếm Tâm') if not v else ('Đạp Thiên', 'Lộ')
    set_text_res(1)  # chữ khắc nổi mỏng + ít đoạn cong: mục tiêu lưới gốc ≤ 5000 tam giác để LOD0 không phải rút (review #325)
    b.text(words[0], 0, 0.56 + h * 0.64, 0.158, 0.5, 0.0, INK_TEXT, fit_w=0.64, fit_h=0.5, bold=0.0)
    b.text(words[1], 0, 0.56 + h * 0.34, 0.158, 0.5, 0.0, INK_TEXT, fit_w=0.64, fit_h=0.5, bold=0.0)
    set_text_res(2)


@item('co_phuong')
def _(b, v):
    # Cờ phướn: cột sơn son đầu thương vàng, xà ngang, phướn vải dày (hai mặt + mép) viền vàng, tua rua, chữ Việt thư pháp thêu hai mặt.
    # Trọng số lắc (0 ở mép treo → 1 ở đầu tự do) nằm ở UV.x của mặt vải; client đọc để lắc bằng shader gió.
    b.cylinder(0, 0, 0, 0.12, 5.0, VERM, 10, 0.09)
    b.cylinder(0, 0, 0, 0.3, 0.3, STONE_M, 8, 0.2)
    b.box(0.55, 4.7, 0, 1.3, 0.08, 0.08, WOOD_D)
    ellipsoid(b, 1.22, 4.7, 0, 0.07, 0.07, 0.07, GILD, 6, 3)
    lathe(b, [(0.0, 5.0), (0.1, 5.0), (0.07, 5.2), (0.0, 5.5)], GILD, 6)
    cols = [(0.55, CLOTH_R, ('Kiếm',)), (1.05, CLOTH_B, ('Thiên',))] if v else [(0.55, CLOTH_R, ('Lạc',))]
    L, wd, th, top, n = 3.2, 0.5, 0.04, 4.66, 10

    def curve(dx, t):
        return dx + math.sin(t * 3.4 + dx * 3) * 0.07 * t

    for dx, col, words in cols:
        for side in (1, -1):
            for i in range(n):
                t0, t1 = i / n, (i + 1) / n
                x0, x1 = curve(dx, t0), curve(dx, t1)
                zf = side * th / 2
                y0, y1 = top - t0 * L, top - t1 * L
                quad = [(x0 - wd / 2, y0, zf), (x0 + wd / 2, y0, zf), (x1 + wd / 2, y1, zf), (x1 - wd / 2, y1, zf)]
                cloth_quad(b, quad[::-1] if side > 0 else quad, col, top, L)
                for sx in (-1, 1):  # viền vàng
                    e = [(x0 + sx * (wd / 2 - 0.06), y0, zf + 0.006 * side), (x0 + sx * wd / 2, y0, zf + 0.006 * side), (x1 + sx * wd / 2, y1, zf + 0.006 * side), (x1 + sx * (wd / 2 - 0.06), y1, zf + 0.006 * side)]
                    cloth_quad(b, e[::-1] if sx * side > 0 else e, CLOTH_Y, top, L)
        for sx in (-1, 1):  # mép dày hai bên
            xa, xb = curve(dx, 0), curve(dx, 1)
            edge = [(xa + sx * wd / 2, top, -th / 2), (xa + sx * wd / 2, top, th / 2), (xb + sx * wd / 2, top - L, th / 2), (xb + sx * wd / 2, top - L, -th / 2)]
            cloth_quad(b, edge[::-1] if sx > 0 else edge, CLOTH_Y, top, L)
        xe = curve(dx, 1)
        yb = top - L
        for k in range(7):  # tua rua
            tx = xe - wd / 2 + (k + 0.5) * wd / 7
            for side in (1, -1):
                q = [(tx - 0.012, yb, side * th / 2), (tx + 0.012, yb, side * th / 2), (tx + 0.012, yb - 0.22, side * th / 2), (tx - 0.012, yb - 0.22, side * th / 2)]
                cloth_quad(b, q[::-1] if side > 0 else q, CLOTH_Y, top, L)
        set_text_res(1)
        for wi, word in enumerate(words):  # chữ thêu hai mặt, đi theo vải (trọng số lắc)
            yy = top - 1.2 - wi * 0.75
            xm = curve(dx, (top - yy) / L)
            n0 = len(b.faces)
            b.text(word, xm, yy, th / 2 + 0.01, 0.5, 0.0, CLOTH_Y, fit_w=0.36, fit_h=0.5, bold=0.0)
            b.text(word, xm, yy, -th / 2 - 0.01, 0.5, 0.0, CLOTH_Y, yaw=math.pi, fit_w=0.36, fit_h=0.5, bold=0.0)
            weight_from(b, n0, top, L)
        set_text_res(2)


@item('lo_luyen_dan')
def _(b, v):
    # Lò luyện đan: thân đồng tròn trên ba chân thú, cửa lò vòm có lửa cháy, đai lôi văn, hai quai đầu thú, nắp ống khói nhiều tầng.
    s = 1.15 if v else 1.0
    _paw_legs(b, 3, 0.8 * s, 0.55, BRONZE_D, 0.22)
    lathe(b, [(0.0, 0.5), (0.7 * s, 0.55), (0.98 * s, 0.95), (0.98 * s, 1.5), (0.78 * s, 1.98), (0.55 * s, 2.15)], BRONZE, 20)
    meander(b, 1.7 * s, 0.9 * s, 0.18, GILD, 18)
    meander(b, 0.78 * s, 0.9 * s, 0.14, GILD, 18)
    zf = 0.99 * s
    b.prism(arch_outline(0.72, 0.95), zf - 0.02, zf + 0.12, BRONZE_D, 0.0, 0.72)
    b.prism(arch_outline(0.5, 0.78), zf + 0.12, zf + 0.14, IRON, 0.0, 0.74)
    flame = [(-0.17, 0.0), (0.17, 0.0), (0.2, 0.22), (0.08, 0.4), (0.13, 0.6), (-0.02, 0.5), (-0.1, 0.68), (-0.12, 0.38), (-0.2, 0.2)]
    b.prism(flame, zf + 0.14, zf + 0.17, GLOW_R, 0.0, 0.78)
    b.prism([(-0.08, 0.0), (0.08, 0.0), (0.06, 0.24), (0.0, 0.34), (-0.05, 0.22)], zf + 0.17, zf + 0.19, GLOW_Y, 0.0, 0.8)
    b.box(0, 0.7, zf + 0.12, 0.9, 0.06, 0.34, STONE_M)
    for sx in (-1, 1):
        for k in range(3):
            ellipsoid(b, sx * 0.43, 0.9 + k * 0.28, zf + 0.12, 0.03, 0.03, 0.03, GILD, 5, 3)
    for sx in (-1, 1):
        ellipsoid(b, sx * 0.96 * s, 1.5, 0, 0.12, 0.12, 0.12, GILD, 6, 4)
        tube(b, [(sx * 1.02 * s, 1.5, 0), (sx * 1.2 * s, 1.35, 0), (sx * 1.2 * s, 1.1, 0), (sx * 1.02 * s, 0.98, 0)], 0.05, BRONZE_D, 6, sub=3)
    lathe(b, [(0.55 * s, 2.15), (0.44 * s, 2.35), (0.46 * s, 2.45), (0.3 * s, 2.62), (0.22 * s, 2.64), (0.24 * s, 2.9), (0.1 * s, 3.0), (0.0, 3.1)], GREEN_BR, 14)
    for k in range(6):
        a = k / 6 * math.tau
        ellipsoid(b, math.cos(a) * 0.4 * s, 2.35, math.sin(a) * 0.4 * s, 0.07, 0.15, 0.07, BRONZE, 5, 3, yaw=a)


@item('chuong_dong')
def _(b, v):
    # Chuông đồng treo trong giá gỗ sơn son: thân chuông miệng loe, ba băng hoa văn khắc, bốn ô núm (vú chuông 3×3) ngăn bằng gờ vàng, dùi gỗ.
    s = 1.25 if v else 1.0
    for sx in (-1, 1):
        b.box(sx * 1.3 * s, 1.6 * s, 0.4, 0.2, 3.2 * s, 0.2, VERM_D)
        b.box(sx * 1.3 * s, 1.6 * s, -0.4, 0.2, 3.2 * s, 0.2, VERM_D)
        b.box(sx * 1.3 * s, 0.1, 0, 0.5, 0.2, 1.4, STONE_M)
    b.box(0, 3.25 * s, 0, 2.9 * s, 0.24, 0.3, WOOD_D)
    b.box(0, 3.45 * s, 0, 3.3 * s, 0.1, 0.5, VERM)
    for sx in (-1, 1):
        b.box(sx * 1.1 * s, 3.45 * s, 0, 0.3, 0.3, 0.55, GILD)
    b.cylinder(0, 2.9 * s, 0, 0.07, 0.4, BRONZE_D, 6)
    prof = [(0.1, 2.9 * s), (0.34 * s, 2.78 * s), (0.5 * s, 2.3 * s), (0.58 * s, 1.5 * s), (0.7 * s, 1.0 * s), (0.9 * s, 0.84 * s), (1.0 * s, 0.8 * s)]
    lathe(b, prof + [(1.04 * s, 0.77 * s), (0.98 * s, 0.74 * s)], BRONZE, 22)
    ellipsoid(b, 0, 2.86 * s, 0, 0.12, 0.1, 0.12, GILD, 6, 3)

    def rb(y):  # bán kính thân chuông ở độ cao y
        for (r0, y0), (r1, y1) in zip(prof, prof[1:]):
            if y1 <= y <= y0:
                return r1 + (r0 - r1) * (y - y1) / (y0 - y1)
        return prof[-1][0]

    meander(b, 2.46 * s, rb(2.46 * s), 0.16, GILD, 14)
    meander(b, 0.98 * s, rb(0.98 * s), 0.14, GILD, 14)
    meander(b, 1.55 * s, rb(1.55 * s), 0.06, GILD, 12)
    for k in range(4):  # bốn ô núm 3×3 giữa các gờ đứng vàng
        a0 = k * math.pi / 2
        for dy in range(3):
            y = (1.78 + dy * 0.2) * s
            for dx in (-1, 0, 1):
                a = a0 + dx * 0.3
                rr = rb(y) + 0.02
                ellipsoid(b, math.sin(a) * rr, y, math.cos(a) * rr, 0.05 * s, 0.05 * s, 0.05 * s, GILD, 5, 2)
        ar = a0 + math.pi / 4
        rr = rb(2.0 * s) + 0.012
        b.box(math.sin(ar) * rr, 2.0 * s, math.cos(ar) * rr, 0.025, 0.7 * s, 0.025, GILD, yaw=ar)
    b.box(0, 0.9 * s, 1.1, 0.1, 0.1, 1.3, WOOD)


@item('trong')
def _(b, v):
    # Trống lớn nằm ngang trên giá gỗ: thân phình, hai mặt da, hàng đinh đồng.
    s = 1.3 if v else 1.0
    b.box(0, 0.12, 0, 1.6 * s, 0.24, 1.2 * s, WOOD_D)
    for sz in (-1, 1):
        b.box(0, 0.5, sz * 0.4 * s, 1.4 * s, 0.5, 0.14, WOOD)
    lathe_x(b, [(0.0, -0.8 * s), (0.64 * s, -0.78 * s), (0.78 * s, -0.4 * s), (0.82 * s, 0.0), (0.78 * s, 0.4 * s), (0.64 * s, 0.78 * s), (0.0, 0.8 * s)], VERM_D, 18, cy=1.0 * s)
    for sx in (-1, 1):
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
    # Lư hương đồng: ba chân thú, bụng tròn đai lôi văn, hai quai tai, cắm ba nén hương.
    s = 1.0 if not v else 0.85
    _paw_legs(b, 3, 0.42 * s, 0.38 * s, BRONZE_D, 0.12)
    lathe(b, [(0.0, 0.3 * s), (0.42 * s, 0.35 * s), (0.6 * s, 0.6 * s), (0.58 * s, 0.9 * s), (0.5 * s, 1.0 * s)], BRONZE, 18, cap_top=False)
    lathe(b, [(0.5 * s, 1.0 * s), (0.42 * s, 1.0 * s), (0.42 * s, 0.94 * s)], BRONZE_D, 16)
    meander(b, 0.72 * s, 0.6 * s, 0.1, GILD, 16)
    for sx in (-1, 1):
        _ear(b, sx, 0.9 * s, 0.56 * s, 0.32 * s, BRONZE_D, 0.06)
    for k in range(3):
        x = (k - 1) * 0.16
        b.cylinder(x, 0.94 * s, 0.05 * (k % 2), 0.014, 0.5 * s, VERM, 5)
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
