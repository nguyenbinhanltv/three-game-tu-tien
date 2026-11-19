# Cảnh Kính Nguyệt Cung (DUN-1 PR3, phong cách B): điện gương trăng bạc. Hàng cột ngọc có vòm nhọn và gương treo, vòng gương trăng khổng lồ phía bắc,
# mảnh gương lơ lửng và cắm nghiêng, dây chuông gương treo trần, mảnh gương vỡ trên sàn. Dùng bộ dựng của Kiếm Trủng (kiem_trung_arch.py).
#
#   blender --background --python tools/blender/kinh_nguyet_arch.py -- assets/build/raw/arch_kinh_nguyet.glb
#
# Gốc toạ độ = tâm sảnh (1520, y, 1300); x = đông, z = nam. Vật `kn_*` gốc ở sàn (y = 0, sàn phẳng ±3 m tới r 110); `kn_ceil_*` treo trần (client đặt y theo vòm);
# `kn_float_*` lơ lửng (y do script đặt, tính từ sàn). Gương = vật liệu `glass` (client thay bằng vật liệu emissive + fresnel).

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

bs.MATERIALS['glass'] = Mat(0.08, 0.2, None, 1.0, False, 0.0, (0xBFD8FF, 0.5))
bs.MATERIALS['silk'] = Mat(0.32, 0.12, None, 1.0, False, 0.0)
bs.MATERIALS['jade'] = bs.MATERIALS.get('jade', Mat(0.55, 0.0, 'jade', 3.0, True, 0.04))

SEED = 20261119
DOME_R, DOME_H = 135.0, 80.0
JADE = C(0xC4CBD9)
JADE_DK = C(0x7A8499)
SILVER = C(0xAEB9C8)
SILVER_DK = C(0x5E6878)
INDIGO = C(0x1B2744)


def dome_h(r):
    return DOME_H * math.sqrt(max(0.0, 1.0 - (r / DOME_R) ** 2))


def jade_col(seed, dark=0.0):
    def fn(pos, nrm):
        n = fbm3(pos[0] * 0.5, pos[1] * 0.5, pos[2] * 0.5, seed, 3)
        rgb = mix(JADE, JADE_DK, 0.25 + 0.5 * n + dark)
        rgb = tuple(c * (0.8 + 0.3 * fbm3(pos[0] * 2, pos[1] * 2, pos[2] * 2, seed + 4, 2)) for c in rgb)
        return Paint(tuple(rgb), 'jade')

    return fn


def glass(pos):
    """Màu đỉnh của mặt gương: vệt sáng chéo + dần tối về chân (client dùng làm phát sáng)."""
    x, y, z = pos
    streak = 0.5 + 0.5 * math.sin((x * 1.1 + y * 0.7 + z * 1.1) * 0.55)
    t = 0.03 + 0.7 * streak ** 3 * (0.4 + 0.6 * min(1.0, max(0.0, y / 30.0)))
    return Paint(mix(C(0x1A2A55), C(0xCFE0FF), t), 'glass')


SILV = Paint(SILVER, 'metal')
SILV_D = Paint(SILVER_DK, 'metal')


def poly_glass(b, pts, inside):
    c = [sum(p[i] for p in pts) / len(pts) for i in range(3)]
    b.poly(pts, inside, glass(c))


# ---------- hàng cột + vòm nhọn ----------


def bay(b, seed):
    """Một nhịp (rộng W) quay mặt vào tâm: hai nửa cột ở hai mép (mỗi cột chia cho nhịp kề), vòm nhọn, khung bạc và mặt gương phát sáng; z+ hướng vào tâm sảnh."""
    W = 34.0
    H = 24.0
    rise = 10.0
    for sx in (-1, 1):
        x0 = sx * W / 2
        # chân tảng chìm sâu 3 m: sàn bám địa hình (thấp hơn mặt phẳng tâm tới ~1,3 m ở r 100) nên cột không được lơ lửng
        tbox(b, (x0, -1.4, 0), (4.6, 3.2, 4.6), Paint(mix(JADE, JADE_DK, 0.3), 'jade'))
        # đế bậc, thân sáo, đầu cột cánh sen
        for k, (rw, hh) in enumerate(((3.6, 0.7), (3.0, 0.6))):
            blob(b, (x0, 0.35 + k * 0.7, 0), (rw, hh, rw), jade_col(seed + k), nu=14, nv=4, e=2.4, amp=0.04, seed=seed + k)
        sides = 14
        prev = None
        for i in range(9):
            q = i / 8
            y = 1.3 + q * (H - 2.6)
            rr = 2.2 * (1.0 - 0.14 * q)
            ring = []
            for j in range(sides):
                a = j / sides * math.tau
                fl = 1.0 - 0.07 * (1 if j % 2 else 0)  # sáo dọc thân
                ring.append((x0 + math.cos(a) * rr * fl, y, math.sin(a) * rr * fl))
            if prev:
                for j in range(sides):
                    k2 = (j + 1) % sides
                    n_ = fbm3(j, q * 4, seed, seed + 7, 2)
                    rgb = mix(mix(JADE, JADE_DK, 0.2 + 0.4 * n_), C(0xDFE8F5), 0.25 * (1 - q))
                    b.poly([prev[j], prev[k2], ring[k2], ring[j]], (x0, y, 0), Paint(tuple(rgb), 'jade'))
            prev = ring
        b.poly(prev, (x0, 0, 0), Paint(JADE, 'jade'))
        for k in range(8):  # cánh sen ở đầu cột
            a = k / 8 * math.tau
            blob(b, (x0 + math.cos(a) * 1.9, H - 0.6, math.sin(a) * 1.9), (0.9, 1.4, 0.7), jade_col(seed + 20 + k), nu=8, nv=5, seed=seed + 30 + k, rot=a)
        blob(b, (x0, H + 0.6, 0), (3.2, 0.7, 3.2), jade_col(seed + 50), nu=14, nv=4, e=2.4, amp=0.04, seed=seed + 51)
    # đường viền vòm nhọn: hai cung tròn gặp nhau ở đỉnh
    def arch_pt(t, off=0.0):
        # t 0..1 từ chân trái → đỉnh → chân phải; nửa rộng a = W/2 - 2.6
        a = W / 2 - 2.6 - off
        side = -1 if t < 0.5 else 1
        u = abs(2 * t - 1)  # 1 ở chân, 0 ở đỉnh
        x = side * a * u
        y = H + 0.4 + (rise + off * 0.5) * math.sin((1 - u) * math.pi / 2) ** 0.9 * (1 - 0.15 * u)
        return (x, y)
    N = 28
    outer = [arch_pt(i / N) for i in range(N + 1)]
    inner = [arch_pt(i / N, 1.4) for i in range(N + 1)]
    # dải đá viền vòm dày 2.4
    for i in range(N):
        for zz in (1.1, -1.1):
            pass
        q = [(outer[i][0], outer[i][1], 1.1), (outer[i + 1][0], outer[i + 1][1], 1.1), (inner[i + 1][0], inner[i + 1][1], 1.1), (inner[i][0], inner[i][1], 1.1)]
        b.poly(q, (0, H, 0), Paint(mix(JADE, JADE_DK, 0.15), 'jade'))
        q2 = [(outer[i][0], outer[i][1], -1.1), (outer[i][0], outer[i][1], 1.1), (inner[i][0], inner[i][1], 1.1), (inner[i][0], inner[i][1], -1.1)]
        b.poly(q2, (0, H, 0), Paint(mix(JADE, JADE_DK, 0.3), 'jade'))
        q3 = [(outer[i][0], outer[i][1], -1.1), (outer[i + 1][0], outer[i + 1][1], -1.1), (outer[i + 1][0], outer[i + 1][1], 1.1), (outer[i][0], outer[i][1], 1.1)]
        b.poly(q3, (0, H + 20, 0), Paint(mix(JADE, C(0xFFFFFF), 0.2), 'jade'))
    # khung bạc quanh mép trong vòm + mặt gương
    inn = [arch_pt(i / N, 1.4) for i in range(N + 1)]
    for i in range(N):
        a, c_ = inn[i], inn[i + 1]
        tbox(b, ((a[0] + c_[0]) / 2, (a[1] + c_[1]) / 2, 0.9), (math.dist(a, c_) + 0.1, 0.34, 0.5), SILV, rz=math.atan2(c_[1] - a[1], c_[0] - a[0]))
    # mặt gương: quạt đa giác từ chân giữa lên theo viền trong (z = -0.4, lùi vào trong 0.6)
    base_y = 4.0
    ring_pts = [(inn[i][0], inn[i][1], -0.2) for i in range(N + 1)]
    ctr = (0.0, base_y + (H - base_y) * 0.5 + 6, -0.2)
    for i in range(N):
        poly_glass(b, [ctr, ring_pts[i], ring_pts[i + 1]], (0, ctr[1], -5))
    # phần dưới gương: hai dải đứng tới chân
    left = inn[0]
    right = inn[N]
    poly_glass(b, [(left[0], base_y, -0.2), (left[0], left[1], -0.2), ctr], (0, ctr[1], -5))
    poly_glass(b, [(right[0], right[1], -0.2), (right[0], base_y, -0.2), ctr], (0, ctr[1], -5))
    poly_glass(b, [(left[0], base_y, -0.2), ctr, (right[0], base_y, -0.2)], (0, ctr[1], -5))
    tbox(b, (0, base_y - 0.2, 0.3), (W - 5.2, 0.6, 1.4), SILV_D)  # ngưỡng bạc dưới gương
    # chạm trăng khuyết ở đỉnh vòm: vòng cung 250° bằng ống bạc + hạt ngọc ở giữa
    cx_, cy_ = 0.0, H + rise + 3.0
    cres = [(cx_ + math.cos(a) * 1.9, cy_ + math.sin(a) * 1.9, 1.3) for a in [math.radians(-125 + k * 250 / 10) for k in range(11)]]
    for a_, c_ in zip(cres, cres[1:]):
        rod(b, a_, c_, 0.28, 0.2, lambda p, n: SILV, nu=6, nv=1, amp=0.0)
    blob(b, (0.5, cy_ + 0.2, 1.3), (0.5, 0.5, 0.5), lambda p, n: Paint(C(0xF3E9C4), 'metal'), nu=8, nv=5)
    # hoa văn mây cuộn dọc khung trong vòm: cứ mỗi ~3 điểm một cụm cuộn (đĩa + hai cuộn nhỏ)
    for i in range(2, N - 1, 3):
        px, py = inn[i]
        blob(b, (px, py, 1.25), (0.55, 0.55, 0.3), lambda p, n: SILV, nu=8, nv=5)
        blob(b, (px + 0.55, py - 0.2, 1.25), (0.3, 0.3, 0.2), lambda p, n: SILV_D, nu=6, nv=4)
        blob(b, (px - 0.5, py + 0.25, 1.25), (0.26, 0.26, 0.2), lambda p, n: SILV_D, nu=6, nv=4)
    # tường sau ngọc trắng (lấp sau gương và hai bên vòm) + gờ ngang
    top = H + rise + 2.2
    tbox(b, (0, top / 2 - 0.2, -2.4), (W - 4.0, top, 1.3), Paint(mix(JADE, JADE_DK, 0.1), 'jade'))
    for yy in (6.0, 15.0, 24.0):
        tbox(b, (0, yy, -1.6), (W - 3.4, 0.5, 0.5), Paint(mix(JADE, JADE_DK, 0.3), 'jade'))
    # trụ ốp nổi chia tường thành ô: bốn trụ đứng + khung ô hai bên gương
    for sx in (-1, 1):
        for off in (W / 2 - 3.2, W / 2 - 6.2):
            tbox(b, (sx * off, (top - 2) / 2 + 2, -1.35), (0.9, top - 4, 0.6), Paint(mix(JADE, C(0xFFFFFF), 0.1), 'jade'))
    # mái cong (hiên): dải ngói lam bạc chạy ngang đỉnh, hai đầu cong vút; sống mái bạc
    roof = Paint(C(0x7E94B8), 'plaster')
    n_seg = 16
    for i in range(n_seg):
        t0, t1 = i / n_seg, (i + 1) / n_seg
        x0r, x1r = -W / 2 - 1.4 + t0 * (W + 2.8), -W / 2 - 1.4 + t1 * (W + 2.8)
        y0r = top + 0.2 + 3.4 * abs(2 * t0 - 1) ** 2.6
        y1r = top + 0.2 + 3.4 * abs(2 * t1 - 1) ** 2.6
        slope = math.atan2(y1r - y0r, x1r - x0r)
        mx, my = (x0r + x1r) / 2, (y0r + y1r) / 2
        tbox(b, (mx, my, 0.4), (math.dist((x0r, y0r), (x1r, y1r)) + 0.1, 0.7, 5.2), roof, rz=slope, rx=-0.12)
        tbox(b, (mx, my + 0.55, 2.6), (math.dist((x0r, y0r), (x1r, y1r)) + 0.1, 0.35, 0.4), SILV, rz=slope)
    # rèm lụa bạc rủ hai bên vòm: dải vải có nếp sóng
    for sx in (-1, 1):
        for off in (0.0, 3.0):
            xc = sx * (W / 2 - 3.4 - off)
            cw, rows = 2.4, 14
            for r_ in range(rows):
                y_a = H - 1.0 - r_ * ((H - 6.0) / rows)
                y_b = y_a - (H - 6.0) / rows
                for c_ in range(5):
                    xa = xc - cw / 2 + c_ * cw / 5
                    xb = xa + cw / 5
                    za = 0.9 + 0.42 * math.sin(c_ * 1.3 + r_ * 0.35 + sx)
                    zb = 0.9 + 0.42 * math.sin((c_ + 1) * 1.3 + r_ * 0.35 + sx)
                    za2 = 0.9 + 0.42 * math.sin(c_ * 1.3 + (r_ + 1) * 0.35 + sx)
                    zb2 = 0.9 + 0.42 * math.sin((c_ + 1) * 1.3 + (r_ + 1) * 0.35 + sx)
                    sh = 0.55 + 0.4 * (0.5 + 0.5 * math.sin(c_ * 1.3 + 1.0))
                    col = Paint(mix(C(0x8A97B2), C(0xF2F4FA), sh), 'silk')
                    b.poly([(xa, y_a, za), (xb, y_a, zb), (xb, y_b, zb2), (xa, y_b, za2)], (xc, y_a, -4), col)
            tbox(b, (xc, 5.4, 0.9), (cw + 0.3, 0.3, 0.35), Paint(C(0xE3D6A2), 'metal'))  # tua vàng nhạt chân rèm
            tbox(b, (xc, H - 0.8, 0.9), (cw + 0.5, 0.35, 0.5), SILV)


# ---------- vòng gương trăng ----------


def moon_ring(b, seed):
    R, T = 13.0, 1.1
    cy = 20.0
    rnd = random.Random(seed)
    # bệ bậc đá + hai trụ đỡ
    for k in range(4):
        w = 40 - k * 6
        tbox(b, (0, 0.5 + k * 1.0, 0), (w, 1.0, 14 - k * 2), Paint(mix(JADE, JADE_DK, 0.12 * k), 'stone'))
    for sx in (-1, 1):
        for k in range(3):
            blob(b, (sx * 9.5, 4.5 + k * 3.3, 0), (2.6 - 0.2 * k, 2.2, 2.4), jade_col(seed + k + (3 if sx > 0 else 0)), nu=12, nv=6, e=2.0, amp=0.05, seed=seed + k)
    tbox(b, (0, 4.3, 0), (22, 1.2, 3.0), Paint(JADE_DK, 'stone'))
    # vòng bạc: ống tròn
    N = 56
    for i in range(N):
        a0, a1 = i / N * math.tau, (i + 1) / N * math.tau
        p0 = (math.cos(a0) * R, cy + math.sin(a0) * R, 0)
        p1 = (math.cos(a1) * R, cy + math.sin(a1) * R, 0)
        rod(b, p0, p1, T, T, lambda p, n: Paint(mix(SILVER, C(0xE8EEF8), 0.4 * (0.5 + 0.5 * math.sin(p[0] * 0.4))), 'metal'), nu=8, nv=1, amp=0.01)
    for i in range(24):  # đinh tán và trăng khuyết trang trí
        a = i / 24 * math.tau
        blob(b, (math.cos(a) * (R + 1.6), cy + math.sin(a) * (R + 1.6), 0), (0.7, 0.7, 0.7), lambda p, n: SILV, nu=8, nv=5)
    for i in range(8):
        a = i / 8 * math.tau + math.pi / 8
        tbox(b, (math.cos(a) * (R + 3.6), cy + math.sin(a) * (R + 3.6), 0), (0.7, 3.4, 0.7), SILV, rz=a - math.pi / 2)
    # mặt gương trăng: đĩa quạt, sáng nhất ở giữa
    M = 64
    inner = R - T * 0.8
    for i in range(M):
        a0, a1 = i / M * math.tau, (i + 1) / M * math.tau
        p0 = (math.cos(a0) * inner, cy + math.sin(a0) * inner, -0.3)
        p1 = (math.cos(a1) * inner, cy + math.sin(a1) * inner, -0.3)
        mid = (0.0, cy, -0.3)
        xm = math.cos((a0 + a1) / 2) * inner * 0.5
        ym = math.sin((a0 + a1) / 2) * inner * 0.5
        band = max(0.0, 1.0 - abs((xm + ym * 0.8) - 2.0) / 3.2) ** 1.5
        base_t = 0.08 + 0.1 * (0.5 + 0.5 * math.sin(a0 * 3 + 1))
        b.poly([mid, p0, p1], (0, cy, -5), Paint(mix(C(0x14204A), C(0xE6EEFF), base_t + 0.8 * band), 'glass'))
    # chuỗi hạt ngọc rủ hai bên
    for sx in (-1, 1):
        for k in range(10):
            blob(b, (sx * (R + 1.0 + 0.15 * k), cy - R * 0.4 - k * 1.9, 0.3), (0.55, 0.55, 0.55), lambda p, n: Paint(C(0xD6E4FF), 'glass'), nu=8, nv=5)


# ---------- mảnh gương ----------


def shard(b, seed, big=True):
    """Mảnh gương vỡ: đa giác 6–8 cạnh, bán kính xen kẽ gai nhọn (mũi dài ở hai đầu), dẹt mỏng; cạnh bạc sắc, hai mặt gương phản chiếu, khung bạc mảnh."""
    rnd = random.Random(seed)
    n = rnd.randint(6, 8)
    h = 4.4
    pts = []
    for i in range(n):
        a_ = i / n * math.tau + rnd.uniform(-0.15, 0.15)
        spike = 1.0 if i % 2 == 0 else 0.5
        rr = (1.0 + rnd.uniform(-0.15, 0.25)) * spike
        pts.append((math.cos(a_) * rr * 1.35, math.sin(a_) * rr * h * (1.0 if abs(math.sin(a_)) > 0.5 else 0.7), 0.0))
    th = 0.12
    front = [(x, y, th) for x, y, _ in pts]
    back = [(x, y, -th) for x, y, _ in pts]
    c = (0, 0, 0)
    for face, zz in ((front, th), (back, -th)):
        mid = [(x * 0.5, y * 0.5, zz) for x, y, _ in face]
        for i in range(n):
            j = (i + 1) % n
            poly_glass(b, [(0, 0, zz), mid[i], mid[j]], (0, 0, -zz * 5))
            poly_glass(b, [mid[i], face[i], face[j], mid[j]], (0, 0, -zz * 5))
    for i in range(n):
        j = (i + 1) % n
        b.poly([front[i], front[j], back[j], back[i]], c, SILV)
        a_, b_ = pts[i], pts[j]
        tbox(b, ((a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2, th + 0.04), (math.dist(a_[:2], b_[:2]) * 1.02, 0.1, 0.14), SILV_D, rz=math.atan2(b_[1] - a_[1], b_[0] - a_[0]))


def chime(b, seed):
    """Dây chuông gương treo trần: dây mảnh + 4–6 mảnh gương nhỏ treo so le + hạt ngọc; gốc ở trần, rủ xuống -y."""
    rnd = random.Random(seed)
    n = rnd.randint(4, 6)
    y = 0.0
    for k in range(n):
        ln = rnd.uniform(2.2, 4.2)
        b.box(0, y - ln / 2, 0, 0.07, ln, 0.07, Paint(SILVER_DK, 'metal'))
        y -= ln
        s = 0.35 + 0.25 * rnd.random()
        pts = [(0, -1.1 * s, 0), (0.55 * s, 0, 0), (0, 1.1 * s, 0), (-0.55 * s, 0, 0)]
        ox = rnd.uniform(-0.2, 0.2)
        front = [(x + ox, yy + y - 1.1 * s, 0.05) for x, yy, _ in pts]
        back = [(x + ox, yy + y - 1.1 * s, -0.05) for x, yy, _ in pts]
        poly_glass(b, front, (ox, y - 1.1 * s, -5))
        poly_glass(b, list(reversed(back)), (ox, y - 1.1 * s, 5))
        for i in range(4):
            j = (i + 1) % 4
            b.poly([front[i], front[j], back[j], back[i]], (ox, y, 0), SILV)
        y -= 2.2 * s


def fragments(b, seed):
    """Mảnh gương vỡ nằm trên sàn: vài tấm tam giác/tứ giác nghiêng nhẹ, mép bạc, mặt phát sáng yếu."""
    rnd = random.Random(seed)
    for k in range(6):
        cx, cz = rnd.uniform(-2.5, 2.5), rnd.uniform(-2.5, 2.5)
        n = rnd.choice((3, 4, 5))
        r = rnd.uniform(0.5, 1.4)
        a0 = rnd.uniform(0, math.tau)
        tilt = (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15))
        pts = []
        for i in range(n):
            a = a0 + i / n * math.tau + rnd.uniform(-0.3, 0.3)
            rr = r * rnd.uniform(0.6, 1.1)
            x, z = cx + math.cos(a) * rr, cz + math.sin(a) * rr
            pts.append((x, 0.08 + tilt[0] * x + tilt[1] * z, z))
        poly_glass(b, pts, (cx, -5, cz))
        for i in range(n):
            j = (i + 1) % n
            b.poly([pts[i], pts[j], (pts[j][0], pts[j][1] - 0.15, pts[j][2]), (pts[i][0], pts[i][1] - 0.15, pts[i][2])], (cx, 0, cz), SILV_D)


def lotus_basin(b, seed):
    """Chậu sen đá nhỏ có nước sáng: bệ tròn bậc, vành cánh sen, mặt nước phát sáng nhạt (dùng cạnh lối vào)."""
    rnd = random.Random(seed)
    for k in range(3):
        blob(b, (0, 0.3 + k * 0.45, 0), (3.6 - 0.5 * k, 0.5, 3.6 - 0.5 * k), jade_col(seed + k), nu=16, nv=4, e=2.2, amp=0.04, seed=seed + k)
    for i in range(12):
        a = i / 12 * math.tau
        blob(b, (math.cos(a) * 2.7, 1.5, math.sin(a) * 2.7), (0.8, 0.8, 0.45), jade_col(seed + 10 + i), nu=8, nv=5, seed=seed + 20 + i, rot=a)
    n = 14
    pts = [(math.cos(i / n * math.tau) * 2.3, 1.55, math.sin(i / n * math.tau) * 2.3) for i in range(n)]
    for i in range(n):
        poly_glass(b, [(0, 1.5, 0), pts[i], pts[(i + 1) % n]], (0, -5, 0))


def build_variants():
    v = {}
    for i in range(2):
        b = new_b(900 + i)
        bay(b, 900 + i * 13)
        v[f'bay{i}'] = b
    b = new_b(910)
    moon_ring(b, 910)
    v['ring'] = b
    for i in range(3):
        b = new_b(920 + i)
        shard(b, 920 + i)
        v[f'shard{i}'] = b
    for i in range(3):
        b = new_b(930 + i)
        chime(b, 930 + i)
        v[f'chime{i}'] = b
    for i in range(3):
        b = new_b(940 + i)
        fragments(b, 940 + i)
        v[f'frag{i}'] = b
    b = new_b(950)
    lotus_basin(b, 950)
    v['basin'] = b
    return v


def keep_out(x, z, min_r=30.0):
    return math.hypot(x, z) < min_r or (abs(x) < 10 and z > 0)


def run(out):
    bs.make_textures()
    variants = build_variants()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = ts.materials_for(list(variants.values()))
    meshes = {k: ts.make_mesh(f'kn_{k}', b, keys, images, bevel=False) for k, b in variants.items()}
    rnd = random.Random(SEED)
    n_obj = 0

    def put(kind, var, x, z, y=0.0, **kw):
        nonlocal n_obj
        o = kta.place(f'kn_{kind}_{n_obj}', meshes[var], x, z, **kw)
        o.location.z = y  # Blender z = lên
        n_obj += 1

    # Hàng cột: 18 nhịp quanh r = 100 (chừa nhịp phía nam, lối vào); mỗi nhịp quay mặt vào tâm.
    NB = 18
    R = 100.0
    for i in range(NB):
        a = (i + 0.5) / NB * math.tau
        if abs(math.atan2(math.sin(a - math.pi / 2), math.cos(a - math.pi / 2))) < 0.2:
            continue
        put('bay', f'bay{i % 2}', math.cos(a) * R, math.sin(a) * R, yaw=a + math.pi / 2 + math.pi, scale=1.0)
    # Vòng gương trăng khổng lồ ở bắc, nhìn về tâm.
    put('ring', 'ring', 0.0, -92.0, yaw=0.0, scale=1.0)
    # Chậu sen cạnh lối vào.
    for sx in (-1, 1):
        put('basin', 'basin', sx * 16, 70.0, yaw=rnd.uniform(0, 6.28), scale=1.4)
    # Mảnh gương cắm nghiêng trên sàn (cao 4–10 m), ngoài khu đánh.
    got = 0
    while got < 34:
        a = rnd.uniform(0, math.tau)
        r = 34 + 56 * math.sqrt(rnd.random())
        x, z = math.cos(a) * r, math.sin(a) * r
        if keep_out(x, z, 34):
            continue
        s = rnd.uniform(1.0, 2.0)
        put('shard', f'shard{rnd.randrange(3)}', x, z, y=4.2 * s * 0.8, yaw=rnd.uniform(0, 6.28), scale=s, lean=rnd.uniform(0.05, 0.3), lean_yaw=rnd.uniform(0, 6.28))
        got += 1
    # Mảnh gương lơ lửng.
    for i in range(44):
        a = rnd.uniform(0, math.tau)
        r = 24 + 68 * math.sqrt(rnd.random())
        if keep_out(math.cos(a) * r, math.sin(a) * r, 26):
            continue
        s = rnd.uniform(0.7, 2.4)
        h = rnd.uniform(7, 34)
        put('float', f'shard{rnd.randrange(3)}', math.cos(a) * r, math.sin(a) * r, y=h, yaw=rnd.uniform(0, 6.28), scale=s, lean=rnd.uniform(-0.4, 0.4), lean_yaw=rnd.uniform(0, 6.28))
    # Dây chuông gương treo trần.
    for i in range(48):
        a = rnd.uniform(0, math.tau)
        r = 8 + 100 * math.sqrt(rnd.random())
        put('ceil_chime', f'chime{rnd.randrange(3)}', math.cos(a) * r, math.sin(a) * r, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(1.4, 2.6))
    # Mảnh gương vỡ rải trên sàn.
    got = 0
    while got < 70:
        a = rnd.uniform(0, math.tau)
        r = 14 + 80 * math.sqrt(rnd.random())
        x, z = math.cos(a) * r, math.sin(a) * r
        if abs(x) < 8 and z > 0:
            continue
        put('frag', f'frag{rnd.randrange(3)}', x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(1.0, 1.8))
        got += 1
    ts.export_glb(out)
    size, prims, tris, doc = bs.inspect(out)
    print(f'[kinh_nguyet] {out}: {size / 1024:.0f} KB, {n_obj} vật, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)})')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_kinh_nguyet.glb')
