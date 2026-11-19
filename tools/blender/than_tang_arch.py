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
BRAZIERS, BRAZIER_R = 14, 90.0
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
    # dado: dải huy chương tròn (vành vàng, lòng tím, hoa văn) dọc chân tường + gờ chân tường
    tbox(b, (0, 2.0, -0.7), (W - 4.6, 0.5, 0.6), GOLD_DK)
    for i in range(6):
        mx_ = -12.5 + i * 5.0
        if abs(mx_) < 4.0:
            continue
        for k in range(24):
            a_ = k / 24 * math.tau
            blob(b, (mx_ + math.cos(a_) * 1.6, 5.5 + math.sin(a_) * 1.6, -0.5), (0.2, 0.2, 0.2), lambda p, n: GOLD, nu=6, nv=4)
        blob(b, (mx_, 5.5, -0.7), (1.45, 1.45, 0.25), lambda p, n: Paint(C(0x2A1850), 'jade'), nu=14, nv=6)
        for k in range(8):  # cánh hoa sen khắc
            a_ = k / 8 * math.tau
            blob(b, (mx_ + math.cos(a_) * 0.75, 5.5 + math.sin(a_) * 0.75, -0.45), (0.34, 0.34, 0.16), lambda p, n: GOLD_DK, nu=6, nv=4)
        blob(b, (mx_, 5.5, -0.4), (0.38, 0.38, 0.2), lambda p, n: RUNE, nu=8, nv=5)
    # tấm ốp phù điêu hai bên hốc: khung vàng + hình ba vòng đồng tâm
    for sx in (-1, 1):
        for yy in (14.0, 26.0):
            fx = sx * 15.9
            tbox(b, (fx, yy, -0.8), (3.4, 6.2, 0.35), mpaint(seed + 40, lift=0.12))
            for (ox, oy, w_, h_) in ((0, 3.1, 3.5, 0.18), (0, -3.1, 3.5, 0.18), (-1.7, 0, 0.18, 6.3), (1.7, 0, 0.18, 6.3)):
                tbox(b, (fx + ox, yy + oy, -0.55), (w_, h_, 0.25), GOLD)
            for rad in (1.2, 0.8):
                for k in range(20):
                    a_ = k / 20 * math.tau
                    blob(b, (fx + math.cos(a_) * rad, yy + math.sin(a_) * rad, -0.5), (0.14, 0.14, 0.12), lambda p, n: GOLD_DK, nu=6, nv=4)
            blob(b, (fx, yy, -0.45), (0.45, 0.45, 0.2), lambda p, n: Paint(C(0xE9D79A), 'gold'), nu=8, nv=5)
    # chuỗi đèn lồng nhỏ giăng giữa hai cột (dây vàng võng + chín ngọn đèn + hai tua)
    for zz in (2.6,):
        pts = []
        for i in range(13):
            t = i / 12
            pts.append((-W / 2 + 2.4 + t * (W - 4.8), H - 9.0 - 3.4 * (1 - (2 * t - 1) ** 2), zz))
        for a_, c_ in zip(pts, pts[1:]):
            tbox(b, ((a_[0] + c_[0]) / 2, (a_[1] + c_[1]) / 2, zz), (math.dist(a_[:2], c_[:2]) + 0.1, 0.12, 0.12), GOLD_DK, rz=math.atan2(c_[1] - a_[1], c_[0] - a_[0]))
        for i in range(1, 12, 1):
            x_, y_, z_ = pts[i]
            blob(b, (x_, y_ - 0.55, z_), (0.36, 0.5, 0.36), lambda p, n: LAMP, nu=8, nv=5)
            blob(b, (x_, y_ - 0.05, z_), (0.2, 0.12, 0.2), lambda p, n: GOLD, nu=6, nv=4)
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
    # đinh tán + viền khung khắc trên tấm cửa
    for rowy in (3.0, 17.0):
        for k in range(9):
            blob(b, (-4.6 + k * 1.15, rowy, 0.55), (0.22, 0.22, 0.16), lambda p, n: GOLD, nu=6, nv=4)
    for sx in (-1, 1):
        for k in range(10):
            blob(b, (sx * 5.2, 3.0 + k * 1.55, 0.55), (0.2, 0.2, 0.14), lambda p, n: GOLD_DK, nu=6, nv=4)
        tbox(b, (sx * 5.5, 10.0, 0.5), (0.35, 17.0, 0.28), GOLD_DK)
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
    """Thần tướng đá đen chạm khắc cao ~14 m: bệ ba tầng có dải phù văn tím phát sáng; giáp ống + che gối viền vàng; váy giáp năm tấm; ngực giáp có sống vàng, đai lưng có mặt khóa;
    giáp vai ba lớp có gai; tay giáp có đai vàng, nắm chuôi đại kiếm (lưỡi có rãnh phù văn, chắn vàng có đầu thú cách điệu); mũ trụ liền mặt nạ trơn, mào vàng, hai sừng cong; áo choàng sau lưng."""
    rnd = random.Random(seed)
    S = lambda off=0: marble(seed + int(off), 0.05)  # hàm màu cho blob/rod
    SP = lambda off=0: mpaint(seed + int(off), lift=0.05)  # Paint cho tbox
    # bệ ba tầng + dải phù văn
    tbox(b, (0, 0.7, 0), (8.0, 1.4, 8.0), SP(1))
    tbox(b, (0, 1.8, 0), (6.6, 0.9, 6.6), SP(2))
    tbox(b, (0, 2.6, 0), (5.6, 0.7, 5.6), SP(3))
    for k in range(5):
        for side in (-1, 1):
            tbox(b, (side * 3.34, 1.8, -2.0 + k * 1.0), (0.1, 0.5, 0.45), RUNE)
            tbox(b, (-2.0 + k * 1.0, 1.8, side * 3.34), (0.45, 0.5, 0.1), RUNE)
    for yy in (1.42, 2.28):
        tbox(b, (0, yy, 0), (8.1 if yy < 2 else 6.7, 0.1, 8.1 if yy < 2 else 6.7), GOLD)
    # chân: giáp ống, che gối, giày
    for sx in (-1, 1):
        blob(b, (sx * 1.25, 5.0, 0), (0.95, 2.3, 1.05), S(3), nu=12, nv=7, seed=seed + 1)
        tbox(b, (sx * 1.25, 4.1, 0.9), (1.5, 2.2, 0.28), SP(4))  # tấm ống chân
        blob(b, (sx * 1.25, 6.9, 0.45), (1.0, 0.9, 0.7), S(5), nu=10, nv=6, seed=seed + 2)  # che gối
        blob(b, (sx * 1.25, 6.9, 1.0), (0.45, 0.45, 0.2), lambda p, n: GOLD, nu=8, nv=5)
        blob(b, (sx * 1.25, 7.9, 0), (1.2, 1.2, 1.2), S(6), nu=10, nv=6, seed=seed + 3)
        blob(b, (sx * 1.25, 3.0, 0.6), (1.1, 0.5, 1.5), S(7), nu=10, nv=5, seed=seed + 4)
        gold_band(b, sx * 1.25, 3.4, 0, 1.08, 0.18)
    # váy giáp: năm tấm treo + hai tấm hông
    for k in range(5):
        a_ = (k - 2) * 0.33
        tbox(b, (math.sin(a_) * 2.2, 8.2, math.cos(a_) * 1.55), (1.0, 2.0, 0.22), SP(10 + k), yaw=a_, rx=-0.06)
        tbox(b, (math.sin(a_) * 2.2, 7.25, math.cos(a_) * 1.6), (1.04, 0.14, 0.26), GOLD, yaw=a_)
    for sx in (-1, 1):
        tbox(b, (sx * 2.6, 8.3, 0), (0.25, 2.0, 1.8), SP(15), rz=sx * 0.12)
    # thân: ngực giáp, sống vàng, đai lưng
    blob(b, (0, 10.9, 0), (2.5, 2.8, 1.65), S(16), nu=16, nv=10, seed=seed + 5)
    tbox(b, (0, 10.9, 1.6), (0.22, 4.0, 0.3), GOLD)
    for sx in (-1, 1):
        blob(b, (sx * 1.15, 11.7, 1.4), (1.1, 0.9, 0.5), S(17), nu=10, nv=6, seed=seed + 6)
        tbox(b, (sx * 1.15, 10.6, 1.55), (1.5, 0.14, 0.18), GOLD_DK)
    for k in range(5):  # chạm vảy ngực
        tbox(b, (0, 9.4 + k * 0.5, 1.5), (3.6 - k * 0.3, 0.1, 0.2), SP(18 + k))
    gold_band(b, 0, 9.0, 0, 2.3, 0.32)
    blob(b, (0, 9.2, 1.7), (0.85, 0.85, 0.35), lambda p, n: GOLD, nu=12, nv=6)  # mặt khóa đai
    blob(b, (0, 9.2, 2.0), (0.4, 0.4, 0.2), lambda p, n: RUNE, nu=8, nv=5)
    # áo choàng sau lưng
    for r_ in range(8):
        y_a = 13.0 - r_ * 1.2
        for c_ in range(6):
            xa = -2.3 + c_ * 0.78
            xb = xa + 0.78
            z_ = -1.7 - 0.12 * r_
            wob = 0.22 * math.sin(c_ * 1.3 + r_ * 0.5)
            col = Paint(mix(C(0x241448), C(0x4C2C84), 0.35 + 0.4 * math.sin(c_ * 1.3) * 0.5 + 0.2 * r_ / 8), 'silk')
            b.poly([(xa, y_a, z_ + wob), (xb, y_a, z_ - wob), (xb, y_a - 1.2, z_ - 0.12 - wob), (xa, y_a - 1.2, z_ - 0.12 + wob)], (0, y_a, 3), col)
    tbox(b, (0, 13.0, -1.7), (5.0, 0.3, 0.3), GOLD)
    # giáp vai ba lớp có gai + gai
    for sx in (-1, 1):
        for k in range(3):
            blob(b, (sx * (3.0 + 0.14 * k), 12.9 - 0.62 * k, 0), (1.25 - 0.08 * k, 0.6, 1.4 - 0.08 * k), S(30 + k), nu=12, nv=6, seed=seed + 7 + k)
            tbox(b, (sx * (3.0 + 0.14 * k), 12.55 - 0.62 * k, 1.0), (2.2, 0.1, 0.1), GOLD)
        blob(b, (sx * 3.6, 13.8, 0), (0.28, 0.9, 0.28), S(33), nu=8, nv=5, seed=seed + 12)  # gai vai
        # tay: cánh tay trên, ống tay có đai vàng, găng
        rod(b, (sx * 3.0, 12.2, 0.1), (sx * 1.7, 9.8, 2.3), 0.62, 0.52, S(34), nu=10, nv=4)
        gold_band(b, sx * 2.35, 11.0, 1.2, 0.0, 0.0) if False else None
        blob(b, (sx * 1.45, 9.55, 2.35), (0.62, 0.62, 0.62), S(35), nu=10, nv=6, seed=seed + 13)
        b.cylinder(sx * 1.5, 9.1, 2.35, 0.66, 0.2, GOLD, 10)
    # đầu: mũ trụ liền mặt nạ trơn, mào vàng, hai sừng cong, hộ cổ
    blob(b, (0, 13.9, 0), (1.05, 1.25, 1.0), S(40), nu=14, nv=9, seed=seed + 14)
    blob(b, (0, 14.4, 0), (1.16, 0.85, 1.1), S(41), nu=12, nv=6, seed=seed + 15, v0=0.0, v1=0.55)
    tbox(b, (0, 14.7, 0.1), (0.16, 2.2, 1.5), GOLD)  # mào
    tbox(b, (0, 13.5, 1.0), (1.2, 0.12, 0.2), GOLD_DK)  # gờ mày: không mắt không mũi
    for sx in (-1, 1):
        for k in range(6):
            a0 = k / 6 * 1.0
            rod(b, (sx * (1.0 + 0.5 * math.sin(a0 * 1.5)), 14.5 + 1.3 * a0, 0), (sx * (1.0 + 0.5 * math.sin((k + 1) / 6 * 1.5)), 14.5 + 1.3 * (k + 1) / 6, 0), 0.2 - 0.02 * k, 0.17 - 0.02 * k, lambda p, n: GOLD, nu=6, nv=1, amp=0.0)
        blob(b, (sx * 1.15, 13.4, 0.3), (0.5, 0.8, 0.6), S(42), nu=8, nv=5, seed=seed + 16)  # hộ nhĩ
    blob(b, (0, 12.9, 0), (1.5, 0.35, 1.4), S(43), nu=12, nv=4, seed=seed + 17)  # hộ cổ
    # đại kiếm chống: lưỡi có rãnh phù văn, chắn vàng đầu thú, chuôi, đế tròn
    tbox(b, (0, 5.2, 2.6), (1.0, 10.0, 0.24), Paint(C(0x8D88A2), 'metal'))
    tbox(b, (0, 5.2, 2.74), (0.14, 8.6, 0.08), RUNE)
    for sx in (-1, 1):
        tbox(b, (sx * 1.0, 10.15, 2.6), (2.0, 0.38, 0.52), GOLD, rz=sx * 0.12)
        blob(b, (sx * 2.1, 10.4, 2.6), (0.42, 0.5, 0.42), lambda p, n: GOLD, nu=8, nv=5)  # đầu thú cách điệu
    tbox(b, (0, 10.6, 2.6), (0.42, 1.5, 0.42), IRON)
    blob(b, (0, 11.5, 2.6), (0.45, 0.45, 0.45), lambda p, n: GOLD, nu=10, nv=6)


# ---------- kim ngân ----------


def hoard(b, seed):
    """Kho báu: gò tiền vàng có khắc, thỏi vàng xếp chồng, chén vàng, ngọc đỏ/tím, rương đai vàng, bình ngọc tím, cuộn lụa tím."""
    rnd = random.Random(seed)

    def goldmound(pos, nrm):
        n = fbm3(pos[0] * 3, pos[1] * 3, pos[2] * 3, seed, 3)
        return Paint(tuple(c * (0.55 + 0.7 * n) for c in C(0xD6AE50)), 'gold')

    blob(b, (0, 0.6, 0), (3.4, 1.3, 3.0), goldmound, nu=16, nv=8, seed=seed, v0=0.0, v1=0.5, amp=0.22)
    for k in range(70):  # đồng tiền nổi (nhiều cỡ, nghiêng)
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0, 3.0)
        y = 1.2 * max(0.0, 1 - (d / 3.4) ** 2) + 0.12
        rr = rnd.uniform(0.35, 0.7)
        tbox(b, (math.cos(a) * d, y, math.sin(a) * d), (rr, 0.07, rr), Paint(mix(C(0xEBCB74), C(0x9A7430), rnd.random()), 'gold'), rx=rnd.uniform(-0.9, 0.9), rz=rnd.uniform(-0.9, 0.9), yaw=a)
    for k in range(10):  # ngọc
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0.3, 2.4)
        cc = rnd.choice((C(0xB0233A), C(0x6B3FD0), C(0x2FAE92)))
        blob(b, (math.cos(a) * d, 1.2 * max(0.0, 1 - (d / 3.4) ** 2) + 0.3, math.sin(a) * d), (0.28, 0.34, 0.28), lambda p, n, cc=cc: Paint(cc, 'rune'), nu=6, nv=4)
    # thỏi vàng xếp chồng (kim tự tháp)
    for row, cnt in enumerate((4, 3, 2, 1)):
        for k in range(cnt):
            tbox(b, (4.4 + (k - (cnt - 1) / 2) * 1.1, 0.25 + row * 0.5, 1.6), (1.0, 0.45, 0.55), GOLD, yaw=0.15)
    # chén vàng
    for k in range(3):
        x_, z_ = -4.0 + k * 0.9, 1.8 + 0.4 * k
        b.cylinder(x_, 0.0, z_, 0.34, 0.5, GOLD, 10, 0.16)
        b.cylinder(x_, 0.45, z_, 0.1, 0.35, GOLD_DK, 8)
        blob(b, (x_, 0.95, z_), (0.5, 0.3, 0.5), lambda p, n: GOLD, nu=10, nv=5, v0=0.5, v1=1.0)
    # rương
    tbox(b, (3.6, 0.8, -1.4), (2.8, 1.6, 1.9), Paint(C(0x2C1F25), 'wood'), yaw=0.3)
    tbox(b, (3.6, 1.7, -1.4), (2.9, 0.38, 2.0), GOLD_DK, yaw=0.3)
    for sz in (-0.5, 0.5):
        tbox(b, (3.6, 0.8, -1.4 + sz * 1.6), (2.9, 1.7, 0.16), GOLD, yaw=0.3)
    blob(b, (3.6, 1.1, -0.4), (0.3, 0.3, 0.18), lambda p, n: GOLD, nu=8, nv=5)
    # bình ngọc tím + cuộn lụa
    blob(b, (-3.8, 1.3, -1.0), (0.95, 1.5, 0.95), lambda p, n: Paint(C(0x5A3C98), 'jade'), nu=12, nv=8)
    gold_band(b, -3.8, 1.9, -1.0, 0.8, 0.2)
    for k in range(3):
        rod(b, (-1.0 + k * 0.5, 0.35, -4.0), (-1.0 + k * 0.5, 0.35, -2.6), 0.3, 0.3, lambda p, n: Paint(C(0x4C2C84), 'silk'), nu=8, nv=1, amp=0.0)


# ---------- lư lửa ----------


def brazier(b, seed):
    """Lư lửa đồng vàng: ba chân sư tử, bát khắc, đệm than, ngọn lửa tím-vàng phát sáng (xếp lớp), vòng đai vàng; cao ~5 m."""
    for k in range(3):
        a = k / 3 * math.tau
        rod(b, (math.cos(a) * 1.6, 0.0, math.sin(a) * 1.6), (math.cos(a) * 0.7, 2.6, math.sin(a) * 0.7), 0.28, 0.2, lambda p, n: GOLD_DK, nu=8, nv=3, amp=0.0)
        blob(b, (math.cos(a) * 1.7, 0.2, math.sin(a) * 1.7), (0.4, 0.25, 0.5), lambda p, n: GOLD, nu=8, nv=4)
    blob(b, (0, 3.2, 0), (1.9, 0.9, 1.9), lambda p, n: GOLD_DK, nu=16, nv=7, v0=0.5, v1=1.0)
    gold_band(b, 0, 3.0, 0, 1.95, 0.25)
    gold_band(b, 0, 3.7, 0, 2.05, 0.2)
    blob(b, (0, 3.75, 0), (1.5, 0.25, 1.5), lambda p, n: Paint(C(0x3A0A12), 'rune'), nu=12, nv=4)
    for k, (dx, dz, h, r, cc) in enumerate(((0, 0, 2.6, 0.55, LAMP), (0.5, 0.3, 1.7, 0.4, RUNE), (-0.5, 0.2, 1.8, 0.42, RUNE), (0.1, -0.5, 1.5, 0.35, LAMP), (-0.2, 0.6, 1.3, 0.3, LAMP))):
        blob(b, (dx, 3.9 + h / 2, dz), (r, h / 2, r), lambda p, n, cc=cc: cc, nu=8, nv=6)
    blob(b, (0, 6.4, 0), (0.22, 0.45, 0.22), lambda p, n: LAMP, nu=6, nv=4)


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
    b = new_b(1045)
    brazier(b, 1045)
    v['brazier'] = b
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
    while got < 8:  # vành tượng thưa
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
    # Lư lửa vòng quanh điện (r = 90, bỏ cửa nam): vị trí tất định, khớp `brazierSpots()` ở `thanTangArt.ts` (vũng sáng trên sàn).
    for i in range(BRAZIERS):
        a = (i + 0.5) / BRAZIERS * math.tau
        if abs(math.atan2(math.sin(a - math.pi / 2), math.cos(a - math.pi / 2))) < 0.2:
            continue
        put('brazier', 'brazier', math.cos(a) * BRAZIER_R, math.sin(a) * BRAZIER_R, yaw=a, scale=1.25)
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
