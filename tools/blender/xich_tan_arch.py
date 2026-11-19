# Cảnh Xích Tẫn Khích (DUN-1 PR6, phong cách B): hẻm núi lửa tàn đỏ-đen. Cụm cột bazan lục giác đen bóng có khe than hồng, mảnh obsidian nhọn, mảng vỏ dung nham nguội nứt
# để lộ than phát sáng, miệng phun khói than, cây cháy xém, cột cờ gãy có cờ rách, đống xương + mũ giáp, lò sắt than hồng. Dùng bộ dựng của Kiếm Trủng (kiem_trung_arch.py).
#
#   blender --background --python tools/blender/xich_tan_arch.py -- assets/build/raw/arch_xich_tan.glb
#
# Gốc toạ độ = tâm hẻm (1520, y, 1300); x = đông, z = nam. Vật `xk_*` gốc ở sàn; client đặt y theo `heightAt` từng chỗ (sàn hẻm gần phẳng, vách dốc).

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

bs.MATERIALS['ember'] = Mat(0.7, 0.0, None, 1.0, False, 0.0, (0xE8481A, 0.75))
bs.MATERIALS['obs'] = Mat(0.4, 0.1, None, 1.0, False, 0.0)
bs.MATERIALS['silk'] = Mat(0.5, 0.05, None, 1.0, False, 0.0)

SEED = 20261119
CANYON_HALF_W, CANYON_HALF_L = 46.0, 82.0

EMBER = Paint(C(0xFF6A2A), 'ember')
EMBER_DK = Paint(C(0xC4301A), 'ember')


def lava(t):
    """Gradient dung nham: t 0 (mép, đỏ thẫm) → 1 (lõi, vàng cam). Màu đỉnh làm phát sáng (client thay vật liệu `ember`)."""
    t = max(0.0, min(1.0, t))
    return Paint(mix(C(0x7A1608), C(0xFFB23C), t ** 1.3), 'ember')

IRON = Paint(C(0x2D2826), 'metal')
CHAR = Paint(C(0x17120F), 'obs')


def rock(seed, lift=0.0):
    def fn(pos, nrm):
        n = fbm3(pos[0] * 0.5, pos[1] * 0.5, pos[2] * 0.5, seed, 3)
        rgb = mix(C(0x3A3532), C(0x6A605A), 0.2 + 0.5 * n + lift)
        # vỉa gỉ đỏ ở chân
        low = max(0.0, 1.0 - max(pos[1], 0.0) / 2.5)
        rgb = mix(rgb, C(0x5E2C1C), low * 0.3 * n)
        return Paint(tuple(rgb), 'jade')

    return fn


def rp(seed, lift=0.0):
    return rock(seed, lift)((0, 0, 0), (0, 1, 0))


def hexcol(seed, h, y, lift=0.0):
    """Cột lục giác: bazan đen xanh bóng, sáng dần theo mặt và chân tối khói."""
    n = fbm3(h * 0.7, y * 0.3, seed, seed + 3, 2)
    rgb = mix(C(0x25282E), C(0x4A505C), 0.2 + 0.6 * n + lift)
    return Paint(tuple(rgb), 'obs')


def basalt_cluster(b, seed):
    """Cụm cột bazan lục giác 4–8 cột CAO THẤP LỆCH (2–13 m): thớ dọc, đỉnh VỠ (mặt cắt xiên + răng cưa), có cột gãy ngang với mảnh vỡ nằm cạnh, khe than hồng ở chân và dọc khe (gradient phát sáng), đá vụn + than quanh. Tro phủ đỉnh do vật liệu client (pháp tuyến hướng lên)."""
    rnd = random.Random(seed)
    n = rnd.randint(4, 8)
    ring = [(0.0, 0.0)]
    for i in range(9):
        a = i / 9 * math.tau + rnd.uniform(-0.3, 0.3)
        d = rnd.uniform(1.8, 4.4)
        ring.append((math.cos(a) * d, math.sin(a) * d))
    blob(b, (0, 0.04, 0), (5.0, 0.07, 5.0), lambda p, nn: lava(0.35), nu=16, nv=3, v0=0.0, v1=0.5)
    for i in range(n):
        cx, cz = ring[i]
        h = rnd.choice((rnd.uniform(2.0, 4.5), rnd.uniform(4.0, 8.0), rnd.uniform(7.0, 13.0)))
        r = rnd.uniform(0.7, 1.3)
        sides = 6
        ph = rnd.uniform(0, 1)
        broken = rnd.random() < 0.7
        cut_n = (rnd.uniform(-0.8, 0.8), rnd.uniform(-0.8, 0.8))
        lean = (rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05))
        jag = [rnd.uniform(-0.6, 0.6) for _ in range(sides)]
        prev = None
        steps = 6
        for k in range(steps + 1):
            q = k / steps
            y = -0.6 + (h + 0.6) * q
            rr = r * (1.0 - 0.05 * q) * (1.0 + 0.05 * math.sin(q * 13 + i))
            ring_pts = []
            for j in range(sides):
                ang = ph + j / sides * math.tau
                px = cx + lean[0] * y + math.cos(ang) * rr
                pz = cz + lean[1] * y + math.sin(ang) * rr
                py = y
                if k == steps:  # đỉnh vỡ: mặt xiên + răng cưa theo từng cạnh
                    py = y + (cut_n[0] * (px - cx) + cut_n[1] * (pz - cz)) * (1.4 if broken else 0.3) + (jag[j] if broken else 0.0)
                ring_pts.append((px, py, pz))
            if prev:
                for j in range(sides):
                    k2 = (j + 1) % sides
                    b.poly([prev[j], prev[k2], ring_pts[k2], ring_pts[j]], (cx, y, cz), hexcol(seed + i, j + k, y, 0.08 * (j % 3)))
            prev = ring_pts
        b.poly(prev, (cx, 0, cz), hexcol(seed + i, 1, h, 0.14))
        for j in range(sides):  # khe than hồng quanh chân cột
            ang = ph + (j + 0.5) / sides * math.tau
            tbox(b, (cx + math.cos(ang) * (r + 0.05), 0.14, cz + math.sin(ang) * (r + 0.05)), (0.62, 0.22, 0.12), lava(0.55 + 0.4 * rnd.random()), yaw=-ang)
        # vết nứt THẲNG góc cạnh: hai ba khe mảnh nghiêng trên mặt cột (không cong), phát sáng ở lõi khe
        for _ in range(rnd.randint(1, 3)):
            j = rnd.randrange(sides)
            ang = ph + (j + 0.5) / sides * math.tau
            yy = rnd.uniform(0.18, 0.75) * h
            ln = rnd.uniform(0.9, 2.6)
            tbox(b, (cx + math.cos(ang) * (r + 0.02), yy, cz + math.sin(ang) * (r + 0.02)), (0.07, ln, 0.05), lava(rnd.uniform(0.6, 0.95)), yaw=-ang, rx=0.0, rz=rnd.choice((-1, 1)) * rnd.uniform(0.25, 0.7))
        if broken and rnd.random() < 0.7:  # mảnh vỡ nằm cạnh chân
            a = rnd.uniform(0, math.tau)
            tbox(b, (cx + math.cos(a) * (r + 1.0), 0.45, cz + math.sin(a) * (r + 1.0)), (rnd.uniform(0.9, 1.6), rnd.uniform(0.7, 1.3), rnd.uniform(0.9, 1.6)), hexcol(seed + i, 5, 1, 0.05), rx=rnd.uniform(-0.5, 0.5), rz=rnd.uniform(-0.5, 0.5), yaw=a)
    for k in range(9):  # đá vụn + than
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(2.8, 6.0)
        blob(b, (math.cos(a) * d, 0.3, math.sin(a) * d), (rnd.uniform(0.3, 0.8), rnd.uniform(0.25, 0.5), rnd.uniform(0.3, 0.8)), rock(seed + 90 + k), nu=7, nv=5, e=1.8, amp=0.3, seed=seed + k)
    for k in range(6):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(2.5, 5.5)
        blob(b, (math.cos(a) * d, 0.12, math.sin(a) * d), (0.22, 0.1, 0.22), lambda p, n: lava(0.8), nu=6, nv=3)


def obsidian_spike(b, seed):
    """Mảnh obsidian nhọn cao 3–6 m: 5–8 mảnh nghiêng chụm lại, mặt bóng đen, vài cạnh viền than hồng mảnh."""
    rnd = random.Random(seed)
    for i in range(rnd.randint(5, 8)):
        a = i / 7 * math.tau + rnd.uniform(-0.3, 0.3)
        d = rnd.uniform(0.0, 1.6)
        cx, cz = math.cos(a) * d, math.sin(a) * d
        h = rnd.uniform(2.6, 6.0)
        w = rnd.uniform(0.45, 0.9)
        lx, lz = math.cos(a) * rnd.uniform(0.1, 0.4), math.sin(a) * rnd.uniform(0.1, 0.4)
        ph = rnd.uniform(0, 1)
        prev = None
        for k, (q, rk) in enumerate(((0.0, 1.0), (0.4, 0.8), (0.85, 0.35), (1.0, 0.0))):
            ring = [(cx + lx * q * h + math.cos(ph + j / 4 * math.tau) * w * rk, q * h - 0.1, cz + lz * q * h + math.sin(ph + j / 4 * math.tau) * w * rk * 0.55) for j in range(4)]
            if prev:
                for j in range(4):
                    j2 = (j + 1) % 4
                    col = Paint(mix(C(0x1A1B20), C(0x4A4E5A), rnd.random() * 0.8), 'obs')
                    b.poly([prev[j], prev[j2], ring[j2], ring[j]], (cx, 0, cz), col)
            prev = ring
        if rnd.random() < 0.6:
            tbox(b, (cx + lx * h * 0.3, h * 0.22, cz + lz * h * 0.3), (0.06, h * 0.4, 0.06), EMBER_DK, rx=lz * 0.5, rz=-lx * 0.5)


def crust_plate(b, seed):
    """Phiến vỏ dung nham nguội nứt (đường kính ~8–9 m, có độ LÕM): sáu bảy phiến dày 0,35 m xếp quanh tâm, mép phiến bo nghiêng, KHE rộng 0,2–0,45 m nhìn xuống lớp dung nham phát sáng (gradient vàng cam ở lõi khe → đỏ thẫm ở mép, màu đỉnh), thành khe nung đỏ; viền ngoài là đá vỡ nhô lởm chởm."""
    rnd = random.Random(seed)
    # lớp dung nham chìm (lõm 0,18 m dưới mặt phiến): đĩa nhiều vòng, sáng ở giữa
    rings = 5
    for k in range(rings):
        r0, r1 = 4.9 * k / rings, 4.9 * (k + 1) / rings
        t = 1.0 - (k + 0.5) / rings
        N = 24
        for i in range(N):
            a0, a1 = i / N * math.tau, (i + 1) / N * math.tau
            quad = [(math.cos(a0) * r0, 0.04, math.sin(a0) * r0), (math.cos(a1) * r0, 0.04, math.sin(a1) * r0), (math.cos(a1) * r1, 0.04, math.sin(a1) * r1), (math.cos(a0) * r1, 0.04, math.sin(a0) * r1)]
            b.poly(quad, (0, -2, 0), lava(0.25 + 0.7 * t * (0.7 + 0.3 * rnd.random())))
    n = rnd.randint(6, 8)
    for i in range(n):
        a0 = i / n * math.tau + rnd.uniform(-0.12, 0.12)
        a1 = (i + 1) / n * math.tau - rnd.uniform(0.0, 0.12)
        r0 = rnd.uniform(0.7, 1.2)
        r1 = rnd.uniform(3.7, 4.5)
        gap = rnd.uniform(0.18, 0.4)
        top = []
        for (a, r) in ((a0 + gap / r0, r0), (a1 - gap / r0, r0), (a1 - gap / r1, r1 * 0.88), ((a0 + a1) / 2, r1 + rnd.uniform(-0.2, 0.3)), (a0 + gap / r1, r1 * 0.88)):
            top.append((math.cos(a) * r, 0.32 + rnd.uniform(0.0, 0.1), math.sin(a) * r))
        # mép bo nghiêng vào trong (0,12 m) rồi mặt phiến
        cxm = sum(p[0] for p in top) / len(top)
        czm = sum(p[2] for p in top) / len(top)
        inner = [(p[0] + (cxm - p[0]) * 0.07, p[1] + 0.05, p[2] + (czm - p[2]) * 0.07) for p in top]
        shade = mix(C(0x2E2724), C(0x5A4E46), rnd.random())
        b.poly(inner, (0, -2, 0), Paint(tuple(shade), 'jade'))
        for q0, q1, i0, i1 in zip(top, top[1:] + top[:1], inner, inner[1:] + inner[:1]):
            b.poly([q0, q1, i1, i0], (0, 0, 0), Paint(mix(tuple(shade), C(0x8A3A1E), 0.35), 'jade'))
            # thành khe: nung đỏ ở dưới, tối dần lên mặt
            b.poly([q0, q1, (q1[0], 0.06, q1[2]), (q0[0], 0.06, q0[2])], (0, 0, 0), lava(0.55))
    for k in range(10):  # đá vỡ nhô ở viền
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(4.2, 5.2)
        tbox(b, (math.cos(a) * d, 0.3, math.sin(a) * d), (rnd.uniform(0.5, 1.2), rnd.uniform(0.4, 0.9), rnd.uniform(0.5, 1.2)), Paint(mix(C(0x2A2320), C(0x4A3E38), rnd.random()), 'jade'), rx=rnd.uniform(-0.5, 0.5), rz=rnd.uniform(-0.5, 0.5), yaw=a)


def dais(b, seed):
    """Bệ đá vỡ nhô cao ở tâm hẻm (bán kính 9 m, cao 0,9–1,8 m): ba bậc đá vỡ không đều ôm nhau; mặt bệ nứt TỎA TỪ TÂM thành 7 mảng (khe 0,25–0,5 m rộng dần ra ngoài) có dung nham gradient bên dưới; vài khối đá vỡ nghiêng ở mép; mảnh vụn chỉ rải ở viền ngoài. Quanh chân là vành dung nham mảnh. Chừa khoảng giữa trống cho bia giữ (r 2)."""
    rnd = random.Random(seed)
    # vành dung nham dưới chân bệ
    N = 36
    for i in range(N):
        a0, a1 = i / N * math.tau, (i + 1) / N * math.tau
        r0, r1 = 8.6, 9.6
        quad = [(math.cos(a0) * r0, 0.05, math.sin(a0) * r0), (math.cos(a1) * r0, 0.05, math.sin(a1) * r0), (math.cos(a1) * r1, 0.05, math.sin(a1) * r1), (math.cos(a0) * r1, 0.05, math.sin(a0) * r1)]
        b.poly(quad, (0, -2, 0), lava(0.35 + 0.4 * rnd.random()))
    tiers = ((8.4, 0.16), (6.2, 0.32), (3.6, 0.48))  # thấp (≤ 0,5 m): bệ chỉ để nhìn, không va chạm, người chơi đứng và đánh trên đó
    for ti, (R_, H_) in enumerate(tiers):
        n = 7 + ti
        ph = rnd.uniform(0, 1)
        for i in range(n):
            a0 = ph + i / n * math.tau
            a1 = ph + (i + 1) / n * math.tau
            gap = (0.3 + 0.12 * ti) / max(R_, 1.0)  # khe rộng dần ra ngoài
            rin = (0.0 if ti == len(tiers) - 1 else tiers[ti + 1][0] - 0.2) + (1.6 if ti == len(tiers) - 1 else 0.0)
            hh = H_ + rnd.uniform(-0.1, 0.18)
            outer = [(math.cos(a) * R_ * (1 + rnd.uniform(-0.04, 0.04)), hh, math.sin(a) * R_ * (1 + rnd.uniform(-0.04, 0.04))) for a in (a0 + gap, (a0 + a1) / 2, a1 - gap)]
            innerp = [(math.cos(a) * rin, hh + 0.05, math.sin(a) * rin) for a in (a1 - gap, a0 + gap)]
            top = outer + innerp
            shade = mix(C(0x2A2422), C(0x544842), rnd.random())
            b.poly(top, (0, -2, 0), Paint(tuple(shade), 'jade'))
            # thành đứng thô + khe sáng dung nham (màu đỉnh gradient đỏ thẫm → vàng cam ở đáy khe)
            for q0, q1 in zip(top, top[1:] + top[:1]):
                low = (q0[0], max(0.0, hh - 0.16 - rnd.uniform(0, 0.08)), q0[2])
                low1 = (q1[0], max(0.0, hh - 0.16 - rnd.uniform(0, 0.08)), q1[2])
                b.poly([q0, q1, low1, low], (0, 0, 0), Paint(mix(tuple(shade), C(0x7A2A14), 0.4), 'jade'))
            for a in (a0, ):
                # khe giữa hai mảng: dải dung nham chạy từ trong ra ngoài, sáng ở trong (gần tâm) tối ra ngoài
                steps = 5
                for k in range(steps):
                    t0, t1 = k / steps, (k + 1) / steps
                    r0_, r1_ = rin + (R_ - rin) * t0, rin + (R_ - rin) * t1
                    w0 = 0.12 + 0.16 * t0 + 0.04 * ti
                    w1 = 0.12 + 0.16 * t1 + 0.04 * ti
                    nx, nz = -math.sin(a), math.cos(a)
                    p0 = (math.cos(a) * r0_, 0.2 * (ti + 1), math.sin(a) * r0_)
                    p1 = (math.cos(a) * r1_, 0.2 * (ti + 1), math.sin(a) * r1_)
                    quad = [(p0[0] + nx * w0, p0[1], p0[2] + nz * w0), (p0[0] - nx * w0, p0[1], p0[2] - nz * w0), (p1[0] - nx * w1, p1[1], p1[2] - nz * w1), (p1[0] + nx * w1, p1[1], p1[2] + nz * w1)]
                    b.poly(quad, (0, -2, 0), lava(1.0 - 0.7 * t0 - 0.12 * ti))
    # đá vỡ nghiêng ở mép bệ + mảnh vụn chỉ ở viền ngoài
    for k in range(9):
        a = rnd.uniform(0, math.tau)
        tbox(b, (math.cos(a) * rnd.uniform(8.6, 9.6), 0.5, math.sin(a) * rnd.uniform(8.6, 9.6)), (rnd.uniform(0.8, 1.6), rnd.uniform(0.7, 1.4), rnd.uniform(0.8, 1.6)), Paint(mix(C(0x2A2320), C(0x4A3E38), rnd.random()), 'jade'), rx=rnd.uniform(-0.6, 0.6), rz=rnd.uniform(-0.6, 0.6), yaw=a)
    for k in range(16):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(9.4, 11.6)
        tbox(b, (math.cos(a) * d, 0.15, math.sin(a) * d), (rnd.uniform(0.25, 0.6), rnd.uniform(0.15, 0.35), rnd.uniform(0.25, 0.6)), Paint(mix(C(0x2A2320), C(0x4A3E38), rnd.random()), 'jade'), rx=rnd.uniform(-0.5, 0.5), rz=rnd.uniform(-0.5, 0.5), yaw=a)


def vent(b, seed):
    """Miệng phun than: gò đá nung hình nón cụt (cao 1,6 m) có miệng phát sáng, vành đá cháy, vài vệt than chảy xuống thành."""
    rnd = random.Random(seed)
    blob(b, (0, 0.8, 0), (2.4, 1.5, 2.4), rock(seed, 0.1), nu=16, nv=7, v0=0.0, v1=0.5, amp=0.18, seed=seed)
    blob(b, (0, 1.55, 0), (1.0, 0.14, 1.0), lambda p, n: lava(0.55), nu=12, nv=4)
    blob(b, (0, 1.7, 0), (0.45, 0.25, 0.45), lambda p, n: lava(1.0), nu=10, nv=5)
    for k in range(5):
        a = k / 5 * math.tau + rnd.uniform(-0.2, 0.2)
        tbox(b, (math.cos(a) * 1.25, 0.9, math.sin(a) * 1.25), (0.14, 1.4, 0.16), lava(0.5), yaw=-a, rz=0.0)


def burnt_tree(b, seed):
    rnd = random.Random(seed)
    pts = [(0.0, 0.0, 0.0)]
    x = z = 0.0
    for i in range(1, 6):
        x += rnd.uniform(-0.4, 0.4)
        z += rnd.uniform(-0.4, 0.4)
        pts.append((x, i * 1.4, z))
    for i in range(5):
        rod(b, pts[i], pts[i + 1], 0.55 - 0.08 * i, 0.55 - 0.08 * (i + 1), lambda p, n: CHAR, nu=8, nv=2, seed=seed + i, amp=0.18)
    for k in range(6):
        j = rnd.randint(2, 5)
        base = pts[j]
        a = rnd.uniform(0, math.tau)
        L = rnd.uniform(1.6, 3.2)
        end = (base[0] + math.cos(a) * L, base[1] + rnd.uniform(0.4, 1.6), base[2] + math.sin(a) * L)
        rod(b, base, end, 0.17, 0.06, lambda p, n: CHAR, nu=6, nv=2, amp=0.1)
    for k in range(7):  # vệt than đang âm ỉ trên thân
        j = rnd.randint(0, 4)
        tbox(b, (pts[j][0] + 0.38, pts[j][1] + 0.7, pts[j][2]), (0.06, rnd.uniform(0.4, 1.0), 0.06), EMBER_DK, yaw=rnd.uniform(0, 3))
    blob(b, (0, 0.1, 0), (1.5, 0.12, 1.5), lambda p, n: Paint(C(0x241A16), 'jade'), nu=10, nv=3, v0=0.0, v1=0.5)


def banner(b, seed):
    """Cột cờ gãy cao ~8 m: cột đen cháy xém ngả, lá cờ đỏ sẫm rách (dải vải nhiều mảnh lủng lẳng), đầu cột gãy lởm chởm, đế đá chồng."""
    rnd = random.Random(seed)
    for k in range(3):
        tbox(b, (0, 0.25 + k * 0.4, 0), (2.4 - 0.5 * k, 0.4, 2.4 - 0.5 * k), bp(seed + k), rz=0.0)
    rod(b, (0, 0.5, 0), (0.7, 7.6, 0.2), 0.22, 0.15, lambda p, n: CHAR, nu=8, nv=5, amp=0.12)
    tbox(b, (0.75, 7.9, 0.2), (0.4, 0.8, 0.3), Paint(C(0x17120F), 'obs'), rz=0.5)
    tbox(b, (0.4, 6.8, 0.12), (1.4, 0.12, 0.12), IRON)  # xà ngang giữ cờ
    cols = (C(0x5A1210), C(0x7A1C16), C(0x401010))
    for s_ in range(5):
        x0 = -0.5 + s_ * 0.34
        top = 6.8
        ln = rnd.uniform(2.2, 4.2)
        rows = 6
        for r_ in range(rows):
            y_a = top - r_ * ln / rows
            sw = 0.14 * math.sin(r_ * 0.9 + s_) + 0.05 * r_
            col = Paint(mix(cols[s_ % 3], C(0x1A0A08), r_ / rows * 0.6), 'silk')
            b.poly([(x0, y_a, sw), (x0 + 0.3, y_a, sw + 0.04), (x0 + 0.3 + 0.03 * r_, y_a - ln / rows, sw + 0.1), (x0 + 0.03 * r_, y_a - ln / rows, sw + 0.06)], (x0, y_a, -3), col)
    tbox(b, (0.0, 6.8, 0.2), (1.8, 0.2, 0.1), Paint(C(0x8A6A34), 'metal'))


def bp(seed, lift=0.0):
    return rp(seed, lift)


def bones(b, seed):
    kta.bones(b, seed)
    rnd = random.Random(seed)
    # mũ giáp vỡ + khiên tròn gỉ
    blob(b, (-1.6, 0.35, 0.9), (0.5, 0.42, 0.5), lambda p, n: Paint(C(0x4A3A30), 'metal'), nu=10, nv=6, v0=0.0, v1=0.55)
    b.cylinder(1.2, 0.0, -1.0, 0.8, 0.1, Paint(C(0x4A3028), 'metal'), 12)
    tbox(b, (1.2, 0.12, -1.0), (0.2, 0.06, 1.2), IRON)


def brazier(b, seed):
    """Lò sắt than hồng: ba chân sắt cao 2,2 m, bát sắt có nan, than cháy phát sáng (nhiều cục), tay cầm."""
    for k in range(3):
        a = k / 3 * math.tau
        rod(b, (math.cos(a) * 1.3, 0.0, math.sin(a) * 1.3), (math.cos(a) * 0.6, 2.0, math.sin(a) * 0.6), 0.14, 0.1, lambda p, n: IRON, nu=6, nv=2, amp=0.0)
    blob(b, (0, 2.2, 0), (1.0, 0.5, 1.0), lambda p, n: IRON, nu=14, nv=6, v0=0.5, v1=1.0)
    tbox(b, (0, 2.3, 0), (2.3, 0.1, 0.1), IRON)
    tbox(b, (0, 2.3, 0), (0.1, 0.1, 2.3), IRON)
    blob(b, (0, 2.45, 0), (0.85, 0.2, 0.85), lambda p, n: lava(0.7), nu=10, nv=4)
    rnd = random.Random(seed)
    for k in range(7):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0, 0.6)
        blob(b, (math.cos(a) * d, 2.6, math.sin(a) * d), (0.2, 0.16, 0.2), lambda p, n: lava(0.95), nu=6, nv=4)


def build_variants():
    v = {}
    for i in range(3):
        b = new_b(1200 + i)
        basalt_cluster(b, 1200 + i * 17)
        v[f'basalt{i}'] = b
    for i in range(3):
        b = new_b(1210 + i)
        obsidian_spike(b, 1210 + i * 11)
        v[f'spike{i}'] = b
    for i in range(3):
        b = new_b(1220 + i)
        crust_plate(b, 1220 + i * 7)
        v[f'crust{i}'] = b
    b = new_b(1225)
    dais(b, 1225)
    v['dais'] = b
    b = new_b(1230)
    vent(b, 1230)
    v['vent'] = b
    for i in range(3):
        b = new_b(1240 + i)
        burnt_tree(b, 1240 + i * 5)
        v[f'tree{i}'] = b
    for i in range(2):
        b = new_b(1250 + i)
        banner(b, 1250 + i * 3)
        v[f'banner{i}'] = b
    for i in range(2):
        b = new_b(1260 + i)
        bones(b, 1260 + i * 3)
        v[f'bones{i}'] = b
    b = new_b(1270)
    brazier(b, 1270)
    v['brazier'] = b
    return v


def run(out):
    bs.make_textures()
    variants = build_variants()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = ts.materials_for(list(variants.values()))
    meshes = {k: ts.make_mesh(f'xk_{k}', b, keys, images, bevel=False) for k, b in variants.items()}
    rnd = random.Random(SEED)
    n_obj = 0

    def put(kind, var, x, z, **kw):
        nonlocal n_obj
        kta.place(f'xk_{kind}_{n_obj}', meshes[var], x, z, **kw)
        n_obj += 1

    def free(x, z, r=0.0):
        """Chỗ cấm đặt: quanh bia giữ (r 18), ba khe mạch (r 9), lối vào/ra phía nam (|x| < 9, z > 40), quanh vết nứt chính ngay trong `free` không xét (client xét)."""
        if math.hypot(x, z) < 18 + r:
            return False
        for (vx, vz) in ((19, 11), (-19, 11), (0, -22)):
            if math.hypot(x - vx, z - vz) < 10 + r:
                return False
        if abs(x) < 10 + r and z > 36:
            return False
        return True

    # Cụm cột bazan dọc chân vách: khoảng cách và vị trí lệch ngẫu nhiên (không thành tường đều), cỡ 0,5–1,5×, có cụm đứng lẻ và cụm đôi.
    z = -76.0
    while z < 66:
        z += rnd.uniform(7.0, 24.0)
        for sx in (-1, 1):
            if rnd.random() < 0.3:
                continue
            x = sx * rnd.uniform(30, 42)
            if not free(x, z + rnd.uniform(-4, 4), 5):
                continue
            put('basalt', f'basalt{rnd.randrange(3)}', x, z + rnd.uniform(-4, 4), yaw=rnd.uniform(0, 6.28), scale=rnd.choice((rnd.uniform(0.5, 0.8), rnd.uniform(0.8, 1.2), rnd.uniform(1.2, 1.55))))
    # Vài cụm cột lẻ trên sàn (xa bia giữ).
    got = 0
    while got < 6:
        x, z = rnd.uniform(-30, 30), rnd.uniform(-70, 50)
        if not free(x, z, 12):
            continue
        put('basalt', f'basalt{rnd.randrange(3)}', x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(0.45, 0.8))
        got += 1
    # Mảnh obsidian thành cụm rải sàn.
    got = 0
    while got < 22:
        x, z = rnd.uniform(-38, 38), rnd.uniform(-76, 66)
        if not free(x, z, 4):
            continue
        put('spike', f'spike{rnd.randrange(3)}', x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(0.8, 1.4))
        got += 1
    # Bệ đá vỡ ở tâm hẻm (quanh bia giữ) + vài mảng vỏ dung nham nguội xa tâm (r > 30).
    put('dais', 'dais', 0.0, 0.0, yaw=0.3)
    got = 0
    while got < 7:
        x, z = rnd.uniform(-34, 34), rnd.uniform(-72, 60)
        if math.hypot(x, z) < 30 or not free(x, z, 6):
            continue
        put('crust', f'crust{rnd.randrange(3)}', x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(0.7, 1.1))
        got += 1
    # Miệng phun than quanh sàn.
    got = 0
    while got < 9:
        x, z = rnd.uniform(-36, 36), rnd.uniform(-74, 58)
        if not free(x, z, 8):
            continue
        put('vent', 'vent', x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(1.0, 1.6))
        got += 1
    # Cây cháy xém, cột cờ gãy, đống xương, lò sắt.
    for kind, var_fmt, cnt, lim in (('tree', 'tree{}', 14, 3), ('banner', 'banner{}', 8, 2), ('bones', 'bones{}', 14, 2)):
        got = 0
        while got < cnt:
            x, z = rnd.uniform(-40, 40), rnd.uniform(-76, 66)
            if not free(x, z, 5):
                continue
            put(kind, var_fmt.format(rnd.randrange(lim)), x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(0.9, 1.4))
            got += 1
    for (x, z) in ((-24, -50), (24, -50), (-26, 30), (26, 30), (-14, -68), (14, -68), (-28, -10), (28, -10)):
        put('brazier', 'brazier', x, z, yaw=rnd.uniform(0, 6.28), scale=1.2)
    ts.export_glb(out)
    size, prims, tris, doc = bs.inspect(out)
    print(f'[xich_tan] {out}: {size / 1024:.0f} KB, {n_obj} vật, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)})')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_xich_tan.glb')
