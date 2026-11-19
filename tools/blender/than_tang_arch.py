# Cảnh Thần Tàng Điện (DUN-1 PR4, phong cách B): điện tàng cổ của chủ điện Thiên Khuyết. Đá cẩm thạch đen tím nạm vàng, hàng cột sáo có đai vàng, tường có hốc vòm và
# phướn tím thêu vàng, ba cửa phong ấn khổng lồ (đúng ba hướng 200° / 270° / 340° của `seals.doors`), tượng đá võ sĩ không mặt cầm đại kiếm canh cửa, đống kim ngân và rương,
# đèn chùm vàng treo trần, mặt nạ "vô diện" khổng lồ trên tường bắc. Dùng bộ dựng của Kiếm Trủng (kiem_trung_arch.py).
#
#   blender --background --python tools/blender/than_tang_arch.py -- assets/build/raw/arch_than_tang.glb
#
# Gốc toạ độ = tâm điện (1520, y, 1300); x = đông, z = nam; mặt trước (+z) của mọi vật hướng vào tâm khi quay `yaw = a + π/2` (a = góc đặt, atan2(z, x)).
# Vật `tt_*` gốc ở sàn; `tt_ceil_*` treo trần (client đặt y theo vòm).

import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_sect as bs  # noqa: E402
import kiem_trung_arch as kta  # noqa: E402
import thien_cong_sect as ts  # noqa: E402
from build_sect import Mat, Paint  # noqa: E402
from kiem_trung_arch import C, blob, mix, new_b, rod, tbox  # noqa: E402
from thien_khuyet_arch import fbm3  # noqa: E402

bs.MATERIALS['gold'] = Mat(0.34, 0.55, None, 1.0, False, 0.0, (0xC99A3A, 0.4))
bs.MATERIALS['silk'] = Mat(0.4, 0.1, None, 1.0, False, 0.0)
bs.MATERIALS['lamp'] = Mat(0.9, 0.0, None, 1.0, False, 0.0, (0xFFB45A, 1.1))
bs.MATERIALS['rune'] = Mat(0.5, 0.0, None, 1.0, False, 0.0, (0xB08CFF, 1.0))

SEED = 20261119
DOME_R, DOME_H = 135.0, 80.0
DOOR_DEG = [200, 270, 340]  # khớp `seals.doors` (levels/than_tang.json) và props.thantang.ts

GOLD = Paint(C(0xDDB95C), 'gold')
GOLD_DK = Paint(C(0x9A7430), 'gold')
LAMP = Paint(C(0xFFC27A), 'lamp')
RUNE = Paint(C(0x6B4BC8), 'rune')
BANNER = Paint(C(0x4A2A78), 'silk')
IRON = Paint(C(0x3B3540), 'metal')


def dome_h(r):
    return DOME_H * math.sqrt(max(0.0, 1.0 - (r / DOME_R) ** 2))


def marble(seed, lift=0.0):
    """Cẩm thạch đen tím có vân sáng; `lift` làm sáng thêm."""

    def fn(pos, nrm):
        n = fbm3(pos[0] * 0.4, pos[1] * 0.4, pos[2] * 0.4, seed, 3)
        vein = max(0.0, 1.0 - abs(fbm3(pos[0] * 0.9 + 3, pos[1] * 0.9, pos[2] * 0.9, seed + 7, 2) - 0.5) * 16)
        rgb = mix(C(0x2C2542), C(0x5A5074), 0.3 + 0.5 * n + lift)
        rgb = mix(rgb, C(0xB8A8D8), vein * 0.35)
        return Paint(tuple(rgb), 'jade')

    return fn


def mpaint(seed, x=0.0, y=0.0, z=0.0, lift=0.0):
    return marble(seed, lift)((x, y, z), (0, 1, 0))


def gold_band(b, x, y, z, r, h):
    b.cylinder(x, y, z, r, h, GOLD, 16)


# ---------- nhịp tường + cột ----------


def bay(b, seed):
    """Một nhịp tường (rộng W = 36) quay mặt vào tâm (+z): hai nửa cột sáo đai vàng ở mép, tường đen tím có hốc vòm viền vàng, gờ diềm vàng, mái hiên cong, hai phướn tím thêu vàng."""
    W = 36.0
    H = 36.0
    for sx in (-1, 1):
        x0 = sx * W / 2
        tbox(b, (x0, 1.0, 0), (5.4, 2.0, 5.4), mpaint(seed, lift=0.1))
        tbox(b, (x0, -1.4, 0), (4.8, 3.2, 4.8), mpaint(seed + 1))  # chân tảng chìm: sàn bám địa hình, cột không lơ lửng
        sides = 14
        prev = None
        for i in range(9):
            q = i / 8
            y = 2.0 + q * (H - 4.5)
            rr = 2.4 * (1.0 - 0.1 * q)
            ring = []
            for j in range(sides):
                a = j / sides * math.tau
                fl = 1.0 - 0.07 * (1 if j % 2 else 0)
                ring.append((x0 + math.cos(a) * rr * fl, y, math.sin(a) * rr * fl))
            if prev:
                for j in range(sides):
                    k2 = (j + 1) % sides
                    b.poly([prev[j], prev[k2], ring[k2], ring[j]], (x0, y, 0), mpaint(seed + j, x0, y, 0, 0.05))
            prev = ring
        b.poly(prev, (x0, 0, 0), mpaint(seed))
        for yb in (3.0, H * 0.35, H * 0.7, H - 3.2):
            gold_band(b, x0, yb, 0, 2.62, 0.5)
        tbox(b, (x0, H - 0.8, 0), (5.2, 1.6, 5.2), mpaint(seed + 6, lift=0.1))
        gold_band(b, x0, H + 0.0, 0, 3.1, 0.4)
    # tường sau
    tbox(b, (0, H / 2 - 0.2, -1.6), (W - 4.6, H, 1.6), mpaint(seed + 9))
    # hốc vòm viền vàng ở giữa (sâu 0,8), tối hơn, có đèn
    hw, hh = 6.0, 22.0
    pts = []
    N = 18
    for i in range(N + 1):
        t = i / N
        a = math.pi * t
        pts.append((-hw * math.cos(a), 7.0 + hh * 0.62 + hh * 0.38 * math.sin(a) * 1.0))
    # viền vàng hốc
    for i in range(N):
        a_, c_ = pts[i], pts[i + 1]
        tbox(b, ((a_[0] + c_[0]) / 2, (a_[1] + c_[1]) / 2, -0.55), (math.dist(a_, c_) + 0.15, 0.55, 0.6), GOLD, rz=math.atan2(c_[1] - a_[1], c_[0] - a_[0]))
    tbox(b, (-hw, 7.0 + (hh * 0.62) / 2, -0.55), (0.55, hh * 0.62, 0.6), GOLD)
    tbox(b, (hw, 7.0 + (hh * 0.62) / 2, -0.55), (0.55, hh * 0.62, 0.6), GOLD)
    tbox(b, (0, 7.0 + hh * 0.31, -0.9), (hw * 2 - 0.4, hh * 0.62 + 4, 0.3), Paint(C(0x120D20), 'earth'))  # lòng hốc tối
    for k in range(3):  # đèn dầu trong hốc
        blob(b, ((k - 1) * 3.0, 9.0 + 4 * (k % 2), -0.5), (0.6, 0.9, 0.6), lambda p, n: LAMP, nu=10, nv=6)
    # diềm vàng + mái cong
    for yy, hh2 in ((H - 4.0, 0.6), (H - 6.4, 0.35)):
        tbox(b, (0, yy, -0.7), (W - 4.6, hh2, 0.7), GOLD)
    for i in range(7):
        tbox(b, (-14.4 + i * 4.8, H - 5.2, -0.65), (1.8, 1.2, 0.5), GOLD_DK)
    roof = mpaint(seed + 20, lift=0.2)
    n_seg = 16
    top = H + 0.4
    for i in range(n_seg):
        t0, t1 = i / n_seg, (i + 1) / n_seg
        x0r, x1r = -W / 2 - 1.2 + t0 * (W + 2.4), -W / 2 - 1.2 + t1 * (W + 2.4)
        y0r = top + 3.2 * abs(2 * t0 - 1) ** 2.6
        y1r = top + 3.2 * abs(2 * t1 - 1) ** 2.6
        slope = math.atan2(y1r - y0r, x1r - x0r)
        mx, my = (x0r + x1r) / 2, (y0r + y1r) / 2
        tbox(b, (mx, my, 0.5), (math.dist((x0r, y0r), (x1r, y1r)) + 0.1, 0.8, 5.0), roof, rz=slope, rx=-0.12)
        tbox(b, (mx, my + 0.6, 2.8), (math.dist((x0r, y0r), (x1r, y1r)) + 0.1, 0.35, 0.4), GOLD, rz=slope)
    # phướn tím thêu vàng hai bên hốc: vải có nếp, viền vàng, tròn "vô diện" ở giữa
    for sx in (-1, 1):
        xc = sx * 11.8
        cw, ch = 3.2, 18.0
        rows = 12
        for r_ in range(rows):
            y_a = H - 5.0 - r_ * ch / rows
            y_b = y_a - ch / rows
            for c_ in range(4):
                xa = xc - cw / 2 + c_ * cw / 4
                xb = xa + cw / 4
                f = lambda cc, rr: 0.55 + 0.25 * math.sin(cc * 1.4 + rr * 0.3 + sx)
                col = Paint(mix(C(0x2E1858), C(0x6B46A8), 0.4 + 0.5 * math.sin(c_ * 1.4 + 1.0) * 0.5), 'silk')
                b.poly([(xa, y_a, f(c_, r_)), (xb, y_a, f(c_ + 1, r_)), (xb, y_b, f(c_ + 1, r_ + 1)), (xa, y_b, f(c_, r_ + 1))], (xc, y_a, -4), col)
        tbox(b, (xc, H - 5.0, 0.7), (cw + 0.5, 0.4, 0.5), GOLD)
        tbox(b, (xc, H - 5.0 - ch, 0.7), (cw + 0.5, 0.35, 0.45), GOLD)
        blob(b, (xc, H - 5.0 - ch * 0.4, 1.1), (1.0, 1.3, 0.25), lambda p, n: Paint(C(0xE9D79A), 'gold'), nu=12, nv=6)  # mặt nạ trống
        for k in range(5):
            b.box(xc + (k - 2) * 0.5, H - 5.0 - ch - 1.0, 0.7, 0.07, 1.6, 0.07, GOLD_DK)


# ---------- cửa phong ấn ----------


def seal_gate(b, seed):
    """Cửa phong ấn khổng lồ quay mặt +z: khung đá hai trụ đai vàng + lanh tô vòm, tấm cửa đen tím, đĩa ấn vàng nhiều vòng có tám nan và khối chữ phát sáng tím, xích rủ hai bên, bậc đá."""
    for k in range(3):
        tbox(b, (0, 0.4 + k * 0.8, 3.0 - k * 0.9), (24 - 2 * k, 0.8, 8 - 1.8 * k), mpaint(seed + k, lift=0.1))
    for sx in (-1, 1):
        for k in range(4):
            tbox(b, (sx * 7.4, 2.4 + k * 4.4, 0), (3.2, 4.4, 3.2), mpaint(seed + 4 + k, lift=0.08))
        for yb in (3.0, 9.0, 15.0):
            gold_band(b, sx * 7.4, yb, 0, 2.3, 0.5)
    # lanh tô vòm
    N = 20
    for i in range(N):
        a0, a1 = math.pi * i / N, math.pi * (i + 1) / N
        p0 = (7.4 * math.cos(a0), 19.0 + 4.2 * math.sin(a0))
        p1 = (7.4 * math.cos(a1), 19.0 + 4.2 * math.sin(a1))
        tbox(b, ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 0), (math.dist(p0, p1) + 0.2, 3.0, 3.0), mpaint(seed + 30 + i, lift=0.1), rz=math.atan2(p1[1] - p0[1], p1[0] - p0[0]))
        tbox(b, ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 1.6), (math.dist(p0, p1) + 0.2, 0.5, 0.3), GOLD, rz=math.atan2(p1[1] - p0[1], p1[0] - p0[0]))
    # tấm cửa
    tbox(b, (0, 10.0, -0.3), (11.6, 20.0, 1.2), mpaint(seed + 60, lift=-0.05))
    for yy in (4.0, 16.0):
        tbox(b, (0, yy, 0.45), (11.6, 0.5, 0.4), GOLD_DK)
    # đĩa ấn
    cy = 10.5
    for rad, th in ((4.4, 0.28), (3.3, 0.22), (2.0, 0.2)):
        for i in range(40):
            a0, a1 = i / 40 * math.tau, (i + 1) / 40 * math.tau
            rod(b, (math.cos(a0) * rad, cy + math.sin(a0) * rad, 0.6), (math.cos(a1) * rad, cy + math.sin(a1) * rad, 0.6), th, th, lambda p, n: GOLD, nu=6, nv=1, amp=0.0)
    for i in range(8):
        a = i / 8 * math.tau
        rod(b, (math.cos(a) * 0.8, cy + math.sin(a) * 0.8, 0.6), (math.cos(a) * 4.2, cy + math.sin(a) * 4.2, 0.6), 0.18, 0.18, lambda p, n: GOLD, nu=6, nv=1, amp=0.0)
    for i in range(16):  # khối chữ phát sáng tím giữa hai vòng ngoài
        a = i / 16 * math.tau + 0.1
        tbox(b, (math.cos(a) * 3.85, cy + math.sin(a) * 3.85, 0.7), (0.5, 0.8, 0.12), RUNE, rz=a - math.pi / 2)
    blob(b, (0, cy, 0.8), (1.0, 1.0, 0.45), lambda p, n: Paint(C(0xF0DC9A), 'gold'), nu=12, nv=6)
    # xích
    for sx in (-1, 1):
        for k in range(14):
            tbox(b, (sx * 4.2 + sx * 0.4 * math.sin(k * 0.5), 18.0 - k * 1.1, 0.9), (0.4, 0.8, 0.22), IRON, rz=sx * 0.12, yaw=(k % 2) * math.pi / 2)


# ---------- tượng võ sĩ không mặt ----------


def statue(b, seed):
    """Tượng đá võ sĩ giáp trụ không mặt, đứng tấn cao ~13 m, hai tay chống đại kiếm cắm xuống; bệ vuông; giáp vai ba lớp viền vàng."""
    rnd = random.Random(seed)
    S = lambda off=0: marble(seed + int(off), 0.05)  # hàm màu cho blob/rod
    SP = lambda off=0: mpaint(seed + int(off), lift=0.05)  # Paint cho tbox
    tbox(b, (0, 0.8, 0), (7.0, 1.6, 7.0), SP(1))
    tbox(b, (0, 1.9, 0), (5.6, 0.6, 5.6), SP(2))
    for sx in (-1, 1):  # chân + giáp ống
        blob(b, (sx * 1.2, 4.6, 0), (0.95, 2.6, 1.1), S(3), nu=10, nv=6, seed=seed + 1)
        blob(b, (sx * 1.2, 7.4, 0), (1.25, 1.5, 1.3), S(4), nu=10, nv=6, seed=seed + 2)
    blob(b, (0, 8.5, 0), (3.0, 0.9, 1.9), S(5), nu=12, nv=5, seed=seed + 3)  # váy giáp
    blob(b, (0, 10.8, 0), (2.4, 2.7, 1.6), S(6), nu=14, nv=8, seed=seed + 4)  # thân
    gold_band(b, 0, 9.0, 0, 2.2, 0.3)
    for k in range(3):  # giáp vai nhiều lớp
        for sx in (-1, 1):
            blob(b, (sx * (2.9 + 0.12 * k), 12.8 - 0.55 * k, 0), (1.15 - 0.08 * k, 0.55, 1.3 - 0.08 * k), S(7 + k), nu=10, nv=5, seed=seed + 5 + k)
            tbox(b, (sx * (2.9 + 0.12 * k), 12.45 - 0.55 * k, 0.9), (2.0, 0.1, 0.1), GOLD)
    blob(b, (0, 13.8, 0), (1.0, 1.15, 0.95), S(11), nu=12, nv=8, seed=seed + 9)  # đầu trơn không mặt
    blob(b, (0, 14.2, 0), (1.12, 0.8, 1.05), S(12), nu=12, nv=5, seed=seed + 10, v0=0.0, v1=0.55)  # mũ trụ
    tbox(b, (0, 14.0, 0.55), (0.15, 2.0, 0.4), GOLD)  # sống mũ
    # đại kiếm chống trước thân
    tbox(b, (0, 4.5, 2.3), (0.9, 9.0, 0.25), Paint(C(0x7F7A92), 'metal'))
    tbox(b, (0, 9.1, 2.3), (3.0, 0.4, 0.5), GOLD)
    for sx in (-1, 1):  # cánh tay chống kiếm
        rod(b, (sx * 2.6, 12.0, 0.2), (sx * 0.9, 9.6, 2.1), 0.65, 0.5, S(13), nu=8, nv=3)
    tbox(b, (0, 9.6, 2.3), (0.45, 1.3, 0.45), IRON)


# ---------- kim ngân ----------


def hoard(b, seed):
    rnd = random.Random(seed)

    def goldmound(pos, nrm):
        n = fbm3(pos[0] * 3, pos[1] * 3, pos[2] * 3, seed, 3)
        return Paint(tuple(c * (0.7 + 0.6 * n) for c in C(0xD6AE50)), 'gold')

    blob(b, (0, 0.6, 0), (3.4, 1.3, 3.0), goldmound, nu=16, nv=8, seed=seed, v0=0.0, v1=0.5, amp=0.18)
    for k in range(34):  # đồng tiền nổi
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0, 2.6)
        y = 1.2 * max(0.0, 1 - (d / 3.2) ** 2) + 0.15
        tbox(b, (math.cos(a) * d, y, math.sin(a) * d), (0.55, 0.07, 0.55), Paint(mix(C(0xE8C468), C(0xA97E32), rnd.random()), 'gold'), rx=rnd.uniform(-0.6, 0.6), rz=rnd.uniform(-0.6, 0.6), yaw=a)
    for k in range(4):  # thỏi vàng
        tbox(b, (rnd.uniform(-2, 2), 1.1, rnd.uniform(-1.6, 1.6)), (0.9, 0.4, 0.45), GOLD, yaw=rnd.uniform(0, 3), rz=rnd.uniform(-0.3, 0.3))
    # rương
    tbox(b, (3.6, 0.8, -0.8), (2.6, 1.6, 1.8), Paint(C(0x3B2A22), 'wood'), yaw=0.3)
    tbox(b, (3.6, 1.7, -0.8), (2.7, 0.35, 1.9), GOLD_DK, yaw=0.3)
    for sz in (-0.5, 0.5):
        tbox(b, (3.6, 0.8, -0.8 + sz * 1.5), (2.7, 1.7, 0.16), GOLD, yaw=0.3)
    # bình ngọc tím
    blob(b, (-3.8, 1.3, 0.6), (0.9, 1.4, 0.9), lambda p, n: Paint(C(0x6A4BA0), 'jade'), nu=12, nv=8)
    gold_band(b, -3.8, 1.9, 0.6, 0.75, 0.2)


# ---------- đèn chùm ----------


def chandelier(b, seed):
    """Đèn chùm vàng treo trần: dây xích, vòng vàng (hai tầng), tám ngọn đèn sáng, tua rủ; gốc ở trần, rủ xuống −y."""
    for k in range(8):
        tbox(b, (0, -1.2 - k * 1.7, 0), (0.35, 1.3, 0.18), GOLD_DK, yaw=(k % 2) * math.pi / 2)
    yc = -15.0
    for rad, yy, th in ((7.0, yc, 0.42), (4.2, yc + 1.4, 0.3)):
        n = 24
        for i in range(n):
            a0, a1 = i / n * math.tau, (i + 1) / n * math.tau
            rod(b, (math.cos(a0) * rad, yy, math.sin(a0) * rad), (math.cos(a1) * rad, yy, math.sin(a1) * rad), th, th, lambda p, n_: GOLD, nu=6, nv=1, amp=0.0)
    for i in range(4):
        a = i / 4 * math.tau
        rod(b, (0, yc + 3.0, 0), (math.cos(a) * 7.0, yc + 0.1, math.sin(a) * 7.0), 0.18, 0.18, lambda p, n_: GOLD_DK, nu=6, nv=1, amp=0.0)
    for i in range(8):
        a = i / 8 * math.tau
        x, z = math.cos(a) * 7.0, math.sin(a) * 7.0
        b.cylinder(x, yc + 0.3, z, 0.55, 1.0, GOLD, 8)
        blob(b, (x, yc + 2.0, z), (0.55, 0.9, 0.55), lambda p, n_: LAMP, nu=10, nv=6)
        for k in range(3):
            b.box(x, yc - 0.6 - k * 0.9, z, 0.05, 0.9, 0.05, GOLD_DK)
    blob(b, (0, yc - 1.0, 0), (1.0, 1.6, 1.0), lambda p, n_: LAMP, nu=10, nv=6)


# ---------- mặt nạ vô diện ----------


def faceless_mask(b, seed):
    """Mặt nạ khổng lồ không mặt trên tường bắc (cao ~22 m): oval trơn bằng cẩm thạch sáng, gờ mày, hai tai cuộn, viền vàng dày, hào quang tia vàng; quay mặt +z."""
    W, H = 8.0, 11.0
    cy = 22.0

    def oval(u, v):
        a = u * math.tau
        r = 1.0 + 0.04 * math.sin(a * 3)
        return (math.cos(a) * W * r, cy + math.sin(a) * H * r)

    N = 40
    for i in range(N):
        p0, p1 = oval(i / N, 0), oval((i + 1) / N, 0)
        tbox(b, ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 1.2), (math.dist(p0, p1) + 0.3, 1.5, 1.6), GOLD, rz=math.atan2(p1[1] - p0[1], p1[0] - p0[0]))
    blob(b, (0, cy, 0.6), (W * 0.96, H * 0.96, 1.4), marble(seed, 0.35), nu=28, nv=14, seed=seed, v0=0.0, v1=1.0, amp=0.02)
    tbox(b, (0, cy + 3.0, 2.0), (W * 1.3, 0.9, 1.0), Paint(C(0xCFC0E6), 'jade'))  # gờ mày (không mắt, không mũi)
    for sx in (-1, 1):
        blob(b, (sx * (W + 1.6), cy, 0.8), (1.4, 3.4, 1.0), lambda p, n: GOLD, nu=10, nv=8)
    for i in range(24):  # tia hào quang
        a = i / 24 * math.tau
        r0, r1 = 1.25, 1.5 + (0.55 if i % 2 == 0 else 0.1)
        p0 = (math.cos(a) * W * r0, cy + math.sin(a) * H * r0)
        p1 = (math.cos(a) * W * r1, cy + math.sin(a) * H * r1)
        rod(b, (p0[0], p0[1], 0.8), (p1[0], p1[1], 0.8), 0.34, 0.1, lambda p, n: GOLD_DK, nu=6, nv=2, amp=0.0)
    tbox(b, (0, 4.0, 0.0), (W * 2.4, 8.0, 3.0), marble(seed + 4)((0, 4, 0), (0, 1, 0)))  # bệ


def build_variants():
    v = {}
    for i in range(2):
        b = new_b(1000 + i)
        bay(b, 1000 + i * 13)
        v[f'bay{i}'] = b
    b = new_b(1010)
    seal_gate(b, 1010)
    v['gate'] = b
    for i in range(3):
        b = new_b(1020 + i)
        statue(b, 1020 + i * 7)
        v[f'statue{i}'] = b
    for i in range(3):
        b = new_b(1030 + i)
        hoard(b, 1030 + i)
        v[f'hoard{i}'] = b
    b = new_b(1040)
    chandelier(b, 1040)
    v['chandelier'] = b
    b = new_b(1050)
    faceless_mask(b, 1050)
    v['mask'] = b
    return v


def keep_out(x, z, min_r=30.0):
    return math.hypot(x, z) < min_r or (abs(x) < 10 and z > 0)


def run(out):
    bs.make_textures()
    variants = build_variants()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = ts.materials_for(list(variants.values()))
    meshes = {k: ts.make_mesh(f'tt_{k}', b, keys, images, bevel=False) for k, b in variants.items()}
    rnd = random.Random(SEED)
    n_obj = 0

    def put(kind, var, x, z, y=0.0, **kw):
        nonlocal n_obj
        o = kta.place(f'tt_{kind}_{n_obj}', meshes[var], x, z, **kw)
        o.location.z = y
        n_obj += 1

    # Tường: 18 nhịp quanh r = 104 (chừa lối vào phía nam); mặt nạ vô diện đứng trước nhịp bắc.
    NB = 18
    R = 104.0
    for i in range(NB):
        a = (i + 0.5) / NB * math.tau
        if abs(math.atan2(math.sin(a - math.pi / 2), math.cos(a - math.pi / 2))) < 0.2:
            continue
        put('bay', f'bay{i % 2}', math.cos(a) * R, math.sin(a) * R, yaw=a + math.pi / 2)
    put('mask', 'mask', 0.0, -98.0, yaw=0.0, scale=1.0)
    # Ba cửa phong ấn đúng ba hướng của `seals.doors` (r 76, sau điểm nhập thân ở r 64), tượng canh hai bên.
    for deg in DOOR_DEG:
        a = math.radians(deg)
        put('gate', 'gate', math.cos(a) * 76, math.sin(a) * 76, yaw=a + math.pi / 2)
    # Hai hàng tượng dọc hai bên lối vào + vành tượng thưa.
    for k in range(5):
        for sx in (-1, 1):
            put('statue', f'statue{rnd.randrange(3)}', sx * (20 + 2.0 * k), 38 + k * 11, yaw=-sx * 0.9, scale=0.8)
    got = 0
    while got < 8:
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(84, 94)
        x, z = math.cos(a) * r, math.sin(a) * r
        if keep_out(x, z, 80) or any(abs(math.degrees(a) % 360 - d) < 12 for d in DOOR_DEG):
            continue
        put('statue', f'statue{rnd.randrange(3)}', x, z, yaw=a + math.pi / 2, scale=0.95)
        got += 1
    # Đống kim ngân quanh vành điện.
    got = 0
    while got < 18:
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(72, 96)
        x, z = math.cos(a) * r, math.sin(a) * r
        if keep_out(x, z, 66) or any(abs(math.degrees(a) % 360 - d) < 14 for d in DOOR_DEG):
            continue
        put('hoard', f'hoard{rnd.randrange(3)}', x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(0.9, 1.5))
        got += 1
    # Đèn chùm treo trần.
    for i in range(7):
        a = i / 7 * math.tau + 0.2
        r = 0.0 if i == 0 else 50.0
        put('ceil_chandelier', 'chandelier', math.cos(a) * r, math.sin(a) * r, yaw=a, scale=1.4 if i == 0 else 1.0)
    ts.export_glb(out)
    size, prims, tris, doc = bs.inspect(out)
    print(f'[than_tang] {out}: {size / 1024:.0f} KB, {n_obj} vật, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)})')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_than_tang.glb')
