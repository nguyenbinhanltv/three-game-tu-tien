# Cầu treo Đoạn Mạch (POLISH-3): dựng bằng Blender thay cho cầu ghép hộp trong client.
# Ván gỗ khác nhau (rộng/dày/lệch/cong, có khe, mắt đinh), hai dầm biên gỗ tròn, dây thừng xoắn chạy hai bên (tay vịn võng giữa các dây treo, không thẳng tắp),
# dây treo đứng thả từ tay vịn xuống dầm, cọc gỗ tròn hai đầu (có đai dây, mộng ngang, đỉnh vát), dây neo chéo xuống đất, vòng dây xuống tự nhiên.
#
#   blender --background --python tools/blender/dm_bridge_arch.py -- assets/build/raw/arch_dm_bridge.glb
#
# Hệ trục: gốc = đầu a của cầu (mặt cầu ở y = 0 đúng `ay`), z chạy dọc nhịp về đầu b, x ngang, y lên. Mặt cầu theo đúng đường `bridgeDeckY` của shared
# (hai đầu phẳng BRIDGE_FLAT_END, giữa võng `sag` theo parabol) nên client chỉ cần đặt tại (ax, ay, az) quay yaw: collider/địa hình không đổi.

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

LEN = 48.0  # cau_treo_sa_lun: (970,1500) → (970,1548)
HALF_W = 1.25
BY_MINUS_AY = 0.2
SAG = 2.4
FLAT = 10.0  # BRIDGE_FLAT_END

bs.MATERIALS['rope'] = Mat(0.95, 0.0, None, 1.0, False, 0.0)
bs.MATERIALS['dmwood'] = Mat(0.88, 0.0, None, 1.0, False, 0.0)  # gỗ: màu đỉnh + vân; không dán texture lặp


def srgb(h):
    return bs.srgb(h)


def deck_y(z):
    t = z / LEN
    f = FLAT / LEN
    u = max(0.0, min(1.0, (t - f) / (1 - 2 * f)))
    return BY_MINUS_AY * u - SAG * 4 * u * (1 - u)


def slope(z):
    return (deck_y(min(LEN, z + 0.05)) - deck_y(max(0.0, z - 0.05))) / (min(LEN, z + 0.05) - max(0.0, z - 0.05))


def wood(base, rnd, k=0.16):
    c = srgb(base)
    j = 1 + (rnd.random() - 0.5) * 2 * k
    return Paint(tuple(min(1.0, v * j) for v in c), 'dmwood')


def rope_col(rnd):
    c = srgb(0xB59B6A)
    j = 1 + (rnd.random() - 0.5) * 0.3
    return Paint(tuple(v * j for v in c), 'rope')


def tube(b, pts, radii, paint_fn, nsd=6, smooth=True):
    """Ống theo đường gấp khúc (toạ độ game x, y, z), bán kính từng điểm."""
    prev = None
    for q, p in enumerate(pts):
        nxt = pts[min(q + 1, len(pts) - 1)]
        prv = pts[max(q - 1, 0)]
        t = [nxt[k] - prv[k] for k in range(3)]
        ln = math.sqrt(sum(a * a for a in t)) or 1.0
        t = [a / ln for a in t]
        ref = (0.0, 1.0, 0.0) if abs(t[1]) < 0.9 else (1.0, 0.0, 0.0)
        e1 = [t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]]
        n1 = math.sqrt(sum(a * a for a in e1)) or 1.0
        e1 = [a / n1 for a in e1]
        e2 = [t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0]]
        ring = []
        for s in range(nsd):
            a = s / nsd * math.tau
            ring.append(tuple(p[k] + (e1[k] * math.cos(a) + e2[k] * math.sin(a)) * radii[q] for k in range(3)))
        if prev:
            for s in range(nsd):
                s2 = (s + 1) % nsd
                b.face([prev[s], ring[s], ring[s2], prev[s2]], paint_fn(), smooth)
        prev = ring


def beam(b, a, c, r, rnd, base=0x5A3C25, nsd=7):
    """Cây gỗ tròn từ a đến c, hơi cong/thon."""
    n = 6
    pts = [tuple(a[k] + (c[k] - a[k]) * i / n for k in range(3)) for i in range(n + 1)]
    rad = [r * (1 + 0.08 * math.sin(i * 1.7 + rnd.random())) for i in range(n + 1)]
    tube(b, pts, rad, lambda: wood(base, rnd, 0.1), nsd)


def build(b, rnd):
    zs = [i * LEN / 200 for i in range(201)]
    # ---- dầm biên: hai cây gỗ tròn chạy dọc dưới mép ván, nối các đoạn (mối nối so le) ----
    for sx in (-1, 1):
        x = sx * (HALF_W - 0.1)
        segs = 4
        for q in range(segs):
            z0, z1 = LEN * q / segs - (0.3 if q else 0), LEN * (q + 1) / segs + 0.3
            pts = [(x + math.sin(z * 0.3 + q) * 0.03, deck_y(z) - 0.28, z) for z in [z0 + (z1 - z0) * i / 10 for i in range(11)]]
            tube(b, pts, [0.17 + 0.02 * math.sin(i + q) for i in range(11)], lambda: wood(0x4E3320, rnd, 0.1), 7)
    # ---- ván: rộng/dày khác nhau, lệch nhẹ và vênh, khe thưa ----
    z = 0.15
    k = 0
    while z < LEN - 0.3:
        w = 0.34 + rnd.random() * 0.2
        gap = 0.02 + rnd.random() * 0.07
        th = 0.075 + rnd.random() * 0.04
        zc = z + w / 2
        ycen = deck_y(zc) + 0.05
        pitch = -math.atan(slope(zc))
        half = HALF_W + 0.08 + (rnd.random() - 0.5) * 0.12
        shift = (rnd.random() - 0.5) * 0.12
        warp = (rnd.random() - 0.5) * 0.06  # vênh một đầu
        col = wood(0x7A5434 if rnd.random() > 0.25 else 0x5E4029, rnd, 0.14)

        def P(dx, dy, dz):
            # xoay quanh trục x theo độ dốc ván
            cy, sy = math.cos(pitch), math.sin(pitch)
            return (shift + dx, ycen + dy * cy - dz * sy, zc + dy * sy + dz * cy)

        hw = w / 2
        x0, x1 = -half, half
        top = [P(x0, th, -hw), P(x1, th + warp, -hw), P(x1, th + warp, hw), P(x0, th, hw)]
        bot = [P(x0, 0, -hw), P(x1, warp * 0.5, -hw), P(x1, warp * 0.5, hw), P(x0, 0, hw)]
        b.face(top, col)
        b.face(bot[::-1], col)
        for i in range(4):
            j = (i + 1) % 4
            b.face([bot[i], bot[j], top[j], top[i]], col)
        if rnd.random() < 0.8:  # đầu đinh ở hai mép
            for sx in (-1, 1):
                b.box(shift + sx * (half - 0.14), ycen + th + 0.012, zc, 0.05, 0.025, 0.05, Paint(srgb(0x2A2622), 'rope'))
        z += w + gap
        k += 1
    # ---- cọc đầu cầu: cây gỗ tròn to, đỉnh vát, đai dây, mộng ngang ----
    for end, zc in ((0, 0.0), (1, LEN)):
        yb = deck_y(zc)
        for sx in (-1, 1):
            x = sx * (HALF_W + 0.55)
            zc2 = zc + (-0.6 if end == 0 else 0.6)
            h = 3.6
            pts = [(x + math.sin(i * 0.9) * 0.02, yb - 0.9 + h * i / 8, zc2) for i in range(9)]
            tube(b, pts, [0.3 - 0.03 * i / 8 + 0.015 * math.sin(i * 2.3) for i in range(9)], lambda: wood(0x4B3220, rnd, 0.12), 9)
            top = (x, yb - 0.9 + h, zc2)
            tube(b, [top, (x, top[1] + 0.22, zc2)], [0.27, 0.12], lambda: wood(0x3E2A1B, rnd, 0.1), 9)
            # đai dây quấn đỉnh
            for q in range(5):
                yy = yb + 2.1 + q * 0.09
                ring = [(x + math.cos(a / 12 * math.tau) * 0.3, yy, zc2 + math.sin(a / 12 * math.tau) * 0.3) for a in range(13)]
                tube(b, ring, [0.035] * 13, lambda: rope_col(rnd), 5)
            # mộng ngang nối hai cọc
        beam(b, (-(HALF_W + 0.55), yb + 1.7, zc + (-0.6 if end == 0 else 0.6)), ((HALF_W + 0.55), yb + 1.7, zc + (-0.6 if end == 0 else 0.6)), 0.12, rnd)
        # dây neo chéo từ đỉnh cọc ra sau xuống đất
        for sx in (-1, 1):
            x = sx * (HALF_W + 0.55)
            zc2 = zc + (-0.6 if end == 0 else 0.6)
            back = -1 if end == 0 else 1
            ptsr = []
            for i in range(9):
                t = i / 8
                ptsr.append((x + sx * 1.2 * t, yb + 2.5 - 3.3 * t - 0.25 * math.sin(math.pi * t), zc2 + back * (6.5 * t)))
            tube(b, ptsr, [0.05] * 9, lambda: rope_col(rnd), 5)
            # cọc neo đất
            beam(b, (x + sx * 1.2, yb - 0.8, zc2 + back * 6.5), (x + sx * 1.0, yb + 0.5, zc2 + back * 6.2), 0.1, rnd)
    # ---- tay vịn: dây thừng chính xoắn, võng giữa các dây treo; dây treo đứng, thả xuống dầm ----
    hang_every = 2.4
    for sx in (-1, 1):
        x = sx * (HALF_W + 0.3)
        posts = [0.0]
        z = hang_every
        while z < LEN - 1.0:
            posts.append(z + (rnd.random() - 0.5) * 0.4)
            z += hang_every
        posts.append(LEN)
        railpts = []
        for i in range(len(posts) - 1):
            z0, z1 = posts[i], posts[i + 1]
            for q in range(6):
                t = q / 6
                zz = z0 + (z1 - z0) * t
                sagx = 0.14 * 4 * t * (1 - t) * (z1 - z0) / hang_every  # dây trùng giữa hai chỗ treo
                railpts.append((x + math.sin(zz * 0.4) * 0.03, deck_y(zz) + 1.15 - sagx, zz))
        railpts.append((x, deck_y(LEN) + 1.15, LEN))
        # dây xoắn: hai sợi quấn nhau
        for ph in (0.0, math.pi):
            tw = [(p[0] + math.cos(p[2] * 5 + ph) * 0.03, p[1] + math.sin(p[2] * 5 + ph) * 0.03, p[2]) for p in railpts]
            tube(b, tw, [0.034] * len(tw), lambda: rope_col(rnd), 5)
        # dây treo + vòng dây xuống
        for zz in posts[1:-1]:
            ry = deck_y(zz) + 1.15 - 0.1
            pts = [(x, ry - (ry - (deck_y(zz) + 0.1)) * i / 6, zz + math.sin(i * 1.3) * 0.015) for i in range(7)]
            tube(b, pts, [0.022] * 7, lambda: rope_col(rnd), 4)
        for i in range(0, len(posts) - 2, 3):  # vài vòng dây xuống tự nhiên từ tay vịn (dây thừa buông)
            zz = posts[i + 1]
            loop = []
            for q in range(10):
                t = q / 9
                loop.append((x + sx * 0.06 * math.sin(t * math.pi), deck_y(zz) + 1.1 - 0.9 * math.sin(t * math.pi * 0.95) - 0.05, zz + t * 0.7))
            tube(b, loop, [0.03] * 10, lambda: rope_col(rnd), 4)
        # dây dọc thấp (lưới chắn) thứ hai nối các dây treo
        low = [(x, deck_y(z) + 0.55 + 0.05 * math.sin(z * 1.7), z) for z in [LEN * i / 60 for i in range(61)]]
        tube(b, low, [0.022] * len(low), lambda: rope_col(rnd), 4)
    # ---- dây cáp chính trên cọc (từ đỉnh cọc a sang đỉnh cọc b) đã gộp trong tay vịn; thêm bó dây buộc đầu ván ----


def run(out):
    bs.make_textures()
    rnd = random.Random(20261120)
    b = kit.new_builder(seed=77, moss=0.0)
    build(b, rnd)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = ts.materials_for([b])
    mesh = ts.make_mesh('dm_bridge', b, keys, images, bevel=False)
    obj = bpy.data.objects.new('dm_bridge', mesh)
    bpy.context.scene.collection.objects.link(obj)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    ts.export_glb(out)
    size, prims, tris, doc = bs.inspect(out)
    print(f'[dm_bridge] {out}: {size / 1024:.0f} KB, {len(b.faces)} mặt, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)})')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_dm_bridge.glb')
