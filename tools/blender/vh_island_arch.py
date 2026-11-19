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
C_D = lin(0x3D3834)  # đá tối ở mũi
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


def island(name, R, amp, belly, ln, spikes, roots, seed, fake=False, seg=128, nr=76):
    rnd = random.Random(seed)
    M = Mesh()
    prof = [
        (R - 4, -0.02), (R + 3, -0.1), (R + 4.5, -1.2), (R + 5.5, -4), (R + 6, -9), (R + 2, -15), (R - 5, -22), (R - 14, -31),
        (R * 0.78, -41), (R * 0.58, -52), (R * 0.38, -62), (R * 0.2, -72), (R * 0.07, -80), (0.01, -86),
    ]
    base = [(x * (belly if x < R * 0.9 else 1.0), y * ln) for x, y in prof]
    sp = catmull(base, nr)
    sp = [(max(0.01, x), y) for x, y in sp]
    sdh = seed % 997
    tipY = sp[-1][1]
    # độ nhô riêng của từng tầng (tầng ~4,4 m): mỗi tầng một độ lồi/lõm, gờ gãy ở đỉnh tầng
    layer_off = {}

    def layer_push(y):
        k = int(math.floor(-y / 4.4))
        if k not in layer_off:
            layer_off[k] = (rnd.random() - 0.5) * 3.2
        return layer_off[k]

    rings = []
    for (r0, y0) in sp:
        ring = []
        depth = min(1.0, -y0 / (86 * ln))
        for j in range(seg):
            th = j / seg * math.tau
            x0, z0 = math.cos(th) * r0, math.sin(th) * r0
            rid = ridged(x0 * 0.045 + sdh, y0 * 0.07, z0 * 0.045)
            ledge_t = y0 / 4.4 + nz(x0 * 0.03, y0 * 0.01, z0 * 0.03, 710) * 1.6
            ledge = (ledge_t - math.floor(ledge_t)) ** 2.2
            fine = nz(x0 * 0.22 + sdh, y0 * 0.35, z0 * 0.22, 730) - 0.5
            groove = nz(th * 5.5 + sdh, y0 * 0.05, 3.3, 720) - 0.5
            crack = max(0.0, 1.0 - abs(nz(th * 17.0 + sdh, y0 * 0.04, 8.1, 740) - 0.5) * 9.0)  # nứt dọc hẹp
            push = ((rid - 0.45) * 17 + ledge * 9 + groove * 7 + fine * 3.4 + layer_push(y0) * 2.6 - crack * 3.0) * amp * (0.3 + depth * 0.9) * (0.4 if y0 > -0.5 else 1.0)
            r = max(0.01, r0 + push) if r0 > 0.02 else 0.01
            yy = y0 + (rid - 0.4) * 3 * depth
            ring.append((math.cos(th) * r, yy, math.sin(th) * r, th, r, depth))
        rings.append(ring)

    def prof_r(y):
        """Bán kính thân đảo ở độ cao y (xấp xỉ theo spline gốc): chỗ bám của thạch nhũ và rễ."""
        for k in range(len(sp) - 1):
            if sp[k][1] >= y >= sp[k + 1][1]:
                t = (sp[k][1] - y) / max(1e-6, sp[k][1] - sp[k + 1][1])
                return sp[k][0] * (1 - t) + sp[k + 1][0] * t
        return sp[-1][0]

    idx = []
    for k, ring in enumerate(rings):
        row = []
        for (x, y, z, th, r, depth) in ring:
            row.append(M.vert((x, y, z), None))
        idx.append(row)
    for k in range(len(rings) - 1):
        for j in range(seg):
            j2 = (j + 1) % seg
            M.quad(idx[k][j], idx[k][j2], idx[k + 1][j2], idx[k + 1][j])
    if fake:  # mặt cỏ trên của đảo giả: vài vòng đồng tâm gồ nhẹ (không phải đĩa phẳng), màu cỏ loang
        top_r = rings[0]
        grid = [[M.vert((x, 0.0, z), None) for (x, y, z, th, r, d) in top_r]]
        for q, kk in enumerate((0.66, 0.33, 0.0)):
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
    # ---- thạch nhũ: nón nhiều vòng, lệch và gồ ghề, gắn vào bụng đảo ----
    n_sp = int(round((6 + R / 22) * spikes * 1.7 * (0.5 if fake else 1.0)))
    stal = []
    for i in range(n_sp):
        a = rnd.random() * math.tau
        dy = -(18 + rnd.random() * 30) * ln
        rr = prof_r(dy) * (0.55 + rnd.random() * 0.4)
        length = (10 + rnd.random() * 26 * amp)
        wid = 1.0 + rnd.random() * 2.4
        lean = (rnd.random() - 0.5) * 0.35
        stal.append((a, dy, rr, length, wid, lean, i))
    verts_extra = []
    for (a, dy, rr, length, wid, lean, i) in stal:
        cx, cz = math.cos(a) * rr, math.sin(a) * rr
        nrr, nsd = 7, 7
        prev = None
        for q in range(nrr + 1):
            t = q / nrr
            w = wid * (1.0 - t) ** 0.85 * (1 + 0.35 * math.sin(t * 9 + i)) * (1.5 if q == 0 else 1.0)
            y = dy - t * length
            ox = cx + lean * (-y + dy) * 0.9
            ring = []
            for s in range(nsd):
                th = s / nsd * math.tau
                nzv = 1 + 0.35 * (nz(math.cos(th) * 3 + i, y * 0.3, math.sin(th) * 3, 760) - 0.5)
                ring.append(M.vert((ox + math.cos(th) * w * nzv, y, cz + math.sin(th) * w * nzv), None))
            if prev:
                for s in range(nsd):
                    s2 = (s + 1) % nsd
                    M.quad(prev[s], prev[s2], ring[s2], ring[s])
            prev = ring
            if q == nrr:
                tipv = M.vert((ox, y - w * 0.8, cz), None)
                for s in range(nsd):
                    M.tri(ring[s], ring[(s + 1) % nsd], tipv)
    n_start = len(M.v)
    # ---- rễ cây: ống thon uốn cong dọc vách rồi rơi tự do ----
    n_rt = int(round((10 + R / 14) * roots * 1.9 * (0.6 if fake else 1.0)))
    nroot_ranges = []
    for i in range(n_rt):
        a = rnd.random() * math.tau
        y0 = -(2 + rnd.random() * 16)
        r0 = prof_r(y0) * 0.97
        length = (14 + rnd.random() * 34) * (1.4 if roots > 1 else 1.15)
        rad0 = 0.42 + rnd.random() * 0.5
        out = 1.5 + rnd.random() * 5.0
        wob = rnd.random() * 6
        pts = []
        N = 12
        for q in range(N + 1):
            t = q / N
            rr = r0 + out * math.sin(min(1.0, t * 1.6) * math.pi / 2) + 0.0
            th = a + 0.04 * math.sin(t * 5 + wob)
            pts.append((math.cos(th) * rr, y0 - t * length, math.sin(th) * rr))
        nsd = 6
        prev = None
        for q, p in enumerate(pts):
            t = q / N
            w = rad0 * (1 - t) ** 0.8 + 0.03
            ring = []
            for s in range(nsd):
                th = s / nsd * math.tau
                ring.append(M.vert((p[0] + math.cos(th) * w, p[1], p[2] + math.sin(th) * w), None))
            if prev:
                for s in range(nsd):
                    s2 = (s + 1) % nsd
                    M.quad(prev[s], prev[s2], ring[s2], ring[s])
            prev = ring
        nroot_ranges.append(None)
    n_end = len(M.v)

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
        depth = min(1.0, -gy / (86 * ln))
        if i >= n_start:  # rễ
            col = mixc(C_ROOT, C_ROOT_L, hsh(i // 7, 3, 5, seed) * 0.7)
        elif gy > -0.4 and fake:
            n = nz(gx * 0.12, 0.3, gz * 0.12, 780)
            col = mixc(lin(0x3C6334), lin(0x66854A), n)
            if hsh(int(gx * 0.5), int(gz * 0.5), 3, seed) > 0.93:
                col = mixc(col, C_B, 0.8)
        else:
            band = hsh(int(math.floor(gy / 1.6)), seed % 997, 61, 5)
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
        t = island(f'vhrock_{kind}', R, amp, belly, ln, spikes, roots, SEED + i * 101, seg=96 if R > 100 else 72, nr=64 if R > 100 else 52)
        tot += t
        print(f'[vh_island] vhrock_{kind}: {t} mặt')
    for i, nm in enumerate(('a', 'b')):
        t = island(f'vhfake_{nm}', 40.0, 1.1 + 0.3 * i, 1.0, 0.7 + 0.1 * i, 0.9, 0.6, SEED + 900 + i * 7, fake=True, seg=64, nr=40)
        tot += t
        print(f'[vh_island] vhfake_{nm}: {t} mặt')
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_vertex_color='ACTIVE', export_image_format='NONE')
    print(f'[vh_island] {out}: {tot} mặt')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_vh_island.glb')
