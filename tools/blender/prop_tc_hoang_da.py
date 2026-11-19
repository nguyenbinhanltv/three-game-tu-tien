# Nhóm "Hoang dã" của PROP-1: đá linh khí, tre, cây cổ thụ uốn lượn (thẻ alpha), linh thảo/nấm phát sáng, mô cổ,
# cột đá đổ, rễ cây, khúc gỗ khô.
import math
import random

from build_sect import paint
from prop_tc_lib import (BARK, BARK_L, BAMBOO, BAMBOO_D, GLOW_B, GLOW_G, GLOW_P, GLOW_Y, LEAF_D, LEAF_G, LEAF_P, LEAF_Y, ROCK_D, ROCK_M, SOIL, STONE_D, STONE_L, STONE_M, WOOD_D, card, crystal, ellipsoid, item, lathe, leaf_cluster, rock, tube)

MOSS = paint(0x4F6B34, 'cloth')
MOSS_L = paint(0x7C9A48, 'cloth')
STEM = paint(0xD9D2B8, 'cloth')
CAP_Y = paint(0xB0603A, 'cloth')


@item('da_linh_khi')
def _(b, v):
    # Đá linh khí: tảng đá lớn, mạch tinh thể phát sáng nhô ra từ khe, rêu ở chân.
    glow, glow_m = (GLOW_B, 'b') if v else (GLOW_G, 'g')
    rock(b, 0, 0, 0, 1.3, ROCK_M, seed=3 + v, squash=1.1, seg=10, rings=5)
    rock(b, 0.9, 0, 0.3, 0.7, ROCK_D, seed=5 + v, squash=0.8)
    rock(b, -0.8, 0, -0.5, 0.55, ROCK_M, seed=8, squash=0.9)
    for k, (x, z, h, tx, tz) in enumerate(((0.2, 0.7, 1.0, 0.2, 0.3), (-0.3, 0.8, 0.7, -0.2, 0.2), (0.6, 0.5, 0.55, 0.15, 0.1))):
        crystal(b, x, 0.7 + k * 0.05, z, 0.13, h, glow, (tx, tz))
    for k in range(6):
        a = k / 6 * math.tau
        ellipsoid(b, math.cos(a) * 1.2, 0.1, math.sin(a) * 1.1, 0.3, 0.13, 0.28, MOSS, 6, 3)


@item('tre')
def _(b, v):
    # Bụi tre: 7–9 thân có đốt, lá thẻ alpha ở ngọn, cong nhẹ.
    rng = random.Random(11 + v)
    n = 9 if v else 7
    for i in range(n):
        a = rng.uniform(0, math.tau)
        rr = rng.uniform(0.1, 0.55)
        x0, z0 = math.cos(a) * rr, math.sin(a) * rr
        h = rng.uniform(5.5, 7.5) if v else rng.uniform(4.5, 6.5)
        lean = rng.uniform(0.2, 0.7)
        pts = [(x0, 0, z0), (x0 + math.cos(a) * lean * 0.3, h * 0.4, z0 + math.sin(a) * lean * 0.3), (x0 + math.cos(a) * lean, h * 0.75, z0 + math.sin(a) * lean), (x0 + math.cos(a) * lean * 2.0, h, z0 + math.sin(a) * lean * 2.0)]
        tube(b, pts, [0.075, 0.065, 0.05, 0.03], BAMBOO if i % 2 else BAMBOO_D, 5, sub=3)
        for t in (0.25, 0.5, 0.72):
            yy = h * t
            b.cylinder(x0 + math.cos(a) * lean * t * 0.8, yy - 0.02, z0 + math.sin(a) * lean * t * 0.8, 0.085 - t * 0.03, 0.05, BAMBOO_D, 5)
        for t in (0.6, 0.78, 0.92):
            leaf_cluster(b, pts[-1][0] - (1 - t) * math.cos(a) * 0.4, h * t, pts[-1][2] - (1 - t) * math.sin(a) * 0.4, 0.85, LEAF_G if i % 2 else LEAF_D, seed=i * 5 + int(t * 10), n=3)


@item('cay_co_thu')
def _(b, v):
    # Cây cổ thụ uốn lượn: thân xoắn có rễ nổi, ba cành lớn, tán lá thẻ alpha thành từng tầng.
    rng = random.Random(21 + v)
    h = 9.0 if v else 8.0
    pts = [(0, 0, 0), (0.5, h * 0.2, 0.2), (-0.3, h * 0.45, 0.5), (0.4, h * 0.7, -0.1), (0.1, h * 0.95, 0.2)]
    tube(b, pts, [0.8, 0.55, 0.4, 0.28, 0.12], BARK, 8, sub=4)
    for k in range(5):  # rễ nổi
        a = k / 5 * math.tau + 0.4
        tube(b, [(math.cos(a) * 0.3, 0.7, math.sin(a) * 0.3), (math.cos(a) * 1.1, 0.3, math.sin(a) * 1.1), (math.cos(a) * 1.9, 0.0, math.sin(a) * 1.9)], [0.35, 0.22, 0.08], BARK_L, 6, sub=3)
    crown = LEAF_P if v else LEAF_G
    for k in range(3):
        a = k / 3 * math.tau + 0.6
        s = [(pts[2][0], pts[2][1], pts[2][2]), (pts[2][0] + math.cos(a) * 1.5, pts[2][1] + 1.0, pts[2][2] + math.sin(a) * 1.5), (pts[2][0] + math.cos(a) * 3.0, pts[2][1] + 1.2, pts[2][2] + math.sin(a) * 3.0)]
        tube(b, s, [0.22, 0.16, 0.07], BARK, 6, sub=3)
        for t in range(5):
            leaf_cluster(b, s[2][0] + rng.uniform(-1.6, 1.6), s[2][1] + rng.uniform(-0.4, 1.4), s[2][2] + rng.uniform(-1.6, 1.6), 1.5, crown if t % 2 else LEAF_D, seed=k * 10 + t, n=4)
    for t in range(7):
        leaf_cluster(b, pts[4][0] + rng.uniform(-1.8, 1.8), pts[4][1] + rng.uniform(-0.8, 1.2), pts[4][2] + rng.uniform(-1.8, 1.8), 1.7, crown if t % 3 else LEAF_Y, seed=100 + t, n=4)


@item('linh_thao')
def _(b, v):
    # Linh thảo phát sáng: cụm lá dài cong, hoa/nụ phát sáng ở ngọn, nền cỏ rêu.
    rng = random.Random(31 + v)
    glow = GLOW_Y if v else GLOW_G
    ellipsoid(b, 0, 0.02, 0, 0.55, 0.08, 0.5, MOSS, 8, 3)
    for k in range(9 if v else 7):
        a = k / 7 * math.tau + rng.uniform(-0.3, 0.3)
        L = rng.uniform(0.5, 0.95)
        pts = [(math.cos(a) * 0.05, 0.03, math.sin(a) * 0.05), (math.cos(a) * L * 0.5, L * 0.55, math.sin(a) * L * 0.5), (math.cos(a) * L * 0.95, L * 0.7, math.sin(a) * L * 0.95)]
        tube(b, pts, [0.03, 0.025, 0.004], MOSS_L, 3, sub=2)
    for k in range(3):
        a = k * 2.1
        x, z = math.cos(a) * 0.12, math.sin(a) * 0.12
        tube(b, [(x, 0.03, z), (x * 2, 0.5, z * 2), (x * 2.5, 0.8 + k * 0.1, z * 2.5)], 0.014, MOSS_L, 3, sub=2)
        ellipsoid(b, x * 2.5, 0.88 + k * 0.1, z * 2.5, 0.12, 0.14, 0.12, glow, 7, 4)


@item('nam_phat_sang')
def _(b, v):
    # Nấm phát sáng: cụm nấm lớn nhỏ, mũ phát sáng, thân trắng, rêu.
    rng = random.Random(41 + v)
    cap = GLOW_P if v else GLOW_B
    ellipsoid(b, 0, 0.02, 0, 0.6, 0.08, 0.55, MOSS, 8, 3)
    for k in range(7):
        a = rng.uniform(0, math.tau)
        rr = rng.uniform(0.0, 0.4)
        s = rng.uniform(0.5, 1.3)
        x, z = math.cos(a) * rr, math.sin(a) * rr
        tube(b, [(x, 0, z), (x + 0.03 * s, 0.25 * s, z), (x, 0.5 * s, z)], [0.06 * s, 0.045 * s, 0.05 * s], STEM, 5, sub=2)
        lathe(b, [(0.0, 0.5 * s), (0.28 * s, 0.5 * s), (0.3 * s, 0.56 * s), (0.2 * s, 0.7 * s), (0.0, 0.74 * s)], cap if k % 3 else CAP_Y, 9, x, z, cap_top=False)
        lathe(b, [(0.28 * s, 0.5 * s), (0.04 * s, 0.5 * s)], STEM, 9, x, z, cap_top=False)


@item('mo_co')
def _(b, v):
    # Mô cổ: gò đất vồng phủ rêu cỏ, bia đá nghiêng có đế, bát hương đá, ba nén hương, vài hòn đá cuội quanh chân.
    lathe(b, [(0.0, 0.85), (0.45, 0.8), (0.95, 0.55), (1.35, 0.18), (1.55, 0.0)], SOIL, 14, 0.0, 0.0, 0.0, 1.0, 0.8)
    lathe(b, [(0.0, 0.88), (0.45, 0.83), (0.9, 0.6), (1.2, 0.3), (1.4, 0.12)], MOSS, 14, 0.0, 0.0, 0.0, 1.0, 0.8, cap_top=False)
    for k in range(5):
        a = k / 5 * math.tau + v
        ellipsoid(b, math.cos(a) * 0.7, 0.55, math.sin(a) * 0.55, 0.28, 0.09, 0.22, MOSS_L, 6, 3)
    yaw = 0.12 if v else -0.1
    b.box(0, 0.12, 1.25, 1.0, 0.24, 0.7, STONE_D)
    b.box(0, 0.78, 1.2, 0.7, 1.3, 0.14, STONE_L, yaw=yaw)
    b.box(0, 1.46, 1.2, 0.8, 0.12, 0.2, STONE_M, yaw=yaw)
    b.cylinder(0.0, 0.0, 1.85, 0.2, 0.22, STONE_M, 8, 0.17)  # bát hương đá
    for k in range(3):
        b.cylinder(-0.06 + k * 0.06, 0.22, 1.85, 0.008, 0.4, CAP_Y, 4)
    for k in range(4):
        rock(b, -1.0 + k * 0.6, 0, -1.1 + 0.3 * (k % 2), 0.22, STONE_M, seed=k, squash=0.6, seg=6, rings=3)


@item('cot_da_do')
def _(b, v):
    # Cột đá đổ: thân cột tròn nứt gãy chéo, đầu cột chạm, mảnh vỡ nằm cạnh, rêu.
    b.cylinder(0, 0, 0, 0.62, 0.5, STONE_D, 10, 0.55)
    b.cylinder(0, 0.5, 0, 0.45, 2.2 if not v else 3.0, STONE_M, 10, 0.4)
    b.box(0, 0.5 + (2.2 if not v else 3.0) - 0.05, 0, 0.9, 0.12, 0.9, STONE_L, yaw=0.5)  # đỉnh gãy phẳng
    lathe(b, [(0.0, 0.0), (0.4, 0.0), (0.4, 1.8), (0.0, 1.8)], STONE_M, 10, 1.4, 1.2, 0.35, smooth=True)
    for k, (x, z, s) in enumerate(((0.6, 0.8, 0.4), (-0.9, 0.7, 0.3), (1.0, -0.5, 0.35))):
        rock(b, x, 0, z, s, STONE_M, seed=k + 3 * v, squash=0.7, seg=6, rings=3)
    for k in range(5):
        a = k / 5 * math.tau
        ellipsoid(b, math.cos(a) * 0.55, 0.1, math.sin(a) * 0.55, 0.22, 0.1, 0.22, MOSS, 6, 3)


@item('re_cay')
def _(b, v):
    # Rễ cây khổng lồ trồi lên thành vòm: nhiều rễ uốn lượn, ngọn gốc cụt, rêu bám.
    rng = random.Random(51 + v)
    for k in range(7 if v else 6):
        a = k / 6 * math.tau + rng.uniform(-0.3, 0.3)
        r1, r2 = rng.uniform(1.5, 2.4), rng.uniform(2.8, 4.0)
        top = rng.uniform(1.8, 2.8)
        tube(b, [(math.cos(a) * 0.3, top, math.sin(a) * 0.3), (math.cos(a) * r1 * 0.6, top * 0.85, math.sin(a) * r1 * 0.6), (math.cos(a) * r1, top * 0.45, math.sin(a) * r1), (math.cos(a + 0.2) * r2, 0.05, math.sin(a + 0.2) * r2)], [0.28, 0.3, 0.22, 0.08], BARK if k % 2 else BARK_L, 6, sub=3)
    tube(b, [(0, 3.0, 0), (0.1, 1.5, 0.05), (0, 0, 0)], [0.45, 0.55, 0.7], BARK, 8, sub=2)
    ellipsoid(b, 0, 0.12, 0, 1.0, 0.18, 1.0, MOSS, 8, 3)
    for k in range(5):
        ellipsoid(b, rng.uniform(-1.8, 1.8), 0.05, rng.uniform(-1.8, 1.8), 0.4, 0.15, 0.35, MOSS_L, 6, 3)


@item('kho_go')
def _(b, v):
    # Khúc gỗ khô: thân đổ nằm ngang có mắt cành cụt, một gốc cây cụt có vòng năm, nấm nhỏ.
    from prop_tc_lib import lathe_x

    ring = paint(0xB59A6A, 'wood')
    lathe_x(b, [(0.0, -1.9), (0.42, -1.9), (0.45, -1.0), (0.4, 0.5), (0.36, 1.9), (0.0, 1.9)], BARK, 10, 0, 0.42, 0)
    for k in range(3):
        a = k * 2.1 + v
        tube(b, [(-0.8 + k * 0.9, 0.42 + math.cos(a) * 0.35, math.sin(a) * 0.35), (-0.8 + k * 0.9, 0.42 + math.cos(a) * 0.7, math.sin(a) * 0.7)], [0.1, 0.06], BARK_L, 5, sub=1)
    b.cylinder(1.5, 0, 1.5, 0.5, 0.55, BARK, 9, 0.45)
    b.cylinder(1.5, 0.55, 1.5, 0.45, 0.02, ring, 9)
    for k in range(4):
        ellipsoid(b, 1.4 + k * 0.1, 0.4 + k * 0.12, 1.0 - k * 0.0, 0.1, 0.05, 0.08, CAP_Y, 6, 3)
