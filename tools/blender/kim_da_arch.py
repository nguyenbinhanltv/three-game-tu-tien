# Cảnh Kim Dạ Cung (DUN-1 PR5, phong cách B): cung dát vàng của một triều đã chết, đêm lồng đèn. Sơn đen bóng + vàng đồng cổ + đèn lồng son-cam; hàng nhịp tường cột sơn đen
# đai vàng có cửa sổ hoa cách phát sáng ấm, mái cong ngói đen sống vàng, chuỗi đèn lồng treo hiên, rèm lụa son viền vàng; ngai vàng ở bắc (bình phong mặt trời vàng, bệ bậc),
# cột đèn nhiều tầng quanh sảnh có dây đèn lồng giăng, đỉnh đồng ba chân, cây vàng chết (vườn chết). Dùng bộ dựng của Kiếm Trủng (kiem_trung_arch.py).
#
#   blender --background --python tools/blender/kim_da_arch.py -- assets/build/raw/arch_kim_da.glb
#
# Gốc toạ độ = tâm cung (1520, y, 1300); x = đông, z = nam. Mặt trước (+z) mọi vật hướng vào tâm khi quay `yaw = a + π/2` (a = góc đặt). Vật `kd_*` gốc ở sàn.
# Lối vào nam (+z) và ngai bắc (−z) khớp `props.kimda.ts` (ngai z −44, bia ±16, bốn đèn đố); không đặt vật trong khu giữa r < 52 trừ ngai.

import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_sect as bs  # noqa: E402
import kiem_trung_arch as kta  # noqa: E402
import thien_cong_sect as ts  # noqa: E402
import than_tang_arch as tta  # noqa: E402  (tái dùng tượng thần tướng chạm khắc, đổi sang bazan ấm + chữ hổ phách)
from build_sect import Mat, Paint  # noqa: E402
from kiem_trung_arch import C, blob, mix, new_b, rod, tbox  # noqa: E402
from thien_khuyet_arch import fbm3  # noqa: E402

bs.MATERIALS['gold'] = Mat(0.34, 0.55, None, 1.0, False, 0.0, (0xC99A3A, 0.4))
bs.MATERIALS['silk'] = Mat(0.4, 0.1, None, 1.0, False, 0.0)
bs.MATERIALS['lantern'] = Mat(0.8, 0.0, None, 1.0, False, 0.0, (0xFF6A28, 1.25))
bs.MATERIALS['glow'] = Mat(0.9, 0.0, None, 1.0, False, 0.0, (0xFFB45A, 0.9))
bs.MATERIALS['blk'] = Mat(0.3, 0.12, None, 1.0, False, 0.0)

SEED = 20261119
PONDS = [(-58.0, -4.0, 9.5), (58.0, -4.0, 9.5)]  # (x, z, bán kính) khớp `PONDS` ở kimDaArt.ts
DOME_R, DOME_H = 135.0, 80.0
POSTS, POST_R = 22, 84.0  # cột đèn quanh sảnh: khớp `lanternPosts()` ở kimDaArt.ts

GOLD = Paint(C(0xDDB95C), 'gold')
GOLD_DK = Paint(C(0x9A7430), 'gold')
BLK = Paint(C(0x17120F), 'blk')
BLK2 = Paint(C(0x241A14), 'blk')
LANT = Paint(C(0xFF8A3A), 'lantern')
LANT_R = Paint(C(0xE8452A), 'lantern')
GLOW = Paint(C(0xFFC27A), 'glow')
VERM = Paint(C(0x8E1F18), 'silk')
IRON = Paint(C(0x2D2824), 'metal')


def basalt(seed, lift=0.0):
    def fn(pos, nrm):
        n = fbm3(pos[0] * 0.4, pos[1] * 0.4, pos[2] * 0.4, seed, 3)
        rgb = mix(C(0x2A2420), C(0x4C4239), 0.25 + 0.5 * n + lift)
        return Paint(tuple(rgb), 'jade')

    return fn


def bp(seed, lift=0.0):
    return basalt(seed, lift)((0, 0, 0), (0, 1, 0))


def band(b, x, y, z, r, h):
    b.cylinder(x, y, z, r, h, GOLD, 16)


def lantern(b, x, y, z, s=1.0, red=False):
    """Đèn lồng tròn: nắp và đáy vàng, thân phát sáng (cam hoặc son) có hai vành vàng, tua rủ."""
    col = LANT_R if red else LANT
    blob(b, (x, y, z), (0.62 * s, 0.78 * s, 0.62 * s), lambda p, n: col, nu=12, nv=8)
    b.cylinder(x, y + 0.7 * s, z, 0.34 * s, 0.16 * s, GOLD, 10)
    b.cylinder(x, y - 0.86 * s, z, 0.3 * s, 0.14 * s, GOLD, 10)
    for yy in (-0.28, 0.28):
        b.cylinder(x, y + yy * s, z, 0.66 * s, 0.05 * s, GOLD, 14)
    for k in range(3):
        b.box(x + (k - 1) * 0.14 * s, y - 1.6 * s, z, 0.04 * s, 1.2 * s, 0.04 * s, Paint(C(0xE9B25C), 'gold'))


# ---------- nhịp tường ----------


def bay(b, seed):
    W, H = 36.0, 30.0
    for sx in (-1, 1):
        x0 = sx * W / 2
        tbox(b, (x0, -1.3, 0), (4.8, 3.2, 4.8), bp(seed + 1))
        tbox(b, (x0, 0.8, 0), (5.2, 1.6, 5.2), bp(seed, 0.1))
        b.cylinder(x0, 1.6, 0, 3.0, 0.3, GOLD, 16)
        for k in range(8):  # cánh sen chân cột
            a = k / 8 * math.tau
            blob(b, (x0 + math.cos(a) * 2.5, 2.1, math.sin(a) * 2.5), (0.7, 0.5, 0.5), lambda p, n: GOLD, nu=8, nv=5, rot=a)
        sides = 16
        prev = None
        for i in range(9):
            q = i / 8
            y = 1.9 + q * (H - 4.6)
            rr = 2.1 * (1.0 - 0.08 * q)
            ring = [(x0 + math.cos(j / sides * math.tau) * rr, y, math.sin(j / sides * math.tau) * rr) for j in range(sides)]
            if prev:
                for j in range(sides):
                    k2 = (j + 1) % sides
                    sh = 0.7 + 0.5 * fbm3(j, q * 5, seed, seed + 3, 2)
                    b.poly([prev[j], prev[k2], ring[k2], ring[j]], (x0, y, 0), Paint(tuple(c * sh for c in C(0x1D1612)), 'blk'))
            prev = ring
        b.poly(prev, (x0, 0, 0), BLK)
        for yb in (4.0, H * 0.4, H * 0.75):
            band(b, x0, yb, 0, 2.3, 0.5)
        for k in range(12):  # vảy rồng khắc quanh đai giữa: hạt vàng
            a = k / 12 * math.tau
            blob(b, (x0 + math.cos(a) * 2.2, H * 0.4 + 0.9, math.sin(a) * 2.2), (0.22, 0.22, 0.22), lambda p, n: GOLD, nu=6, nv=4)
        tbox(b, (x0, H - 1.0, 0), (4.6, 1.8, 4.6), bp(seed + 5, 0.1))
        band(b, x0, H - 2.0, 0, 2.6, 0.4)
    # tường sơn đen + gờ
    tbox(b, (0, H / 2, -1.6), (W - 4.2, H, 1.6), BLK2)
    tbox(b, (0, 2.2, -0.7), (W - 4.2, 0.6, 0.5), GOLD_DK)
    tbox(b, (0, 7.5, -0.7), (W - 4.2, 0.4, 0.4), GOLD_DK)
    # cửa sổ hoa cách phát sáng ấm: nền sáng + khung vàng + song dọc/ngang
    ww, wh, wy = 15.0, 13.0, 15.0
    tbox(b, (0, wy, -0.95), (ww, wh, 0.25), GLOW)
    for dx in (-ww / 2, ww / 2):
        tbox(b, (dx, wy, -0.6), (0.7, wh + 0.7, 0.6), GOLD)
    for dy in (-wh / 2, wh / 2):
        tbox(b, (0, wy + dy, -0.6), (ww + 0.7, 0.7, 0.6), GOLD)
    for i in range(1, 12):
        tbox(b, (-ww / 2 + i * ww / 12, wy, -0.7), (0.2, wh, 0.25), GOLD_DK)
    for i in range(1, 10):
        tbox(b, (0, wy - wh / 2 + i * wh / 10, -0.7), (ww, 0.2, 0.25), GOLD_DK)
    for i in range(4):  # hoa văn khóa vuông ở bốn ô giữa
        for j in range(3):
            tbox(b, (-4.5 + i * 3.0, wy - 3.0 + j * 3.0, -0.62), (1.4, 1.4, 0.1), GOLD)
    # mái cong ngói đen, sống vàng, hai đầu vút; hàng đèn lồng treo hiên
    roof = Paint(C(0x1C2622), 'plaster')
    top = H + 0.2
    n_seg = 16
    for i in range(n_seg):
        t0, t1 = i / n_seg, (i + 1) / n_seg
        x0r, x1r = -W / 2 - 1.2 + t0 * (W + 2.4), -W / 2 - 1.2 + t1 * (W + 2.4)
        y0r = top + 3.0 * abs(2 * t0 - 1) ** 2.6
        y1r = top + 3.0 * abs(2 * t1 - 1) ** 2.6
        sl = math.atan2(y1r - y0r, x1r - x0r)
        mx, my = (x0r + x1r) / 2, (y0r + y1r) / 2
        ln = math.dist((x0r, y0r), (x1r, y1r)) + 0.1
        tbox(b, (mx, my, 0.8), (ln, 0.8, 5.4), roof, rz=sl, rx=-0.12)
        tbox(b, (mx, my + 0.55, 3.2), (ln, 0.4, 0.5), GOLD, rz=sl)
    tbox(b, (0, top + 3.6, -0.5), (W + 2.4, 0.5, 0.7), GOLD)  # sống mái
    for sx in (-1, 1):
        blob(b, (sx * (W / 2 + 1.0), top + 3.6, 0.4), (0.9, 0.9, 0.9), lambda p, n: GOLD, nu=8, nv=5)
    for i in range(11):
        lx = -W / 2 + 2.4 + i * (W - 4.8) / 10
        lantern(b, lx, H - 3.2, 2.9, 0.9, red=(i % 2 == 0))
        tbox(b, (lx, H - 1.7, 2.9), (0.08, 1.4, 0.08), GOLD_DK)
    tbox(b, (0, H - 1.0, 2.9), (W - 4.2, 0.18, 0.18), GOLD_DK)
    # rèm lụa son viền vàng hai bên cửa sổ, có nếp sóng
    for sx in (-1, 1):
        xc = sx * 12.6
        cw, ch, rows = 3.0, 17.0, 12
        for r_ in range(rows):
            y_a = H - 5.0 - r_ * ch / rows
            for c_ in range(4):
                xa = xc - cw / 2 + c_ * cw / 4
                xb = xa + cw / 4
                f = lambda cc, rr: 0.5 + 0.28 * math.sin(cc * 1.4 + rr * 0.3 + sx)
                tone = 0.35 + 0.45 * (0.5 + 0.5 * math.sin(c_ * 1.4 + 1.0))
                col = Paint(mix(C(0x4A0F0C), C(0xA8321F), tone), 'silk')
                b.poly([(xa, y_a, f(c_, r_)), (xb, y_a, f(c_ + 1, r_)), (xb, y_a - ch / rows, f(c_ + 1, r_ + 1)), (xa, y_a - ch / rows, f(c_, r_ + 1))], (xc, y_a, -4), col)
        tbox(b, (xc, H - 5.0, 0.6), (cw + 0.5, 0.4, 0.5), GOLD)
        tbox(b, (xc, H - 5.0 - ch, 0.6), (cw + 0.5, 0.35, 0.45), GOLD)
        for k in range(5):
            b.box(xc + (k - 2) * 0.5, H - 5.0 - ch - 1.0, 0.6, 0.07, 1.6, 0.07, GOLD_DK)


# ---------- ngai vàng ----------


def throne(b, seed):
    """Ngai ở bắc: bệ ba tầng có bậc, ngai vàng có tay vịn đầu thú, bình phong đen khắc mặt trời vàng (vòng + 24 tia), hai chân đèn vàng; mặt +z hướng vào sảnh."""
    for k in range(3):
        tbox(b, (0, 0.6 + k * 1.2, -k * 1.3), (30 - 6 * k, 1.2, 20 - 3.5 * k), bp(seed + k, 0.08))
        tbox(b, (0, 1.25 + k * 1.2, -k * 1.3 + (20 - 3.5 * k) / 2 - 0.2), (30 - 6 * k, 0.12, 0.3), GOLD)
    for k in range(5):  # bậc trước
        tbox(b, (0, 0.3 + k * 0.5, 11.2 + (4 - k) * 0.9), (9.0, 0.6, 1.0), bp(seed + 10 + k, 0.05))
    # ngai
    tbox(b, (0, 4.2, -5.0), (7.0, 1.2, 4.0), GOLD_DK)
    tbox(b, (0, 5.0, -5.0), (6.4, 0.4, 3.6), Paint(C(0x6A1812), 'silk'))
    for sx in (-1, 1):
        tbox(b, (sx * 3.6, 5.4, -5.0), (0.8, 2.2, 3.6), GOLD)
        blob(b, (sx * 3.6, 6.8, -3.4), (0.7, 0.7, 0.9), lambda p, n: GOLD, nu=8, nv=5)  # đầu thú tay vịn
    # bình phong mặt trời
    tbox(b, (0, 12.5, -8.0), (22.0, 16.0, 1.0), BLK2)
    for dx in (-11, 11):
        tbox(b, (dx, 12.5, -7.4), (0.8, 16.8, 1.0), GOLD)
    for dy in (-8, 8):
        tbox(b, (0, 12.5 + dy, -7.4), (22.8, 0.8, 1.0), GOLD)
    cx, cy = 0.0, 13.0
    for rad, th in ((4.2, 0.32), (3.2, 0.22), (2.4, 0.2)):
        for i in range(40):
            a0, a1 = i / 40 * math.tau, (i + 1) / 40 * math.tau
            rod(b, (cx + math.cos(a0) * rad, cy + math.sin(a0) * rad, -7.3), (cx + math.cos(a1) * rad, cy + math.sin(a1) * rad, -7.3), th, th, lambda p, n: GOLD, nu=6, nv=1, amp=0.0)
    for i in range(24):
        a = i / 24 * math.tau
        r1 = 6.4 if i % 2 == 0 else 5.2
        rod(b, (cx + math.cos(a) * 4.5, cy + math.sin(a) * 4.5, -7.3), (cx + math.cos(a) * r1, cy + math.sin(a) * r1, -7.3), 0.26, 0.1, lambda p, n: GOLD, nu=6, nv=2, amp=0.0)
    blob(b, (cx, cy, -7.1), (1.6, 1.6, 0.5), lambda p, n: GLOW, nu=14, nv=7)
    # chân đèn vàng hai bên
    for sx in (-1, 1):
        x = sx * 12.5
        for k in range(3):
            b.cylinder(x, 1.0 + k * 0.7, 3.0, 1.3 - 0.25 * k, 0.7, GOLD, 12)
        rod(b, (x, 3.0, 3.0), (x, 9.0, 3.0), 0.3, 0.22, lambda p, n: GOLD_DK, nu=8, nv=3, amp=0.0)
        for k in range(3):
            a = -0.9 + k * 0.9
            rod(b, (x, 7.5, 3.0), (x + math.sin(a) * 2.2, 8.6, 3.0), 0.12, 0.1, lambda p, n: GOLD_DK, nu=6, nv=1, amp=0.0)
            lantern(b, x + math.sin(a) * 2.2, 9.4, 3.0, 0.7, red=(k == 1))


# ---------- cột đèn + dây đèn ----------


def post(b, seed):
    """Cột đèn cao ~11 m: bệ đá ba bậc, trụ sơn đen đai vàng, ba tầng đèn lồng (cam/son) treo trên chạc vàng, đỉnh bảo châu."""
    for k in range(3):
        tbox(b, (0, 0.3 + k * 0.5, 0), (3.0 - 0.6 * k, 0.5, 3.0 - 0.6 * k), bp(seed + k, 0.06))
    rod(b, (0, 1.6, 0), (0, 10.0, 0), 0.34, 0.24, lambda p, n: BLK, nu=10, nv=6, amp=0.0)
    for yb in (2.4, 6.0, 9.4):
        band(b, 0, yb, 0, 0.5, 0.3)
    for ti, (yy, ln) in enumerate(((4.0, 1.8), (6.6, 1.4), (8.8, 1.1))):
        for k in range(4):
            a = k / 4 * math.tau + ti * 0.4
            ex, ez = math.cos(a) * ln, math.sin(a) * ln
            rod(b, (0, yy, 0), (ex, yy + 0.15, ez), 0.1, 0.08, lambda p, n: GOLD, nu=6, nv=1, amp=0.0)
            lantern(b, ex, yy - 0.85, ez, 0.62 - 0.08 * ti, red=((k + ti) % 2 == 0))
    blob(b, (0, 10.4, 0), (0.28, 0.4, 0.28), lambda p, n: GOLD, nu=8, nv=5)


def lantern_string(b, seed):
    """Dây đèn lồng giăng giữa hai cột (dài 24 m, võng 1,6 m): dây vàng, đèn lồng nhỏ so le cam/son cách 3 m; trục x dọc dây, gốc ở cao độ điểm treo."""
    L = POST_R * 2 * math.sin(math.pi / POSTS)
    n = 16
    pts = [(-L / 2 + L * i / n, -1.6 * (1 - (2 * i / n - 1) ** 2), 0.0) for i in range(n + 1)]
    for a, c in zip(pts, pts[1:]):
        tbox(b, ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0), (math.dist(a[:2], c[:2]) + 0.05, 0.1, 0.1), GOLD_DK, rz=math.atan2(c[1] - a[1], c[0] - a[0]))
    for i in range(2, n - 1, 2):
        x, y, z = pts[i]
        lantern(b, x, y - 0.8, z, 0.5, red=(i % 4 == 0))


# ---------- đỉnh đồng + cây vàng chết ----------


def censer(b, seed):
    """Đỉnh đồng vàng ba chân cao ~6 m: chân thú, thân tròn khắc, hai quai, nắp có núm bảo châu, khói/hạt than đỏ cam phát sáng ở miệng."""
    for k in range(3):
        a = k / 3 * math.tau
        rod(b, (math.cos(a) * 1.5, 0.0, math.sin(a) * 1.5), (math.cos(a) * 0.9, 2.2, math.sin(a) * 0.9), 0.3, 0.22, lambda p, n: GOLD_DK, nu=8, nv=3, amp=0.0)
        blob(b, (math.cos(a) * 1.55, 0.2, math.sin(a) * 1.55), (0.4, 0.26, 0.5), lambda p, n: GOLD, nu=8, nv=4, rot=a)
    blob(b, (0, 3.4, 0), (1.9, 1.4, 1.9), lambda p, n: GOLD, nu=16, nv=8)
    band(b, 0, 3.0, 0, 1.95, 0.25)
    band(b, 0, 4.1, 0, 1.75, 0.2)
    for k in range(10):  # chạm vảy quanh thân
        a = k / 10 * math.tau
        blob(b, (math.cos(a) * 1.9, 3.5, math.sin(a) * 1.9), (0.3, 0.3, 0.2), lambda p, n: GOLD_DK, nu=6, nv=4, rot=a)
    for sx in (-1, 1):
        for k in range(8):
            a = math.pi * k / 7
            rod(b, (sx * 1.95, 4.3, 0), (sx * (1.95 + 0.7 * math.sin(a)), 4.3 + 0.7 * math.cos(a) - 0.7, 0), 0.12, 0.12, lambda p, n: GOLD, nu=6, nv=1, amp=0.0)
    blob(b, (0, 4.75, 0), (1.5, 0.3, 1.5), lambda p, n: LANT_R, nu=12, nv=4)
    for k in range(5):
        blob(b, (0.4 * math.cos(k * 1.3), 5.1 + 0.15 * k, 0.4 * math.sin(k * 1.3)), (0.28, 0.5, 0.28), lambda p, n: LANT, nu=6, nv=4)


def dead_tree(b, seed):
    """Cây vàng chết: thân đen xoắn, vài cành gãy, lá vàng rụng còn sót (mảnh dẹt) và vài lá rơi quanh gốc."""
    rnd = random.Random(seed)
    pts = [(0.0, 0.0, 0.0)]
    x = z = 0.0
    for i in range(1, 7):
        x += rnd.uniform(-0.5, 0.5)
        z += rnd.uniform(-0.5, 0.5)
        pts.append((x, i * 1.5, z))
    for i in range(6):
        r0, r1 = 0.55 - 0.07 * i, 0.55 - 0.07 * (i + 1)
        rod(b, pts[i], pts[i + 1], r0, max(0.12, r1), lambda p, n: BLK, nu=8, nv=2, seed=seed + i, amp=0.12)
    for k in range(7):
        j = rnd.randint(2, 6)
        base = pts[j]
        a = rnd.uniform(0, math.tau)
        L = rnd.uniform(1.8, 3.4)
        end = (base[0] + math.cos(a) * L, base[1] + rnd.uniform(0.6, 1.8), base[2] + math.sin(a) * L)
        rod(b, base, end, 0.2, 0.08, lambda p, n: BLK, nu=6, nv=2, amp=0.1)
        if rnd.random() < 0.7:
            for q in range(rnd.randint(2, 4)):
                t = rnd.uniform(0.5, 1.0)
                lx, ly, lz = base[0] + (end[0] - base[0]) * t, base[1] + (end[1] - base[1]) * t, base[2] + (end[2] - base[2]) * t
                tbox(b, (lx, ly - 0.2, lz), (0.7, 0.04, 0.45), Paint(mix(C(0xE8C468), C(0x9A7430), rnd.random()), 'gold'), rx=rnd.uniform(-0.8, 0.8), rz=rnd.uniform(-0.8, 0.8), yaw=rnd.uniform(0, 3))
    for k in range(10):
        tbox(b, (rnd.uniform(-2.2, 2.2), 0.04, rnd.uniform(-2.2, 2.2)), (0.7, 0.03, 0.45), Paint(mix(C(0xE8C468), C(0x9A7430), rnd.random()), 'gold'), yaw=rnd.uniform(0, 3))


def build_variants():
    v = {}
    # tượng thần tướng chạm khắc (viết ở than_tang_arch.statue), đổi bảng màu sang bazan ấm + chữ phù văn hổ phách
    tta.marble = lambda seed, lift=0.0: basalt(seed, lift)
    tta.RUNE = Paint(C(0xE8A040), 'glow')
    for i in range(2):
        b = new_b(1160 + i)
        tta.statue(b, 1160 + i * 7)
        v[f'statue{i}'] = b
    b = new_b(1170)
    low_lantern(b, 1170)
    v['lowlantern'] = b
    b = new_b(1171)
    incense_altar(b, 1171)
    v['altar'] = b
    b = new_b(1172)
    osmanthus(b, 1172)
    v['osman'] = b
    b = new_b(1173)
    bridge(b, 1173)
    v['bridge'] = b
    b = new_b(1174)
    pond_rim(b, 1174)
    v['pondrim'] = b
    for i in range(2):
        b = new_b(1100 + i)
        bay(b, 1100 + i * 13)
        v[f'bay{i}'] = b
    b = new_b(1110)
    throne(b, 1110)
    v['throne'] = b
    for i in range(2):
        b = new_b(1120 + i)
        post(b, 1120 + i * 7)
        v[f'post{i}'] = b
    b = new_b(1130)
    lantern_string(b, 1130)
    v['string'] = b
    b = new_b(1140)
    censer(b, 1140)
    v['censer'] = b
    for i in range(3):
        b = new_b(1150 + i)
        dead_tree(b, 1150 + i * 5)
        v[f'tree{i}'] = b
    return v


def low_lantern(b, seed):
    """Đèn đá thấp ~1,8 m: bệ, trụ, hộp lửa phát sáng có cửa sổ, mái cong, bảo châu."""
    stone = lambda off=0: basalt(seed + off, 0.1)
    for k in range(2):
        tbox(b, (0, 0.2 + k * 0.4, 0), (1.5 - 0.4 * k, 0.4, 1.5 - 0.4 * k), bp(seed + k, 0.1))
    rod(b, (0, 0.8, 0), (0, 1.15, 0), 0.2, 0.17, stone(2), nu=8, nv=2, amp=0.0)
    tbox(b, (0, 1.3, 0), (0.95, 0.12, 0.95), bp(seed + 3, 0.12))
    tbox(b, (0, 1.65, 0), (0.62, 0.55, 0.62), GLOW)
    for sx in (-1, 1):
        tbox(b, (sx * 0.34, 1.65, 0), (0.1, 0.6, 0.7), bp(seed + 4, 0.1))
        tbox(b, (0, 1.65, sx * 0.34), (0.7, 0.6, 0.1), bp(seed + 5, 0.1))
    tbox(b, (0, 2.05, 0), (1.15, 0.14, 1.15), bp(seed + 6, 0.12), rx=0.0)
    tbox(b, (0, 2.22, 0), (0.7, 0.18, 0.7), bp(seed + 7, 0.12))
    blob(b, (0, 2.46, 0), (0.17, 0.2, 0.17), lambda p, n: GOLD, nu=8, nv=5)


def incense_altar(b, seed):
    """Bệ hương: nền đá ba bậc có bậc lên, bàn đá khắc, lư hương đồng lớn có than đỏ + hương cắm, hai chân đèn nhỏ hai bên, bát nước đồng."""
    for k in range(3):
        tbox(b, (0, 0.3 + k * 0.6, 0), (9.0 - 1.8 * k, 0.6, 6.0 - 1.2 * k), bp(seed + k, 0.1))
        tbox(b, (0, 0.62 + k * 0.6, 0), (9.2 - 1.8 * k, 0.08, 6.2 - 1.2 * k), GOLD_DK)
    for k in range(3):
        tbox(b, (0, 0.2 + k * 0.2, 3.6 + (2 - k) * 0.7), (4.0, 0.3, 0.8), bp(seed + 10 + k, 0.08))
    tbox(b, (0, 2.2, -0.2), (4.2, 0.5, 2.0), bp(seed + 20, 0.14))
    for sx in (-1, 1):
        tbox(b, (sx * 1.7, 1.75, -0.2), (0.5, 0.9, 1.6), bp(seed + 21, 0.1))
    # lư hương
    for k in range(3):
        a = k / 3 * math.tau
        rod(b, (math.cos(a) * 0.8, 2.45, math.sin(a) * 0.8 - 0.2), (math.cos(a) * 0.5, 3.0, math.sin(a) * 0.5 - 0.2), 0.15, 0.1, lambda p, n: GOLD_DK, nu=6, nv=2, amp=0.0)
    blob(b, (0, 3.5, -0.2), (1.05, 0.7, 1.05), lambda p, n: GOLD, nu=14, nv=7)
    band(b, 0, 3.3, -0.2, 1.08, 0.14)
    blob(b, (0, 4.05, -0.2), (0.85, 0.16, 0.85), lambda p, n: LANT_R, nu=10, nv=4)
    for k in range(9):
        a = k / 9 * math.tau
        tbox(b, (math.cos(a) * 0.5, 4.5, math.sin(a) * 0.5 - 0.2), (0.05, 0.9, 0.05), Paint(C(0x6A1812), 'silk'), rx=0.06 * math.sin(a), rz=0.06 * math.cos(a))
        blob(b, (math.cos(a) * 0.5 * 1.0, 4.98, math.sin(a) * 0.5 - 0.2), (0.07, 0.07, 0.07), lambda p, n: LANT, nu=4, nv=3)
    for sx in (-1, 1):
        rod(b, (sx * 3.4, 1.9, 0.6), (sx * 3.4, 3.4, 0.6), 0.14, 0.1, lambda p, n: GOLD_DK, nu=6, nv=2, amp=0.0)
        lantern(b, sx * 3.4, 3.9, 0.6, 0.55, red=(sx > 0))


def osmanthus(b, seed):
    """Cây quế kim tuyết: thân đen xoắn, tán nhiều cụm lá xanh sẫm lốm đốm hoa vàng, hoa vàng rụng quanh gốc, năm đèn lồng treo cành, vòng đá quanh gốc."""
    rnd = random.Random(seed)
    for k in range(10):
        a = k / 10 * math.tau
        blob(b, (math.cos(a) * 2.2, 0.35, math.sin(a) * 2.2), (0.85, 0.4, 0.7), lambda p, n: Paint(C(0x4A4038), "jade"), nu=8, nv=4, rot=a)
    pts = [(0.0, 0.0, 0.0)]
    x = z = 0.0
    for i in range(1, 6):
        x += rnd.uniform(-0.4, 0.4)
        z += rnd.uniform(-0.4, 0.4)
        pts.append((x, i * 1.35, z))
    for i in range(5):
        rod(b, pts[i], pts[i + 1], 0.7 - 0.1 * i, 0.7 - 0.1 * (i + 1), lambda p, n: BLK, nu=8, nv=2, seed=seed + i, amp=0.14)
    branches = []
    for k in range(7):
        a = k / 7 * math.tau + rnd.uniform(-0.3, 0.3)
        base = pts[rnd.randint(3, 5)]
        L = rnd.uniform(2.8, 4.2)
        end = (base[0] + math.cos(a) * L, base[1] + rnd.uniform(0.8, 1.8), base[2] + math.sin(a) * L)
        rod(b, base, end, 0.26, 0.1, lambda p, n: BLK, nu=6, nv=2, amp=0.1)
        branches.append((base, end))
    # tán lá
    for k in range(14):
        base, end = branches[k % len(branches)]
        t = rnd.uniform(0.55, 1.0)
        c = tuple(base[i] + (end[i] - base[i]) * t for i in range(3))
        rr = rnd.uniform(1.2, 2.1)
        green = Paint(mix(C(0x2A3A22), C(0x44582E), rnd.random()), 'plaster')
        blob(b, (c[0], c[1] + 0.4, c[2]), (rr, rr * 0.7, rr), lambda p, n, g=green: g, nu=10, nv=6, seed=seed + k, amp=0.3)
        for q in range(7):  # hoa vàng lốm đốm
            fa, fe = rnd.uniform(0, math.tau), rnd.uniform(0.1, 1.0)
            blob(b, (c[0] + math.cos(fa) * rr * 0.9, c[1] + 0.4 + math.sin(fe) * rr * 0.65, c[2] + math.sin(fa) * rr * 0.9), (0.12, 0.12, 0.12), lambda p, n: GOLD, nu=4, nv=3)
    # đèn lồng treo
    for k in range(5):
        base, end = branches[(k * 2) % len(branches)]
        t = rnd.uniform(0.6, 0.95)
        c = tuple(base[i] + (end[i] - base[i]) * t for i in range(3))
        b.box(c[0], c[1] - 0.6, c[2], 0.04, 1.2, 0.04, GOLD_DK)
        lantern(b, c[0], c[1] - 1.7, c[2], 0.7, red=(k % 2 == 0))
    for k in range(40):  # hoa rụng
        tbox(b, (rnd.uniform(-3.6, 3.6), 0.04, rnd.uniform(-3.6, 3.6)), (0.14, 0.02, 0.1), Paint(mix(C(0xE8C468), C(0xC9962A), rnd.random()), 'gold'), yaw=rnd.uniform(0, 3))


def bridge(b, seed):
    """Cầu đá vòm nhỏ (dài 20 m dọc trục z, rộng 4): mặt vòm lên 1,4 m, thành đá + lan can sơn son có trụ vàng, hai đèn đá cuối cầu; qua hồ bán kính ~9,5."""
    N = 14
    L = 20.0
    for i in range(N):
        t0, t1 = i / N, (i + 1) / N
        z0, z1 = -L / 2 + t0 * L, -L / 2 + t1 * L
        y0 = 0.15 + 1.4 * math.sin(t0 * math.pi)
        y1 = 0.15 + 1.4 * math.sin(t1 * math.pi)
        zm, ym = (z0 + z1) / 2, (y0 + y1) / 2
        ln = math.dist((z0, y0), (z1, y1)) + 0.05
        sl = math.atan2(y1 - y0, z1 - z0)
        tbox(b, (0, ym - 0.35, zm), (4.0, 0.7, ln), bp(seed + i, 0.1), rx=-sl)
        tbox(b, (0, ym + 0.02, zm), (3.0, 0.08, ln), GOLD_DK, rx=-sl)
        for sx in (-1, 1):
            tbox(b, (sx * 1.95, ym + 0.65, zm), (0.14, 0.14, ln), Paint(C(0x8E1F18), 'silk'), rx=-sl)
            tbox(b, (sx * 1.95, ym + 0.2, zm), (0.12, 0.5, ln * 0.2), Paint(C(0x8E1F18), 'silk'), rx=-sl)
    for sx in (-1, 1):
        for z in (-L / 2, -L / 4, 0, L / 4, L / 2):
            y = 0.15 + 1.4 * math.sin((z / L + 0.5) * math.pi)
            rod(b, (sx * 1.95, y, z), (sx * 1.95, y + 1.1, z), 0.12, 0.1, lambda p, n: GOLD_DK, nu=6, nv=2, amp=0.0)
            blob(b, (sx * 1.95, y + 1.2, z), (0.14, 0.14, 0.14), lambda p, n: GOLD, nu=6, nv=4)
        for z in (-L / 2 - 0.8, L / 2 + 0.8):
            tbox(b, (sx * 2.6, 0.3, z), (1.2, 0.6, 1.2), bp(seed + 30, 0.1))
            lantern(b, sx * 2.6, 1.6, z, 0.55, red=(sx > 0))


def pond_rim(b, seed):
    """Vành đá hồ (tâm gốc, bán kính ngoài 9,5 m): các phiến đá xếp vòng cao 0,45 m, hoa văn mép vàng thưa, vài lá sen (đĩa phẳng) trong lòng."""
    rnd = random.Random(seed)
    n = 30
    for i in range(n):
        a = i / n * math.tau
        rr = 9.5
        tbox(b, (math.cos(a) * rr, 0.22, math.sin(a) * rr), (2.2, 0.45, 1.3), bp(seed + i, 0.08 + 0.1 * rnd.random()), yaw=-a)
        if i % 3 == 0:
            blob(b, (math.cos(a) * rr, 0.48, math.sin(a) * rr), (0.14, 0.14, 0.14), lambda p, n: GOLD, nu=6, nv=4)
    for k in range(7):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(1.0, 7.0)
        r = rnd.uniform(0.7, 1.3)
        m = 14
        pts = [(math.cos(a) * d + math.cos(j / m * math.tau) * r, 0.12, math.sin(a) * d + math.sin(j / m * math.tau) * r) for j in range(m)]
        b.poly(pts, (0, -2, 0), Paint(mix(C(0x2F3F26), C(0x3E5230), rnd.random()), 'plaster'))


def keep_out(x, z, min_r=30.0):
    return math.hypot(x, z) < min_r or (abs(x) < 10 and z > 0)


def run(out):
    bs.make_textures()
    variants = build_variants()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = ts.materials_for(list(variants.values()))
    meshes = {k: ts.make_mesh(f'kd_{k}', b, keys, images, bevel=False) for k, b in variants.items()}
    rnd = random.Random(SEED)
    n_obj = 0

    def put(kind, var, x, z, y=0.0, **kw):
        nonlocal n_obj
        o = kta.place(f'kd_{kind}_{n_obj}', meshes[var], x, z, **kw)
        o.location.z = y
        n_obj += 1

    NB, R = 18, 104.0
    for i in range(NB):
        a = (i + 0.5) / NB * math.tau
        if abs(math.atan2(math.sin(a - math.pi / 2), math.cos(a - math.pi / 2))) < 0.2:
            continue
        put('bay', f'bay{i % 2}', math.cos(a) * R, math.sin(a) * R, yaw=a + math.pi / 2)
    put('throne', 'throne', 0.0, -66.0, yaw=0.0)
    # cột đèn (r 84, chừa cửa nam) + dây đèn giăng giữa hai cột kề nhau
    ang = [(i + 0.5) / POSTS * math.tau for i in range(POSTS)]
    skip = lambda a: abs(math.atan2(math.sin(a - math.pi / 2), math.cos(a - math.pi / 2))) < 0.2
    for i, a in enumerate(ang):
        if skip(a):
            continue
        put('post', f'post{i % 2}', math.cos(a) * POST_R, math.sin(a) * POST_R, yaw=a + math.pi / 2)
    for i, a in enumerate(ang):
        a2 = a + math.tau / POSTS / 2
        if skip(a) or skip(a + math.tau / POSTS):
            continue
        put('string', 'string', math.cos(a2) * POST_R * math.cos(math.pi / POSTS), math.sin(a2) * POST_R * math.cos(math.pi / POSTS), y=9.0, yaw=a2 + math.pi / 2)
    # đỉnh đồng quanh vành chiến (r 62), chừa cửa nam và hướng ngai
    for i in range(10):
        a = (i + 0.5) / 10 * math.tau
        if skip(a) or abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2))) < 0.35:
            continue
        put('censer', 'censer', math.cos(a) * 62, math.sin(a) * 62, yaw=a)
    # vườn chết: cây vàng chết rải ở vành ngoài
    got = 0
    while got < 12:
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(66, 80)
        x, z = math.cos(a) * r, math.sin(a) * r
        if keep_out(x, z, 60):
            continue
        put('tree', f'tree{rnd.randrange(3)}', x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(0.9, 1.5))
        got += 1
    # --- điểm nhấn trong sân (đều ngoài vùng đánh r < ~42 và ngoài hành lang |x| < 10 phía nam) ---
    # hai hồ + cầu vòm bắc qua mỗi hồ (trục z), vành đá quanh hồ
    for (px, pz, pr) in PONDS:
        put('pondrim', 'pondrim', px, pz)
        put('bridge', 'bridge', px, pz, yaw=0.0)
    # hai bệ hương hai bên ngai (r ~ 36, hai bên thảm), nhìn vào tâm
    for sx in (-1, 1):
        put('altar', 'altar', sx * 24.0, -34.0, yaw=-sx * 0.35, scale=1.0)
    # bốn cây quế kim tuyết ở bốn góc sân trong, đèn treo
    for (px, pz) in ((-44.0, 40.0), (44.0, 40.0), (-44.0, -42.0), (44.0, -42.0)):
        put('osman', 'osman', px, pz, yaw=rnd.uniform(0, 6.28), scale=1.15)
    # đèn đá thấp: vòng r 30 chừa lối nam, cách đều, + hai bên thảm đỏ phía nam
    for i in range(10):
        a = (i + 0.5) / 10 * math.tau
        if skip(a) or abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2))) < 0.5:
            continue
        put('lowlantern', 'lowlantern', math.cos(a) * 32, math.sin(a) * 32, yaw=a)
    for k in range(6):
        for sx in (-1, 1):
            put('lowlantern', 'lowlantern', sx * 4.6, 46.0 + k * 7.0, yaw=0.0)
    # thần tướng canh trước thềm ngai (thay tượng prop cũ) và hai bên lối vào
    for sx in (-1, 1):
        put('statue', f'statue{(sx + 1) // 2}', sx * 12.0, -40.0, yaw=0.0, scale=0.62)
        put('statue', f'statue{(sx + 1) // 2}', sx * 15.0, 60.0, yaw=math.pi, scale=0.6)
    ts.export_glb(out)
    size, prims, tris, doc = bs.inspect(out)
    print(f'[kim_da] {out}: {size / 1024:.0f} KB, {n_obj} vật, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)})')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_kim_da.glb')
