# Chân đảo bay Vân Hải (POLISH-1 v3): khối đá treo dưới đảo, dựng bằng Blender, thay khối xoay (lathe) trong client.
# Mỗi object `vhrock_<kind>` (kind = bản sắc đảo ở vanHaiArt.ts), `vhfake_<a|b>` (đảo giả), `vhsat_<a|b|c>` (đá vệ tinh = cùng bộ khối đá thu nhỏ, có cỏ trên đỉnh),
# `vhfall_<kind>` (dải nước mảnh, có UV để client cuộn). Gốc = tâm mặt đảo (y = 0), nhìn xuống −y.
#
# Dáng (theo góp ý v2): viền KHÔNG tròn đều (chu vi lồi lõm theo nhiễu, mũi đá nhô), vách đứng 8 m ngay dưới mép rồi thu dần; thân dưới là nón ngược LỆCH TÂM, cao ≥ bề rộng,
# thu nhanh như sừng (phần nổi trên biển mây đã hẹp rõ) rồi kéo dài thành đuôi nhọn; mặt đá do nhiều lớp chồng (vân tầng ngang, mỗi tầng một độ nhô), khối vỡ kiểu Worley,
# nứt dọc chữ V, ao tối ở khe; tảng đá treo; thạch nhũ NGẮN màu đá; rễ cây MẢNH nhiều nhánh buông thõng từ mép và dây leo xanh có lá (không cắm xuống mây); dải nước mảnh từ mép.
#
#   blender --background --python tools/blender/vh_island_arch.py -- assets/build/raw/arch_vh_island.glb
#
# Hệ trục khi dựng: x, z ngang, y lên (như glTF); chuyển sang Blender (x, −z, y) lúc tạo đỉnh.

import math
import os
import random
import sys

import bmesh
import bpy

SEED = 20261121

# (R danh nghĩa, amp, belly, spikes, roots, dk = D/R): khớp `SKIRT` ở skyIslands.ts; D (độ sâu mũi) ≥ bề rộng 2R
KINDS = {
    'hub': (85.0, 1.0, 1.0, 1.0, 1.0, 2.2),
    'tung_dai_dao': (207.0, 1.1, 1.0, 0.7, 2.2, 2.0),
    'thach_quy_dao': (207.0, 0.8, 1.14, 0.5, 0.5, 2.0),
    'kinh_ho_dao': (207.0, 0.65, 1.05, 0.4, 1.2, 2.0),
    'loi_van_dao': (207.0, 1.6, 0.92, 2.0, 0.5, 2.2),
    'kinh_ngu_dai': (207.0, 1.3, 0.9, 1.2, 0.8, 2.4),
    'tieu_dao': (40.0, 1.2, 1.0, 0.8, 1.0, 2.4),
}


def lin(h):
    def c(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    return (c((h >> 16) & 255), c((h >> 8) & 255), c(h & 255))


def mixc(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x * (1 - t) + y * t for x, y in zip(a, b))


C_B = lin(0x9A9084)  # đá xám ấm
C_MID = lin(0x76624E)  # đá nâu
C_OCHRE = lin(0xA88F6A)
C_D = lin(0x5E564D)  # đá sẫm ở đuôi (vẫn là màu đá, không đen)
C_MOSS = lin(0x5C7840)
C_GRASS = lin(0x7A8460)
C_ROOT = lin(0x4A3A2C)
C_ROOT_L = lin(0x6A5238)
C_VINE = lin(0x3F7A34)
C_LEAF = lin(0x3F7A30)


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


def worley(x, y, z, sd):
    """Khoảng cách tới điểm đặc trưng gần nhất (0..~1): mặt đá vỡ thành các khối/mặt phẳng."""
    xi, yi, zi = math.floor(x), math.floor(y), math.floor(z)
    best = 9.0
    for a in (-1, 0, 1):
        for b in (-1, 0, 1):
            for c in (-1, 0, 1):
                cx, cy, cz = xi + a, yi + b, zi + c
                px = cx + hsh(cx, cy, cz, sd)
                py = cy + hsh(cx, cy, cz, sd + 1)
                pz = cz + hsh(cx, cy, cz, sd + 2)
                d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2
                if d < best:
                    best = d
    return min(1.0, math.sqrt(best))


class Mesh:
    def __init__(self):
        self.v, self.f, self.tag = [], [], []
        self.cur = 'rock'

    def vert(self, p):
        self.v.append(p)
        self.tag.append(self.cur)
        return len(self.v) - 1

    def quad(self, a, b, c, d):
        self.f.append((a, b, c, d))

    def tri(self, a, b, c):
        self.f.append((a, b, c))


def blob(M, cx, cy, cz, rx, ry, rz, seed, lat=9, lon=13, flat_top=False):
    """Tảng đá vỡ: cầu + nhiễu Worley (mặt phẳng/cạnh sắc) + chia tầng theo chiều cao, đáy nhọn; không phải icosphere trơn."""
    pole_t = M.vert((cx, cy + ry, cz))
    rows = []
    for i in range(1, lat):
        v = i / lat * math.pi
        row = []
        for j in range(lon):
            u = j / lon * math.tau
            dx, dy, dz = math.sin(v) * math.cos(u), math.cos(v), math.sin(v) * math.sin(u)
            w = worley(dx * 1.7 + seed, dy * 1.7, dz * 1.7, 797)
            k = 0.78 + 0.5 * w + (nz(dx * 3 + seed, dy * 3, dz * 3, 795) - 0.5) * 0.35
            dy2 = dy
            if dy2 < 0:
                dy2 *= 1.0 + 0.55 * -dy2
            q = round(dy2 * 4) / 4.0  # tầng ngang
            dy2 = dy2 * 0.6 + q * 0.4
            if flat_top and dy2 > 0.55:
                dy2 = 0.55 + (dy2 - 0.55) * 0.25
            row.append(M.vert((cx + dx * rx * k, cy + dy2 * ry * k, cz + dz * rz * k)))
        rows.append(row)
    pole_b = M.vert((cx, cy - ry * 1.5, cz))
    for j in range(lon):
        M.tri(pole_t, rows[0][(j + 1) % lon], rows[0][j])
    for i in range(len(rows) - 1):
        for j in range(lon):
            j2 = (j + 1) % lon
            M.quad(rows[i][j], rows[i][j2], rows[i + 1][j2], rows[i + 1][j])
    for j in range(lon):
        M.tri(pole_b, rows[-1][j], rows[-1][(j + 1) % lon])


def tube(M, pts, radii, nsd=5, tag='root'):
    """Ống nhiều đoạn theo đường cong, bán kính từng điểm; khung xoay đơn giản quanh trục đoạn."""
    M.cur = tag
    prev = None
    for q, p in enumerate(pts):
        nxt = pts[min(q + 1, len(pts) - 1)]
        prv = pts[max(q - 1, 0)]
        t = [nxt[k] - prv[k] for k in range(3)]
        ln = math.sqrt(sum(a * a for a in t)) or 1.0
        t = [a / ln for a in t]
        ref = (1.0, 0.0, 0.0) if abs(t[0]) < 0.9 else (0.0, 0.0, 1.0)
        e1 = [t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]]
        n1 = math.sqrt(sum(a * a for a in e1)) or 1.0
        e1 = [a / n1 for a in e1]
        e2 = [t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0]]
        ring = []
        for s in range(nsd):
            a = s / nsd * math.tau
            ring.append(M.vert(tuple(p[k] + (e1[k] * math.cos(a) + e2[k] * math.sin(a)) * radii[q] for k in range(3))))
        if prev:
            for s in range(nsd):
                s2 = (s + 1) % nsd
                M.quad(prev[s], prev[s2], ring[s2], ring[s])
        prev = ring
    M.cur = 'rock'


def spike(M, cx, cz, y0, length, wid, i, dirx=0.0, dirz=0.0, lean=0.0, nsd=6, nrr=5):
    prev = None
    for q in range(nrr + 1):
        t = q / nrr
        w = wid * (1.0 - t) ** 0.9 * (1 + 0.3 * math.sin(t * 8 + i)) * (1.4 if q == 0 else 1.0)
        y = y0 - t * length
        ox, oz = cx + dirx * lean * (y0 - y), cz + dirz * lean * (y0 - y)
        ring = []
        for s in range(nsd):
            th = s / nsd * math.tau
            nzv = 1 + 0.35 * (nz(math.cos(th) * 3 + i, y * 0.3, math.sin(th) * 3, 760) - 0.5)
            ring.append(M.vert((ox + math.cos(th) * w * nzv, y, oz + math.sin(th) * w * nzv)))
        if prev:
            for s in range(nsd):
                s2 = (s + 1) % nsd
                M.quad(prev[s], prev[s2], ring[s2], ring[s])
        prev = ring
        if q == nrr:
            tipv = M.vert((ox, y - w * 0.9 - 0.3, oz))
            for s in range(nsd):
                M.tri(ring[s], ring[(s + 1) % nsd], tipv)


def make_object(name, M, cols, uvs=None, mat_name='vhrock'):
    bm = bmesh.new()
    bverts = [bm.verts.new((p[0], -p[2], p[1])) for p in M.v]
    bm.verts.ensure_lookup_table()
    faces = []
    for f in M.f:
        try:
            faces.append(bm.faces.new([bverts[i] for i in f]))
        except ValueError:
            faces.append(None)
    if uvs is None:
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in me.vertices:
        c = cols[v.index] if v.index < len(cols) else (0.5, 0.5, 0.5)
        ca.data[v.index].color = (c[0], c[1], c[2], 1.0)
    if uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        for lp in me.loops:
            uvl.data[lp.index].uv = uvs[lp.vertex_index]
    for p in me.polygons:
        p.use_smooth = True
    mat = bpy.data.materials.get(mat_name) or bpy.data.materials.new(mat_name)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return len(me.polygons)


def island(name, R, amp, belly, spikes, roots, dk, seed, fake=False, seg=96, nr=84, sat=False, water=True):
    rnd = random.Random(seed)
    M = Mesh()
    D = dk * R
    sf = max(0.3, R / 207.0)
    ss = max(0.4, sf**0.5)
    sd = seed % 997
    tau = (20.0 + 0.1 * R) * belly  # độ dài thu hẹp (nón như sừng): phần nổi trên biển mây đã hẹp rõ
    phi = rnd.random() * math.tau
    drift = 0.26 * R * (0.7 + 0.6 * rnd.random())  # lệch tâm của đuôi
    layer_off = {}

    def lay(k):
        if k not in layer_off:
            layer_off[k] = (rnd.random() - 0.5) * 2.0
        return layer_off[k]

    def base_r(m):
        # vách rộng hơn mép địa hình (R + edge 12 → vách đảo trong heightAt kết thúc ở ~R+6): R + 10 để váy che hẳn vành địa hình, không còn lộ đĩa mỏng
        if m <= 8.0:
            return R + 10.0
        return (R + 10.0) * (0.05 + 0.95 * math.exp(-(m - 8.0) / tau))

    def surf(th, m):
        """Điểm trên mặt thân ở góc th, độ sâu m → (x, z, r, ao)."""
        rb = base_r(m)
        w8 = min(1.0, max(0.0, (m - 8.0) / 30.0))
        ramp = w8 * w8 * (3 - 2 * w8)
        cth, sth = math.cos(th), math.sin(th)
        # chu vi lồi lõm: nhiễu ba tầng + mũi đá nhô; giữ ≥ R+1 ở mép để không lộ vách địa hình
        rim = 1.0 + 9.0 * nz(cth * 1.7 + sd, 0.5, sth * 1.7, 810) + 6.0 * nz(cth * 4.1 + sd, 1.5, sth * 4.1, 811) + 15.0 * max(0.0, nz(cth * 6.3 + sd, 2.5, sth * 6.3, 812) - 0.62) ** 1.2 * 4.0
        rim *= ss
        cx = cz = 0.0
        if m > 8.0:
            dv = 1.0 - math.exp(-(m - 8.0) / (1.6 * tau))
            cx, cz = math.cos(phi) * drift * dv, math.sin(phi) * drift * dv
        low = (nz(cth * 1.3 + sd, m / tau * 0.7, sth * 1.3, 790) - 0.5) * 2.0
        r = rb * (1.0 + 0.34 * low * ramp) + rim * math.exp(-max(0.0, m - 8.0) / 22.0)
        x, z = cx + cth * r, cz + sth * r
        k = int(math.floor(m / 5.5))
        ledge = ((m / 5.5) % 1.0) ** 2.5
        wl = worley(x * 0.05 + sd, m * 0.07, z * 0.05, 820)
        chunk = (wl - 0.42) * 0.16 * r * ramp
        groove = max(0.0, 1.0 - abs(nz(th * 13.0 + sd, m * 0.03, 4.4, 830) - 0.5) * 7.0) ** 1.4
        fine = (ridged(x * 0.05 + sd, m * 0.08, z * 0.05) - 0.45) * 5.0 * amp * ss
        rr = r + (lay(k) * 0.06 * r + ledge * 0.03 * r) * (0.35 + 0.65 * ramp) + chunk - groove * 0.05 * r * (0.4 + ramp) + fine * (0.4 + 0.6 * ramp)
        rr = max(0.6, rr)
        x2, z2 = cx + cth * rr, cz + sth * rr
        ao = max(0.0, min(1.0, 0.75 + (wl - 0.42) * 1.4 - groove * 0.6 - ledge * 0.15))
        return x2, z2, rr, ao

    ms = [0.0, 1.5, 3.2, 5.2, 7.0, 8.0]
    nbody = nr
    for k in range(1, nbody + 1):
        ms.append(8.0 + (D - 8.0) * (k / nbody) ** 1.9)
    aos = {}
    idx = []
    for m in ms:
        row = []
        for j in range(seg):
            th = j / seg * math.tau
            x, z, rr, ao = surf(th, m)
            vi = M.vert((x, -m, z))
            aos[vi] = ao
            row.append(vi)
        idx.append(row)
    for k in range(len(idx) - 1):
        for j in range(seg):
            j2 = (j + 1) % seg
            M.quad(idx[k][j], idx[k][j2], idx[k + 1][j2], idx[k + 1][j])
    # đuôi: kéo nhọn về một mũi chính lệch tâm
    cxl = sum(M.v[i][0] for i in idx[-1]) / seg
    czl = sum(M.v[i][2] for i in idx[-1]) / seg
    tip = M.vert((cxl + (rnd.random() - 0.5) * 6 * ss, -D - 0.16 * D, czl + (rnd.random() - 0.5) * 6 * ss))
    for j in range(seg):
        M.tri(idx[-1][j], idx[-1][(j + 1) % seg], tip)
    if not (fake or sat):
        # vành mặt đảo nối mép vách (R+10) với mép địa hình (R-3): không để hở rãnh tối giữa địa hình và váy; chìm 0,4 m dưới mặt đảo nên địa hình che khi cao hơn
        inner = [M.vert((math.cos(j / seg * math.tau) * (R - 3.0), -0.4, math.sin(j / seg * math.tau) * (R - 3.0))) for j in range(seg)]
        for j in range(seg):
            j2 = (j + 1) % seg
            M.quad(inner[j], inner[j2], idx[0][j2], idx[0][j])
    if fake or sat:  # mặt cỏ trên: vài vòng đồng tâm gồ nhẹ
        top_r = idx[0]
        grid = [[M.vert((M.v[i][0], 0.0, M.v[i][2])) for i in top_r]]
        for kk in (0.66, 0.33, 0.0):
            ringv = []
            for j, i in enumerate(top_r):
                x, z = M.v[i][0], M.v[i][2]
                h = (nz(x * 0.15 * (1 - kk) + seed, 0.5, z * 0.15 * (1 - kk), 770) - 0.5) * 2.4 * ss + 0.5 * (1 - kk)
                ringv.append(M.vert((x * kk, h, z * kk)) if kk > 0 else None)
            if kk == 0:
                c = M.vert((0.0, 0.9, 0.0))
                for j in range(seg):
                    M.tri(c, grid[-1][(j + 1) % seg], grid[-1][j])
            else:
                for j in range(seg):
                    j2 = (j + 1) % seg
                    M.quad(grid[-1][j], grid[-1][j2], ringv[j2], ringv[j])
                grid.append(ringv)
    n_body = len(M.v)
    ncore = 0.5 if (fake or sat) else 1.0

    def at(th, m, push=0.0):
        x, z, rr, ao = surf(th, m)
        c, s = math.cos(th), math.sin(th)
        return x + c * push, z + s * push, c, s

    # ---- tảng đá nửa chìm nhô ra sườn (mỗi chỗ một kiểu) ----
    for i in range(int((6 + R / 24) * ncore)):
        m = 12 + rnd.random() * 0.45 * D
        th = rnd.random() * math.tau
        x, z, c, s = at(th, m, -1.0)
        sz = (6 + rnd.random() * 14) * ss * (0.6 + 0.4 * math.exp(-m / (1.2 * tau)) * 2)
        blob(M, x, -m, z, sz * (0.8 + rnd.random() * 0.8), min(sz * (0.6 + rnd.random() * 0.6), m * 0.5), sz * (0.8 + rnd.random() * 0.8), seed + i, flat_top=True)
    # ---- tảng đá treo lủng lẳng bên ngoài, nối bằng dây đá ----
    for i in range(int((3 + R / 50) * spikes * ncore) + 1):
        m = 16 + rnd.random() * 0.3 * D
        th = rnd.random() * math.tau
        x, z, c, s = at(th, m, (5 + rnd.random() * 9) * ss)
        sz = (4 + rnd.random() * 9) * ss
        blob(M, x, -m - sz, z, sz, sz * 1.1, sz * 0.9, seed + 50 + i, lat=8, lon=11)
        x0, z0, _, _ = at(th, m - 2, -0.5)
        spike(M, x0 + (x - x0) * 0.5, z0 + (z - z0) * 0.5, -m + 3 * ss, sz * 1.6 + 7 * ss, 0.7 * ss, i + 300)
    # ---- mũi đá chính ở đáy (1–3) ----
    for i in range(rnd.randint(1, 3)):
        a = rnd.random() * math.tau
        spike(M, cxl + math.cos(a) * 2.5 * ss * i, czl + math.sin(a) * 2.5 * ss * i, -D * 0.93, (0.25 + rnd.random() * 0.2) * D, (3.5 + rnd.random() * 3) * ss, i + 400, nsd=7, nrr=6)
    # ---- thạch nhũ NGẮN màu đá, bám dưới các gờ tầng ----
    for i in range(int((22 + R / 7) * spikes * 1.2 * ncore)):
        th = rnd.random() * math.tau
        m = 6 + rnd.random() * 0.35 * D
        x, z, c, s = at(th, m, 0.0)
        spike(M, x, z, -m, (3 + rnd.random() * 8) * ss, (0.5 + rnd.random() * 1.2) * ss, i, dirx=-c, dirz=-s, lean=0.25, nsd=5, nrr=4)
    n_rock = len(M.v)
    # ---- rễ cây MẢNH nhiều nhánh buông thõng mềm từ mép (không cắm xuống mây), dây leo xanh có lá ----
    n_groups = int((4 + R / 30) * roots * (0.6 if (fake or sat) else 1.0)) + 1
    for g in range(n_groups):
        th = rnd.random() * math.tau
        x0, z0, c, s = at(th, 0.5, -0.5)
        L = (7 + rnd.random() * 15) * ss * 1.3
        out = (0.8 + rnd.random() * 1.8) * ss
        sway = rnd.random() * 6
        N = 12

        def path(t, L=L, out=out, sway=sway, x0=x0, z0=z0, c=c, s=s):
            o = out * (1 - (1 - t) ** 2) + 0.35 * math.sin(t * 6 + sway) * t
            return (x0 + c * o + (-s) * 0.25 * math.sin(t * 5 + sway * 1.3) * t, -0.5 - L * t, z0 + s * o + c * 0.25 * math.sin(t * 5 + sway * 1.3) * t)

        pts = [path(q / N) for q in range(N + 1)]
        rad = [(0.34 * (1 - q / N) ** 0.8 + 0.03) * ss**0.5 for q in range(N + 1)]
        tube(M, pts, rad, nsd=5, tag='root')
        for br in range(3 + rnd.randint(0, 2)):  # nhánh phụ
            t0 = 0.2 + rnd.random() * 0.55
            p0 = path(t0)
            ang = rnd.random() * math.tau
            bl = L * (0.25 + rnd.random() * 0.3)
            bo = (0.8 + rnd.random() * 2.0) * ss
            bp = []
            for q in range(7):
                t = q / 6
                bp.append((p0[0] + math.cos(ang) * bo * (1 - (1 - t) ** 2), p0[1] - bl * t, p0[2] + math.sin(ang) * bo * (1 - (1 - t) ** 2)))
            tube(M, bp, [(0.12 * (1 - q / 6) + 0.02) * ss**0.5 for q in range(7)], nsd=4, tag='root')
    for g in range(int((2 + R / 70) * roots * (0.5 if (fake or sat) else 1.0)) + 1):
        th = rnd.random() * math.tau
        x0, z0, c, s = at(th, 0.5, -0.3)
        L = (10 + rnd.random() * 16) * ss * 1.1
        N = 14
        wob = rnd.random() * 6
        pts = [(x0 + c * (0.6 + 1.5 * math.sin(q / N * 1.6)) * ss + 0.9 * math.sin(q * 0.8 + wob), -0.5 - L * q / N, z0 + s * (0.6 + 1.5 * math.sin(q / N * 1.6)) * ss + 0.9 * math.cos(q * 0.7 + wob)) for q in range(N + 1)]
        tube(M, pts, [0.09 * (1 - 0.4 * q / N) for q in range(N + 1)], nsd=4, tag='vine')
        M.cur = 'leaf'
        for q in range(2, N, 1):
            if (q + g) % 2:
                continue
            p = pts[q]
            a = rnd.random() * math.tau
            lw = (0.4 + rnd.random() * 0.3) * ss**0.5
            va = M.vert((p[0], p[1], p[2]))
            vb = M.vert((p[0] + math.cos(a) * lw * 1.4, p[1] - lw * 0.6, p[2] + math.sin(a) * lw * 1.4))
            vc = M.vert((p[0] + math.cos(a + 0.7) * lw, p[1] - lw * 1.4, p[2] + math.sin(a + 0.7) * lw))
            M.tri(va, vb, vc)
            M.tri(va, vc, vb)
        M.cur = 'rock'
    # ---- màu đỉnh ----
    cols = []
    for i, p in enumerate(M.v):
        tg = M.tag[i]
        gy = p[1]
        if tg == 'root':
            col = mixc(C_ROOT, C_ROOT_L, hsh(i // 9, 3, 5, seed))
        elif tg == 'vine':
            col = C_VINE
        elif tg == 'leaf':
            col = mixc(C_LEAF, C_VINE, hsh(i, 1, 2, seed))
        else:
            depth = max(0.0, min(1.0, -gy / D))
            band = hsh(int(math.floor(gy / 3.0)), sd, 61, 5)
            col = mixc(C_B, C_MID, band * 0.75)
            if band > 0.72:
                col = mixc(col, C_OCHRE, 0.5)
            col = mixc(col, C_D, depth**0.7 * 0.55)
            col = tuple(c_ * (0.78 + band * 0.4) for c_ in col)
            ao = aos.get(i, 0.8)
            col = tuple(c_ * (0.55 + 0.45 * ao) for c_ in col)
            if gy > -1.4:
                col = mixc(col, lin(0x6F9D58) if (fake or sat) else C_GRASS, min(1.0, (gy + 1.4) / 1.4))
        cols.append(col)
    tot = make_object(name, M, cols)
    # ---- dải nước mảnh từ mép (đối tượng riêng, có UV để client cuộn) ----
    if water and not sat and not fake and R > 60:
        W = Mesh()
        uvs = []
        for g in range(2 if R < 150 else 3):
            th = rnd.random() * math.tau
            Lf = 34 + rnd.random() * 12
            ns = 10
            for q in range(ns + 1):
                t = q / ns
                m = 6.0 + (Lf) * t
                x, z, c, s = at(th, min(m, 40.0), 0.8 + 3.0 * t * t)
                wd = (0.5 + 0.7 * math.sin(math.pi * min(1.0, t * 1.2)) + 0.3) * ss
                tx, tz = -s, c
                W.vert((x + tx * wd, -m, z + tz * wd))
                uvs.append((0.0, t * Lf / 14.0))
                W.vert((x - tx * wd, -m, z - tz * wd))
                uvs.append((1.0, t * Lf / 14.0))
            base = len(W.v) - 2 * (ns + 1)
            for q in range(ns):
                a0 = base + 2 * q
                W.quad(a0, a0 + 1, a0 + 3, a0 + 2)
        make_object(name.replace('vhrock_', 'vhfall_'), W, [(1.0, 1.0, 1.0)] * len(W.v), uvs=uvs, mat_name='vhwater')
    return tot


def run(out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    tot = 0
    for i, (kind, (R, amp, belly, spikes, roots, dk)) in enumerate(KINDS.items()):
        t = island(f'vhrock_{kind}', R, amp, belly, spikes, roots, dk, SEED + i * 101, seg=88 if R > 100 else 64, nr=70 if R > 100 else 48)
        tot += t
        print(f'[vh_island] vhrock_{kind}: {t} mặt')
    for i, nm in enumerate(('a', 'b')):
        t = island(f'vhfake_{nm}', 40.0, 1.1 + 0.3 * i, 1.0, 0.9, 0.6, 2.2 + 0.2 * i, SEED + 900 + i * 7, fake=True, seg=56, nr=40)
        tot += t
        print(f'[vh_island] vhfake_{nm}: {t} mặt')
    for i, (nm, R, dk) in enumerate((('a', 16.0, 2.4), ('b', 11.0, 2.8), ('c', 22.0, 2.2))):  # đá vệ tinh: cùng bộ khối đá đảo thu nhỏ, có cỏ trên đỉnh
        t = island(f'vhsat_{nm}', R, 1.0, 1.0, 0.8, 0.8, dk, SEED + 1300 + i * 11, sat=True, seg=40, nr=30)
        tot += t
        print(f'[vh_island] vhsat_{nm}: {t} mặt')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_vertex_color='ACTIVE', export_image_format='NONE')
    print(f'[vh_island] {out}: {tot} mặt')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_vh_island.glb')
