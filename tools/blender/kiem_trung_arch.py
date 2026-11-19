# Cảnh Kiếm Trủng (DUN-1, phong cách B): cự kiếm chi tiết, vành núi đá nhiều tầng (shan-shui), mộ, bia gãy, cột gãy, bậc đá, xương, giáp vụn.
# Dựng bằng Builder của tông môn (build_sect / thien_cong_kit): mặt có màu đỉnh + UV, vật liệu `stone`/`steel`/`metal`/`rune`.
#
#   blender --background --python tools/blender/kiem_trung_arch.py -- assets/build/raw/arch_kiem_trung.glb
#
# Gốc toạ độ = tâm đài chiến Kiếm Trủng (1520, 150, 1300); x = đông, y = lên, z = nam. Mỗi vật là MỘT object tên `kt_*` có gốc ở chân vật
# (y = 0); client (`loadKtModel`) hạ y theo `heightAt` tại chỗ vật. Vật cùng loại dùng chung lưới (object liên kết), chỉ khác phép biến đổi.

import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_sect as bs  # noqa: E402
import thien_cong_kit as kit  # noqa: E402
import thien_cong_sect as ts  # noqa: E402
from build_sect import Mat, Paint  # noqa: E402
from thien_khuyet_arch import fbm3  # noqa: E402

bs.UV_ORIGIN, bs.UV_RANGE = 200.0, 420

# Rãnh khí/phù văn: phát sáng xanh dưới ngưỡng bloom (1,0) để không cháy trắng.
bs.MATERIALS['rune'] = Mat(0.5, 0.0, None, 1.0, False, 0.0, (0x4FB8F0, 0.95))
bs.MATERIALS['steel'] = Mat(0.5, 0.18, None, 1.0, False, 0.0)
bs.MATERIALS['metal'] = Mat(0.55, 0.2, None, 1.0, False, 0.0)

C = bs.srgb


def pnt(hex_color, mat):
    return Paint(C(hex_color), mat)


RUNE = pnt(0x6FD0FF, 'rune')
BONE = pnt(0xB9B09A, 'plaster')
PAPER = pnt(0xB8A878, 'plaster')
PAPER_RED = pnt(0x8A3028, 'plaster')
CHAIN = pnt(0x4A4036, 'metal')
BRONZE = pnt(0x6E5A3A, 'metal')
LEATHER = pnt(0x2A2220, 'wood')
ROCK = [C(0x5A6470), C(0x434B56), C(0x6C7784), C(0x2F353E)]
STEEL = C(0xB8C4D0)
STEEL_DK = C(0x6A7681)
RUST = C(0x7E4A2C)
MOSS = C(0x3B5A36)
SOIL = C(0x4A3B34)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x * (1 - t) + y * t for x, y in zip(a, b))


def new_b(seed):
    b = kit.new_builder(seed=seed, moss=0.0)
    return b


# ---------- mặt lưới điêu khắc có hàm màu ----------


def surf(b, f, nu, nv, center, colfn):
    """Như `surface` của Thiên Khuyết nhưng màu do `colfn(pos, normal)` quyết định."""
    grid = [[f((i % nu) / nu, j / nv) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
            dq = []
            for p in q:
                if not dq or math.dist(p, dq[-1]) > 1e-6:
                    dq.append(p)
            if len(dq) > 1 and math.dist(dq[0], dq[-1]) < 1e-6:
                dq.pop()
            if len(dq) < 3:
                continue
            c = [sum(p[k] for p in dq) / len(dq) for k in range(3)]
            n = bs.newell(dq)
            ctr = center((j + 0.5) / nv)
            if (c[0] - ctr[0]) * n[0] + (c[1] - ctr[1]) * n[1] + (c[2] - ctr[2]) * n[2] < 0:
                dq.reverse()
                n = (-n[0], -n[1], -n[2])
            ln = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) or 1.0
            b.face(dq, colfn(c, (n[0] / ln, n[1] / ln, n[2] / ln)), True)


def blob(b, c, r, colfn, nu=14, nv=9, e=1.0, amp=0.12, seed=1, v0=0.0, v1=1.0, rot=0.0):
    def f(u, v):
        pv = (v0 + (v1 - v0) * v) * math.pi
        th = u * math.tau + rot
        dx, dy, dz = math.sin(pv) * math.cos(th), math.cos(pv), math.sin(pv) * math.sin(th)
        if e > 1.0:
            q = 2.0 / e
            dx, dy, dz = (math.copysign(abs(t) ** q, t) for t in (dx, dy, dz))
        x, y, z = c[0] + dx * r[0], c[1] + dy * r[1], c[2] + dz * r[2]
        k = 1.0 + amp * (fbm3(x * 0.5, y * 0.5, z * 0.5, seed, 3) - 0.5) * 2
        return (c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k, c[2] + (z - c[2]) * k)

    surf(b, f, nu, nv, lambda v: c, colfn)


def rod(b, a, bp, r0, r1, colfn, nu=8, nv=4, seed=1, amp=0.04):
    ax = [bp[k] - a[k] for k in range(3)]
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
        base = [a[k] + (bp[k] - a[k]) * v for k in range(3)]
        p = [base[k] + (e1[k] * math.cos(th) + e2[k] * math.sin(th)) * rad for k in range(3)]
        k_ = 1.0 + amp * (fbm3(p[0], p[1], p[2], seed, 2) - 0.5) * 2
        return tuple(base[k] + (p[k] - base[k]) * k_ for k in range(3))

    surf(b, f, nu, nv, lambda v: tuple(a[k] + (bp[k] - a[k]) * v for k in range(3)), colfn)


# ---------- hàm màu ----------


def rock_col(seed, haze=0.0, strata=0.0, moss_amt=1.0):
    def fn(pos, nrm):
        x, y, z = pos
        n = fbm3(x * 0.25, y * 0.25, z * 0.25, seed, 3)
        base = ROCK[int(n * 3.99) % 4]
        t = 0.7 + 0.6 * fbm3(x * 0.6, y * 0.6, z * 0.6, seed + 3, 2)
        rgb = tuple(c * t for c in base)
        if strata:
            band = 0.5 + 0.5 * math.sin(y * strata + n * 5)
            rgb = tuple(c * (0.78 + 0.4 * band) for c in rgb)
        # đất đỏ rỉ chảy ở chân, rêu mặt ngửa
        low = max(0.0, 1.0 - max(y, 0.0) / 3.0)
        rgb = mix(rgb, RUST, low * 0.45 * fbm3(x * 0.4 + 7, y, z * 0.4, seed + 5, 2))
        if nrm[1] > 0.45 and moss_amt:
            m = fbm3(x * 0.3 + 2, y * 0.3, z * 0.3, seed + 9, 3)
            if m > 0.5:
                rgb = mix(rgb, MOSS, min(0.8, (m - 0.5) * 3) * moss_amt)
        if haze:
            rgb = mix(rgb, C(0x9FB4C8), haze)
        return Paint(tuple(rgb), 'stone')

    return fn


def soil_col(seed):
    def fn(pos, nrm):
        n = fbm3(pos[0] * 0.4, pos[1] * 0.4, pos[2] * 0.4, seed, 3)
        rgb = mix(SOIL, RUST, 0.18 * n)
        rgb = tuple(c * (0.75 + 0.5 * n) for c in rgb)
        if nrm[1] > 0.6 and n > 0.55:
            rgb = mix(rgb, MOSS, 0.55)
        return Paint(tuple(rgb), 'stone')

    return fn


def bone_col(pos, nrm):
    n = fbm3(pos[0] * 3, pos[1] * 3, pos[2] * 3, 4, 2)
    return Paint(tuple(c * (0.7 + 0.4 * n) for c in C(0xB9B09A)), 'plaster')


def metal_col(seed, rust=0.5):
    def fn(pos, nrm):
        n = fbm3(pos[0] * 0.5, pos[1] * 0.5, pos[2] * 0.5, seed, 3)
        rgb = mix(STEEL_DK, RUST, rust * n * 1.6)
        return Paint(tuple(rgb), 'metal')

    return fn


# ---------- cự kiếm ----------


def blade_rings(H, Lb, W, T, broken, rnd, y_bot):
    """Các vòng tiết diện lưỡi (16 điểm: sống nổi, rãnh máu giữa, hai mép sắc) từ y_bot (chìm trong đất) tới đỉnh."""
    n = 22
    top = Lb * (1.3 if broken else 1.0)
    notches = [(rnd.uniform(0.25, 0.9) * top, rnd.choice((-1, 1)), rnd.uniform(0.03, 0.07) * W) for _ in range(5 if broken else 3)]
    rings = []
    for i in range(n + 1):
        q = i / n
        y = y_bot + (top - y_bot) * q
        w = W * (1.0 - 0.1 * q) * (1.0 if y > 0 else 0.9)
        t = T
        # mẻ lưỡi: lõm một bên mép quanh vị trí
        wl, wr = w, w
        for (ny_, side, depth) in notches:
            k = math.exp(-((y - ny_) / (0.012 * H)) ** 2)
            if side < 0:
                wl -= depth * k
            else:
                wr -= depth * k
        if i == n and not broken:  # mũi vát (kiếm chắn ở trên: đầu lưỡi dưới đất, đỉnh lưỡi vào chắn)
            pass
        prof = [
            (-wl, 0.0), (-0.52 * w, 0.62 * t), (-0.2 * w, 0.92 * t), (-0.1 * w, 0.42 * t),
            (0.1 * w, 0.42 * t), (0.2 * w, 0.92 * t), (0.52 * w, 0.62 * t), (wr, 0.0),
            (0.52 * w, -0.62 * t), (0.2 * w, -0.92 * t), (0.1 * w, -0.42 * t), (-0.1 * w, -0.42 * t),
            (-0.2 * w, -0.92 * t), (-0.52 * w, -0.62 * t),
        ]
        rings.append((y, prof))
    return rings, top


def giant_sword(b, H, broken, seed):
    rnd = random.Random(seed)
    s = H / 40.0
    Lb = 0.5 * H
    W = 0.085 * H
    T = 0.016 * H
    rings, top = blade_rings(H, Lb, W, T, broken, rnd, -0.03 * H)
    N = len(rings)
    sc = metal_col(seed + 1, rust=0.9)
    jag = [rnd.uniform(-0.05, 0.07) * H for _ in range(14)]
    for i in range(N - 1):
        y0, p0 = rings[i]
        y1, p1 = rings[i + 1]
        last = i == N - 2
        for j in range(14):
            k = (j + 1) % 14
            ya = y0
            yb = y1 + (jag[j] if last and broken else 0.0)
            yb2 = y1 + (jag[k] if last and broken else 0.0)
            quad = [
                (p0[j][0], ya, p0[j][1]), (p0[k][0], ya, p0[k][1]),
                (p1[k][0], yb2, p1[k][1]), (p1[j][0], yb, p1[j][1]),
            ]
            mid = (0.0, (y0 + y1) / 2, 0.0)
            # vùng màu: mép sáng (j 0,7), rãnh giữa (j 3,4,10,11) có phù văn đứt đoạn, còn lại thép rỉ
            n_ = fbm3(0.0, (y0 + y1) * 0.15 / s, j * 0.7, seed, 3)
            low = max(0.0, 1.0 - max(y0, 0.0) / (0.5 * Lb))
            edge = j in (0, 7)
            groove = j in (3, 10)
            if groove and int(i) % 3 != 2 and y0 > 0.04 * H and y1 < Lb * 0.97:
                col = RUNE
            else:
                rgb = mix(STEEL, STEEL_DK, 0.25 + 0.5 * n_)
                rgb = mix(rgb, RUST, min(1.0, 0.05 + 0.5 * n_ * (0.3 + low)) if not edge else 0.1 * n_)
                col = Paint(tuple(c * (1.15 if edge else 1.0) for c in rgb), 'steel')
            b.poly(quad, mid, col)
    # nắp đỉnh (lưỡi gãy: mặt cắt thô)
    yt, pt = rings[-1]
    cap = [(x, yt + (jag[j] if broken else 0.0), z) for j, (x, z) in enumerate(pt)]
    b.poly(cap, (0, yt - 1, 0), Paint(STEEL_DK, 'steel'))
    # chi tiết phù văn: các khối nhỏ phát sáng dọc lưỡi (chữ triện cách điệu), hai mặt
    for side in (1, -1):
        for k in range(7 if not broken else 5):
            y = (0.1 + 0.11 * k) * Lb * 1.1 + rnd.uniform(-0.01, 0.01) * H
            if y > (Lb * (1.28 if broken else 0.95)):
                continue
            wx = rnd.choice((-1, 1)) * 0.3 * W
            b.box(wx, y, side * (T * 0.62), 0.1 * W, 0.03 * H, 0.01 * H, RUNE)
            b.box(wx + 0.05 * W, y + 0.012 * H, side * (T * 0.62), 0.05 * W, 0.008 * H, 0.01 * H, RUNE)
    if broken:
        # mảnh lưỡi gãy nằm bên chân, chếch trên đất
        piece = Lb * 0.45
        b2 = []
        a0 = rnd.uniform(0, math.tau)
        ox, oz = math.cos(a0) * 0.22 * H, math.sin(a0) * 0.22 * H
        for i in range(8):
            q0, q1 = i / 8, (i + 1) / 8
            for j in range(14):
                k = (j + 1) % 14
                w0 = 1.0 - 0.4 * q0
                w1 = 1.0 - 0.4 * q1
                P = lambda q, w, jj: (ox + math.cos(a0) * (q * piece) + (-math.sin(a0)) * rings[2][1][jj][0] * w * 1.0,
                                      0.02 * H + rings[2][1][jj][1] * w * 1.0 + 0.02 * H,
                                      oz + math.sin(a0) * (q * piece) + math.cos(a0) * rings[2][1][jj][0] * w * 1.0)
                quad = [P(q0, w0, j), P(q0, w0, k), P(q1, w1, k), P(q1, w1, j)]
                b.poly(quad, (ox + math.cos(a0) * piece * (q0 + q1) / 2, 0.0, oz + math.sin(a0) * piece * (q0 + q1) / 2), Paint(mix(STEEL_DK, RUST, 0.6), 'steel'))
    else:
        guard_and_hilt(b, H, Lb, W, T, rnd, seed)
    plinth(b, H, rnd, seed)


def guard_and_hilt(b, H, Lb, W, T, rnd, seed):
    s = H / 40.0
    G = 0.15 * H
    y = Lb
    bronze = metal_col(seed + 11, rust=0.45)
    # tấm chắn cong sừng: hai cánh vẫy lên, tiết diện tròn thon
    for sx in (-1, 1):
        a = (0.0, y, 0.0)
        m = (sx * G * 0.55, y - 0.012 * H, 0.0)
        e = (sx * G, y + 0.09 * H, 0.0)
        rod(b, a, m, 0.032 * H, 0.026 * H, bronze, nu=8, nv=3, seed=seed)
        rod(b, m, e, 0.026 * H, 0.014 * H, bronze, nu=8, nv=4, seed=seed + 1)
        blob(b, e, (0.02 * H, 0.03 * H, 0.02 * H), bronze, nu=8, nv=5, seed=seed + 2)
        # xích rủ từ đầu cánh xuống đất
        cx, cz = e[0], 0.0
        n = 6
        for k in range(n):
            t = k / n
            lx = cx + sx * (0.02 * H + 0.04 * H * t)
            ly = e[1] - t * 0.13 * H + 0.01 * H * math.sin(t * math.pi)
            b.box(lx, ly, cz, 0.02 * H, 0.026 * H, 0.016 * H, CHAIN, yaw=(k % 2) * math.pi / 2)
    # bùa chú: dải giấy treo từ chắn, có chữ phát sáng
    for sx in (-0.45, -0.2, 0.2, 0.45):
        px = sx * G * 2 * 0.5
        ln = rnd.uniform(0.07, 0.12) * H
        b.box(px, y - ln / 2, 0.03 * H, 0.018 * H, ln, 0.002 * H, PAPER_RED if rnd.random() < 0.5 else PAPER)
        for k in range(3):
            b.box(px, y - ln * (0.2 + 0.25 * k), 0.032 * H, 0.008 * H, 0.012 * H, 0.002 * H, RUNE)
    # cổ chắn + chuôi quấn + vòng + đầu chuôi
    blob(b, (0, y + 0.012 * H, 0), (0.05 * H, 0.03 * H, 0.04 * H), bronze, nu=10, nv=6, seed=seed + 3)
    rod(b, (0, y + 0.03 * H, 0), (0, y + 0.19 * H, 0), 0.02 * H, 0.017 * H, lambda p, n: Paint(tuple(c * (0.7 + 0.5 * fbm3(p[0] * 8, p[1] * 8, p[2] * 8, 6, 2)) for c in C(0x2A2220)), 'wood'), nu=8, nv=6)
    for k in range(7):
        b.cylinder(0, y + (0.04 + 0.022 * k) * H, 0, 0.022 * H, 0.008 * H, BRONZE, 8)
    blob(b, (0, y + 0.215 * H, 0), (0.034 * H, 0.03 * H, 0.034 * H), bronze, nu=10, nv=7, seed=seed + 4)
    # dây xích quấn quanh chuôi
    for k in range(9):
        t = k / 9
        a_ = t * math.tau * 2
        b.box(math.cos(a_) * 0.022 * H, y + (0.05 + 0.15 * t) * H, math.sin(a_) * 0.022 * H, 0.012 * H, 0.014 * H, 0.012 * H, CHAIN, yaw=a_)


def plinth(b, H, rnd, seed):
    """Chân cắm vào khối đá nứt vỡ, đất đỏ trồi lên quanh gốc, khe nứt tối."""
    R = 0.11 * H
    soil = soil_col(seed + 20)
    blob(b, (0, 0.0, 0), (R * 1.7, 0.045 * H, R * 1.7), soil, nu=20, nv=8, seed=seed + 21, v0=0.0, v1=0.5, amp=0.25)
    for i in range(9):
        a = i / 9 * math.tau + rnd.uniform(-0.2, 0.2)
        d = R * rnd.uniform(0.55, 1.15)
        rr = R * rnd.uniform(0.28, 0.55)
        x, z = math.cos(a) * d, math.sin(a) * d
        h_ = rr * rnd.uniform(0.7, 1.5)
        blob(b, (x, h_ * 0.35, z), (rr, h_, rr * rnd.uniform(0.7, 1.1)), rock_col(seed + 30 + i, strata=2.0), nu=10, nv=7, e=1.5, amp=0.22, seed=seed + 40 + i, rot=a)
    # khối đá chính ôm gốc kiếm, nứt vỡ làm ba mảng
    for i in range(3):
        a = i / 3 * math.tau + 0.5
        x, z = math.cos(a) * R * 0.32, math.sin(a) * R * 0.32
        blob(b, (x, 0.04 * H, z), (R * 0.46, 0.075 * H, R * 0.46), rock_col(seed + 60 + i, strata=3.0), nu=10, nv=7, e=1.6, amp=0.18, seed=seed + 70 + i, rot=a)
    for i in range(6):  # khe nứt tối + vệt khí xanh trong khe
        a = i / 6 * math.tau + 0.3
        d0, d1 = R * 0.3, R * rnd.uniform(1.3, 1.7)
        mx, mz = math.cos(a) * (d0 + d1) / 2, math.sin(a) * (d0 + d1) / 2
        b.box(mx, 0.062 * H, mz, d1 - d0, 0.004 * H, 0.012 * H, Paint(C(0x15181D), 'stone'), yaw=-a)
        if i % 2 == 0:
            b.box(mx, 0.066 * H, mz, (d1 - d0) * 0.6, 0.002 * H, 0.004 * H, RUNE, yaw=-a)


# ---------- vành núi đá (shan-shui) ----------


def spire(b, h, w, haze, seed):
    """Mỏm đá góc cạnh nhiều tầng (sơn thủy): thân loe rộng, các phiến chồng lệch có nhô ngang, đỉnh gãy nhọn lệch, chân có bậc đá lớn."""
    rnd = random.Random(seed)
    lean = rnd.uniform(-0.25, 0.25)
    # chân loe: ba khối bậc đá lớn
    for k in range(3):
        a = rnd.uniform(0, math.tau)
        blob(b, (math.cos(a) * w * 0.8, 1.5, math.sin(a) * w * 0.8), (w * rnd.uniform(0.7, 1.0), 5.5, w * rnd.uniform(0.6, 0.9)),
             rock_col(seed + 50 + k, haze=haze * 0.3, strata=0.8), nu=12, nv=6, e=2.4, amp=0.35, seed=seed + 60 + k, rot=a)
    n = 6
    y = -4.0
    cx = cz = 0.0
    for i in range(n):
        q = i / n
        sh = (h + 4) / n * rnd.uniform(0.7, 1.3)
        wk = w * (1.0 - 0.62 * q) * rnd.uniform(0.82, 1.18)
        cx += lean * sh + rnd.uniform(-0.1, 0.1) * wk
        cz += rnd.uniform(-0.12, 0.12) * wk
        blob(b, (cx, y + sh / 2, cz), (wk, sh / 2 + 1.5, wk * rnd.uniform(0.6, 0.95)), rock_col(seed + i * 5, haze=haze * (0.3 + 0.7 * q), strata=0.8, moss_amt=0.25),
             nu=12, nv=6, e=2.6, amp=0.4, seed=seed + i, rot=rnd.uniform(0, 3))
        if i in (1, 3):  # phiến nhô ngang như mái đá
            blob(b, (cx + wk * rnd.choice((-0.7, 0.7)), y + sh * 0.9, cz), (wk * 0.9, sh * 0.2, wk * 0.5), rock_col(seed + i * 9, haze=haze * (0.3 + 0.7 * q), strata=1.1, moss_amt=0.1),
                 nu=10, nv=5, e=2.8, amp=0.3, seed=seed + 30 + i, rot=rnd.uniform(0, 3))
        y += sh * 0.86
    # đỉnh gãy nhọn lệch
    blob(b, (cx + lean * 3, y + 0.1 * h, cz), (w * 0.2, 0.2 * h, w * 0.17), rock_col(seed + 99, haze=haze, strata=0.8, moss_amt=0.0), nu=8, nv=6, e=1.4, amp=0.35, seed=seed + 98, v0=0.0, v1=0.6)


# ---------- vật rải ----------


def grave(b, seed):
    rnd = random.Random(seed)
    s = rnd.uniform(0.9, 1.4)
    blob(b, (0, 0.3 * s, 0), (2.4 * s, 0.9 * s, 1.6 * s), soil_col(seed), nu=14, nv=7, seed=seed, v0=0.0, v1=0.5, amp=0.2)
    # bia nghiêng nửa vùi
    b.box(0, 0.9 * s, -1.4 * s, 0.9 * s, 1.8 * s, 0.3 * s, Paint(C(0x6A7480), 'stone'), yaw=rnd.uniform(-0.3, 0.3))
    for k in range(2):
        b.box(rnd.uniform(-1, 1) * s, 0.5 * s, rnd.uniform(-0.2, 1) * s, 0.5 * s, 0.9 * s, 0.1 * s, PAPER)
    # kiếm gãy cắm đầu mộ
    b.box(0.2 * s, 0.9 * s, 0.4 * s, 0.14 * s, 1.8 * s, 0.05 * s, Paint(STEEL_DK, 'steel'), yaw=0.4)


def stele(b, seed):
    rnd = random.Random(seed)
    h = rnd.uniform(5.5, 9.0)
    w = h * 0.22
    col = rock_col(seed, strata=1.5)
    blob(b, (0, -0.2, 0), (w * 1.5, 0.8, w * 1.5), col, nu=10, nv=5, e=1.8, amp=0.2, seed=seed, v0=0.0, v1=0.55)
    blob(b, (0, h * 0.5, 0), (w * 0.62, h * 0.5, w * 0.28), col, nu=10, nv=8, e=2.2, amp=0.12, seed=seed + 1)
    # đỉnh gãy: mảnh vỡ trên đất
    blob(b, (w * 1.2, 0.5, w * 0.8), (w * 0.5, 0.5, w * 0.3), col, nu=8, nv=5, e=2.0, amp=0.2, seed=seed + 2)
    for k in range(6):  # nét khắc chữ phát sáng yếu
        b.box(0, h * (0.25 + 0.1 * k), w * 0.3, w * 0.6, 0.12, 0.08, RUNE if k % 3 == 0 else Paint(C(0x242A32), 'stone'))


def pillar(b, seed):
    rnd = random.Random(seed)
    h = rnd.uniform(4.5, 8.0)
    r = h * 0.15
    col = rock_col(seed, strata=1.2)
    blob(b, (0, -0.1, 0), (r * 1.6, 0.6, r * 1.6), col, nu=12, nv=5, e=1.4, amp=0.15, seed=seed, v0=0.0, v1=0.55)
    rod(b, (0, 0.2, 0), (rnd.uniform(-0.2, 0.2), h, rnd.uniform(-0.2, 0.2)), r, r * 0.88, col, nu=12, nv=7, seed=seed + 1, amp=0.12)
    # đỉnh gãy lởm chởm
    blob(b, (0, h + 0.1, 0), (r * 0.9, 0.5, r * 0.9), col, nu=10, nv=4, e=1.5, amp=0.4, seed=seed + 2, v0=0.0, v1=0.5)
    # đoạn cột đổ nằm
    rod(b, (r * 2.0, r * 0.9, 1.5), (r * 2.0 + h * 0.55, r * 0.9, 1.5 + h * 0.2), r * 0.95, r * 0.9, col, nu=12, nv=5, seed=seed + 3, amp=0.1)


def steps(b, seed):
    rnd = random.Random(seed)
    col = rock_col(seed, strata=0.0)
    for k in range(5):
        w = 7.0 - k * 0.9
        blob(b, (rnd.uniform(-0.2, 0.2), 0.22 + k * 0.36, 0), (w, 0.26, 2.2 - k * 0.2), col, nu=12, nv=4, e=2.4, amp=0.16, seed=seed + k, v0=0.0, v1=0.5)
    for k in range(4):  # bậc vỡ lăn
        blob(b, (rnd.uniform(-5, 5), 0.2, rnd.uniform(1.8, 4)), (rnd.uniform(0.5, 1.1), 0.35, rnd.uniform(0.4, 0.8)), col, nu=8, nv=5, e=1.8, amp=0.25, seed=seed + 9 + k)


def bones(b, seed):
    rnd = random.Random(seed)
    # lồng ngực: các cung xương sườn
    for k in range(7):
        z = -0.5 + k * 0.35
        rr = 0.45 - abs(k - 3) * 0.05
        pts = [(math.cos(t) * rr, 0.0 + math.sin(t) * rr * 0.9 - 0.05, z) for t in [i / 9 * math.pi for i in range(10)]]
        for a_, c_ in zip(pts, pts[1:]):
            rod(b, a_, c_, 0.045, 0.04, bone_col, nu=6, nv=1, seed=seed + k)
    rod(b, (0, 0.1, -0.6), (0, 0.1, 1.2), 0.07, 0.06, bone_col, nu=6, nv=3, seed=seed)  # cột sống
    # sọ + hai hốc mắt
    blob(b, (1.4, 0.2, 0.6), (0.28, 0.24, 0.3), bone_col, nu=10, nv=7, seed=seed + 4)
    b.box(1.33, 0.25, 0.82, 0.08, 0.08, 0.05, Paint(C(0x15181D), 'stone'))
    b.box(1.47, 0.25, 0.82, 0.08, 0.08, 0.05, Paint(C(0x15181D), 'stone'))
    # xương dài + giáo gãy
    rod(b, (-1.2, 0.07, 0.4), (-2.0, 0.07, -0.3), 0.06, 0.05, bone_col, nu=6, nv=2, seed=seed + 5)
    rod(b, (-0.5, 0.1, 1.4), (1.0, 0.12, 2.6), 0.05, 0.045, metal_col(seed + 6, 0.8), nu=6, nv=2, seed=seed + 6)


def armor(b, seed):
    rnd = random.Random(seed)
    mc = metal_col(seed, 0.9)
    # mũ trụ úp (nửa cầu), tấm khiên tròn nghiêng, mảnh giáp lá
    blob(b, (0, 0.28, 0), (0.55, 0.45, 0.55), mc, nu=12, nv=7, seed=seed, v0=0.0, v1=0.52, amp=0.1)
    rod(b, (0.5, 0.45, 0.2), (0.55, 0.52, 0.3), 0.06, 0.03, mc, nu=6, nv=1)
    ang = rnd.uniform(0, 1)
    b.cylinder(1.5, 0.1, 0.2, 0.85, 0.1, BRONZE, 14, 0.8)
    for k in range(4):
        b.box(-1.2 + k * 0.25, 0.1, -0.8 + rnd.uniform(-0.2, 0.2), 0.34, 0.04, 0.22, Paint(mix(STEEL_DK, RUST, 0.7), 'metal'), yaw=rnd.uniform(0, 3))


def rune_blade(b, seed):
    """Kiếm trận nhỏ (vòng quanh đài chiến): lưỡi thép phát rãnh khí mảnh, tấm chắn, chuôi."""
    H = 5.0
    Lb = 2.6
    W = 0.22
    for q in range(8):
        y0, y1 = q / 8 * Lb, (q + 1) / 8 * Lb
        w0, w1 = W * (1 - 0.12 * q / 8), W * (1 - 0.12 * (q + 1) / 8)
        for side in (1, -1):
            t0, t1 = 0.06, 0.06
            b.poly([(-w0, y0, 0), (-w1, y1, 0), (0, y1, side * t1), (0, y0, side * t0)], (0, y0, 0), Paint(STEEL, 'steel'))
            b.poly([(w0, y0, 0), (0, y0, side * t0), (0, y1, side * t1), (w1, y1, 0)], (0, y0, 0), Paint(STEEL_DK, 'steel'))
        b.box(0, (y0 + y1) / 2, 0.065, 0.025, (y1 - y0) * (0.7 if q % 2 == 0 else 0.0), 0.012, RUNE)
        b.box(0, (y0 + y1) / 2, -0.065, 0.025, (y1 - y0) * (0.7 if q % 2 == 0 else 0.0), 0.012, RUNE)
    b.box(0, Lb, 0, 1.0, 0.1, 0.18, BRONZE)
    b.box(0, Lb + 0.5, 0, 0.08, 0.9, 0.08, LEATHER)
    blob(b, (0, Lb + 1.0, 0), (0.1, 0.1, 0.1), metal_col(seed, 0.3), nu=8, nv=5)
    blob(b, (0, 0.0, 0), (0.7, 0.18, 0.7), rock_col(seed, strata=0.0), nu=10, nv=5, e=1.5, amp=0.25, seed=seed, v0=0.0, v1=0.55)


# ---------- sắp đặt ----------

SEED = 20261119


def place(name, mesh, x, z, yaw=0.0, scale=1.0, lean=0.0, lean_yaw=0.0):
    obj = bpy.data.objects.new(name, mesh)
    obj.location = (x, -z, 0.0)
    lx, ly = lean * math.cos(lean_yaw), lean * math.sin(lean_yaw)
    obj.rotation_euler = (lx, ly, -yaw)
    obj.scale = (scale, scale, scale)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def keep_out(x, z, min_r=30.0):
    return math.hypot(x, z) < min_r or (abs(x) < 9 and z > 0)


def dome_h(r):
    return 110.0 * math.sqrt(max(0.0, 1.0 - (r / 170.0) ** 2))


def build_all():
    rnd = random.Random(SEED)
    variants = {}  # tên -> builder
    ref = 40.0
    for i, (broken, sd) in enumerate(((False, 11), (False, 12), (True, 13), (True, 14))):
        b = new_b(sd)
        giant_sword(b, ref, broken, sd)
        variants[f'giant{i}'] = b
    sp = []
    for hz in range(3):  # ba lớp xa dần: lớp xa nhạt và ngả lam (sương xa)
        for i in range(3):
            b = new_b(200 + i + hz * 10)
            spire(b, 40.0, 9.0 + 2.5 * i, (0.0, 0.32, 0.55)[hz], 300 + i * 7)
            variants[f'spire{hz}_{i}'] = b
    for i in range(3):
        b = new_b(400 + i)
        grave(b, 400 + i)
        variants[f'grave{i}'] = b
    for i in range(3):
        b = new_b(420 + i)
        stele(b, 420 + i)
        variants[f'stele{i}'] = b
    for i in range(3):
        b = new_b(440 + i)
        pillar(b, 440 + i)
        variants[f'pillar{i}'] = b
    b = new_b(460)
    steps(b, 460)
    variants['steps'] = b
    for i in range(3):
        b = new_b(470 + i)
        bones(b, 470 + i)
        variants[f'bones{i}'] = b
    for i in range(3):
        b = new_b(480 + i)
        armor(b, 480 + i)
        variants[f'armor{i}'] = b
    b = new_b(490)
    rune_blade(b, 490)
    variants['runeblade'] = b
    return variants, rnd


def run(out):
    bs.make_textures()
    variants, rnd = build_all()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = ts.materials_for(list(variants.values()))
    meshes = {k: ts.make_mesh(f'kt_{k}', b, keys, images, bevel=False) for k, b in variants.items()}
    n_obj = 0

    def put(kind, var, x, z, **kw):
        nonlocal n_obj
        place(f'kt_{kind}_{n_obj}', meshes[var], x, z, **kw)
        n_obj += 1

    # Cự kiếm: một thanh 62 m ở bắc (đối diện lối vào), hai thanh gãy ở hai bên, còn lại rải vành ngoài.
    giants = [(-6, -122, 62, 0), (52, -108, 38, 2), (-64, -100, 44, 3)]
    for i in range(15):
        a = i / 15 * math.tau + rnd.uniform(-0.15, 0.15)
        r = 96 + rnd.uniform(0, 40)
        x, z = math.cos(a) * r, math.sin(a) * r
        if keep_out(x, z, 80) or any(math.hypot(g[0] - x, g[1] - z) < 28 for g in giants):
            continue
        h = 14 + rnd.uniform(0, 24)
        giants.append((x, z, h, rnd.choice((0, 1, 2, 3))))
    for x, z, h, v in giants:
        r = math.hypot(x, z)
        h = min(h, dome_h(r) * 0.95)
        put('giant', f'giant{v}', x, z, yaw=rnd.uniform(0, 6.28), scale=h / 40.0, lean=rnd.uniform(0.03, 0.14), lean_yaw=rnd.uniform(0, 6.28))
    # Vành núi đá nhiều tầng: ba lớp, lớp xa nhạt dần (độ xa ép màu qua `haze` ở client? ở đây chỉ khác kích cỡ).
    for ring, (r0, r1, cnt, hf) in enumerate(((118, 134, 22, 0.38), (136, 150, 26, 0.55), (150, 160, 22, 0.8))):
        for i in range(cnt):
            a = (i + rnd.uniform(0, 1)) / cnt * math.tau
            r = rnd.uniform(r0, r1)
            x, z = math.cos(a) * r, math.sin(a) * r
            h = dome_h(r) * hf * rnd.uniform(0.6, 1.0)
            put('spire', f'spire{ring}_{rnd.randrange(3)}', x, z, yaw=rnd.uniform(0, 6.28), scale=h / 40.0 * rnd.uniform(0.9, 1.1))
    # Vật rải quanh bãi kiếm.
    def scatter(kind, var_fmt, cnt, r_min, r_max, scale=(0.9, 1.3), nvar=3):
        got = 0
        while got < cnt:
            a = rnd.uniform(0, math.tau)
            r = r_min + (r_max - r_min) * math.sqrt(rnd.random())
            x, z = math.cos(a) * r, math.sin(a) * r
            if keep_out(x, z, 30.0):
                continue
            v = var_fmt.format(rnd.randrange(nvar)) if '{}' in var_fmt else var_fmt
            put(kind, v, x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(*scale))
            got += 1

    scatter('grave', 'grave{}', 44, 36, 105, (1.0, 1.7))
    scatter('stele', 'stele{}', 20, 40, 108)
    scatter('pillar', 'pillar{}', 16, 44, 110)
    scatter('steps', 'steps', 4, 52, 90, (1.0, 1.4))
    scatter('bones', 'bones{}', 44, 32, 108, (1.5, 2.4))
    scatter('armor', 'armor{}', 36, 32, 108, (1.6, 2.6))
    # Vòng tám kiếm trận quanh đài chiến (khớp vòng khắc sàn r ≈ 59).
    for i in range(8):
        a = i / 8 * math.tau + math.pi / 8
        x, z = math.cos(a) * 59, math.sin(a) * 59
        if abs(x) < 9 and z > 0:
            continue
        put('runeblade', 'runeblade', x, z, yaw=a, scale=1.2, lean=0.04, lean_yaw=a)
    ts.export_glb(out)
    size, prims, tris, doc = bs.inspect(out)
    print(f'[kiem_trung] {out}: {size / 1024:.0f} KB, {n_obj} vật, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)})')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_kiem_trung.glb')
