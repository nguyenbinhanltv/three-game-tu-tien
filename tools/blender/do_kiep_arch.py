# Cảnh Độ Kiếp (DUN-1 PR7, phong cách B): Thiên Lôi Đài trên đỉnh núi dưới mây bão. Đài tròn lát đá hoa cương xám lạnh có vòng bát quái khảm vàng nằm sát mặt sân
# (người chơi đứng và đánh trên đó, KHÔNG nhô cao), tám lôi trụ đá khắc vân mây cao 10 m đỉnh thu lôi bằng đồng, bốn đỉnh đồng than hồng, cột đá gãy cháy xém,
# vết sét cháy nám hình sao rải sân, tinh thể sét (fulgurite) và mảnh đá nung chảy. Dùng bộ dựng của Kiếm Trủng (kiem_trung_arch.py).
#
#   blender --background --python tools/blender/do_kiep_arch.py -- assets/build/raw/arch_do_kiep.glb
#
# Gốc toạ độ = tâm sân (1520, y, 1300); x = đông, z = nam. Sàn gần phẳng tới r 78 nên vật đặt theo heightAt từng chỗ (client).

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

bs.MATERIALS['rune'] = Mat(0.6, 0.0, None, 1.0, False, 0.0, (0xFFC860, 0.75))
bs.MATERIALS['bronze'] = Mat(0.45, 0.8, None, 1.0, False, 0.0)
bs.MATERIALS['volt'] = Mat(0.5, 0.0, None, 1.0, False, 0.0, (0xB89CFF, 0.9))
bs.MATERIALS['char'] = Mat(0.95, 0.0, None, 1.0, False, 0.0)

SEED = 20261120


def gold(t=0.6):
    """Khảm vàng/điện: t 0 vàng đồng thẫm → 1 trắng xanh điện. Màu đỉnh làm phát sáng (client thay vật liệu `rune`)."""
    return Paint(mix(C(0xD08A20), C(0xFFE9B0), max(0.0, min(1.0, t))), 'rune')


def volt(t=0.6):
    """Vết nứt/phù văn phát điện tím-trắng: t 0 tím thẫm → 1 trắng. Màu đỉnh làm phát sáng (client thay vật liệu `volt`)."""
    return Paint(mix(C(0x7A4CFF), C(0xF2EAFF), max(0.0, min(1.0, t))), 'volt')


def granite(seed, lift=0.0):
    """Hoa cương xám lạnh có đốm, chân ngả tối; không phải bê tông phẳng."""

    def fn(pos, nrm):
        n = fbm3(pos[0] * 0.45, pos[1] * 0.45, pos[2] * 0.45, seed, 3)
        sp = fbm3(pos[0] * 2.2, pos[1] * 2.2, pos[2] * 2.2, seed + 5, 2)
        rgb = mix(C(0x363A46), C(0x8A909C), 0.2 + 0.5 * n + 0.18 * sp + lift)
        low = max(0.0, 1.0 - max(pos[1], 0.0) / 2.0)
        rgb = mix(rgb, C(0x242830), low * 0.35)
        return Paint(tuple(rgb), 'jade')

    return fn


def gp(seed, lift=0.0):
    return granite(seed, lift)((0, 0, 0), (0, 1, 0))


BRONZE = Paint(C(0x3E3A3A), 'bronze')
BRONZE_LT = Paint(C(0x6E6866), 'bronze')
IRON = Paint(C(0x23252C), 'bronze')
SOOT = Paint(C(0x16151A), 'char')


def paving(b, seed):
    """Đài lát đá: nền r 21 gồm hai vành lát hình quạt so le (bát giác ~ 24 mảnh/vành), mỗi mảnh cao hạ lệch 0–4 cm, khe đen hẹp; vòng khảm vàng ở r 8,5 / 13,5 / 20; tám nhóm ba vạch bát quái (liền hoặc đứt) nằm giữa r 15–19; tám tia mảnh nối tâm ra vòng ngoài."""
    rnd = random.Random(seed)
    rings = ((1.8, 8.2, 14), (8.8, 13.2, 22), (13.8, 19.6, 30))
    for ri, (r0, r1, n) in enumerate(rings):
        ph = rnd.uniform(0, 1)
        for i in range(n):
            a0 = ph + i / n * math.tau
            a1 = ph + (i + 1) / n * math.tau
            g = 0.012 / max(r1 * 0.1, 0.5)
            h = 0.36 + rnd.uniform(0, 0.06)
            pts = []
            for r_, a_ in ((r0, a0 + g), (r1, a0 + g), (r1, a1 - g), (r0, a1 - g)):
                pts.append((math.cos(a_) * r_, h, math.sin(a_) * r_))
            b.poly(pts, (0, -2, 0), gp(seed + ri * 31 + i, 0.06 * (i % 3) - 0.14))
            # cạnh bên thấp (đọc ra có độ dày)
            for k in range(4):
                k2 = (k + 1) % 4
                lo = [(pts[k][0], -1.0, pts[k][2]), (pts[k2][0], -1.0, pts[k2][2])]
                b.poly([lo[0], lo[1], pts[k2], pts[k]], (0, h, 0), gp(seed + i, -0.15))
    # vòng khảm vàng
    for R_, w_, hh in ((8.5, 0.16, 0.4), (13.5, 0.16, 0.4), (20.1, 0.22, 0.4)):
        N = 64
        for i in range(N):
            a0, a1 = i / N * math.tau, (i + 1) / N * math.tau
            quad = [(math.cos(a0) * (R_ - w_), hh, math.sin(a0) * (R_ - w_)), (math.cos(a1) * (R_ - w_), hh, math.sin(a1) * (R_ - w_)), (math.cos(a1) * (R_ + w_), hh, math.sin(a1) * (R_ + w_)), (math.cos(a0) * (R_ + w_), hh, math.sin(a0) * (R_ + w_))]
            b.poly(quad, (0, -2, 0), gold(0.15 + 0.25 * rnd.random()))
    # tám tia từ tâm
    for k in range(8):
        a = k / 8 * math.tau + math.pi / 8
        tbox(b, (math.cos(a) * 5.0, 0.4, math.sin(a) * 5.0), (6.4, 0.04, 0.12), gold(0.3), yaw=-a)
    # bát quái: tám nhóm ba vạch (liền / đứt) xếp theo tiếp tuyến ở r 16–19
    pat = ((1, 1, 1), (0, 1, 1), (1, 0, 1), (0, 0, 1), (1, 1, 0), (0, 1, 0), (1, 0, 0), (0, 0, 0))
    for k in range(8):
        a = k / 8 * math.tau
        for j, solid in enumerate(pat[k]):
            R_ = 16.0 + j * 1.0
            span = 0.3
            segs = ((-span, span),) if solid else ((-span, -0.05), (0.05, span))
            for (s0, s1) in segs:
                am = a + (s0 + s1) / 2
                ln = (s1 - s0) * R_
                tbox(b, (math.cos(am) * R_, 0.4, math.sin(am) * R_), (0.42, 0.05, ln), gold(0.3), yaw=-am + math.pi / 2)
    # vết cháy xém và nứt điện trên mặt đài: mảng đen mỏng + khe tím-trắng gấp khúc
    for i in range(16):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(3.0, 19.0)
        cx, cz = math.cos(a) * d, math.sin(a) * d
        tbox(b, (cx, 0.43, cz), (rnd.uniform(1.6, 3.6), 0.03, rnd.uniform(1.4, 3.0)), SOOT, yaw=rnd.uniform(0, 6.28))
        yaw = rnd.uniform(0, 6.28)
        px, pz = cx, cz
        for k in range(rnd.randint(3, 6)):
            yaw += rnd.uniform(-0.9, 0.9)
            ln = rnd.uniform(0.6, 1.6)
            nx, nz = px + math.cos(yaw) * ln, pz + math.sin(yaw) * ln
            tbox(b, ((px + nx) / 2, 0.45, (pz + nz) / 2), (ln, 0.03, 0.07), volt(rnd.uniform(0.35, 0.9)), yaw=-yaw)
            px, pz = nx, nz
    # nền ngoài vòng 20: tấm đá rời rạc thưa dần ra r 26, nứt vỡ
    for i in range(46):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(20.8, 27.0)
        tbox(b, (math.cos(a) * d, 0.0, math.sin(a) * d), (rnd.uniform(1.4, 3.2), 0.8, rnd.uniform(1.2, 2.6)), gp(seed + 100 + i, rnd.uniform(-0.1, 0.1)), yaw=rnd.uniform(0, 6.28), rx=rnd.uniform(-0.03, 0.03))


def pillar(b, seed, broken=False):
    """Lôi trụ cao 10 m (gãy: 5,5 m có mảnh vỡ nằm cạnh): đế ba bậc, thân bát giác thon dần có đai vân mây nổi ở 1/3 và 2/3, vòng khảm vàng quanh cổ, đỉnh thu lôi đồng nhọn + cầu điện sáng."""
    rnd = random.Random(seed)
    for k in range(3):
        sz = 4.2 - 0.7 * k
        tbox(b, (0, 0.25 + k * 0.5, 0), (sz, 0.5, sz), granite(seed + k)((0, 0.4 + k * 0.5, 0), (0, 1, 0)), yaw=0.39)
    H = 5.5 if broken else 9.2
    sides = 8
    steps_n = 8
    prev = None
    ph = 0.39
    for k in range(steps_n + 1):
        q = k / steps_n
        y = 1.5 + (H - 1.5) * q
        rr = 1.05 * (1.0 - 0.28 * q)
        ring = []
        for j in range(sides):
            ang = ph + j / sides * math.tau
            py = y
            if broken and k == steps_n:
                py = y + 0.9 * math.sin(j * 2.3 + seed) + 0.5 * (j % 2)
            ring.append((math.cos(ang) * rr, py, math.sin(ang) * rr))
        if prev:
            for j in range(sides):
                j2 = (j + 1) % sides
                b.poly([prev[j], prev[j2], ring[j2], ring[j]], (0, y, 0), granite(seed + k * 3 + j, 0.05 * (j % 3))((prev[j][0], y, prev[j][2]), (1, 0, 0)))
        prev = ring
    b.poly(prev, (0, H, 0), gp(seed, 0.1))
    # đai vân mây nổi
    for t in ((0.33, 1.28), (0.66, 1.2)):
        yy = 1.5 + (H - 1.5) * t[0]
        if broken and yy > H:
            continue
        for j in range(8):
            ang = ph + (j + 0.5) / 8 * math.tau
            r0 = 1.05 * (1.0 - 0.28 * t[0]) * 1.02
            tbox(b, (math.cos(ang) * r0, yy, math.sin(ang) * r0), (0.5, 0.5, 0.12), gp(seed + 40 + j, 0.12), yaw=-ang + math.pi / 2)
        # vòng phù văn điện
        for j in range(16):
            a0, a1 = j / 16 * math.tau, (j + 1) / 16 * math.tau
            rr = 1.05 * (1.0 - 0.28 * t[0]) + 0.04
            quad = [(math.cos(a0) * rr, yy - 0.5, math.sin(a0) * rr), (math.cos(a1) * rr, yy - 0.5, math.sin(a1) * rr), (math.cos(a1) * rr, yy - 0.38, math.sin(a1) * rr), (math.cos(a0) * rr, yy - 0.38, math.sin(a0) * rr)]
            b.poly(quad, (0, yy, 0), volt(0.3))
    # phù văn khắc dọc tám mặt thân: cột ba bốn vạch ngắn xen nét sổ, phát sáng điện
    for j in range(8):
        ang = ph + (j + 0.5) / 8 * math.tau
        for q_ in range(5):
            yy = 2.2 + q_ * (H - 3.4) / 5.0
            if broken and yy > H - 0.6:
                continue
            rr = 1.05 * (1.0 - 0.28 * (yy - 1.5) / (H - 1.5)) + 0.03
            wd = 0.34 if q_ % 2 == 0 else 0.18
            tbox(b, (math.cos(ang) * rr, yy, math.sin(ang) * rr), (wd, 0.07, 0.05), volt(0.25 + 0.5 * rnd.random()), yaw=-ang + math.pi / 2)
            tbox(b, (math.cos(ang) * rr, yy + 0.16, math.sin(ang) * rr), (0.05, 0.3, 0.05), volt(0.3), yaw=-ang + math.pi / 2)
    if broken:
        # mảnh gãy nằm cạnh + mặt cháy
        tbox(b, (2.4, 0.6, 1.0), (1.5, 1.3, 1.5), gp(seed + 77), rz=0.7, yaw=0.5)
        tbox(b, (-1.8, 0.45, 2.1), (1.1, 0.9, 1.0), gp(seed + 78), rx=0.5, yaw=1.1)
        blob(b, (0, H + 0.05, 0), (0.9, 0.12, 0.9), lambda p, n: SOOT, nu=10, nv=3, v0=0.0, v1=0.5)
        return
    # đỉnh thu lôi đồng
    tbox(b, (0, H + 0.2, 0), (1.0, 0.4, 1.0), IRON, yaw=0.39)
    rod(b, (0, H + 0.3, 0), (0, H + 3.3, 0), 0.28, 0.04, lambda p, n: IRON, nu=8, nv=5, amp=0.0)
    for k in range(3):  # ba nhánh cong
        a = k / 3 * math.tau
        rod(b, (0, H + 0.9, 0), (math.cos(a) * 0.9, H + 2.0, math.sin(a) * 0.9), 0.07, 0.03, lambda p, n: IRON, nu=6, nv=2, amp=0.0)
    blob(b, (0, H + 3.45, 0), (0.26, 0.26, 0.26), lambda p, n: volt(0.95), nu=8, nv=6)


def cauldron(b, seed):
    """Đỉnh đồng ba chân thú, thân bầu có hai quai, miệng đầy than hồng, vân khắc nổi quanh bụng."""
    rnd = random.Random(seed)
    for k in range(3):
        a = k / 3 * math.tau
        rod(b, (math.cos(a) * 1.4, 0.0, math.sin(a) * 1.4), (math.cos(a) * 0.9, 1.7, math.sin(a) * 0.9), 0.24, 0.18, lambda p, n: BRONZE, nu=7, nv=3, amp=0.08)
    blob(b, (0, 2.5, 0), (1.55, 1.15, 1.55), lambda p, n: BRONZE if p[1] < 2.9 else BRONZE_LT, nu=16, nv=8, v0=0.12, v1=0.85)
    b.cylinder(0, 3.35, 0, 1.45, 0.16, BRONZE_LT, 16, cap=False)
    for k in range(2):
        s = -1 if k else 1
        tbox(b, (s * 1.6, 3.0, 0), (0.18, 0.7, 0.5), BRONZE_LT, rz=s * 0.2)
    for j in range(10):
        a = j / 10 * math.tau
        tbox(b, (math.cos(a) * 1.58, 2.6, math.sin(a) * 1.58), (0.34, 0.36, 0.09), BRONZE_LT, yaw=-a + math.pi / 2)
    blob(b, (0, 3.45, 0), (1.25, 0.18, 1.25), lambda p, n: Paint(mix(C(0x9A2812), C(0xFFB23C), 0.5), 'rune'), nu=12, nv=4)
    for k in range(9):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0, 0.9)
        blob(b, (math.cos(a) * d, 3.55, math.sin(a) * d), (0.2, 0.15, 0.2), lambda p, n: Paint(mix(C(0xE05020), C(0xFFD060), rnd.random()), 'rune'), nu=6, nv=4)


def scorch(b, seed):
    """Vết sét cháy nám: đĩa đen nhám r 1,6–2,6 m sát đất, tia cháy tỏa hình sao 7–10 nhánh dài ngắn không đều, tâm có tinh thể sét (fulgurite) trắng xanh, vài mảnh đá nứt."""
    rnd = random.Random(seed)
    R0 = rnd.uniform(1.3, 2.0)
    blob(b, (0, 0.05, 0), (R0, 0.05, R0), lambda p, n: SOOT, nu=14, nv=3, v0=0.0, v1=0.5, amp=0.3, seed=seed)
    for i in range(rnd.randint(7, 10)):
        a = i / 9 * math.tau + rnd.uniform(-0.25, 0.25)
        ln = rnd.uniform(2.0, 6.5)
        wd = rnd.uniform(0.2, 0.55)
        tbox(b, (math.cos(a) * (R0 + ln / 2 - 0.4), 0.045, math.sin(a) * (R0 + ln / 2 - 0.4)), (ln, 0.06, wd), SOOT, yaw=-a)
        tbox(b, (math.cos(a) * (R0 + ln * 0.35), 0.075, math.sin(a) * (R0 + ln * 0.35)), (ln * 0.55, 0.03, wd * 0.22), volt(rnd.uniform(0.4, 0.9)), yaw=-a)
    for k in range(3):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0, 0.7)
        rod(b, (math.cos(a) * d, 0.0, math.sin(a) * d), (math.cos(a) * d * 1.2 + rnd.uniform(-0.3, 0.3), rnd.uniform(0.5, 1.0), math.sin(a) * d * 1.2 + rnd.uniform(-0.3, 0.3)), 0.08, 0.02, lambda p, n: volt(0.9), nu=5, nv=2, amp=0.0)


def crag(b, seed):
    """Đá vỡ cháy xém bị sét đánh: 5–8 phiến/khối góc cạnh nghiêng chồng nhau cao 1–4 m, mặt trên cháy đen, vết nứt điện tím-trắng chạy dọc phiến, đá vụn góc cạnh quanh chân."""
    rnd = random.Random(seed)
    for k in range(rnd.randint(5, 8)):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0, 2.4)
        h = rnd.uniform(1.0, 4.0)
        w = rnd.uniform(0.7, 1.6)
        t = rnd.uniform(0.5, 1.3)
        cx, cz = math.cos(a) * d, math.sin(a) * d
        rx, rz, yaw = rnd.uniform(-0.45, 0.45), rnd.uniform(-0.45, 0.45), rnd.uniform(0, 3.1)
        tbox(b, (cx, h * 0.45, cz), (w, h, t), granite(seed + k, -0.1)((cx, h * 0.5, cz), (1, 0, 0)), rx=rx, rz=rz, yaw=yaw)
        tbox(b, (cx, h * 0.95, cz), (w * 0.9, 0.12, t * 0.9), SOOT, rx=rx, rz=rz, yaw=yaw)  # mặt cháy đen
        if rnd.random() < 0.8:  # khe điện chạy dọc phiến
            tbox(b, (cx + math.cos(yaw) * w * 0.52, h * 0.5, cz - math.sin(yaw) * w * 0.52), (0.06, h * 0.8, 0.05), volt(rnd.uniform(0.4, 0.9)), rx=rx, rz=rz + rnd.uniform(-0.3, 0.3), yaw=yaw)
    for k in range(7):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(1.8, 3.6)
        tbox(b, (math.cos(a) * d, 0.18, math.sin(a) * d), (rnd.uniform(0.3, 0.8), rnd.uniform(0.25, 0.5), rnd.uniform(0.3, 0.7)), granite(seed + 50 + k, -0.2)((0, 0.2, 0), (0, 1, 0)), rx=rnd.uniform(-0.6, 0.6), rz=rnd.uniform(-0.6, 0.6), yaw=a)


def chain(b, seed):
    """Dây xích từ trụ về đài, dọc trục -x dài 15 m: từ (0, 4.6) võng xuống (−15, 0.5); mắt xích nhỏ xen kẽ ngang/dọc; hai đầu có vòng neo."""
    N = 34
    L = 15.0
    top, bot = 4.6, 0.55
    for i in range(N):
        q = i / (N - 1)
        x = -q * L
        y = top + (bot - top) * q - 2.2 * math.sin(math.pi * q) * 0.0 - 1.1 * math.sin(math.pi * q)
        y = max(y, 0.35)
        tbox(b, (x, y, 0.0), (0.34, 0.12, 0.12), IRON, rz=0.0, rx=(0.0 if i % 2 == 0 else math.pi / 2))
    tbox(b, (-0.5, top, 0.0), (0.5, 0.5, 0.5), IRON, yaw=0.0)
    tbox(b, (-L, bot, 0.0), (0.6, 0.35, 0.6), IRON)
    for k in range(4):  # mắt xích có điện chạy qua
        q = (k + 0.5) / 4
        x = -q * L
        y = max(top + (bot - top) * q - 1.1 * math.sin(math.pi * q), 0.35)
        tbox(b, (x, y + 0.01, 0.0), (0.2, 0.05, 0.05), volt(0.8))


def spire(b, seed):
    kta.karst(b, 55.0, 9.0, 0.55, seed)


def stump(b, seed):
    """Cây tùng bị sét đánh: thân cháy đen vặn xoắn cao 4–6 m, chẻ đôi từ ngọn, vài cành cụt."""
    rnd = random.Random(seed)
    H = rnd.uniform(4.0, 6.0)
    rod(b, (0, 0, 0), (0.5, H, 0.2), 0.55, 0.2, lambda p, n: SOOT, nu=9, nv=7, amp=0.22, seed=seed)
    rod(b, (0.5, H, 0.2), (1.2, H + 1.4, 0.7), 0.18, 0.05, lambda p, n: SOOT, nu=6, nv=3, amp=0.1)
    rod(b, (0.5, H, 0.2), (-0.4, H + 0.9, -0.5), 0.15, 0.04, lambda p, n: SOOT, nu=6, nv=3, amp=0.1)
    for k in range(3):
        y = H * rnd.uniform(0.3, 0.8)
        a = rnd.uniform(0, math.tau)
        rod(b, (0.5 * y / H, y, 0.2 * y / H), (0.5 * y / H + math.cos(a) * 1.3, y + 0.4, 0.2 * y / H + math.sin(a) * 1.3), 0.1, 0.04, lambda p, n: SOOT, nu=6, nv=2, amp=0.1)
    blob(b, (0.5, 0.2, 0.2), (0.9, 0.3, 0.9), lambda p, n: gp(seed + 3), nu=8, nv=4, amp=0.3)


def build_variants():
    v = {}
    b = new_b(1400)
    paving(b, 1400)
    v['paving'] = b
    for i in range(2):
        b = new_b(1410 + i)
        pillar(b, 1410 + i * 7, broken=False)
        v[f'pillar{i}'] = b
    for i in range(2):
        b = new_b(1420 + i)
        pillar(b, 1420 + i * 5, broken=True)
        v[f'bpillar{i}'] = b
    b = new_b(1430)
    cauldron(b, 1430)
    v['cauldron'] = b
    for i in range(4):
        b = new_b(1440 + i)
        scorch(b, 1440 + i * 5)
        v[f'scorch{i}'] = b
    for i in range(3):
        b = new_b(1450 + i)
        crag(b, 1450 + i * 9)
        v[f'crag{i}'] = b
    b = new_b(1470)
    chain(b, 1470)
    v['chain'] = b
    for i in range(3):
        b = new_b(1480 + i)
        spire(b, 1480 + i * 13)
        v[f'spire{i}'] = b
    for i in range(3):
        b = new_b(1460 + i)
        stump(b, 1460 + i * 4)
        v[f'stump{i}'] = b
    return v


def run(out):
    bs.make_textures()
    variants = build_variants()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = ts.materials_for(list(variants.values()))
    meshes = {k: ts.make_mesh(f'dk_{k}', b, keys, images, bevel=False) for k, b in variants.items()}
    rnd = random.Random(SEED)
    n_obj = 0

    def put(kind, var, x, z, **kw):
        nonlocal n_obj
        kta.place(f'dk_{kind}_{n_obj}', meshes[var], x, z, **kw)
        n_obj += 1

    def free(x, z, r=0.0):
        """Chừa lối vào phía nam (|x| < 8, z > 24)."""
        return not (abs(x) < 8 + r and z > 24)

    put('paving', 'paving', 0.0, 0.0)
    # tám lôi trụ quanh r 36 (bỏ trụ chắn lối vào phía nam: dịch lệch sang hai bên), xen kẽ trụ nguyên và trụ gãy
    for k in range(8):
        a = k / 8 * math.tau + 0.2
        x, z = math.cos(a) * 36, math.sin(a) * 36
        moved = not free(x, z, 3)
        if moved:
            x = math.copysign(12.0, x)
            z = 40.0
        broken = k in (2, 5)
        put('pillar', ('bpillar%d' % rnd.randrange(2)) if broken else ('pillar%d' % rnd.randrange(2)), x, z, yaw=rnd.uniform(0, 6.28))
        ang = math.atan2(z, x)
        dist = math.hypot(x, z)
        if not moved:
            put('chain', 'chain', x, z, yaw=ang - math.pi, scale=(dist - 21.0) / 15.0)
    # bốn đỉnh đồng ở r 28 trên hai đường chéo
    for (x, z) in ((-20, -20), (20, -20), (-20, 20), (20, 20)):
        put('cauldron', 'cauldron', x * 1.02, z * 1.02, yaw=rnd.uniform(0, 6.28), scale=1.05)
    # vết sét cháy rải sân (cách tâm 10–60 m, chừa lối vào)
    got = 0
    while got < 18:
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(11, 62)
        x, z = math.cos(a) * d, math.sin(a) * d
        if not free(x, z, 3):
            continue
        put('scorch', f'scorch{rnd.randrange(4)}', x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(0.8, 1.5))
        got += 1
    # tảng đá nung quanh vành r 42–72
    got = 0
    while got < 18:
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(42, 74)
        x, z = math.cos(a) * d, math.sin(a) * d
        if not free(x, z, 5):
            continue
        put('crag', f'crag{rnd.randrange(3)}', x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(0.8, 1.6))
        got += 1
    got = 0
    while got < 8:
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(44, 72)
        x, z = math.cos(a) * d, math.sin(a) * d
        if not free(x, z, 5):
            continue
        put('stump', f'stump{rnd.randrange(3)}', x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(0.9, 1.3))
        got += 1
    # cột đá nhọn xa mọc từ biển mây, r 118–175
    for k in range(16):
        a = k / 16 * math.tau + rnd.uniform(-0.15, 0.15)
        d = rnd.uniform(118, 178)
        put('spire', f'spire{rnd.randrange(3)}', math.cos(a) * d, math.sin(a) * d, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(0.8, 1.6))
    ts.export_glb(out)
    size, prims, tris, doc = bs.inspect(out)
    print(f'[do_kiep] {out}: {size / 1024:.0f} KB, {n_obj} vật, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)})')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_do_kiep.glb')
