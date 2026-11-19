# Kiến trúc Thiên Khuyết trên trời (MAP-4, phong cách B): dựng từ bộ kit "Thiên Công Khai Vật" (thien_cong_kit.py)
# với bảng màu riêng (ngọc trắng ngà, ngói lưu ly vàng + sống mái tím, cột son, vàng kim) và xuất GLB `arch_thien_khuyet`.
#
#   blender --background --python tools/blender/thien_khuyet_arch.py -- assets/build/raw/arch_thien_khuyet.glb
#
# Gốc toạ độ = tâm quảng trường Điện Tiền (1044, 80, 374); x = đông, y = lên, z = nam. Dữ liệu (đảo, bậc thang, tượng, cột)
# lấy từ packages/content/data/levels/thien_khuyet.assets.json khối `thienKhuyetSky`, cùng nguồn với client (thienKhuyetSky.ts).
# Hai object: `tk_main` (bậc thang, Cổng Tiên Vỡ, tiên cung, cột dọc đại lộ) và `tk_statue` (tượng thần đổ; client hạ theo độ cao đất).

import json
import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_sect as bs  # noqa: E402
import thien_cong_kit as kit  # noqa: E402
import thien_cong_sect as ts  # noqa: E402
from build_sect import paint  # noqa: E402
from thien_cong_kit import new_builder  # noqa: E402

CX, CY, CZ = 1044.0, 80.0, 374.0

# Miền UV rộng hơn vì công trình trải ±450 m.
bs.UV_ORIGIN, bs.UV_RANGE = 520.0, 1100

# ---------- bảng màu Thiên Khuyết (đè màu của kit; các mảnh đọc biến toàn cục lúc dựng) ----------
kit.JADE = paint(0xE6E2EA, 'jade')  # ngọc trắng ngà ánh lam
kit.JADE_SHADE = paint(0xB7B0C2, 'jade')
kit.JADE_GREEN = paint(0x9A86C8, 'jade')  # nhấn tím ngọc (tấm chạm, bia)
kit.CLOUD = paint(0xEFE9E0, 'plaster')
kit.GLAZE = paint(0xD9A93A, 'tile')  # ngói lưu ly vàng
kit.GLAZE_DARK = paint(0x6A3FA8, 'tile')  # sống mái, bờ dải tím
kit.VERMILION = paint(0xB5332D, 'lacquer')
kit.GILD = paint(0xE0B652, 'metal')
GOLD_LIT = paint(0xFFC24A, 'lamp')  # vết nứt phát sáng vàng
STONE_DK = paint(0x8B8496, 'jade')
CHIP = paint(0xD7D0DC, 'jade')


def build_data():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'packages', 'content', 'data', 'levels', 'thien_khuyet.assets.json')
    with open(p, encoding='utf8') as f:
        return json.load(f)['thienKhuyetSky']


def loc(x, y, z):
    """Toạ độ thế giới → cục bộ (gốc quảng trường)."""
    return x - CX, y - CY, z - CZ


def xform(b, start, piv, rx=0.0, ry=0.0, rz=0.0, d=(0.0, 0.0, 0.0)):
    """Xoay các đỉnh `b.verts[start:]` quanh `piv` (toạ độ game): quanh x (rx, ngẩng/chúi), quanh z (rz, nghiêng bên), quanh y (ry), rồi dịch `d`."""
    cx_, sx_ = math.cos(rx), math.sin(rx)
    cz_, sz_ = math.cos(rz), math.sin(rz)
    cy_, sy_ = math.cos(ry), math.sin(ry)
    for i in range(start, len(b.verts)):
        X, Y, Z = b.verts[i]
        x, y, z = X - piv[0], Z - piv[1], -Y - piv[2]
        y, z = y * cx_ - z * sx_, y * sx_ + z * cx_  # quanh x
        x, y = x * cz_ - y * sz_, x * sz_ + y * cz_  # quanh z
        x, z = x * cy_ + z * sy_, -x * sy_ + z * cy_  # quanh y
        b.verts[i] = bs.P(x + piv[0] + d[0], y + piv[1] + d[1], z + piv[2] + d[2])


def place_t(b, pid, x, y, z, yaw=0.0, scale=1.0, rx=0.0, rz=0.0, ry=0.0):
    """Đặt mảnh kit rồi nghiêng quanh chân mảnh (mảnh đổ, mái trượt)."""
    start = len(b.verts)
    b.place(pid, x, y, z, yaw, scale)
    if rx or rz or ry:
        xform(b, start, (x, y, z), rx, ry, rz)


def broken_column(b, x, y0, z, r, h, rnd, glow=True):
    """Cột son gãy: thân cụt, mảnh vụn nứt ở đầu, vết nứt phát sáng vàng."""
    b.box(x, y0 + 0.35 * r, z, r * 3.4, r * 0.7, r * 3.4, kit.JADE_SHADE)
    b.column(x, y0 + 0.7 * r, z, r, h)
    top = y0 + 0.7 * r + h
    for k in range(4):
        a = rnd.uniform(0, math.tau)
        w = r * rnd.uniform(0.4, 0.8)
        hh = r * rnd.uniform(0.5, 1.6)
        start = len(b.verts)
        b.box(x + math.cos(a) * r * 0.5, top + hh / 2 - 0.1, z + math.sin(a) * r * 0.5, w, hh, w * 0.9, kit.VERMILION_DARK)
        xform(b, start, (x + math.cos(a) * r * 0.5, top, z + math.sin(a) * r * 0.5), rnd.uniform(-0.5, 0.5), 0, rnd.uniform(-0.5, 0.5))
    if glow:
        for k in range(3):
            a = rnd.uniform(0, math.tau)
            b.box(x + math.cos(a) * r * 0.98, top - h * rnd.uniform(0.1, 0.3), z + math.sin(a) * r * 0.98, r * 0.08, h * rnd.uniform(0.2, 0.4), r * 0.08, GOLD_LIT, yaw=-a)


def rubble(b, x, y, z, n, size, rnd, spread=1.0):
    for _ in range(n):
        s = size * rnd.uniform(0.35, 1.0)
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0, spread)
        px, pz = x + math.cos(a) * d, z + math.sin(a) * d
        start = len(b.verts)
        b.box(px, y + s * 0.3, pz, s, s * 0.6, s * 0.8, kit.JADE if rnd.random() < 0.6 else kit.JADE_SHADE, yaw=rnd.uniform(0, 3))
        xform(b, start, (px, y, pz), rnd.uniform(-0.5, 0.5), 0, rnd.uniform(-0.5, 0.5))


# ---------- bậc thang xoắn lên trời ----------


def stair_pt(s, u):
    a = s['a0'] + s['turns'] * math.tau * u
    r = s['r0'] + (s['r1'] - s['r0']) * u
    return a, r, math.cos(a) * r, math.sin(a) * r, s['y0'] - CY + (s['y1'] - s['y0']) * u


# Chân thang nằm trên lối đi (đại lộ, điểm nhiệm vụ) mà thang không có va chạm: bỏ mọi bậc thấp hơn mức này (m so với mặt quảng trường),
# thang bắt đầu lơ lửng trên tầm đầu người; người chơi đi qua bên dưới.
MIN_Y = 18.0


def build_stair(b, s, rnd):
    length = s['turns'] * math.tau * (s['r0'] + s['r1']) / 2
    n = int(round(length / 2.4))
    rise = (s['y1'] - s['y0']) / n
    wid = s['width']
    prev = None
    for i in range(n):
        u = (i + 0.5) / n
        a, r, x, z, y = stair_pt(s, u)
        if y < MIN_Y:
            continue
        yaw = math.atan2(-math.cos(a), -math.sin(a))
        miss = i > 14 and i < n - 8 and rnd.random() < 0.05
        if not miss:
            sk = wid * (1.0 - 0.06 * rnd.random())
            col = kit.JADE if i % 2 == 0 else kit.JADE_SHADE
            start = len(b.verts)
            # bậc: tấm dày, mép trước vát; thân treo bên dưới
            b.box(x, y - rise * 1.5, z, 2.55, rise * 3.0 + 0.2, sk, col, yaw=yaw)
            if i % 3 == 0:
                tx, tz = -math.sin(a), math.cos(a)
                nx, nz = math.cos(a), math.sin(a)
                b.box(x - tx * 1.3, y + rise * 0.05, z - tz * 1.3, 0.14, 0.1, sk * 0.96, GOLD_LIT if i % 15 == 0 else kit.GILD, yaw=yaw)
            if rnd.random() < 0.07:  # bậc mẻ góc
                xform(b, start, (x, y, z), rnd.uniform(-0.08, 0.08), 0, rnd.uniform(-0.12, 0.12))
        # thân thang treo (đá thô, mỗi 4 bậc): dày dần rồi thu nhọn
        if i % 4 == 0:
            th = 5.0 + 3.0 * math.sin(i * 0.31) + rnd.uniform(0, 2)
            start = len(b.verts)
            b.box(x, y - rise * 3 - th / 2, z, 9.6, th, wid * 0.86, STONE_DK, yaw=yaw)
            xform(b, start, (x, y, z), rnd.uniform(-0.1, 0.1), 0, rnd.uniform(-0.12, 0.12))
            for k in range(2):  # nhũ đá dưới thân
                a2 = rnd.uniform(0, math.tau)
                start = len(b.verts)
                b.cylinder(x + math.cos(a2) * 2, y - rise * 3 - th - 4.0, z + math.sin(a2) * 2, 0.15, 5 + rnd.random() * 4, STONE_DK, 6, 1.0)
                xform(b, start, (x, y - rise * 3 - th, z), math.pi, 0, 0)
        # đèn đá hai bên mỗi 18 bậc
        if i % 18 == 9:
            for sd in (-1, 1):
                lx = x + math.cos(a) * sd * wid * 0.56
                lz = z + math.sin(a) * sd * wid * 0.56
                b.place('prop_den_da', lx, y, lz, yaw=0.0, scale=1.0)
        prev = (x, z, y)
    # lan can ngọc theo đường cong: mỗi đoạn 5 bậc, có đoạn gãy (chỉ còn trụ), có đoạn đổ
    seg = 5
    for i in range(0, n - seg, seg):
        for sd in (-1, 1):
            u0, u1 = i / n, (i + seg) / n
            a0_, r0_, x0, z0, y0 = stair_pt(s, u0)
            a1_, r1_, x1, z1, y1 = stair_pt(s, u1)
            if y0 < MIN_Y:
                continue
            off = wid * 0.53 * sd
            p0 = (x0 + math.cos(a0_) * off, z0 + math.sin(a0_) * off)
            p1 = (x1 + math.cos(a1_) * off, z1 + math.sin(a1_) * off)
            q = rnd.random()
            ym = (y0 + y1) / 2
            if q < 0.72:
                b.balustrade(p0[0], p0[1], p1[0], p1[1], y=ym + 0.1, h=1.0, post=4.0)
            elif q < 0.9:
                b.box(p0[0], ym + 0.5, p0[1], 0.3, 1.0, 0.3, kit.JADE_SHADE)
                rubble(b, (p0[0] + p1[0]) / 2, ym, (p0[1] + p1[1]) / 2, 3, 0.9, rnd, 1.5)
            if i % 25 == 0:
                b.place('cot_vuong_ngoc', p0[0], ym, p0[1], scale=0.8)


# ---------- Cổng Tiên Vỡ ----------


def build_gate(b, isl, rnd):
    x0, y0, z0 = loc(isl['x'], isl['y'], isl['z'])
    P = b.place
    # nền ba bậc rộng, mép vỡ
    top = b.plinth(x0, z0 + 6, 96, 54, tiers=3, h=3.6, inset=4.0) if False else None
    for k in range(3):
        w, d = 100 - k * 14, 58 - k * 9
        b.box(x0, y0 + 0.6 + k * 1.2, z0 + 6, w, 1.2, d, kit.JADE if k % 2 == 0 else kit.JADE_SHADE)
    ground = y0 + 3.6
    span = 33.0
    # hai cột rồng khổng lồ: trái còn nguyên, phải gãy
    P('cot_rong', x0 - span, ground, z0, scale=12.0)
    for k in range(6):  # đai vàng lớn quanh cột trái
        b.cylinder(x0 - span, ground + 8 + k * 12, z0, 7.0, 0.8, kit.GILD, 16, 6.6)
    broken_column(b, x0 + span, ground, z0, 5.2, 46.0, rnd)
    # phần thân trên của cột phải: đổ nằm trên sàn
    start = len(b.verts)
    P('cot_rong', x0 + span + 28, ground, z0 + 18, scale=7.0)
    xform(b, start, (x0 + span + 28, ground, z0 + 18), math.pi / 2 - 0.12, 0.6, 0.0, d=(0, 2.6, 0))
    # xà ngang + đấu củng đỡ mái bên trái, mái lưu ly vàng trượt xuống
    P('dau_cung_dai', x0 - span * 0.45, ground + 78, z0, scale=4.0)
    b.box(x0 - span * 0.5, ground + 76.5, z0, span * 1.1, 3.0, 4.5, kit.VERMILION_DARK)
    b.box(x0 - span * 0.5, ground + 78.4, z0 + 2.4, span * 1.1, 1.2, 0.5, GOLD_LIT)
    place_t(b, 'mai_cong', x0 - span * 0.55, ground + 82, z0, scale=2.7, rz=-0.06)
    place_t(b, 'mai_cong', x0 + 6, ground + 28, z0 + 2, scale=3.0, rx=0.02, rz=0.42)  # nửa mái rơi dựa vào cột phải
    P('bo_noc_tri_vat', x0 - span * 0.55, ground + 92.5, z0, scale=3.4)
    # hoành phi "Thiên Khuyết" treo nghiêng một đầu
    place_t(b, 'hoanh_phi', x0 - 2, ground + 62, z0 + 3, scale=3.4, rz=0.28)
    # bia khắc phù văn hai bên, vết nứt phát sáng vàng chạy trên nền
    for sx in (-1, 1):
        P('prop_bia_khac', x0 + sx * 60, y0 + 3.6, z0 + 14, yaw=-sx * 0.3, scale=3.4)
        P('tru_da_khac_phu', x0 + sx * 49, y0 + 3.6, z0 + 24, scale=3.4)
        P('prop_dinh_lu', x0 + sx * 20, y0 + 3.6, z0 + 24, scale=3.2)
    for k in range(9):  # mạch vàng trên nền như nứt đá
        a = rnd.uniform(-0.6, 0.6)
        zz = z0 + 18 + rnd.uniform(-8, 12)
        xx = x0 + rnd.uniform(-45, 45)
        b.box(xx, y0 + 3.62, zz, rnd.uniform(6, 16), 0.06, 0.28, GOLD_LIT, yaw=a)
    rubble(b, x0 + span + 6, y0 + 3.6, z0 + 14, 14, 5.0, rnd, 22)
    rubble(b, x0 - span - 8, y0 + 3.6, z0 + 16, 8, 3.5, rnd, 16)
    # mảnh vỡ trời quanh cổng (khối đá ngọc trôi, một mặt phát sáng vàng)
    for k in range(30):
        a = rnd.uniform(0, math.tau)
        rr = rnd.uniform(46, 96)
        yy = ground + rnd.uniform(8, 100)
        s = rnd.uniform(1.5, 6.0)
        px, pz = x0 + math.cos(a) * rr, z0 - 6 + math.sin(a) * rr * 0.5
        start = len(b.verts)
        b.box(px, yy, pz, s, s * rnd.uniform(0.5, 1.2), s * 0.8, kit.JADE_SHADE if k % 3 else kit.JADE, yaw=rnd.uniform(0, 3))
        if k % 5 == 0:
            b.box(px, yy, pz, s * 0.2, s * 1.1, s * 0.25, GOLD_LIT)
        xform(b, start, (px, yy, pz), rnd.uniform(0, 3), rnd.uniform(0, 3), rnd.uniform(0, 3))


# ---------- tiên cung đổ nát trên đảo ----------


def build_palace(b, isl, rnd, big):
    x0, y0, z0 = loc(isl['x'], isl['y'], isl['z'])
    P = b.place
    W, D = (46, 34) if big else (36, 28)
    base = b.plinth(x0, z0, W, D, tiers=3, h=1.8, inset=1.1)
    g = y0 + base
    P('nen_ngoc_3', x0, g - 0.1, z0 + D / 2 + 3, scale=1.0)
    # cột son quanh điện: hàng trước nguyên, hàng sau gãy
    nx = 5
    for i in range(nx):
        cx = x0 - W * 0.42 + i * (W * 0.84 / (nx - 1))
        if rnd.random() < 0.7:
            P('cot_dau_cung', cx, g, z0 + D * 0.38, scale=1.9)
        else:
            broken_column(b, cx, g, z0 + D * 0.38, 0.85, 4 + rnd.random() * 5, rnd)
        broken_column(b, cx, g, z0 - D * 0.38, 0.85, 3 + rnd.random() * 9, rnd, glow=i % 2 == 0)
    # tường sau còn một mảng + cửa chạm khắc
    P('tuong_voi', x0 - W * 0.2, g, z0 - D * 0.46, scale=1.7)
    P('cua_cham_khac', x0 + W * 0.12, g, z0 - D * 0.46, scale=1.5)
    # mái ngói lưu ly vàng trượt khỏi cột, nằm nghiêng
    place_t(b, 'mai_hip_lon' if big else 'mai_hip_vua', x0 - W * 0.05, g + 12.5, z0, scale=2.1 if big else 1.9, rz=0.1, rx=-0.05)
    P('dau_cung_dai', x0 - W * 0.25, g + 11.2, z0 + D * 0.38, scale=2.0)
    place_t(b, 'mai_hien', x0 + W * 0.4, g + 0.5, z0 + D * 0.55, scale=2.4, rz=0.5, rx=0.2)  # mảnh mái rơi
    P('bo_noc_tri_vat', x0 - W * 0.05, g + 18.5, z0, scale=2.2)
    place_t(b, 'dau_dao_goc', x0 + W * 0.3, g + 1.0, z0 - D * 0.1, scale=2.6, rz=0.8, rx=0.4)
    # bậc lên điện, lan can gãy, đèn đá, sư tử đá
    P('bac_them_ngoc', x0, y0, z0 + D / 2 + 1.5, scale=1.4)
    b.balustrade(x0 - W / 2 + 1, z0 + D / 2 + 1, x0 - 6, z0 + D / 2 + 1, y=g, h=1.0)
    b.balustrade(x0 + 8, z0 + D / 2 + 1, x0 + 14, z0 + D / 2 + 1, y=g, h=1.0)
    P('prop_su_tu_da', x0 - 8, g, z0 + D / 2 + 3, yaw=0.3, scale=1.8)
    start = len(b.verts)
    P('prop_su_tu_da', x0 + 8, g, z0 + D / 2 + 3, yaw=-0.3, scale=1.8)
    xform(b, start, (x0 + 8, g, z0 + D / 2 + 3), 0.9, 0, 0.5)  # sư tử đổ
    for sx in (-1, 1):
        P('prop_den_da', x0 + sx * (W / 2 - 1), g, z0 + D / 2, scale=1.4)
    # mạch vàng phát sáng trên nền, mảnh ngọc, rác đá
    for k in range(6):
        b.box(x0 + rnd.uniform(-W / 2, W / 2) * 0.8, g + 0.02, z0 + rnd.uniform(-D / 2, D / 2) * 0.8, rnd.uniform(3, 8), 0.05, 0.22, GOLD_LIT, yaw=rnd.uniform(0, 3))
    rubble(b, x0 + W * 0.25, g, z0 + D * 0.1, 10, 2.2, rnd, 9)
    # cột đổ nằm trên sân đảo
    start = len(b.verts)
    P('cot_dau_cung', x0 - W * 0.62, g, z0 + 10, scale=1.7)
    xform(b, start, (x0 - W * 0.62, g, z0 + 10), math.pi / 2 - 0.1, 0.4, 0, d=(0, 1.4, 0))


# ---------- cột dọc đại lộ ----------


def build_avenue_pillars(b, n, rnd):
    placed = 0
    guard = 0
    while placed < n and guard < 600:
        guard += 1
        side = -1 if rnd.random() < 0.5 else 1
        z = 470 + rnd.random() * 600
        x = 1034 + side * (46 + rnd.random() * 40) + (z - 470) * 0.004
        if math.hypot(x - 1144, z - 684) < 50:
            continue
        lx, _, lz = loc(x, 0, z)
        ly = -1.2
        q = rnd.random()
        b.box(lx, ly + 0.6, lz, 3.6, 1.6, 3.6, kit.JADE_SHADE)
        if q < 0.5:
            broken_column(b, lx, ly + 1.4, lz, 0.9, 3 + rnd.random() * 9, rnd)
        elif q < 0.8:
            b.place('cot_dau_cung', lx, ly + 1.4, lz, scale=1.6)
        else:
            start = len(b.verts)
            b.place('cot_rong', lx, ly + 1.4, lz, scale=1.5)
            xform(b, start, (lx, ly + 1.4, lz), math.pi / 2 - 0.1, rnd.uniform(0, 6), 0, d=(0, 1.0, 0))
        if rnd.random() < 0.25:
            b.place('prop_den_da', lx + 3, ly + 1.4, lz + 2, scale=1.2)
        placed += 1


# ---------- tượng thần khổng lồ gãy đổ ----------


def build_statue(b, st, rnd):
    """Thần tướng giáp trụ cao ~`size` m dựng đứng rồi cho đổ: thân nghiêng, đầu và cánh tay phải rời ra, đại đao cắm bên cạnh."""
    S = st['size'] / 64.0
    J, JS, G, V = kit.JADE, kit.JADE_SHADE, kit.GILD, kit.VERMILION
    # Chân (hai ống giáp có ống quyển vàng) + đai lưng.
    parts = {}

    def seg(name, fn):
        start = len(b.verts)
        fn()
        parts[name] = (start, len(b.verts))

    def legs():
        for sx in (-1, 1):
            b.cylinder(sx * 5 * S, 0, 0, 3.6 * S, 26 * S, J, 14, 3.0 * S)
            b.cylinder(sx * 5 * S, 0, 0, 3.9 * S, 5 * S, G, 14, 3.9 * S)  # ủng vàng
            b.box(sx * 5 * S, 27 * S, 0, 8 * S, 3 * S, 8 * S, JS)  # đầu gối giáp
            b.box(sx * 5 * S, 14 * S, 3.1 * S, 1.6 * S, 18 * S, 1.2 * S, G)

    def torso():
        b.box(0, 30 * S, 0, 17 * S, 4 * S, 9 * S, V)  # đai lưng son
        b.box(0, 32.5 * S, 0, 18 * S, 2 * S, 9.4 * S, G)
        b.cylinder(0, 33 * S, 0, 8.4 * S, 14 * S, J, 18, 10.2 * S)  # thân giáp loe lên vai
        for k in range(6):  # giáp lá xếp tầng
            b.box(0, (34 + k * 2.2) * S, 4.4 * S, (13 - k * 0.2) * S, 1.9 * S, 1.0 * S, JS if k % 2 else J)
        b.box(0, 40 * S, 5.0 * S, 5 * S, 5 * S, 0.8 * S, G)  # hộ tâm kính vàng
        for sx in (-1, 1):
            for k in range(3):  # vai giáp ba lớp
                b.cylinder(sx * 11 * S, (46 + k * 1.6) * S, 0, (6.0 - k * 0.7) * S, 1.6 * S, JS if k % 2 else J, 14, (5.5 - k * 0.7) * S)
            b.box(sx * 11 * S, 46.5 * S, 0, 11 * S, 0.4 * S, 6 * S, G)
        b.cylinder(0, 47 * S, 0, 3.4 * S, 3 * S, JS, 12, 2.6 * S)  # cổ

    def head():
        b.cylinder(0, 0, 0, 3.4 * S, 6.5 * S, J, 18, 3.2 * S)
        b.cylinder(0, 5.4 * S, 0, 3.7 * S, 3 * S, G, 18, 3.0 * S)  # mũ trụ vàng
        b.cylinder(0, 7.8 * S, 0, 2.6 * S, 1.2 * S, JS, 14, 0.4 * S)
        for k in range(5):  # mào lông
            b.box(0, (8 + k * 0.4) * S, (-1.6 + k * 0.8) * S, 0.5 * S, (4.5 - abs(k - 2) * 0.8) * S, 0.5 * S, V)
        b.box(0, 3.2 * S, 3.1 * S, 3.2 * S, 0.6 * S, 0.5 * S, JS)  # tấm che mặt
        for sx in (-1, 1):
            b.box(sx * 3.5 * S, 4.4 * S, 0.8 * S, 0.8 * S, 3.0 * S, 2.4 * S, G)  # hộ nhĩ

    def arm_left():
        b.cylinder(-11 * S, 30 * S, 0, 2.6 * S, 16 * S, J, 12, 2.9 * S)
        b.cylinder(-11 * S, 28 * S, 0, 3.0 * S, 3 * S, G, 12, 2.6 * S)
        b.box(-11 * S, 27 * S, 0, 4.0 * S, 4.5 * S, 4 * S, JS)

    def arm_right():
        b.cylinder(0, 0, 0, 2.6 * S, 15 * S, J, 12, 2.9 * S)
        b.cylinder(0, 12 * S, 0, 3.0 * S, 3 * S, G, 12, 2.6 * S)
        b.box(0, -2.0 * S, 0, 4.2 * S, 4.5 * S, 4 * S, JS)

    seg('legs', legs)
    seg('torso', torso)
    seg('head', head)
    seg('arm_l', arm_left)
    seg('arm_r', arm_right)

    # Đổ: thân + chân nghiêng nằm ngả (chúi 82°), nghiêng bên 0.18.
    def bring(name, rx, rz, ry, d, piv=(0, 0, 0)):
        s0, s1 = parts[name]
        cx_, sx_ = math.cos(rx), math.sin(rx)
        cz_, sz_ = math.cos(rz), math.sin(rz)
        cy_, sy_ = math.cos(ry), math.sin(ry)
        for i in range(s0, s1):
            X, Y, Z = b.verts[i]
            x, y, z = X - piv[0], Z - piv[1], -Y - piv[2]
            y, z = y * cx_ - z * sx_, y * sx_ + z * cx_
            x, y = x * cz_ - y * sz_, x * sz_ + y * cz_
            x, z = x * cy_ + z * sy_, -x * sy_ + z * cy_
            b.verts[i] = bs.P(x + piv[0] + d[0], y + piv[1] + d[1], z + piv[2] + d[2])

    fall = -1.43
    bring('legs', fall, 0.0, 0.0, (0, 0, 0))
    # Thân đổ quanh gốc (0,0,0); đầu rời, nằm lăn cạnh vai; tay phải rời nằm xa.
    for name in ('torso',):
        bring(name, fall, 0.0, 0.0, (0, 0, 0))
    bring('arm_l', fall, 0.0, 0.0, (0, 0, 0))
    bring('head', -1.2, 0.5, 0.4, (-4 * S, 3.0 * S, -50 * S))
    bring('arm_r', -1.5, 0.0, 0.9, (22 * S, 2.6 * S, -38 * S))
    # Đại đao cắm nghiêng cạnh tượng, vết nứt phát sáng.
    start = len(b.verts)
    b.sword_planted(0, 0, 0.0, 48 * S, 4.6 * S, yaw=0.0)
    xform(b, start, (0, 0, 0), 0.0, 0.0, 0.32, d=(20 * S, 0, -6 * S))
    # Bệ đá vỡ dưới chân tượng + đá vụn quanh.
    rubble(b, 0, 0.0, -20 * S, 24, 3.4 * S, rnd, 36 * S)
    for k in range(10):  # nứt phát sáng trên giáp
        b.box(rnd.uniform(-5, 5) * S, 0.2 * S + rnd.uniform(1, 9) * S, rnd.uniform(-34, -4) * S, 0.2 * S, 0.2 * S, rnd.uniform(2, 6) * S, GOLD_LIT)


def build_all():
    data = build_data()
    rnd = random.Random(20261119)
    main = new_builder(seed=3, moss=0.7)
    # bậc thang xoắn
    build_stair(main, data['stair'], rnd)
    islands = data['islands']
    for isl in islands:
        if isl['kind'] == 'cong':
            build_gate(main, isl, rnd)
        else:
            build_palace(main, isl, rnd, big=isl['id'] in ('cung_tay', 'cung_dong'))
    build_avenue_pillars(main, data['pillars'], rnd)
    statue = new_builder(seed=5, moss=0.4)
    build_statue(statue, data['statue'], rnd)
    return main, statue, data


def run(out):
    bs.make_textures()
    main, statue, data = build_all()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = ts.materials_for([main, statue])
    for name, b in (('tk_main', main), ('tk_statue', statue)):
        mesh = ts.make_mesh(name, b, keys, images)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        if name == 'tk_statue':
            st = data['statue']
            obj.location = (st['x'] - CX, -(st['z'] - CZ), 0.0)  # Blender: (x, -z, y); client hạ y theo đất
            obj.rotation_euler = (0.0, 0.0, -st['yaw'])
    ts.export_glb(out)
    size, prims, tris, doc = bs.inspect(out)
    print(f'[thien_khuyet] {out}: {size / 1024:.0f} KB, {len(main.faces) + len(statue.faces)} mặt, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)})')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_thien_khuyet.glb')
