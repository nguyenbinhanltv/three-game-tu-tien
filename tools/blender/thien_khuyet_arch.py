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
from build_sect import Mat, paint  # noqa: E402
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
STEP_RUN = 1.1  # bước tiến mỗi bậc (m); bậc cao ~0,2 m theo độ dốc xoắn
STAIR_W = 4.2  # bề ngang thang (m)
SEG_STEPS = 64  # số bậc mỗi đoạn treo
GAP_STEPS = 4  # khe vỡ giữa hai đoạn


def build_stair(b, s, rnd):
    """Bậc thang nhỏ (rộng ~4 m) xoắn dài lên trời, chia thành các đoạn treo giữa mây, lan can ngọc chạy dọc, đèn đá, đáy đá thô thon như thuyền."""
    length = s['turns'] * math.tau * (s['r0'] + s['r1']) / 2
    n = int(round(length / STEP_RUN))
    wid = STAIR_W
    seg_len = SEG_STEPS + GAP_STEPS
    pts = []  # (i, a, x, z, y, yaw) của các bậc có thật
    for i in range(n):
        a, r, x, z, y = stair_pt(s, (i + 0.5) / n)
        if y < MIN_Y or i % seg_len >= SEG_STEPS:
            pts.append(None)
            continue
        pts.append((a, x, z, y, math.atan2(-math.cos(a), -math.sin(a))))
    for i, p in enumerate(pts):
        if not p:
            if i % seg_len == SEG_STEPS and i > 0 and pts[i - 1]:  # mảnh vỡ trôi ở khe
                a, x, z, y, yaw = pts[i - 1]
                rubble(b, x + math.sin(a) * 2.5, y + rnd.uniform(-1.0, 1.0), z - math.cos(a) * 2.5, 4, 0.7, rnd, 2.0)
            continue
        a, x, z, y, yaw = p
        col = kit.JADE if i % 2 == 0 else kit.JADE_SHADE
        b.box(x, y - 0.18, z, STEP_RUN * 1.03, 0.36, wid, col, yaw=yaw)
        if i % 10 == 0:  # gờ vàng ở mép bậc
            b.box(x - math.sin(a) * 0.0, y + 0.02, z, 0.1, 0.05, wid * 1.02, kit.GILD, yaw=yaw)
        if i % 36 == 18:  # đèn đá hai bên
            for sd in (-1, 1):
                b.place('prop_den_da', x + math.cos(a) * sd * (wid / 2 + 0.5), y, z + math.sin(a) * sd * (wid / 2 + 0.5), scale=0.8)
    # đáy đá treo của từng đoạn: thân thuyền thon hai đầu + nhũ đá
    nseg = n // seg_len + 1
    for g in range(nseg):
        idx = [i for i in range(g * seg_len, min(n, g * seg_len + SEG_STEPS)) if pts[i]]
        if len(idx) < 6:
            continue
        for k in range(0, len(idx) - 1, 3):
            i = idx[k]
            a, x, z, y, yaw = pts[i]
            f = k / (len(idx) - 1)
            th = 0.8 + 3.2 * math.sin(math.pi * f) ** 0.8 + rnd.uniform(0, 0.6)
            w = wid * (0.55 + 0.4 * math.sin(math.pi * f))
            start = len(b.verts)
            b.box(x, y - 0.36 - th / 2, z, STEP_RUN * 3.4, th, w, STONE_DK, yaw=yaw)
            xform(b, start, (x, y, z), rnd.uniform(-0.04, 0.04), 0, rnd.uniform(-0.05, 0.05))
        # nhũ đá hai đầu và giữa
        for f in (0.1, 0.5, 0.9):
            i = idx[int(f * (len(idx) - 1))]
            a, x, z, y, yaw = pts[i]
            start = len(b.verts)
            b.cylinder(x, y - 6.0 - rnd.random() * 4, z, 0.1, 6 + rnd.random() * 5, STONE_DK, 6, 0.9)
            xform(b, start, (x, y - 4.0, z), math.pi, 0, 0, d=(0, -6.0, 0))
    # lan can ngọc chạy dọc hai bên: mỗi mảnh 6 bậc, bỏ 8% mảnh (gãy), trụ ngọc đầu mỗi đoạn
    for g in range(nseg):
        idx = [i for i in range(g * seg_len, min(n, g * seg_len + SEG_STEPS)) if pts[i]]
        for k in range(0, len(idx) - 6, 6):
            i0, i1 = idx[k], idx[k + 6]
            a0_, x0, z0, y0, _ = pts[i0]
            a1_, x1, z1, y1, _ = pts[i1]
            for sd in (-1, 1):
                off = (wid / 2 + 0.12) * sd
                p0 = (x0 + math.cos(a0_) * off, z0 + math.sin(a0_) * off)
                p1 = (x1 + math.cos(a1_) * off, z1 + math.sin(a1_) * off)
                if rnd.random() < 0.08:
                    b.box(p0[0], y0 + 0.5, p0[1], 0.26, 1.0, 0.26, kit.JADE_SHADE)
                    continue
                b.balustrade(p0[0], p0[1], p1[0], p1[1], y=(y0 + y1) / 2 - 0.08, h=0.95, post=5.0, cloud=False)
        for end in (0, len(idx) - 1):
            if idx:
                a, x, z, y, _ = pts[idx[end]]
                for sd in (-1, 1):
                    b.place('cot_vuong_ngoc', x + math.cos(a) * sd * (wid / 2 + 0.12), y - 0.2, z + math.sin(a) * sd * (wid / 2 + 0.12), scale=0.7)


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


def build_avenue_pillars(b, pillars, rnd):
    """Cột son dọc đại lộ ở vị trí/độ cao đất thật trong dữ liệu (`tools/perf/src/tk-pillars.ts`), chân bệ chìm 0,6 m để bám đất dốc."""
    for p in pillars:
        lx, ly, lz = loc(p['x'], p['y'], p['z'])
        b.box(lx, ly + 0.2, lz, 3.6, 1.6, 3.6, kit.JADE_SHADE)
        g = ly + 1.0
        if p['kind'] == 'gay':
            broken_column(b, lx, g, lz, 0.9, 3 + rnd.random() * 9, rnd)
        elif p['kind'] == 'dung':
            b.place('cot_dau_cung', lx, g, lz, scale=1.6)
        else:
            start = len(b.verts)
            b.place('cot_rong', lx, g, lz, scale=1.5)
            xform(b, start, (lx, g, lz), math.pi / 2 - 0.1, rnd.uniform(0, 6), 0, d=(0, 1.0, 0))
        if rnd.random() < 0.25:
            b.place('prop_den_da', lx + 3, g, lz + 2, scale=1.2)


# ---------- tượng thần khổng lồ gãy đổ: lưới điêu khắc procedural (mặt cong chia nhỏ + nhiễu + nếp giáp) ----------


def _hash3(ix, iy, iz, seed):
    h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1274126177) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFFFF) / 4294967296.0


def vnoise3(x, y, z, seed=0):
    xi, yi, zi = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - xi, y - yi, z - zi

    def s(t):
        return t * t * (3 - 2 * t)

    sx, sy, sz = s(fx), s(fy), s(fz)

    def c(dx, dy, dz):
        return _hash3(xi + dx, yi + dy, zi + dz, seed)

    def lerp(a, b_, t):
        return a + (b_ - a) * t

    return lerp(
        lerp(lerp(c(0, 0, 0), c(1, 0, 0), sx), lerp(c(0, 1, 0), c(1, 1, 0), sx), sy),
        lerp(lerp(c(0, 0, 1), c(1, 0, 1), sx), lerp(c(0, 1, 1), c(1, 1, 1), sx), sy),
        sz,
    )


def fbm3(x, y, z, seed=0, octaves=3):
    a, f, tot, norm = 0.5, 1.0, 0.0, 0.0
    for o in range(octaves):
        tot += a * vnoise3(x * f, y * f, z * f, seed + o * 17)
        norm += a
        a *= 0.5
        f *= 2.1
    return tot / norm


SAND = (0.2, 0.17, 0.24)  # đá xám tím (tuyến tính), hợp palette Thiên Khuyết
SAND_DK = (0.07, 0.06, 0.09)
MOSS_LIN = (0.12, 0.26, 0.07)


# vật liệu riêng của tượng: không dán texture lặp (ô vuông tối), màu đỉnh + nhiễu liền; vàng cổ kim loại sẫm có xanh đồng ở khe
bs.MATERIALS['tkstone'] = Mat(0.74, 0.0, None, 1.0, False, 0.0)
bs.MATERIALS['tkgold'] = Mat(0.5, 0.5, None, 1.0, False, 0.0)  # vàng mòn xỉn, còn ánh kim
OLD_GOLD = (0.8, 0.54, 0.12)  # vàng kim (tuyến tính), kim loại bóng
VERDI = (0.05, 0.16, 0.12)  # xanh đồng


def sculpt_color(pos, nrm, gold=False, seed=3):
    """Màu một mặt đá phong hóa: cam thạch ấm đổi sắc chậm theo mảng lớn, vân tầng ngang mảnh, vệt nước chảy dọc, khe nứt tối rõ, rêu chỉ ở mặt ngửa/lõm, vàng kim ở viền."""
    x, y, z = pos
    if gold:
        v = fbm3(x * 0.3, y * 0.3, z * 0.3, seed + 21, 3)
        k = 0.55 + 0.6 * v  # vàng mòn, chỗ bóng chỗ xỉn
        rgb = [c * k for c in OLD_GOLD]
        gap = fbm3(x * 0.22 + 4, y * 0.22, z * 0.22, seed + 33, 2)
        if gap > 0.52:  # patina xanh đồng đọng ở hõm và vệt
            t = min(0.85, (gap - 0.52) * 3.2)
            rgb = [c * (1 - t) + d * t for c, d in zip(rgb, VERDI)]
        wear = fbm3(x * 0.3, y * 0.3, z * 0.3, seed + 41, 3)
        w = max(0.0, min(1.0, (wear - 0.55) * 4.0))  # trầy lộ lõi đá sẫm (chuyển mềm, không thành ô vuông)
        rgb = [c * (1 - 0.55 * w) for c in rgb]
        return bs.Paint(tuple(rgb), 'tkgold')

    big = fbm3(x * 0.12, y * 0.12, z * 0.12, seed, 2)
    t = 0.92 + 0.14 * big
    t *= 0.93 + 0.07 * math.sin(y * 1.3 + 3.0 * fbm3(x * 0.2, y * 0.05, z * 0.2, seed + 2, 2))  # vân tầng ngang
    streak = fbm3(x * 0.9, y * 0.05, z * 0.9, seed + 4, 2)  # vệt nước chảy dọc
    t *= 0.94 + 0.1 * streak
    rgb = [c * t for c in SAND]
    crack = abs(fbm3(x * 0.45 + 9, y * 0.45, z * 0.45, seed + 5, 2) - 0.5)
    if crack < 0.004:  # chỉ vết nứt rất mảnh (mảng tối vuông do mặt lớn tô một màu: bỏ)
        k = 0.4
        rgb = [c * (1 - k) + d * k for c, d in zip(rgb, SAND_DK)]
    moss = fbm3(x * 0.18 + 3, y * 0.18, z * 0.18, seed + 9, 3)
    k = 0.0
    if moss > 0.7 and nrm[1] > 0.6:
        k = min(0.3, (moss - 0.7) * 2.0) * nrm[1]
    if k > 0.01:
        rgb = [c * (1 - k) + m * k for c, m in zip(rgb, MOSS_LIN)]
    return bs.Paint(tuple(rgb), 'tkstone')


def surface(b, f, nu, nv, center, hole=None, gold_at=None, col=None):
    """Lưới điêu khắc: f(u, v) → điểm; u quanh (0..1), v dọc (0..1); `center(v)` = điểm trên trục để định chiều pháp tuyến ra ngoài."""
    grid = [[f((i % nu) / nu, j / nv) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
            dq = []
            for p in q:  # bỏ đỉnh trùng ở cực
                if not dq or math.dist(p, dq[-1]) > 1e-6:
                    dq.append(p)
            if len(dq) > 1 and math.dist(dq[0], dq[-1]) < 1e-6:
                dq.pop()
            if len(dq) < 3:
                continue
            c = [sum(p[k] for p in dq) / len(dq) for k in range(3)]
            if hole and hole(c):
                continue
            n = bs.newell(dq)
            ctr = center((j + 0.5) / nv)
            if (c[0] - ctr[0]) * n[0] + (c[1] - ctr[1]) * n[1] + (c[2] - ctr[2]) * n[2] < 0:
                dq.reverse()
                n = (-n[0], -n[1], -n[2])
            ln = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) or 1.0
            b.face(dq, col(c) if col else sculpt_color(c, (n[0] / ln, n[1] / ln, n[2] / ln), gold=bool(gold_at and gold_at(c))), True)


def ellipsoid(b, c, r, nu=22, nv=14, v0=0.0, v1=1.0, e=1.0, amp=0.08, seed=1, hole=None, gold_at=None, ridge=None, col=None):
    """Mặt cầu/siêu cầu méo: bán kính r=(rx, ry, rz), số mũ e (>1 = vuông), nhiễu `amp`, `ridge(x,y,z)` = hệ số nếp giáp nhân vào bán kính."""

    def f(u, v):
        pv = (v0 + (v1 - v0) * v) * math.pi
        th = u * math.tau
        dx, dy, dz = math.sin(pv) * math.cos(th), math.cos(pv), math.sin(pv) * math.sin(th)
        if e > 1.0:
            q = 2.0 / e
            dx, dy, dz = (math.copysign(abs(t) ** q, t) for t in (dx, dy, dz))
        x, y, z = c[0] + dx * r[0], c[1] + dy * r[1], c[2] + dz * r[2]
        k = 1.0 + amp * (fbm3(x * 0.6, y * 0.6, z * 0.6, seed, 3) - 0.5) * 2
        if ridge:
            k *= ridge(x, y, z)
        return (c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k, c[2] + (z - c[2]) * k)

    surface(b, f, nu, nv, lambda v: c, hole, gold_at, col)


def tube(b, a, bpt, r0, r1, nu=14, nv=8, ridges=0, amp=0.07, seed=1, hole=None, gold_at=None, bulge=0.0, col=None):
    """Ống thon từ a đến b: bán kính r0 → r1, nếp vòng `ridges`, phình giữa `bulge`, nhiễu đá."""
    ax = [bpt[k] - a[k] for k in range(3)]
    L = math.sqrt(sum(t * t for t in ax)) or 1.0
    ax = [t / L for t in ax]
    ref = (1.0, 0.0, 0.0) if abs(ax[0]) < 0.9 else (0.0, 1.0, 0.0)
    e1 = [ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]]
    n1 = math.sqrt(sum(t * t for t in e1)) or 1.0
    e1 = [t / n1 for t in e1]
    e2 = [ax[1] * e1[2] - ax[2] * e1[1], ax[2] * e1[0] - ax[0] * e1[2], ax[0] * e1[1] - ax[1] * e1[0]]

    def f(u, v):
        th = u * math.tau
        rad = r0 + (r1 - r0) * v
        rad *= 1.0 + bulge * math.sin(math.pi * v)
        if ridges:
            rad *= 1.0 + 0.06 * math.sin(v * ridges * math.pi * 2) ** 2
        base = [a[k] + (bpt[k] - a[k]) * v for k in range(3)]
        p = [base[k] + (e1[k] * math.cos(th) + e2[k] * math.sin(th)) * rad for k in range(3)]
        k_ = 1.0 + amp * (fbm3(p[0] * 0.6, p[1] * 0.6, p[2] * 0.6, seed, 3) - 0.5) * 2
        return tuple(base[k] + (p[k] - base[k]) * k_ for k in range(3))

    surface(b, f, nu, nv, lambda v: tuple(a[k] + (bpt[k] - a[k]) * v for k in range(3)), hole, gold_at, col)
    # nắp bán cầu kín hai đầu (đầu nhọn r≈0 thì bỏ); đá đặc, không để lộ mặt cắt rỗng
    for end, rr, sgn in ((a, r0, -1.0), (bpt, r1, 1.0)):
        if rr > 0.12 * max(r0, r1):
            dome(b, end, tuple(ax[k] * sgn for k in range(3)), rr, e1, e2, seed, gold_at, col)


def dome(b, E, d, r, e1, e2, seed=1, gold_at=None, col=None, flat=1.0, amp=0.04):
    """Nắp bán cầu bán kính r ở đầu E, hướng ra d (e1, e2: hai trục ngang); `flat` < 1 = nắp dẹt (đầu gãy)."""

    def f(u, v):
        th, ph = u * math.tau, v * math.pi / 2
        rad = r * (1.0 + amp * (fbm3(E[0] * 0.7 + th, E[1] * 0.7 + ph, E[2] * 0.7, seed + 9, 2) - 0.5) * 2)
        s_, c_ = math.sin(ph), math.cos(ph)
        return tuple(E[k] + d[k] * rad * c_ * flat + (e1[k] * math.cos(th) + e2[k] * math.sin(th)) * rad * s_ for k in range(3))

    surface(b, f, 12, 5, lambda v: E, None, gold_at, col)


def limb(b, pts, radii, nu=12, steps=6, seed=1, amp=0.04, cap0='round', cap1='round', gold_at=None, col=None):
    """Chi tiết liền một lưới: lướt tiết diện tròn dọc đường cong trơn qua `pts` (Catmull-Rom), bán kính nội suy trơn theo `radii`; hai đầu khép bán cầu
    (`'round'`) hoặc dẹt nhiễu mạnh như gãy (`'broken'`). Dùng cho tay, ngón, cẳng tay (không ghép ống)."""
    n = len(pts)

    def cr(p0, p1, p2, p3, t):
        return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t**3)

    cl, rl = [], []
    for i in range(n - 1):
        for j in range(steps + (1 if i == n - 2 else 0)):
            t = j / steps
            i0, i1, i2, i3 = max(i - 1, 0), i, i + 1, min(i + 2, n - 1)
            cl.append(tuple(cr(pts[i0][k], pts[i1][k], pts[i2][k], pts[i3][k], t) for k in range(3)))
            rl.append(cr(radii[i0], radii[i1], radii[i2], radii[i3], t))
    m = len(cl)
    tans = []
    for i in range(m):
        a_, b_ = cl[max(i - 1, 0)], cl[min(i + 1, m - 1)]
        tans.append(_unit(tuple(b_[k] - a_[k] for k in range(3))))
    ref = (1.0, 0.0, 0.0) if abs(tans[0][0]) < 0.9 else (0.0, 1.0, 0.0)
    e1 = _unit((tans[0][1] * ref[2] - tans[0][2] * ref[1], tans[0][2] * ref[0] - tans[0][0] * ref[2], tans[0][0] * ref[1] - tans[0][1] * ref[0]))
    frames = []
    for i in range(m):  # chuyển song song khung để không xoắn
        t = tans[i]
        d = sum(e1[k] * t[k] for k in range(3))
        e1 = _unit(tuple(e1[k] - d * t[k] for k in range(3)))
        e2 = (t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0])
        frames.append((e1, e2))
    K = 4
    rows = []  # (tâm, bán kính, e1, e2)
    for j in range(K):  # nắp đầu
        ph = (j / K) * math.pi / 2
        flat = 0.35 if cap0 == 'broken' else 1.0
        rows.append((tuple(cl[0][k] - tans[0][k] * rl[0] * math.cos(ph) * flat for k in range(3)), rl[0] * math.sin(ph) * (1 if cap0 != 'broken' else 1.0), *frames[0]))
    for i in range(m):
        rows.append((cl[i], rl[i], *frames[i]))
    for j in range(K - 1, -1, -1):  # nắp cuối
        ph = (j / K) * math.pi / 2
        flat = 0.35 if cap1 == 'broken' else 1.0
        rows.append((tuple(cl[-1][k] + tans[-1][k] * rl[-1] * math.cos(ph) * flat for k in range(3)), rl[-1] * math.sin(ph), *frames[-1]))
    R = len(rows) - 1

    def f(u, v):
        c, r, f1, f2 = rows[min(R, round(v * R))]
        th = u * math.tau
        p = [c[k] + (f1[k] * math.cos(th) + f2[k] * math.sin(th)) * r for k in range(3)]
        amp_ = amp * (3.0 if (cap0 == 'broken' and v < K / R) or (cap1 == 'broken' and v > 1 - K / R) else 1.0)
        kk = 1.0 + amp_ * (fbm3(p[0] * 0.6, p[1] * 0.6, p[2] * 0.6, seed, 3) - 0.5) * 2
        return tuple(c[k] + (p[k] - c[k]) * kk for k in range(3))

    surface(b, f, nu, R, lambda v: rows[min(R, round(v * R))][0], None, gold_at, col)


def jian(b, x0, y0, z0, length, S):
    """Kiếm thẳng cổ phong cắm mũi xuống: mũi tại (x0, y0, z0), chuôi hướng lên. Lưỡi tiết diện thoi có sống nổi, hơi thon về mũi."""
    N = 10
    w0, t0 = 1.5 * S, 0.34 * S
    rings = []
    for i in range(N + 1):
        t = i / N
        y = y0 + length * t
        if t < 0.1:  # mũi nhọn
            k = t / 0.1
        else:
            k = 1.0 - 0.28 * (t - 0.1) / 0.9
        w, th = w0 * k, t0 * (0.45 + 0.55 * k)
        rings.append([(x0 - w, y, z0), (x0, y, z0 + th), (x0 + w, y, z0), (x0, y, z0 - th)])
    for i in range(N):
        for j in range(4):
            q = [rings[i][j], rings[i][(j + 1) % 4], rings[i + 1][(j + 1) % 4], rings[i + 1][j]]
            q = [p for n_, p in enumerate(q) if n_ == 0 or math.dist(p, q[n_ - 1]) > 1e-6]
            if len(q) < 3:
                continue
            c = [x0, q[0][1], z0]
            b.poly(q, c, kit.BLADE if j % 2 == 0 else kit.BLADE_D)
    top = y0 + length
    b.box(x0, y0 + length * 0.55, z0, 0.1 * S, length * 0.8, 0.12 * S, GOLD_LIT)  # rãnh khắc phát sáng dọc lưỡi (nhỏ)
    # hộ thủ: đĩa tròn dẹt vàng + hai tai cuộn
    b.cylinder(x0, top, z0, 2.6 * S, 0.45 * S, bs.Paint(OLD_GOLD, 'tkgold'), 18, 2.5 * S)
    for sx in (-1, 1):
        b.box(x0 + sx * 3.0 * S, top + 0.2 * S, z0, 1.0 * S, 0.5 * S, 0.5 * S, bs.Paint(OLD_GOLD, 'tkgold'))
    # chuôi quấn dây, vòng vàng, đuôi kiếm
    b.cylinder(x0, top + 0.45 * S, z0, 0.55 * S, 7.5 * S, kit.TIMBER_D, 10, 0.5 * S)
    for k in range(5):
        b.cylinder(x0, top + (1.2 + k * 1.4) * S, z0, 0.6 * S, 0.22 * S, bs.Paint(OLD_GOLD, 'tkgold'), 10)
    b.cylinder(x0, top + 7.9 * S, z0, 1.0 * S, 0.9 * S, bs.Paint(OLD_GOLD, 'tkgold'), 12, 0.5 * S)
    # tua đỏ rủ từ đuôi kiếm
    for k in range(4):
        b.box(x0 + 0.5 * S, top + (6.8 - k * 1.7) * S, z0 + 0.4 * S, 0.5 * S, 1.7 * S, 0.22 * S, kit.VERMILION)


def _g(v, c, w):
    return math.exp(-(((v - c) / w) ** 2))


def _g2(x, cx, wx, y, cy, wy):
    return math.exp(-(((x - cx) / wx) ** 2 + ((y - cy) / wy) ** 2))


def _seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


CRACKS = (  # nứt lớn trên mặt (toạ độ mặt, đơn vị P): từ trán xuống gò má trái; thái dương phải xuống má; vết ngang cằm
    ((-2.3, 59.0), (-1.7, 57.6), (-2.1, 56.5), (-1.3, 55.0), (-1.6, 53.8), (-0.9, 52.4)),
    ((2.6, 58.3), (2.1, 56.8), (2.8, 55.4), (2.2, 54.0)),
    ((-0.2, 51.9), (0.9, 51.5), (1.8, 51.9)),
)


def crack_mask(xs, ys):
    """1 trên đường nứt (rộng ~0,1 P), 0 xa; đường gấp khúc bẻ nhẹ theo nhiễu."""
    best = 9.0
    wob = 0.18 * (fbm3(xs * 1.7, ys * 1.7, 3.0, 61, 2) - 0.5)
    for path in CRACKS:
        for (ax, ay), (bx, by) in zip(path, path[1:]):
            best = min(best, _seg_dist(xs + wob, ys - wob, ax, ay, bx, by))
    return max(0.0, 1.0 - best / 0.1)


def face_depth(xs, ys, zs):
    """Độ lồi (P, dương = nhô ra) của mặt thần tướng điêu khắc cổ điển: mày nặng, mi mắt khắc lõm khép hờ, sống mũi thẳng, môi mím, cằm vuông, gò má, rãnh mũi-má; nứt và mảng vỡ."""
    if zs < 0.15:
        return 0.0
    ax = abs(xs)
    d = 0.0
    # mày nặng: gờ ngang, đầu trong thấp, đuôi hơi vểnh; trán trên mày hõm nhẹ
    by = 56.55 + 0.28 * min(ax, 3.2) / 3.2
    d += 0.62 * _g(ys, by, 0.42) * math.exp(-((ax / 3.0) ** 4))
    d -= 0.18 * _g(ys, by + 0.75, 0.3) * math.exp(-((ax / 2.8) ** 4))
    # mắt: hốc sâu, mi trên dày, mi dưới mỏng, khe mắt khép hờ, nhãn cầu lồi nhẹ
    d -= 0.5 * _g2(ax, 1.72, 1.2, ys, 55.75, 0.5)
    d += 0.3 * _g(ys, 56.12, 0.13) * _g(ax, 1.72, 0.95)
    d += 0.18 * _g(ys, 55.38, 0.12) * _g(ax, 1.72, 0.85)
    d -= 0.38 * _g(ys, 55.78, 0.04) * _g(ax, 1.72, 0.8)
    d += 0.2 * _g2(ax, 1.72, 0.8, ys, 55.78, 0.24)
    # mũi: sống thẳng, chóp, cánh, lỗ mũi
    prof = ((57.4, 0.0), (56.6, 0.35), (55.6, 0.8), (54.7, 1.15), (54.15, 1.55), (53.8, 0.7), (53.5, 0.0))
    nz = 0.0
    for (y0, p0), (y1, p1) in zip(prof, prof[1:]):
        if y1 <= ys <= y0:
            nz = p1 + (p0 - p1) * (ys - y1) / (y0 - y1)
    w = 0.36 + 0.4 * max(0.0, (55.2 - ys) / 1.4)
    d += 1.35 * nz * _g(ax, 0, min(w, 0.78))
    d += 0.55 * _g2(ax, 0.88, 0.36, ys, 54.05, 0.3)
    d -= 0.45 * _g2(ax, 0.42, 0.17, ys, 53.85, 0.13)
    # môi, rãnh nhân trung, khe miệng (khoé cong), cằm vuông có lõm giữa
    d -= 0.1 * _g(ax, 0, 0.17) * _g(ys, 53.4, 0.3)
    d += 0.3 * _g(ys, 53.22, 0.2) * _g(ax, 0, 1.4)
    my = 52.95 + 0.28 * (ax / 2.0) ** 2
    d -= 0.45 * _g(ys, my, 0.065) * math.exp(-((ax / 2.0) ** 4))
    d += 0.32 * _g(ys, 52.6, 0.2) * _g(ax, 0, 1.15)
    d += 0.6 * _g(ys, 51.55, 0.55) * math.exp(-((ax / 1.5) ** 4))
    d -= 0.12 * _g(ax, 0, 0.12) * _g(ys, 51.45, 0.45)
    # gò má, rãnh mũi-má
    d += 0.42 * _g2(ax, 2.6, 0.8, ys, 54.5, 0.6)
    d -= 0.24 * _g(_seg_dist(ax, ys, 0.95, 53.95, 1.95, 52.95), 0, 0.12)
    # nứt lớn + mảng vỡ (chóp mũi sứt, hàm trái mất một mảng)
    d -= 0.34 * crack_mask(xs, ys)
    d -= 0.75 * _g2(xs, 0.12, 0.7, ys, 54.1, 0.34) * (0.5 + 0.9 * fbm3(xs * 3, ys * 3, 5.0, 71, 2))
    d -= 0.95 * _g2(xs, -2.75, 0.95, ys, 52.7, 0.75) * (0.45 + 1.0 * fbm3(xs * 2.5, ys * 2.5, 6.0, 73, 2))
    d += 0.05 * (fbm3(xs * 5, ys * 5, zs * 5, 77, 2) - 0.5)  # nhám đá
    return d


def _torso_col(c, S):
    """Giáp thân: màu đá phong hóa; mảng lớn (ngực trái, lưng) đổi thành đá sẫm như lớp giáp bong lộ lõi; vàng ở đai/ngực."""
    x, y, z = c[0] / S, c[1] / S, c[2] / S
    base = sculpt_color(c, (0, 1, 0))
    if y > 38 and (fbm3(x * 0.8, y * 0.8, z * 0.8, 17, 2) > 0.66 or (z < -1.0 and fbm3(x * 0.55, y * 0.55, 3.0, 29, 2) > 0.64)):
        return bs.Paint(tuple(v * 0.45 for v in base.rgb), 'tkstone')
    if abs(x) < 2.4 and abs(y - 43) < 2.4 and z > 4.6:
        return sculpt_color(c, (0, 1, 0), gold=True)
    return base


def face_k(x, y, z, S):
    xs, ys, zs = x / S, y / S, z / S
    k = 1.0 + face_depth(xs, ys, zs - 0.6) / 3.6
    if ys < 54.2:  # hàm vuông, thu dần về cằm
        k *= 1.0 - 0.05 * min(1.0, (54.2 - ys) / 2.5)
    return k


def face_col(c, S):
    """Màu mặt: đá sáng hơn thân; nứt/hốc mắt tối; rêu bụi đọng ở nứt và hõm."""
    xs, ys, zs = c[0] / S, c[1] / S, c[2] / S
    base = sculpt_color(c, (0, 0, 1))
    rgb = [min(1.0, v * 2.7) for v in base.rgb] if zs > 1.0 and ys < 58.2 else list(base.rgb)
    cm = crack_mask(xs, ys) if zs > 0.15 else 0.0
    sock = max(_g2(abs(xs), 1.72, 1.0, ys, 55.75, 0.4), _g(ys, my_line(abs(xs)), 0.07) * math.exp(-((abs(xs) / 2.0) ** 4)))
    dark = max(cm * 0.8, sock * 0.95)
    rgb = [v * (1 - dark) + d * dark for v, d in zip(rgb, SAND_DK)]
    if cm > 0.1 or fbm3(xs * 2.3, ys * 2.3, zs * 2.3, 83, 3) > 0.74:
        k = min(0.55, 0.2 + cm * 0.5)  # rêu, bụi xanh xám ở khe
        rgb = [v * (1 - k) + m * k for v, m in zip(rgb, MOSS_LIN)]
    return bs.Paint(tuple(rgb), 'tkstone')


def my_line(ax):
    return 52.95 + 0.28 * (ax / 2.0) ** 2


def _unit(v):
    n = math.sqrt(sum(t * t for t in v)) or 1.0
    return tuple(t / n for t in v)


def leaf(b, p0, axis, side, L, W, T, out=(0.0, 0.0, 0.0), bend=0.0, nu=18, nv=18, seed=1, rib=0.25):
    """Cánh/lá kim loại dẹt: từ p0 theo `axis` dài L, rộng W (hướng `side`), dày T, cong về hướng `out` một lượng bend·L; sống nổi giữa, mép nhiễu."""
    ax = _unit(axis)
    d = sum(a_ * s_ for a_, s_ in zip(side, ax))
    sd = _unit(tuple(s_ - d * a_ for s_, a_ in zip(side, ax)))
    nm = (ax[1] * sd[2] - ax[2] * sd[1], ax[2] * sd[0] - ax[0] * sd[2], ax[0] * sd[1] - ax[1] * sd[0])

    def c(v):
        return tuple(p0[k] + ax[k] * L * v + out[k] * bend * L * v * v for k in range(3))

    def f(u, v):
        th = u * math.tau
        pr = max(0.0, 1.0 - (2 * v - 1) ** 2) ** 0.6
        w = W * pr * (0.8 + 0.2 * (1 - v))
        w *= 1.0 + 0.16 * (fbm3(v * 7 + seed, u * 3, seed, seed + 5, 2) - 0.5) * 2
        t = T * pr + 0.02 * W
        t *= 1.0 + rib * math.cos(th * 2)
        cc = c(v)
        return tuple(cc[k] + sd[k] * w * math.cos(th) + nm[k] * t * math.sin(th) for k in range(3))

    surface(b, f, nu, nv, c, None, lambda p: True)


def crown_band(b, y, rx, rz, r, nu=72, nv=10):
    """Vòng đai mão: ống tròn quanh đầu, nổi gân mây cuộn (nhịp 14) và nhấp nhô nhẹ."""

    def f(u, v):
        th, ph = u * math.tau, v * math.tau
        rr = r * (1.0 + 0.24 * math.sin(th * 14) * max(0.0, math.cos(ph)))
        wob = 0.12 * math.sin(th * 5 + 1.0)
        return ((rx + rr * math.cos(ph)) * math.cos(th), y + rr * math.sin(ph) * 1.1 + wob, (rz + rr * math.cos(ph)) * math.sin(th))

    surface(b, f, nu, nv, lambda v: (0.0, y, 0.0), None, lambda p: True)


def hand(b, S, px, py, pz, sgn, k, seed, curl=0.55):
    """Bàn tay trong khung đứng: lòng bàn tay tại (px, py, pz) (đơn vị P), ngón theo sgn·y và cong về +z (phía lòng bàn tay). Mỗi ngón là MỘT lưới liền `limb` (ba đốt,
    bán kính thon trơn, đầu ngón tròn kín), ngón cái hai đốt; lòng bàn tay một mặt cầu dẹt."""
    P = lambda x, y, z: (x * S, y * S, z * S)
    ellipsoid(b, P(px, py + sgn * 0.6 * k, pz), P(2.9 * k, 3.1 * k, 1.35 * k), nu=24, nv=16, seed=seed, amp=0.05)
    fingers = ((-1.95, -0.2, 5.6), (-0.65, -0.06, 7.1), (0.65, 0.07, 6.6), (1.95, 0.22, 5.1))
    for i, (fx, ang, L) in enumerate(fingers):
        pos = (px + fx * k, py + sgn * 1.4 * k, pz)  # gốc ngón nằm sâu trong lòng bàn tay
        pts = [pos]
        pitch = 0.0
        for j, frac in enumerate((0.55, 0.3, 0.27)):
            pitch += curl * (0.5, 0.9, 0.8)[j]
            seg = L * k * frac if j else L * k * 0.5
            d = (math.sin(ang) * math.cos(pitch), sgn * math.cos(ang) * math.cos(pitch), math.sin(pitch))
            pos = (pos[0] + d[0] * seg, pos[1] + d[1] * seg, pos[2] + d[2] * seg)
            pts.append(pos)
        limb(b, [P(*q) for q in pts], [1.0 * k * S, 0.98 * k * S, 0.84 * k * S, 0.66 * k * S], nu=12, steps=4, seed=seed + 10 * i)
    pos = (px + 1.2 * k, py - sgn * 0.4 * k, pz)
    pts = [pos]
    pitch = 0.0
    for seg in (3.4 * k, 2.8 * k):  # ngón cái lệch ngang
        pitch += curl * 0.7
        d = (math.cos(0.75) * math.cos(pitch), sgn * math.sin(0.75) * math.cos(pitch) * 0.8, math.sin(pitch))
        pos = (pos[0] + d[0] * seg, pos[1] + d[1] * seg, pos[2] + d[2] * seg)
        pts.append(pos)
    limb(b, [P(*q) for q in pts] + [P(pts[-1][0] + 0.6 * k, pts[-1][1] + sgn * 0.5 * k, pts[-1][2])], [1.25 * k * S, 1.1 * k * S, 0.85 * k * S, 0.7 * k * S], nu=12, steps=4, seed=seed + 90)


def build_statue(b, st, rnd):
    """Thần tướng giáp trụ cao ~`size` m dựng đứng rồi cho đổ ngửa: lưới điêu khắc cam thạch nứt rêu phủ, giáp lá xếp tầng, vai giáp ba lớp
    viền vàng, mũ trụ mào vàng có mặt và hộ nhĩ, hai tay (phải gãy rời), đại đao cắm bên cạnh."""
    S = st['size'] / 64.0
    parts = {}
    fstart = len(b.faces)

    def seg(name, fn):
        start = len(b.verts)
        fn()
        parts[name] = (start, len(b.verts))

    def P(x, y, z):
        return (x * S, y * S, z * S)

    def lames(y0, period):  # nếp giáp lá ngang mặt trước
        def f(x, y, z):
            k = 1.0
            ph = ((y / S - y0) * period / math.tau) % 1.0
            if z > 0:
                k += 0.08 * ph**1.8  # nếp giáp lá xếp tầng: nhô dần rồi gãy ngang ở mép dưới (cạnh sắc)
                k += 0.05 * math.exp(-((x / S) ** 2) / 1.2)  # sống ngực giữa
            else:  # lưng: lá giáp lớn hơn, sống lưng nổi, đường nứt ngang (tượng nằm sấp: lưng là mặt thấy rõ)
                k += 0.11 * ph**1.5 + 0.07 * math.exp(-((x / S) ** 2) / 0.7)
                k -= 0.05 * math.exp(-(((y / S - 38.5) / 0.5) ** 2))
            return k

        return f

    def legs():
        for sx in (-1, 1):
            tube(b, P(sx * 4.6, 29, 0), P(sx * 4.6, 16, 0.5), 3.7 * S, 2.9 * S, ridges=2, seed=11 + sx)
            ellipsoid(b, P(sx * 4.6, 15.4, 1.3), P(3.4, 2.7, 3.2), seed=21, gold_at=lambda c: abs(c[1] - 15.4 * S) < 0.55 * S and c[2] > 1.3 * S)
            tube(b, P(sx * 4.6, 14.6, 0.4), P(sx * 4.6, 3.2, 0), 2.7 * S, 2.3 * S, ridges=4, bulge=0.1, seed=31 + sx)
            ellipsoid(b, P(sx * 4.6, 1.3, 2.4), P(2.7, 1.5, 4.4), seed=41)

    def torso():
        ellipsoid(b, P(0, 30, 0), P(8.3, 4.3, 5.5), seed=51)  # chậu
        ellipsoid(b, P(0, 32.6, 0), P(9.0, 1.2, 6.1), seed=52, amp=0.03, gold_at=lambda c: True)  # đai lưng vàng
        for sx in (-1, 1):
            for k in range(4):  # giáp váy treo
                ellipsoid(b, P(sx * (3.0 + k * 2.1), 26.2 - abs(k - 1.5) * 0.3, 5.0 - k * 0.35), P(1.2, 3.8, 0.7), nu=14, nv=10, seed=60 + k)
        ellipsoid(b, P(0, 41.5, 0), P(8.3, 9.0, 5.2), e=3.4, nu=40, nv=28, seed=70, amp=0.03, col=lambda c: bs.Paint(tuple(v * 0.8 for v in SAND_DK), 'tkstone'))  # lõi sẫm: mảng giáp vỡ lộ đá tối chứ không lộ mặt sau đen
        ellipsoid(
            b,
            P(0, 41.5, 0),
            P(8.9, 9.7, 5.7),
            e=3.4,
            nu=56,
            nv=40,
            seed=71,
            ridge=lames(33, 3.6),
            col=lambda c: _torso_col(c, S),  # mảng giáp vỡ = vùng đá sẫm lộ lõi (không khoét thủng: lộ mặt sau sẽ đen)
            gold_at=lambda c: abs(c[0]) < 2.4 * S and abs(c[1] - 43 * S) < 2.4 * S and c[2] > 4.6 * S,
        )
        for sx in (-1, 1):  # vai giáp ba lớp
            for k, (ry, rr) in enumerate(((3.9, 6.3), (2.9, 5.5), (2.2, 4.5))):
                y0 = 47.0 + k * 2.4
                ellipsoid(
                    b,
                    P(sx * 11.9, y0, 0),
                    P(rr, ry, rr),
                    v0=0.0,
                    v1=0.62,
                    nu=32,
                    nv=14,
                    seed=80 + k + sx,
                    ridge=lambda x, y, z, rr=rr, sx=sx: 1.0 + 0.05 * max(0.0, math.sin(math.atan2(z, x - sx * 11.9 * S) * 7)),
                    gold_at=lambda c, y0=y0: c[1] < (y0 + 0.18) * S,
                )
                spike = P(sx * (11.9 + rr * 0.55), y0 + ry * 0.9, 0)
                tube(b, spike, (spike[0] + sx * 1.2 * S, spike[1] + 3.6 * S, spike[2]), 0.9 * S, 0.05 * S, nu=8, nv=4, amp=0.02, gold_at=lambda c: True)
            ellipsoid(b, P(sx * 11.9, 49.9, 0), P(2.2, 0.9, 2.2), nu=14, nv=8, seed=88, gold_at=lambda c: True)
        tube(b, P(0, 49, 0), P(0, 52.5, 0), 3.3 * S, 2.8 * S, nu=14, nv=4, seed=91)

    def head():
        # Đầu thần tướng điêu khắc cổ điển trang nghiêm: MỘT mặt lưới mịn (160×120) khắc nổi/lõm bằng trường độ sâu `face_depth` (không ghép cầu),
        # mão vàng mòn hoa văn cánh sen/mây nhiều lớp (một phần vỡ), râu tóc đá, tai; đá xám tím phong hóa, nứt lớn, rêu bụi ở khe.
        ellipsoid(b, P(0, 55.2, 0.6), P(3.3, 4.3, 3.5), nu=110, nv=84, e=2.2, seed=101, amp=0.012, ridge=lambda x, y, z: face_k(x, y, z, S), col=lambda c: face_col(c, S))
        ellipsoid(b, P(0, 56.8, -0.1), P(4.1, 3.9, 4.2), v0=0.0, v1=0.37, nu=48, nv=16, seed=102, amp=0.04)  # mũ lót
        for sx in (-1, 1):
            ellipsoid(b, P(sx * 3.55, 54.8, 0.5), P(0.55, 1.6, 1.1), nu=18, nv=12, seed=104 + sx, amp=0.06)  # tai
            for kk in range(2):  # tóc mai/ria tai dài: hai lọn đá thả dọc má xuống hàm, đầu tròn
                a0 = P(sx * (3.75 - kk * 0.12), 55.0 - kk * 0.45, 0.9 + kk * 0.5)
                a1 = P(sx * (3.6 - kk * 0.3), 52.6 - kk * 0.6, 2.0 + kk * 0.5)
                tube(b, a0, a1, 0.62 * S, 0.4 * S, nu=10, nv=10, ridges=6, amp=0.03, seed=140 + kk + sx)
                ellipsoid(b, a1, P(0.42, 0.55, 0.42), nu=10, nv=8, amp=0.03, seed=146 + kk + sx)
            for (q0, q1) in (((0.45, 53.45, 4.15), (1.9, 52.6, 3.7)), ((1.9, 52.6, 3.7), (2.5, 51.0, 3.2))):  # ria xệ ôm khoé miệng rồi rủ xuống cằm
                tube(b, P(sx * q0[0], q0[1], q0[2]), P(sx * q1[0], q1[1], q1[2]), 0.5 * S, 0.4 * S, nu=10, nv=6, ridges=3, amp=0.03, seed=150 + sx)
                ellipsoid(b, P(sx * q1[0], q1[1], q1[2]), P(0.42, 0.42, 0.42), nu=10, nv=8, amp=0.03, seed=153 + sx)
        # sau đầu (tượng nằm sấp: đây là mặt thấy rõ): tóc búi gọn, gân tóc chạy từ đỉnh, búi tóc có trâm vàng, hai dải mũ rủ xuống gáy
        hair_dk = lambda c: bs.Paint(tuple(v * 1.5 for v in SAND_DK), 'tkstone')
        ellipsoid(
            b, P(0, 55.4, -0.8), P(3.75, 4.7, 3.7), nu=96, nv=64, seed=108, amp=0.02, hole=lambda c: c[2] > 0.1 * S,
            ridge=lambda x, y, z: 1.0 + 0.045 * math.sin(math.atan2(x, z + 0.8 * S) * 38) * (0.6 + 0.4 * (y / S - 50.0) / 9.0) + 0.05 * math.exp(-(((y / S) - 54.0) ** 2) / 1.5) * math.exp(-((x / S) ** 2) / 0.8),
            col=lambda c: hair_dk(c),
        )
        ellipsoid(b, P(0, 60.4, -1.8), P(1.9, 1.7, 1.8), nu=24, nv=16, seed=109, amp=0.05, col=lambda c: hair_dk(c))  # búi tóc
        limb(b, [P(-2.4, 60.6, -1.8), P(0, 60.9, -1.8), P(2.4, 60.6, -1.8)], [0.32 * S, 0.34 * S, 0.32 * S], nu=10, steps=5, seed=110, gold_at=lambda c: True)  # trâm cài ngang búi
        for sx in (-1, 1):
            limb(b, [P(sx * 2.3, 58.2, -3.4), P(sx * 3.0, 54.5, -3.8), P(sx * 2.5, 50.8, -3.3)], [0.55 * S, 0.5 * S, 0.3 * S], nu=10, steps=6, seed=112 + sx, col=lambda c: hair_dk(c))  # dải mũ rủ
        # mão: đai mây cuộn + ba tầng cánh sen (một phần vỡ) + hai cánh tai mão (một cánh gãy) + minh châu trước trán
        crown_band(b, 58.3 * S, 4.15 * S, 4.25 * S, 0.55 * S)
        rn = random.Random(7)
        tiers = ((14, 4.45, 58.6, 0.6, 2.5, 1.15, 0.22, 0.3), (10, 3.9, 59.1, 0.35, 3.2, 1.05, 0.2, 0.2), (6, 2.6, 59.6, 0.15, 3.9, 0.9, 0.17, 0.12))
        for ti, (n, R, y0, tilt, L, W, T, bend) in enumerate(tiers):
            for q in range(n):
                if ti == 0 and q in (3, 4, 9):
                    continue  # cánh sen rụng
                th = (q + 0.5 * ti) / n * math.tau
                ln = L * (0.45 if (ti, q) in ((1, 2), (2, 5)) else 1.0) * (0.9 + 0.2 * rn.random())  # vài cánh gãy ngắn
                ax_ = (math.sin(th) * math.sin(tilt), math.cos(tilt), math.cos(th) * math.sin(tilt))
                leaf(b, P(R * math.sin(th), y0, R * math.cos(th) * 1.02), (ax_[0], ax_[1], ax_[2]), (math.cos(th), 0, -math.sin(th)), ln * S, W * S, T * S, out=(math.sin(th), 0, math.cos(th)), bend=bend, seed=200 + ti * 20 + q)
        ellipsoid(b, P(0, 59.2, 4.55), P(0.75, 1.0, 0.55), nu=16, nv=12, amp=0.02, seed=160, gold_at=lambda c: True)  # minh châu
        for sx, ln in ((-1, 6.6), (1, 3.4)):  # cánh tai mão (phải gãy ngắn)
            leaf(b, P(sx * 4.2, 58.9, -0.6), (sx, 0.12, -0.15), (0, 0, 1), ln * S, 1.25 * S, 0.22 * S, out=(0, -1, 0), bend=0.35, seed=170 + sx)

    def arm_left():
        limb(b, [P(-11.9, 46.2, 0), P(-13.4, 36.0, 1.6), P(-12.3, 25.2, 5.6)], [3.2 * S, 3.0 * S, 2.2 * S], nu=16, steps=7, seed=111)
        hand(b, S, -12.1, 22.8, 6.1, -1, 1.35, 114, curl=-0.18)  # bàn tay mở, ngón ba đốt liền, chống xuống đất

    def arm_right():
        # cánh tay phải gãy ở giữa cẳng tay: đầu gãy dẹt, nhiễu mạnh (đá đặc)
        limb(b, [P(11.9, 46.2, 0), P(13.4, 36.0, 1.6), P(12.3, 28.0, 4.6)], [3.2 * S, 2.9 * S, 2.35 * S], nu=16, steps=7, seed=121, cap1='broken')

    def forearm_right():
        limb(b, [P(0, 0, 0), P(0, 5.5, 0.2), P(0, 10.5, 0)], [2.4 * S, 2.3 * S, 2.1 * S], nu=16, steps=6, seed=131, cap0='broken')
        hand(b, S, 0.0, 12.6, 0.0, 1, 1.0, 132, curl=0.5)  # bàn tay úp, ngón cong chống đất

    seg('legs', legs)
    seg('torso', torso)
    seg('head', head)
    seg('arm_l', arm_left)
    seg('arm_r', arm_right)
    seg('farm_r', forearm_right)

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

    def scale_part(name, k, piv):
        s0, s1 = parts[name]
        for i in range(s0, s1):
            X, Y, Z = b.verts[i]
            b.verts[i] = (piv[0] + (X - piv[0]) * k, piv[1] + (Y - piv[1]) * k, piv[2] + (Z - piv[2]) * k)

    # đầu và bàn tay phóng to: từ 100–200 m phải đọc ra mặt (mũ, sống mũi, gò mày) và bàn tay chống đất
    HEAD_K = 1.8
    scale_part('head', HEAD_K, (0.0, 0.0, 55.0 * S))
    scale_part('farm_r', 2.0, (0.0, 0.0, 0.0))
    fall = -1.43
    for name in ('legs', 'torso', 'arm_l', 'arm_r'):
        bring(name, fall, 0.0, 0.0, (0, 0, 0))
        s0_, s1_ = parts[name]  # lật quanh trục thân (Y): ngã sấp, mặt úp xuống đất, lưng giáp hướng lên trời
        for i_ in range(s0_, s1_):
            X_, Y_, Z_ = b.verts[i_]
            b.verts[i_] = (-X_, Y_, -Z_)
    # vỡ ba khúc: chân / thân + hai tay / đầu + bàn tay gãy; mỗi khúc trượt và xoay lệch quanh trục thân (-z)
    pieces_of = {'legs': 0, 'torso': 1, 'arm_l': 1, 'arm_r': 1, 'head': 2, 'farm_r': 2}
    ids3 = [[], [], []]
    for nm, q in pieces_of.items():
        ids3[q] += list(range(parts[nm][0], parts[nm][1]))
    xform_idx(b, ids3[0], (0, 0, 0), 0.0, -0.12, 0.0, d=(-4.0 * S, 0.0, 6.0 * S))
    xform_idx(b, ids3[1], (0, 0, -40 * S), 0.0, 0.16, 0.05, d=(5.0 * S, 0.0, 0.0))
    # Đầu: lăn khỏi cổ, nằm nghiêng trên đất, mặt quay về quảng trường và hơi ngửa lên trời để từ 100–200 m thấy mũ, mày, mũi, miệng.
    # Khung đầu (toạ độ game, đứng): x phải, y lên, z là hướng mặt. Hướng đích tính trong khung object tượng (Blender: x, y, z lên);
    # đầu nằm ~150 m phía tây-bắc quảng trường; object xoay -yaw nên hướng về quảng trường trong khung object là (-0.9, 0.42), ngửa lên 0,14.
    def basis(f, up0):
        n = lambda v: tuple(t / math.sqrt(sum(q * q for q in v)) for t in v)
        f = n(f)
        d = sum(a_ * b_ for a_, b_ in zip(up0, f))
        u = n(tuple(a_ - d * b_ for a_, b_ in zip(up0, f)))
        r = (u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0])  # r = u × f
        return r, u, f

    def lay(name, c_game, bs3, dest, ground=True):
        r_, u_, f_ = bs3
        s0, s1 = parts[name]
        for i in range(s0, s1):
            X, Y, Z = b.verts[i]
            x, y, z = X - c_game[0], Z - c_game[1], -Y - c_game[2]
            b.verts[i] = (dest[0] + x * r_[0] + y * u_[0] + z * f_[0], dest[1] + x * r_[1] + y * u_[1] + z * f_[1], dest[2] + x * r_[2] + y * u_[2] + z * f_[2])
        if ground:
            low = min(b.verts[i][2] for i in range(s0, s1))
            for i in range(s0, s1):
                X, Y, Z = b.verts[i]
                b.verts[i] = (X, Y, Z - low)

    tv = [b.verts[i] for i in range(parts['torso'][0], parts['torso'][1])]
    neck_y = max(v[1] for v in tv)
    head_c = (0.0, 55.0 * S + 0.2 * S * HEAD_K, 0.6 * S * HEAD_K)  # tâm mặt cầu đầu sau khi phóng to (toạ độ game)
    HEAD_F = tuple(float(t) for t in os.environ.get('TK_HEAD_F', '0.7,-0.3,-0.65').split(','))
    HEAD_UP = tuple(float(t) for t in os.environ.get('TK_HEAD_UP', '0.15,0.95,0.2').split(','))
    head_b = basis(HEAD_F, HEAD_UP)
    hdest = (-6.0 * S, neck_y + 11.0 * S, 0.0)
    lay('head', head_c, head_b, hdest)
    # Cẳng tay phải gãy + bàn tay xòe nằm cạnh đầu, ngón hướng lên trời, chống lên đất
    farm_c = (0.0, 12.0 * S * 2.0, 0.0)
    lay('farm_r', farm_c, basis((0.0, 0.0, -1.0), (-0.9, 0.4, 0.0)), (hdest[0] - 26.0 * S, hdest[1] - 8.0 * S, 0.0))
    # Kiếm cổ phong (jian): lưỡi thẳng hai lưỡi có sống, hộ thủ đĩa vàng, chuôi quấn, đuôi kiếm có tua đỏ; cắm xiên cạnh tượng.
    start = len(b.verts)
    jian(b, 0.0, 0.0, 0.0, 46 * S, S)
    xform(b, start, (0, 0, 0), 1.4, 0.0, 0.26, d=(30 * S, 0.0, -24 * S))  # kiếm gãy nằm cạnh tay, không còn cắm đứng
    rubble(b, 0, 0.0, -20 * S, 26, 3.4 * S, rnd, 36 * S)
    for k in range(12):  # nứt phát sáng vàng trên giáp
        b.box(rnd.uniform(-5, 5) * S, 0.2 * S + rnd.uniform(1, 9) * S, rnd.uniform(-34, -4) * S, 0.2 * S, 0.2 * S, rnd.uniform(2, 6) * S, GOLD_LIT)
    # mỗi khúc nằm chạm đất riêng (đáy y = 0); client còn đặt từng khúc theo heightAt chỗ nó nằm
    for g in ids3:
        low = min(b.verts[i][2] for i in g)
        xform_idx(b, g, (0, 0, 0), 0.0, 0.0, 0.0, d=(0.0, -low, 0.0))
    hv = list(range(parts['head'][0], parts['head'][1]))
    b.parts = parts
    b.head_c = tuple(sum(b.verts[i][k] for i in hv) / len(hv) for k in range(3))  # tâm đầu (cho ảnh xem trước)
    # nhãn khúc của từng mặt: mặt nào đỉnh đầu thuộc khúc nào; vật thêm (kiếm, đá vụn, nứt vàng) về khúc gần nhất theo xz
    owner = {}
    for q, g in enumerate(ids3):
        for i in g:
            owner[i] = q
    cxz = []
    for g in ids3:
        pts = [(b.verts[i][0], -b.verts[i][1]) for i in g]
        cxz.append((sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)))
    pieces = []
    for f in b.faces[fstart:]:
        if f[0] in owner:
            pieces.append(owner[f[0]])
        else:
            c = (sum(b.verts[i][0] for i in f) / len(f), sum(-b.verts[i][1] for i in f) / len(f))
            pieces.append(min(range(3), key=lambda q: (cxz[q][0] - c[0]) ** 2 + (cxz[q][1] - c[1]) ** 2))
    b.pieces = pieces
    b.pstart = fstart


def xform_idx(b, idxs, piv, rx=0.0, ry=0.0, rz=0.0, d=(0.0, 0.0, 0.0)):
    """Như `xform` nhưng chỉ cho tập đỉnh `idxs` (mỗi mặt của Builder có đỉnh riêng nên tách khúc tượng không rách lưới)."""
    cx_, sx_ = math.cos(rx), math.sin(rx)
    cz_, sz_ = math.cos(rz), math.sin(rz)
    cy_, sy_ = math.cos(ry), math.sin(ry)
    for i in idxs:
        X, Y, Z = b.verts[i]
        x, y, z = X - piv[0], Z - piv[1], -Y - piv[2]
        y, z = y * cx_ - z * sx_, y * sx_ + z * cx_
        x, y = x * cz_ - y * sz_, x * sz_ + y * cz_
        x, z = x * cy_ + z * sy_, -x * sy_ + z * cy_
        b.verts[i] = bs.P(x + piv[0] + d[0], y + piv[1] + d[1], z + piv[2] + d[2])


def build_all():
    data = build_data()
    rnd = random.Random(20261119)
    # Ba object: thang (1100 bậc, không vát mép để giữ ngân sách tam giác), kiến trúc (cổng, tiên cung, cột; có vát mép), tượng.
    stair = new_builder(seed=4, moss=0.5)
    build_stair(stair, data['stair'], rnd)
    main = new_builder(seed=3, moss=0.7)
    for isl in data['islands']:
        if isl['kind'] == 'cong':
            build_gate(main, isl, rnd)
        else:
            build_palace(main, isl, rnd, big=isl['id'] in ('cung_tay', 'cung_dong'))
    build_avenue_pillars(main, data['pillars'], rnd)
    statue = new_builder(seed=5, moss=0.35)
    build_statue(statue, data['statue'], rnd)
    return stair, main, statue, data


def split_statue(sb):
    """Tách builder tượng thành 3 builder theo `sb.pieces` (nhãn khúc của từng mặt, tính từ `sb.pstart`)."""
    outs = []
    for q in range(3):
        nb = bs.Builder()
        remap = {}
        for k, f in enumerate(sb.faces):
            lab = sb.pieces[k - sb.pstart] if k >= sb.pstart else 0
            if lab != q:
                continue
            nf = []
            for i in f:
                if i not in remap:
                    remap[i] = len(nb.verts)
                    nb.verts.append(sb.verts[i])
                nf.append(remap[i])
            nb.faces.append(tuple(nf))
            nb.colors.append(sb.colors[k])
            nb.uvs.append(sb.uvs[k])
            nb.mats.append(sb.mats[k])
            nb.smooth.append(sb.smooth[k])
        outs.append(nb)
    return outs


def run(out):
    bs.make_textures()
    stair, main, statue, data = build_all()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = ts.materials_for([stair, main, statue])
    parts = [('tk_stair', stair, False), ('tk_main', main, True)]
    for q, sb in enumerate(split_statue(statue)):  # ba khúc tượng là ba object riêng: client đặt từng khúc theo heightAt chỗ nó nằm
        parts.append((f'tk_statue{q}', sb, True))
    for name, b, bevel in parts:
        mesh = ts.make_mesh(name, b, keys, images, bevel=bevel)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        if name.startswith('tk_statue'):
            st = data['statue']
            obj.location = (st['x'] - CX, -(st['z'] - CZ), 0.0)  # Blender: (x, -z, y); client hạ y theo đất
            obj.rotation_euler = (0.0, 0.0, -st['yaw'])
    ts.export_glb(out)
    size, prims, tris, doc = bs.inspect(out)
    print(f'[thien_khuyet] {out}: {size / 1024:.0f} KB, {len(stair.faces) + len(main.faces) + len(statue.faces)} mặt, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)})')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_thien_khuyet.glb')
