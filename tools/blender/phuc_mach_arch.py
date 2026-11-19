# Cảnh Phục Mạch Quật (DUN-1 PR2, phong cách B): hầm mỏ cũ của Tàng Mạch Hội. Cụm mạch tinh lam lục khổng lồ phát sáng, cột đá sa thạch phân tầng
# bao quanh, khung chống gỗ, cửa hầm có ray + xe quặng, đống quặng, thùng, cuốc, xương thợ mỏ, nhũ đá và mạch tinh treo trần.
# Dùng lại bộ dựng của Kiếm Trủng (kiem_trung_arch.py: lưới điêu khắc, hộp nghiêng, karst, xương) với bảng màu sa thạch.
#
#   blender --background --python tools/blender/phuc_mach_arch.py -- assets/build/raw/arch_phuc_mach.glb
#
# Gốc toạ độ = tâm hầm (1520, y, 1300); x = đông, z = nam. Mỗi vật một object `pm_*` gốc ở chân (y = 0); object tên `pm_ceil_*` treo trần: client đặt y
# theo độ cao vòm hang tại chỗ, các vật khác hạ theo `heightAt`. Vật cùng loại dùng chung lưới.

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

bs.MATERIALS['vein'] = Mat(0.3, 0.0, None, 1.0, False, 0.0, (0x1FC49C, 0.25))  # client thay bằng vật liệu tinh thể (fresnel + gradient theo màu đỉnh)
bs.MATERIALS['crystal'] = Mat(0.18, 0.1, None, 1.0, False, 0.0)

# bảng màu sa thạch cho các hàm dùng chung của Kiếm Trủng (chúng đọc biến toàn cục lúc gọi)
kta.ROCK[:] = [C(0x8A6444), C(0x6A4C34), C(0x9C7650), C(0x45342A)]
kta.HAZE = C(0x140E0A)  # xa thì chìm vào tối (hang kín), không ngả sáng như ngoài trời
kta.RUST = C(0x8A4E2E)
kta.MOSS = C(0x5A5A34)
kta.SOIL = C(0x5A4332)

TEAL = C(0x39E0B8)
TEAL_DK = C(0x0F5E54)
WOODC = C(0x5C4630)
WOOD_DK = C(0x33271C)
IRON = C(0x3E3A36)

VEIN = Paint(C(0x06231E), 'vein')  # nền tối: ánh lục đến từ emissive của vật liệu, không bị nắng đẩy cháy trắng
CRYS = Paint(C(0x0C3A33), 'crystal')
TIMBER = Paint(WOODC, 'wood')
TIMBER_D = Paint(WOOD_DK, 'wood')
IRONP = Paint(IRON, 'metal')

SEED = 20261119
DOME_R, DOME_H = 135.0, 75.0
# Ba khe sáng trên trần (khớp OCULI trong client phucMachArt.ts): chừa phiến đá và nhũ đá quanh đó.
OCULI = [(55 * math.cos(a), 55 * math.sin(a)) for a in (0.9, 2.9, 5.0)]


def near_oculus(x, z, d=16.0):
    return any(math.hypot(x - ox, z - oz) < d for ox, oz in OCULI)


def dome_h(r):
    return DOME_H * math.sqrt(max(0.0, 1.0 - (r / DOME_R) ** 2))


# ---------- mạch tinh ----------


def crystal_prism(b, ox, oz, dx, dz, h, r, ph, glow_ratio, rnd):
    """Một tinh thể lăng trụ lục giác: tiết diện co dần về mũi nhọn qua nhiều vòng; màu đỉnh là gradient từ chân tối → lõi sáng ở mũi (client dùng màu đỉnh làm phát sáng),
    mặt xen kẽ 'mạch' (phát sáng) và 'kính' (sẫm, chỉ bắt viền)."""
    sides = 6
    rings = [(0.0, 1.0), (0.05, 1.0), (0.3, 0.97), (0.55, 0.9), (0.75, 0.78), (0.9, 0.55), (1.0, 0.0)]
    prev = None
    for q, rk in rings:
        ring = []
        for j in range(sides):
            ang = ph + j / sides * math.tau
            ring.append((ox + dx * q * h + math.cos(ang) * r * rk, q * h - 0.05 * h, oz + dz * q * h + math.sin(ang) * r * rk))
        if prev:
            for j in range(sides):
                k2 = (j + 1) % sides
                glow = rnd.random() < glow_ratio
                t = q ** 1.3
                col = Paint(mix(C(0x0A3A32), C(0x7FFFE0), t), 'vein') if glow else Paint(mix(C(0x04201C), C(0x2F9C88), t), 'crystal')
                b.poly([prev[j], prev[k2], ring[k2], ring[j]], (ox, 0, oz), col)
        prev = ring


def crystal_cluster(b, H, seed, glow_ratio=0.62):
    """Cụm tinh thể mọc từ đống đá: tinh thể giữa cao nhất, các tinh thể bên nghiêng ra ngoài với độ cao/độ dày rất khác nhau, và nhiều mảnh tinh thể vụn quanh gốc."""
    rnd = random.Random(seed)
    for k in range(5):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0.1, 0.32) * H
        r = rnd.uniform(0.12, 0.22) * H
        blob(b, (math.cos(a) * d, r * 0.4, math.sin(a) * d), (r, r * 0.8, r * rnd.uniform(0.7, 1.0)), kta.rock_col(seed + k, strata=1.5, moss_amt=0.0), nu=10, nv=6, e=2.0, amp=0.3, seed=seed + 5 + k, rot=a)
    n = rnd.randint(7, 12)
    for c in range(n):
        if c == 0:
            a, lean, h, r = 0.0, rnd.uniform(-0.05, 0.05), H, 0.085 * H
            ox = oz = 0.0
        else:
            a = c / (n - 1) * math.tau + rnd.uniform(-0.3, 0.3)
            d = rnd.uniform(0.06, 0.26) * H
            ox, oz = math.cos(a) * d, math.sin(a) * d
            lean = rnd.uniform(0.15, 0.6)
            h = H * rnd.uniform(0.18, 0.85)
            r = 0.055 * H * rnd.uniform(0.5, 1.3)
        crystal_prism(b, ox, oz, math.cos(a) * lean, math.sin(a) * lean, h, r, rnd.uniform(0, 1), glow_ratio, rnd)
    for k in range(22):  # mảnh vụn quanh gốc
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0.12, 0.42) * H
        crystal_prism(b, math.cos(a) * d, math.sin(a) * d, rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), rnd.uniform(0.04, 0.13) * H, rnd.uniform(0.008, 0.02) * H, rnd.uniform(0, 1), 0.7, rnd)
    return b


def cave_wall(b, seed):
    """Một đoạn vách hang liền khối (rộng ~24 m, cao 48 m), PHÁ NHỊP: tầng phiến cao thấp bất kỳ (3,5–10,5 m), mỗi tầng 1–4 khối rộng hẹp khác nhau, độ nhô vào/ra và độ nghiêng lệch mạnh (có tầng nhô hẳn như mái
    đua), thớ đá mỗi khối một mức; khe tối chỉ ở vài tầng; vài vết nứt dọc, trụ đá lớn nhô từ chân lên và mảng sập; ghép vòng quanh thành vách kín (8 biến thể, đặt xoay/giãn ngẫu nhiên nên không thấy lặp)."""
    rnd = random.Random(seed)
    W = 24.0
    y = -4.0
    row = 0
    while y < 46.0:
        hgt = rnd.choice((3.5, 5.0, 6.5, 8.0, 10.5)) * rnd.uniform(0.85, 1.15)
        nb = rnd.choice((1, 2, 2, 3, 4))
        cuts = sorted(rnd.uniform(0.15, 0.85) for _ in range(nb - 1))
        edges = [0.0] + cuts + [1.0]
        for k in range(nb):
            w = (edges[k + 1] - edges[k]) * W
            x = (edges[k] + edges[k + 1]) / 2 * W - W / 2
            out = rnd.uniform(-3.0, 2.0) + (rnd.choice((0.0, 0.0, 3.5, 5.0)) if rnd.random() < 0.45 else 0.0)
            blob(b, (x, y + hgt / 2, out), (w * rnd.uniform(0.55, 0.72), hgt * rnd.uniform(0.5, 0.68), rnd.uniform(3.5, 9.0)),
                 kta.rock_col(seed + row * 7 + k, haze=0.08 + 0.04 * row, strata=rnd.uniform(0.8, 2.8), moss_amt=0.0),
                 nu=12, nv=6, e=rnd.uniform(2.2, 3.0), amp=rnd.uniform(0.3, 0.5), seed=seed + row * 5 + k, rot=rnd.uniform(0, 3))
        if rnd.random() < 0.4:  # khe tối sau tầng (chỉ vài tầng)
            tbox(b, (rnd.uniform(-4, 4), y + 0.2, -3.0), (rnd.uniform(10, W), 0.6, 3.0), Paint(C(0x0A0705), 'earth'))
        y += hgt * rnd.uniform(0.75, 0.95)
        row += 1
    # vết nứt dọc tối
    for k in range(rnd.randint(2, 4)):
        x = rnd.uniform(-W / 2 + 2, W / 2 - 2)
        tbox(b, (x, rnd.uniform(8, 24), -1.0), (rnd.uniform(0.4, 1.1), rnd.uniform(10, 26), 3.0), Paint(C(0x0A0705), 'earth'), rz=rnd.uniform(-0.12, 0.12))
    # trụ đá lớn nhô từ chân vách lên + mảng sập
    for k in range(rnd.randint(1, 3)):
        hh = rnd.uniform(10, 30)
        blob(b, (rnd.uniform(-W / 2 + 3, W / 2 - 3), hh * 0.4, rnd.uniform(3.0, 6.5)), (rnd.uniform(2.2, 4.0), hh * 0.5, rnd.uniform(2.0, 3.5)),
             kta.rock_col(seed + 40 + k, haze=0.05, strata=rnd.uniform(1.0, 2.5), moss_amt=0.0), nu=10, nv=7, e=2.2, amp=0.4, seed=seed + 41 + k, v0=0.0, v1=0.9)
    # khối chân vách + đá lở
    for k in range(6):
        blob(b, (rnd.uniform(-W / 2, W / 2), 1.2, rnd.uniform(2.5, 6.0)), (rnd.uniform(1.4, 3.6), rnd.uniform(1.2, 2.2), rnd.uniform(1.2, 2.8)), kta.rock_col(seed + 90 + k, moss_amt=0.0), nu=8, nv=5, e=2.0, amp=0.35, seed=seed + 95 + k)


def ceil_slab(b, seed):
    """Phiến đá trần treo (gốc ở trần, thân hướng xuống): dày 2–5 m, mép dưới lởm chởm, sẫm; ghép với nhũ đá làm trần hang nhiều lớp."""
    rnd = random.Random(seed)
    for k in range(3):
        blob(b, (rnd.uniform(-5, 5), -1.8 - k * 0.9, rnd.uniform(-4, 4)), (rnd.uniform(8, 15) - k * 2, rnd.uniform(1.6, 3.0), rnd.uniform(6, 11) - k * 1.5),
             kta.rock_col(seed + k, haze=0.15, strata=2.0, moss_amt=0.0), nu=12, nv=6, e=2.5, amp=0.4, seed=seed + k, v0=0.5, v1=1.0)


def winch(b, seed):
    """Giá tời: khung chữ A bằng gỗ, trống quấn dây thừng, ròng rọc, thùng quặng treo."""
    rnd = random.Random(seed)
    for sz in (-1, 1):
        for sx in (-1, 1):
            tbox(b, (sx * 1.6, 3.4, sz * 1.8), (0.4, 7.2, 0.4), TIMBER, rx=-sz * 0.25, rz=sx * 0.2)
    tbox(b, (0, 6.6, 0), (3.6, 0.45, 0.45), TIMBER_D)
    b.cylinder(0, 1.4, 0, 0.7, 2.6, TIMBER_D, 12)
    tbox(b, (0, 1.6, 0), (0.12, 0.12, 3.8), IRONP, yaw=math.pi / 2)
    for k in range(5):
        b.cylinder(0, 1.5 + k * 0.42, 0, 0.74, 0.12, Paint(C(0x8A7A5A), 'plaster'), 10)
    b.cylinder(0, 5.6, 0, 0.55, 0.3, IRONP, 12)
    b.box(0, 3.4, 0.2, 0.05, 4.4, 0.05, Paint(C(0x8A7A5A), 'plaster'))
    tbox(b, (0, 1.3, 0.2), (1.1, 0.9, 1.1), Paint(C(0x4A3F36), 'metal'))
    for k in range(4):
        blob(b, (rnd.uniform(-0.3, 0.3), 1.9, rnd.uniform(-0.3, 0.5)), (0.3, 0.22, 0.3), kta.rock_col(seed + k, moss_amt=0.0), nu=6, nv=4, e=1.8, amp=0.3, seed=seed + k)


def stalactite(b, L, r, seed):
    rnd = random.Random(seed)
    sides = 8
    prev = None
    for i in range(7):
        q = i / 6
        rk = (1.0 - q) ** 0.8 + 0.02
        y = -L * q
        ring = []
        for j in range(sides):
            ang = j / sides * math.tau
            rr = r * rk * (1.0 + 0.18 * (fbm3(j * 2.3, q * 4, seed, seed, 2) - 0.5))
            ring.append((math.cos(ang) * rr + 0.04 * L * q * q, y, math.sin(ang) * rr))
        if prev:
            for j in range(sides):
                k2 = (j + 1) % sides
                shade = 0.7 + 0.5 * fbm3(j, q * 3, seed, seed + 2, 2)
                col = Paint(tuple(c * shade for c in kta.ROCK[(j + i) % 4]), 'stone')
                b.poly([prev[j], prev[k2], ring[k2], ring[j]], (0, y, 0), col)
        prev = ring
    # hoa văn nước khoáng: tinh thể nhỏ ở mũi
    if rnd.random() < 0.4:
        b.box(0.04 * L, -L * 0.96, 0, 0.12, 0.5, 0.12, VEIN)


# ---------- khung gỗ chống hầm, ray, xe, thùng... ----------


def timber_frame(b, seed):
    rnd = random.Random(seed)
    W, Hh = 5.2, 5.6
    for sx in (-1, 1):
        tbox(b, (sx * W / 2, Hh / 2 - 0.2, 0), (0.55, Hh + 0.4, 0.55), TIMBER, rz=rnd.uniform(-0.04, 0.04))
        tbox(b, (sx * W / 2, 0.15, 0), (0.9, 0.3, 0.9), Paint(kta.ROCK[1], 'stone'))
    tbox(b, (0, Hh + 0.1, 0), (W + 1.2, 0.5, 0.6), TIMBER_D, rz=rnd.uniform(-0.03, 0.03))
    for sx in (-1, 1):  # giằng chéo
        tbox(b, (sx * W * 0.38, Hh - 0.9, 0), (0.28, 1.9, 0.3), TIMBER, rz=-sx * 0.62)
    # đèn treo + dây
    b.box(0, Hh - 0.7, 0.1, 0.03, 1.2, 0.03, IRONP)
    b.box(0, Hh - 1.5, 0.1, 0.4, 0.5, 0.4, Paint(C(0xFFB869), 'lamp'))


def rails(b, L, seed):
    """Hai thanh ray sắt + tà vẹt gỗ dài L (dọc trục z)."""
    n = int(L / 1.1)
    for k in range(n):
        tbox(b, (0, 0.06, k * 1.1 - L / 2), (1.9, 0.12, 0.28), TIMBER_D)
    for sx in (-0.65, 0.65):
        b.box(sx, 0.17, 0, 0.12, 0.1, L, Paint(C(0x6E5A4A), 'metal'))


def cart(b, seed):
    rnd = random.Random(seed)
    tbox(b, (0, 0.95, 0), (1.9, 1.1, 2.9), Paint(C(0x4A3F36), 'metal'))
    tbox(b, (0, 1.55, 0), (2.1, 0.12, 3.1), Paint(C(0x5A4A3C), 'metal'))
    for sx in (-1, 1):
        for sz in (-1, 1):
            b.cylinder(sx * 1.05, 0.0, sz * 1.0, 0.42, 0.14, IRONP, 10)
    # quặng đầy xe: cục đá + tinh thể
    for k in range(9):
        blob(b, (rnd.uniform(-0.7, 0.7), 1.75, rnd.uniform(-1.1, 1.1)), (0.38, 0.3, 0.38), kta.rock_col(seed + k, moss_amt=0.0), nu=7, nv=4, e=1.8, amp=0.3, seed=seed + k)
    for k in range(3):
        tbox(b, (rnd.uniform(-0.5, 0.5), 2.05, rnd.uniform(-0.8, 0.8)), (0.16, 0.7, 0.16), VEIN, rx=rnd.uniform(-0.4, 0.4), rz=rnd.uniform(-0.4, 0.4))


def ore_pile(b, seed):
    rnd = random.Random(seed)
    blob(b, (0, 0.5, 0), (2.2, 0.9, 1.9), kta.soil_col(seed), nu=12, nv=6, seed=seed, v0=0.0, v1=0.5, amp=0.3)
    for k in range(14):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0.0, 1.6)
        r = rnd.uniform(0.22, 0.5)
        blob(b, (math.cos(a) * d, 0.9 - 0.2 * d + r * 0.3, math.sin(a) * d), (r, r * 0.8, r), kta.rock_col(seed + k, moss_amt=0.0), nu=7, nv=4, e=1.7, amp=0.3, seed=seed + k, rot=a)
    for k in range(4):
        tbox(b, (rnd.uniform(-1, 1), 1.0, rnd.uniform(-0.8, 0.8)), (0.12, rnd.uniform(0.4, 0.9), 0.12), VEIN, rx=rnd.uniform(-0.5, 0.5), rz=rnd.uniform(-0.5, 0.5))
    # cuốc cắm đống quặng
    tbox(b, (1.0, 1.2, 0.3), (0.07, 1.6, 0.07), TIMBER, rz=0.5, rx=0.2)
    tbox(b, (1.55, 1.95, 0.3), (0.9, 0.1, 0.1), IRONP, rz=0.5, rx=0.2)


def crates(b, seed):
    rnd = random.Random(seed)
    for k in range(3):
        s = rnd.uniform(0.8, 1.2)
        tbox(b, (rnd.uniform(-0.9, 0.9), 0.5 * s + (0.9 * s if k == 2 else 0), rnd.uniform(-0.6, 0.6)), (s, s, s), TIMBER, yaw=rnd.uniform(0, 3))
    for k in range(2):  # thùng tròn
        b.cylinder(rnd.uniform(-1.2, 1.2), 0.0, rnd.uniform(0.6, 1.4), 0.4, 0.9, TIMBER_D, 10, 0.42)
    # dây thừng cuộn
    b.cylinder(1.3, 0.0, -0.8, 0.3, 0.25, Paint(C(0x8A7A5A), 'plaster'), 10)


def adit(b, seed):
    """Cửa hầm: khung gỗ lớn bao một hốc đen sâu (khối tối), có ray đi vào."""
    W, Hh = 9.0, 8.0
    tbox(b, (0, Hh / 2, -1.2), (W - 1.2, Hh, 0.5), Paint(C(0x07060A), 'earth'))
    for sx in (-1, 1):
        tbox(b, (sx * W / 2, Hh / 2, 0), (0.9, Hh + 0.4, 0.9), TIMBER)
        tbox(b, (sx * W / 2, 0.2, 0), (1.5, 0.4, 1.5), Paint(kta.ROCK[1], 'stone'))
    tbox(b, (0, Hh + 0.3, 0), (W + 2.0, 0.9, 1.0), TIMBER_D)
    tbox(b, (0, Hh + 1.3, 0), (W + 0.4, 0.5, 0.8), TIMBER)
    for sx in (-1, 1):
        tbox(b, (sx * W * 0.34, Hh - 1.4, 0), (0.45, 3.0, 0.5), TIMBER, rz=-sx * 0.8)
    # đá lở chắn một nửa lối
    for k in range(6):
        a = random.Random(seed + k).uniform(-1, 1)
        blob(b, (a * W * 0.4, 0.6, 1.8 + 0.4 * k), (random.Random(seed + k).uniform(0.7, 1.4), 0.7, 0.9), kta.rock_col(seed + k, moss_amt=0.0), nu=8, nv=5, e=1.9, amp=0.3, seed=seed + k)


def build_variants():
    v = {}
    for i in range(3):
        b = new_b(600 + i)
        crystal_cluster(b, 40.0, 600 + i)
        v[f'crystal_big{i}'] = b
    for i in range(3):
        b = new_b(620 + i)
        crystal_cluster(b, 7.0, 620 + i, 0.7)
        v[f'crystal_small{i}'] = b
    for i in range(3):
        b = new_b(640 + i)
        crystal_cluster(b, 9.0, 640 + i, 0.8)
        v[f'ceilcrystal{i}'] = b
    for hz in range(3):
        for i in range(3):
            b = new_b(660 + i + hz * 10)
            kta.karst(b, 40.0, 7.0 + 2.0 * i, (0.0, 0.3, 0.55)[hz], 700 + i * 7 + hz)
            v[f'pillar{hz}_{i}'] = b
    for i in range(4):
        b = new_b(680 + i)
        stalactite(b, 10.0 + 3 * i, 1.6 + 0.3 * i, 680 + i)
        v[f'stalac{i}'] = b
    b = new_b(700)
    timber_frame(b, 700)
    v['frame'] = b
    b = new_b(701)
    rails(b, 22.0, 701)
    v['rails'] = b
    b = new_b(709)
    rails(b, 14.5, 709)
    v['rails14'] = b
    for i in range(8):
        b = new_b(750 + i)
        cave_wall(b, 750 + i * 11)
        v[f'wall{i}'] = b
    for i in range(3):
        b = new_b(760 + i)
        ceil_slab(b, 760 + i * 7)
        v[f'slab{i}'] = b
    b = new_b(770)
    winch(b, 770)
    v['winch'] = b
    for i in range(2):
        b = new_b(702 + i)
        cart(b, 702 + i)
        v[f'cart{i}'] = b
    for i in range(3):
        b = new_b(704 + i)
        ore_pile(b, 704 + i)
        v[f'ore{i}'] = b
    for i in range(3):
        b = new_b(710 + i)
        crates(b, 710 + i)
        v[f'crates{i}'] = b
    b = new_b(720)
    adit(b, 720)
    v['adit'] = b
    for i in range(3):
        b = new_b(730 + i)
        kta.bones(b, 730 + i)
        v[f'bones{i}'] = b
    return v


def run(out):
    bs.make_textures()
    variants = build_variants()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = ts.materials_for(list(variants.values()))
    meshes = {k: ts.make_mesh(f'pm_{k}', b, keys, images, bevel=False) for k, b in variants.items()}
    rnd = random.Random(SEED)
    n_obj = 0

    def put(kind, var, x, z, **kw):
        nonlocal n_obj
        kta.place(f'pm_{kind}_{n_obj}', meshes[var], x, z, **kw)
        n_obj += 1

    def keep_out(x, z, min_r=30.0):
        return math.hypot(x, z) < min_r or (abs(x) < 9 and z > 0)

    # Cụm mạch tinh khổng lồ: một cụm 50 m ở bắc (điểm nhìn từ cửa hầm), vài cụm phụ ở vành.
    big = [(-8, -108, 50, 0), (62, -86, 34, 1), (-70, -78, 38, 2)]
    for i in range(7):
        a = i / 7 * math.tau + rnd.uniform(-0.2, 0.2) + 0.4
        r = 96 + rnd.uniform(0, 14)
        x, z = math.cos(a) * r, math.sin(a) * r
        if keep_out(x, z, 80) or any(math.hypot(g[0] - x, g[1] - z) < 30 for g in big):
            continue
        big.append((x, z, 16 + rnd.uniform(0, 14), rnd.randrange(3)))
    for x, z, h, v in big:
        h = min(h, dome_h(math.hypot(x, z)) * 0.8)
        put('crystal', f'crystal_big{v}', x, z, yaw=rnd.uniform(0, 6.28), scale=h / 40.0 * rnd.uniform(0.85, 1.2))
    # Vành cột đá sa thạch ba lớp.
    for ring, (r0, r1, cnt, hf) in enumerate(((94, 106, 16, 0.35), (106, 118, 14, 0.5))):
        for i in range(cnt):
            a = (i + rnd.uniform(0, 1)) / cnt * math.tau
            r = rnd.uniform(r0, r1)
            x, z = math.cos(a) * r, math.sin(a) * r
            h = dome_h(r) * hf * rnd.uniform(0.6, 1.2)
            put('pillar', f'pillar{ring}_{rnd.randrange(3)}', x, z, yaw=rnd.uniform(0, 6.28), scale=max(h, 8.0) / 40.0 * rnd.uniform(0.9, 1.1))
    # Vách hang liền khối bao kín: 40 đoạn rộng 24 m quanh r ≈ 114, chân hạ cố định (client đặt y theo mặt bằng hầm), đỉnh chạm vòm.
    for i in range(40):
        a = i / 40 * math.tau
        r = 114 + rnd.uniform(-2.5, 2.5)
        h = dome_h(r) + 4.0
        put('wall', f'wall{rnd.randrange(8)}', math.cos(a) * r, math.sin(a) * r, yaw=a + math.pi / 2 + rnd.uniform(-0.08, 0.08), scale=h / 48.0 * rnd.uniform(0.9, 1.15))
    # Cửa hầm quanh vành, mỗi cửa có đường ray chạy vào + xe quặng.
    adits = []
    for i in range(5):
        a = math.pi * 0.15 + i * (math.tau / 5.4) + (0.5 if i else 0.0)
        r = 93.0
        x, z = math.cos(a) * r, math.sin(a) * r
        if abs(x) < 16 and z > 0:
            continue
        adits.append((a, x, z))
        put('adit', 'adit', x, z, yaw=a + math.pi / 2, scale=1.0)
        for s in range(2):
            rr = r - 14 - s * 22
            put('rails', 'rails', math.cos(a) * rr, math.sin(a) * rr, yaw=a + math.pi / 2)
        rr = r - 30
        put('cart', f'cart{i % 2}', math.cos(a) * rr, math.sin(a) * rr, yaw=a + math.pi / 2)
    # Đường ray vòng nối các cửa hầm (r = 72), nhánh ray từ mỗi cửa vào đã có ở trên; thêm xe goòng và giá tời bên đường ray.
    ring_r = 72.0
    nseg = 31
    for k in range(nseg):
        a = k / nseg * math.tau
        x, z = math.cos(a) * ring_r, math.sin(a) * ring_r
        if abs(x) < 12 and z > 0:
            continue
        put('rails', 'rails14', x, z, yaw=a)
    for k in range(5):
        a = rnd.uniform(0, math.tau)
        x, z = math.cos(a) * (ring_r + 2.5), math.sin(a) * (ring_r + 2.5)
        if abs(x) < 16 and z > 0:
            continue
        put('winch', 'winch', x, z, yaw=a + math.pi / 2, scale=rnd.uniform(0.9, 1.3))
    for k in range(6):
        a = rnd.uniform(0, math.tau)
        x, z = math.cos(a) * ring_r, math.sin(a) * ring_r
        if abs(x) < 14 and z > 0:
            continue
        put('cart', f'cart{k % 2}', x, z, yaw=a)
    # Cột chống dọc vách: khung gỗ xếp sát chân vách cách ~7 m, mở vào trong hang.
    for k in range(46):
        a = k / 46 * math.tau
        x, z = math.cos(a) * 99, math.sin(a) * 99
        if abs(x) < 14 and z > 0:
            continue
        put('frame', 'frame', x, z, yaw=a + math.pi / 2, scale=1.25)
    # Khung chống gỗ dọc lối vào và quanh hầm.
    # (không đặt khung gỗ trên lối vào: camera phía sau người chơi sẽ bị chắn)
    for i in range(10):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(40, 86)
        x, z = math.cos(a) * r, math.sin(a) * r
        if keep_out(x, z, 34):
            continue
        put('frame', 'frame', x, z, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(0.9, 1.2))

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

    scatter('ore', 'ore{}', 26, 34, 90, (1.0, 1.7))
    scatter('crates', 'crates{}', 18, 36, 90, (1.0, 1.5))
    scatter('crystal', 'crystal_small{}', 52, 30, 92, (0.5, 2.0))
    scatter('bones', 'bones{}', 26, 32, 92, (1.4, 2.2))
    # Phiến đá trần treo (client đặt y theo vòm), chừa quanh ba khe sáng.
    for i in range(46):
        a = rnd.uniform(0, math.tau)
        r = 10 + 105 * math.sqrt(rnd.random())
        if near_oculus(math.cos(a) * r, math.sin(a) * r):
            continue
        put('ceil_slab', f'slab{rnd.randrange(3)}', math.cos(a) * r, math.sin(a) * r, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(1.0, 2.2))
    # Treo trần: nhũ đá và cụm mạch tinh treo ngược (client đặt y theo vòm).
    for i in range(70):
        a = rnd.uniform(0, math.tau)
        r = 14 + 100 * math.sqrt(rnd.random())
        if near_oculus(math.cos(a) * r, math.sin(a) * r):
            continue
        put('ceil_stalac', f'stalac{rnd.randrange(4)}', math.cos(a) * r, math.sin(a) * r, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(0.9, 1.8))
    for i in range(16):
        a = rnd.uniform(0, math.tau)
        r = 30 + 70 * math.sqrt(rnd.random())
        put('ceil_crystal', f'ceilcrystal{rnd.randrange(3)}', math.cos(a) * r, math.sin(a) * r, yaw=rnd.uniform(0, 6.28), scale=rnd.uniform(1.2, 2.2), lean=math.pi)
    ts.export_glb(out)
    size, prims, tris, doc = bs.inspect(out)
    print(f'[phuc_mach] {out}: {size / 1024:.0f} KB, {n_obj} vật, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)})')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_phuc_mach.glb')
