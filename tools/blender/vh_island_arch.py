# Chân đảo bay Vân Hải (POLISH-1): khối đá treo dưới đảo dựng bằng Blender, thay khối xoay (lathe) trong client.
# Mỗi object tên `vhrock_<kind>` (kind = bản sắc đảo ở vanHaiArt.ts) hoặc `vhfake_<a|b>` (đảo giả, có mặt cỏ trên). Gốc = tâm mặt đảo (y = 0), nhìn xuống −y.
# Dáng: thân phình ở mép rồi thu về mũi đá; vân tầng trầm tích (mỗi tầng một độ nhô riêng, gờ gãy, nứt dọc), thạch nhũ nhọn rủ xuống từ bụng, rễ cây
# cong thòng dọc vách và rơi tự do. Màu đỉnh: đá xám ấm ↔ nâu ↔ nâu vàng theo tầng, rêu ở mặt ngửa, tối dần xuống mũi, vành cỏ ở mép trên.
#
#   blender --background --python tools/blender/vh_island_arch.py -- assets/build/raw/arch_vh_island.glb
#
# Hệ trục khi dựng: x, z ngang, y lên (như glTF); chuyển sang Blender (x, −z, y) lúc tạo đỉnh.

import math
import os
import random
import sys

import bpy
import bmesh

SEED = 20261120

# (R danh nghĩa, amp, belly, len, spikes, roots): khớp `SKIRT` ở skyIslands.ts
KINDS = {
    'hub': (85.0, 1.0, 1.0, 1.0, 1.0, 1.0),
    'tung_dai_dao': (207.0, 1.1, 1.0, 1.0, 0.7, 2.2),
    'thach_quy_dao': (207.0, 0.8, 1.14, 0.78, 0.5, 0.3),
    'kinh_ho_dao': (207.0, 0.65, 1.05, 0.9, 0.4, 1.2),
    'loi_van_dao': (207.0, 1.9, 0.92, 1.05, 2.4, 0.3),
    'kinh_ngu_dai': (207.0, 1.3, 0.9, 1.3, 1.4, 0.8),
    'tieu_dao': (40.0, 1.2, 1.0, 0.9, 0.8, 1.0),
}


def lin(h):
    def c(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    return (c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255))


def mixc(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x * (1 - t) + y * t for x, y in zip(a, b))


C_B = lin(0x8D857A)  # đá xám ấm
C_MID = lin(0x6B5A4A)  # đá nâu
C_OCHRE = lin(0xA58B68)
C_D = lin(0x5A524A)  # đá tối ở mũi
C_MOSS = lin(0x56703F)
C_GRASS = lin(0x7A8460)
C_GRASS_FAKE = lin(0x6F9D58)
C_ROOT = lin(0x3A2E24)
C_ROOT_L = lin(0x5E4A36)


def hsh(a, b, c, sd):
    n = int(a) * 374761393 + int(b) * 668265263 + int(c) * 2147483647 + int(sd) * 1274126177
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFF) / 16777215.0


def nz(x, y, z, sd):
    xi, yi, zi = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - xi, y - yi, z - zi

    def sm(t):
        return t * t * (3 - 2 * t)

    ux, uy, uz = sm(fx), sm(fy), sm(fz)

    def h(a, b, c):
        return hsh(xi + a, yi + b, zi + c, sd)

    def l(a, b, t):
        return a + (b - a) * t

    return l(
        l(l(h(0, 0, 0), h(1, 0, 0), ux), l(h(0, 1, 0), h(1, 1, 0), ux), uy),
        l(l(h(0, 0, 1), h(1, 0, 1), ux), l(h(0, 1, 1), h(1, 1, 1), ux), uy),
        uz,
    )


def ridged(x, y, z):
    s, amp, f = 0.0, 0.55, 1.0
    for o in range(3):
        s += amp * (1 - abs(2 * nz(x * f, y * f, z * f, 700 + o * 31) - 1))
        amp *= 0.5
        f *= 2.2
    return s


class Mesh:
    def __init__(self):
        self.v, self.f, self.c = [], [], []

    def vert(self, p, col):
        self.v.append(p)
        self.c.append(col)
        return len(self.v) - 1

    def quad(self, a, b, c, d):
        self.f.append((a, b, c, d))

    def tri(self, a, b, c):
        self.f.append((a, b, c))


def catmull(pts, n):
    """Spline Catmull-Rom qua các điểm (r, y), lấy n mẫu đều theo tham số."""
    out = []
    m = len(pts) - 1
    for k in range(n + 1):
        t = k / n * m
        i = min(int(t), m - 1)
        u = t - i
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, m)]
        out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u * u + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u**3) for j in range(2)))
    return out


# (hệ số sâu D/R) theo bản sắc: đảo là khối đá hình NÓN NGƯỢC, mũi nhọn sâu D = hệ số × R (~1–1,5× nửa bề rộng... đủ dốc để phần nổi trên biển mây đã thu hẹp rõ)
DEPTHK = {'hub': 1.1, 'tung_dai_dao': 1.2, 'thach_quy_dao': 0.85, 'kinh_ho_dao': 1.0, 'loi_van_dao': 1.35, 'kinh_ngu_dai': 1.5, 'tieu_dao': 1.5}

# hình nón ngược: (r/R, độ sâu/D); mép trên hơi phình (lip) rồi thu nhanh về mũi
CONE = [
    (0.97, 0.0), (1.015, 0.002), (1.03, 0.008), (1.035, 0.018), (1.0, 0.03), (0.9, 0.06), (0.78, 0.1), (0.66, 0.16), (0.55, 0.23), (0.45, 0.31),
    (0.35, 0.42), (0.26, 0.55), (0.17, 0.7), (0.09, 0.85), (0.03, 0.95), (0.0, 1.0),
]


def blob(M, rnd, cx, cy, cz, rx, ry, rz, seed, lat=7, lon=10, flat_top=False):
    """Tảng đá méo: cầu có nhiễu, đáy nhọn hơn."""
    pole_t = M.vert((cx, cy + ry, cz), None)
    rows = []
    for i in range(1, lat):
        v = i / lat * math.pi
        row = []
        for j in range(lon):
            u = j / lon * math.tau
            dx, dy, dz = math.sin(v) * math.cos(u), math.cos(v), math.sin(v) * math.sin(u)
            k = 1.0 + (nz(dx * 2.3 + seed, dy * 2.3, dz * 2.3, 795) - 0.5) * 0.9
            if dy < 0:
                dy *= 1.0 + 0.5 * -dy
            if flat_top and dy > 0.6:
                dy = 0.6 + (dy - 0.6) * 0.3
            row.append(M.vert((cx + dx * rx * k, cy + dy * ry * k, cz + dz * rz * k), None))
        rows.append(row)
    pole_b = M.vert((cx, cy - ry * 1.5, cz), None)
    for j in range(lon):
        M.tri(pole_t, rows[0][(j + 1) % lon], rows[0][j])
    for i in range(len(rows) - 1):
        for j in range(lon):
            j2 = (j + 1) % lon
            M.quad(rows[i][j], rows[i][j2], rows[i + 1][j2], rows[i + 1][j])
    for j in range(lon):
        M.tri(pole_b, rows[-1][j], rows[-1][(j + 1) % lon])


def spike(M, cx, cz, y0, length, wid, lean, i, nsd=7, nrr=7, dirx=1.0, dirz=0.0):
    prev = None
    for q in range(nrr + 1):
        t = q / nrr
        w = wid * (1.0 - t) ** 0.85 * (1 + 0.35 * math.sin(t * 9 + i)) * (1.5 if q == 0 else 1.0)
        y = y0 - t * length
        ox = cx + dirx * lean * (y0 - y)
        oz = cz + dirz * lean * (y0 - y)
        ring = []
        for s in range(nsd):
            th = s / nsd * math.tau
            nzv = 1 + 0.35 * (nz(math.cos(th) * 3 + i, y * 0.3, math.sin(th) * 3, 760) - 0.5)
            ring.append(M.vert((ox + math.cos(th) * w * nzv, y, oz + math.sin(th) * w * nzv), None))
        if prev:
            for s in range(nsd):
                s2 = (s + 1) % nsd
                M.quad(prev[s], prev[s2], ring[s2], ring[s])
        prev = ring
        if q == nrr:
            tipv = M.vert((ox, y - w * 0.8 - 0.5, oz), None)
            for s in range(nsd):
                M.tri(ring[s], ring[(s + 1) % nsd], tipv)


def island(name, R, amp, belly, dk, spikes, roots, seed, fake=False, seg=96, nr=72):
    rnd = random.Random(seed)
    M = Mesh()
    D = dk * R
    sf = max(0.35, R / 207.0)  # co các chi tiết lớn theo cỡ đảo
    pts = [(dd, rr * (belly if rr < 0.9 else 1.0)) for rr, dd in CONE]

    def r_at(dd):
        # nội suy Hermite theo độ sâu (biến độc lập) nên đường biên không thể tự cắt/gập thành vạt như spline theo tham số
        for k in range(len(pts) - 1):
            if pts[k][0] <= dd <= pts[k + 1][0]:
                x0, y0 = pts[k]
                x1, y1 = pts[k + 1]
                h = max(1e-6, x1 - x0)
                t = (dd - x0) / h
                m0 = (y1 - pts[k - 1][1]) / max(1e-6, x1 - pts[k - 1][0]) if k > 0 else (y1 - y0) / h
                m1 = (pts[k + 2][1] - y0) / max(1e-6, pts[k + 2][0] - x0) if k + 2 < len(pts) else (y1 - y0) / h
                v = (2 * t**3 - 3 * t**2 + 1) * y0 + (t**3 - 2 * t**2 + t) * h * m0 + (-2 * t**3 + 3 * t**2) * y1 + (t**3 - t**2) * h * m1
                return min(max(v, min(y0, y1) - 0.04), max(y0, y1) + 0.04)
        return pts[-1][1]

    # mép trên: vành đá nhô ra (R+6 ở độ sâu 9 m) che phần vách địa hình rủ xuống từ mép đảo, rồi chuyển dần (m 10–26) sang thân nón
    lipt = [(0.0, -4.0), (0.1, 3.0), (1.2, 4.5), (4.0, 5.5), (9.0, 6.0), (14.0, 3.0), (30.0, 3.0)]

    def lip_r(m):
        for k in range(len(lipt) - 1):
            if lipt[k][0] <= m <= lipt[k + 1][0]:
                t = (m - lipt[k][0]) / (lipt[k + 1][0] - lipt[k][0])
                return R + lipt[k][1] * (1 - t) + lipt[k + 1][1] * t
        return R + 3.0

    sp = []
    for k in range(nr + 1):
        dd = (k / nr) ** 1.7
        m = D * dd
        if m <= 14.0:
            rr = lip_r(m)
        else:
            # thân nón ngược: phần nổi trên biển mây (~40 m đầu) đã thu về ~22% bán kính (dốc rõ), phần còn lại thon dài về mũi nhọn sâu D
            Hv = min(0.6 * D, 36.0 + 0.1 * R)
            if m < 14.0 + Hv:
                u = (m - 14.0) / Hv
                rr = (R + 3.0) * (1.0 - 0.78 * u**0.85)
            else:
                u = (m - 14.0 - Hv) / max(1.0, D - 14.0 - Hv)
                rr = (R + 3.0) * 0.22 * (1.0 - u**0.9)
            rr *= 1.0 + (belly - 1.0) * math.sin(math.pi * min(1.0, (m - 14.0) / max(1.0, 14.0 + Hv + 30.0)))
        sp.append((max(0.01, rr), -m))
    sdh = seed % 997
    layer_off = {}

    def layer_push(y):
        k = int(math.floor(-y / 4.4))
        if k not in layer_off:
            layer_off[k] = (rnd.random() - 0.5) * 3.2
        return layer_off[k]

    rings = []
    for (r0, y0) in sp:
        ring = []
        depth = min(1.0, -y0 / D)
        taper = min(1.0, r0 / (0.3 * R))
        for j in range(seg):
            th = j / seg * math.tau
            x0, z0 = math.cos(th) * r0, math.sin(th) * r0
            rid = ridged(x0 * 0.045 + sdh, y0 * 0.07, z0 * 0.045)
            ledge_t = y0 / 4.4 + nz(x0 * 0.03, y0 * 0.01, z0 * 0.03, 710) * 1.6
            ledge = (ledge_t - math.floor(ledge_t)) ** 2.2
            fine = nz(x0 * 0.22 + sdh, y0 * 0.35, z0 * 0.22, 730) - 0.5
            groove = nz(th * 5.5 + sdh, y0 * 0.05, 3.3, 720) - 0.5
            crack = max(0.0, 1.0 - abs(nz(th * 17.0 + sdh, y0 * 0.04, 8.1, 740) - 0.5) * 9.0)
            # khối nhô/lõm lệch nhau: nhiễu tần rất thấp theo góc + độ sâu (vài khối lớn lồi hẳn, vài chỗ khoét vào)
            big = (nz(math.cos(th) * 1.5 + sdh, depth * 3.2, math.sin(th) * 1.5, 790) - 0.5) * 2 * 0.22 * r0
            mid = (nz(math.cos(th) * 4.0 + sdh, depth * 9.0, math.sin(th) * 4.0, 791) - 0.5) * 2 * 0.07 * r0
            push = ((rid - 0.45) * 17 + ledge * 9 + groove * 7 + fine * 3.4 + layer_push(y0) * 2.6 - crack * 3.0) * amp * sf**0.5 * (0.3 + depth * 0.9)
            ramp = min(1.0, depth / 0.08)
            ramp = ramp * ramp * (3 - 2 * ramp)  # mép trên giữ tròn đều (khớp mặt đảo), nhô/lõm tăng dần khi xuống: không còn bậc nhô đột ngột thành vạt
            push = (push + big + mid) * taper * ramp
            r = max(0.01, r0 + push) if r0 > 0.02 else 0.01
            yy = y0 + (rid - 0.4) * 3 * depth * sf
            ring.append((math.cos(th) * r, yy, math.sin(th) * r, th, r, depth))
        rings.append(ring)

    def prof_r(y):
        for k in range(len(sp) - 1):
            if sp[k][1] >= y >= sp[k + 1][1]:
                t = (sp[k][1] - y) / max(1e-6, sp[k][1] - sp[k + 1][1])
                return sp[k][0] * (1 - t) + sp[k + 1][0] * t
        return sp[-1][0]

    idx = [[M.vert((x, y, z), None) for (x, y, z, th, r, depth) in ring] for ring in rings]
    for k in range(len(rings) - 1):
        for j in range(seg):
            j2 = (j + 1) % seg
            M.quad(idx[k][j], idx[k][j2], idx[k + 1][j2], idx[k + 1][j])
    if fake:  # mặt cỏ trên: vài vòng đồng tâm gồ nhẹ, màu cỏ loang
        top_r = rings[0]
        grid = [[M.vert((x, 0.0, z), None) for (x, y, z, th, r, d) in top_r]]
        for kk in (0.66, 0.33, 0.0):
            ringv = []
            for j, (x, y, z, th, r, d) in enumerate(top_r):
                h = (nz(x * 0.15 * (1 - kk) + seed, 0.5, z * 0.15 * (1 - kk), 770) - 0.5) * 2.4 + 0.5 * (1 - kk)
                ringv.append(M.vert((x * kk, h, z * kk), None) if kk > 0 else None)
            if kk == 0:
                c = M.vert((0.0, 0.9, 0.0), None)
                for j in range(seg):
                    M.tri(c, grid[-1][(j + 1) % seg], grid[-1][j])
            else:
                for j in range(seg):
                    j2 = (j + 1) % seg
                    M.quad(grid[-1][j], grid[-1][j2], ringv[j2], ringv[j])
                grid.append(ringv)
    ss = max(0.4, sf**0.5)
    # ---- khối đá nhô ra từ thân (nửa chìm vào vách): sườn nón gồ ghề, mỗi nơi một kiểu ----
    for i in range(int((9 + R / 20) * (0.5 if fake else 1.0))):
        d = 0.12 + rnd.random() * 0.55
        y = -D * d
        a = rnd.random() * math.tau
        rr = prof_r(y) * 0.97
        sz = (11 + rnd.random() * 26) * ss
        blob(M, rnd, math.cos(a) * rr, y, math.sin(a) * rr, sz * (0.8 + rnd.random() * 0.8), min(sz * (0.5 + rnd.random() * 0.6), -y * 0.6), sz * (0.8 + rnd.random() * 0.8), seed + i, flat_top=True)
    # ---- tảng đá treo lủng lẳng bên ngoài, nối bằng dây đá ở trên ----
    for i in range(int((4 + R / 40) * spikes * (0.6 if fake else 1.0)) + 2):
        d = 0.10 + rnd.random() * 0.5
        y = -D * d - 8 * ss
        a = rnd.random() * math.tau
        rr = prof_r(y) + (6 + rnd.random() * 12) * ss
        sz = (6 + rnd.random() * 13) * ss
        blob(M, rnd, math.cos(a) * rr, y - sz, math.sin(a) * rr, sz, sz * 1.1, sz * 0.9, seed + 50 + i, lat=6, lon=8)
        spike(M, math.cos(a) * rr * 0.97, math.sin(a) * rr * 0.97, y + sz * 1.6 + 5 * ss, sz * 2 + 8 * ss, 0.9 * ss, 0.0, i + 200, nsd=6, nrr=4)
    # ---- gai đá/thạch nhũ nhọn bám sườn nón (nghiêng vào trong theo độ dốc, không thành vây thẳng đứng chìa ra ngoài) ----
    for i in range(int((10 + R / 18) * spikes * 1.5 * (0.5 if fake else 1.0))):
        a = rnd.random() * math.tau
        d = 0.14 + rnd.random() * 0.55
        dy = -D * d
        rr = prof_r(dy) * 0.96
        slope = max(0.2, (prof_r(dy + 6) - prof_r(dy - 6)) / 12.0)  # độ co bán kính theo độ sâu
        length = (20 + rnd.random() * 50 * amp) * ss * 1.4
        wid = (1.6 + rnd.random() * 3.4) * ss
        spike(M, math.cos(a) * rr, math.sin(a) * rr, dy, length, wid, min(1.2, slope * 0.85), i, dirx=-math.cos(a), dirz=-math.sin(a))
    n_start = len(M.v)

    # ---- rễ cây to buông từ mép, uốn cong rồi rơi tự do; thêm rễ phụ mảnh ----
    def root(a, y0, length, rad0, out, wob, nsd=7, N=14):
        r0 = prof_r(y0) * 0.99
        prev = None
        for q in range(N + 1):
            t = q / N
            rr = r0 + out * math.sin(min(1.0, t * 1.5) * math.pi / 2) * (1 - 0.3 * t)
            th = a + 0.03 * math.sin(t * 5 + wob)
            p = (math.cos(th) * rr, y0 - t * length, math.sin(th) * rr)
            w = rad0 * (1 - t) ** 0.75 * (1.0 + 0.25 * math.sin(t * 7 + wob)) + 0.04
            ring = [M.vert((p[0] + math.cos(s / nsd * math.tau) * w, p[1], p[2] + math.sin(s / nsd * math.tau) * w), None) for s in range(nsd)]
            if prev:
                for s in range(nsd):
                    s2 = (s + 1) % nsd
                    M.quad(prev[s], prev[s2], ring[s2], ring[s])
            prev = ring

    for i in range(int((5 + R / 45) * roots * (0.6 if fake else 1.0)) + 2):
        a = rnd.random() * math.tau
        root(a, -(1 + rnd.random() * 9) * ss, (40 + rnd.random() * 55) * ss * (1.2 if roots > 1 else 1.0), (2.0 + rnd.random() * 2.2) * (0.45 + 0.55 * sf**0.5), (2 + rnd.random() * 7) * ss, rnd.random() * 6)
    for i in range(int((8 + R / 25) * roots * (0.6 if fake else 1.0))):
        a = rnd.random() * math.tau
        root(a, -(1 + rnd.random() * 16) * ss, (16 + rnd.random() * 34) * ss, (0.55 + rnd.random() * 0.6) * (0.5 + 0.5 * sf**0.5), (1 + rnd.random() * 5) * ss, rnd.random() * 6, nsd=6)

    # ---- màu đỉnh ----
    bm = bmesh.new()
    bverts = [bm.verts.new((p[0], -p[2], p[1])) for p in M.v]
    bm.verts.ensure_lookup_table()
    for f in M.f:
        try:
            bm.faces.new([bverts[i] for i in f])
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    cols = {}
    for i, v in enumerate(bm.verts):
        gx, gy, gz = M.v[i]
        ny = v.normal.z  # Blender z = glTF y
        depth = min(1.0, -gy / D)
        if i >= n_start:  # rễ
            col = mixc(C_ROOT, C_ROOT_L, hsh(i // 7, 3, 5, seed) * 0.7)
        elif gy > -0.4 and fake:
            n = nz(gx * 0.12, 0.3, gz * 0.12, 780)
            col = mixc(lin(0x3C6334), lin(0x66854A), n)
            if hsh(int(gx * 0.5), int(gz * 0.5), 3, seed) > 0.93:
                col = mixc(col, C_B, 0.8)
        else:
            band = hsh(int(math.floor(gy / 2.4)), seed % 997, 61, 5)
            col = mixc(C_B, C_MID, band * 0.7)
            if band > 0.75:
                col = mixc(col, C_OCHRE, 0.45)
            col = mixc(col, C_D, depth * 0.75)
            k = 0.72 + band * 0.55
            col = tuple(c * k for c in col)
            if gy > -1.4:
                col = mixc(col, C_GRASS_FAKE if fake else C_GRASS, min(1.0, (gy + 1.4) / 1.4))
            elif ny > 0.55 and hsh(int(math.floor(gy / 1.7)), int(math.atan2(gz, gx) * 6), seed, 9) > 0.4:
                col = mixc(col, C_MOSS, min(0.85, (ny - 0.55) * 1.8) * (1 - depth * 0.6))
        cols[v.index] = col
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        c = cols.get(v.index, (0.5, 0.5, 0.5))
        ca.data[v.index].color = (c[0], c[1], c[2], 1.0)
    for p in me.polygons:
        p.use_smooth = True
    bm.free()
    mat = bpy.data.materials.get('vhrock') or bpy.data.materials.new('vhrock')
    mat.use_nodes = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return len(me.polygons)


def run(out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    tot = 0
    for i, (kind, (R, amp, belly, ln, spikes, roots)) in enumerate(KINDS.items()):
        t = island(f'vhrock_{kind}', R, amp, belly, DEPTHK[kind], spikes, roots, SEED + i * 101, seg=96 if R > 100 else 72, nr=84 if R > 100 else 56)
        tot += t
        print(f'[vh_island] vhrock_{kind}: {t} mặt')
    for i, nm in enumerate(('a', 'b')):
        t = island(f'vhfake_{nm}', 40.0, 1.1 + 0.3 * i, 1.0, 1.4 + 0.15 * i, 0.9, 0.6, SEED + 900 + i * 7, fake=True, seg=64, nr=44)
        tot += t
        print(f'[vh_island] vhfake_{nm}: {t} mặt')
    for i, (nm, R, dk) in enumerate((('a', 14.0, 1.5), ('b', 9.0, 1.7), ('c', 19.0, 1.3))):  # đảo đá nhỏ vệ tinh lơ lửng quanh đảo lớn (client rải bằng InstancedMesh)
        t = island(f'vhsat_{nm}', R, 1.0, 1.0, dk, 0.6, 0.5, SEED + 1300 + i * 11, fake=True, seg=40, nr=30)
        tot += t
        print(f'[vh_island] vhsat_{nm}: {t} mặt')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_vertex_color='ACTIVE', export_image_format='NONE')
    print(f'[vh_island] {out}: {tot} mặt')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_vh_island.glb')
