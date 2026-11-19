# Nhóm "Dị Vực" (Bắc Hoang) của PROP-1 (PR5): xương cự thú thu nhỏ, cột tà màu tím, tinh thể tím, chân đồng đổ nát phương Tây, cờ rách.
# Chuẩn v3: đá đen PBR, tinh thể gradient (chân tối → lõi sáng, fresnel ở client) màu tím trầm, đồng rỉ xanh PBR, vải rách có trọng số lắc; không pastel, không chữ Latin.
import math
import random

from build_sect import paint
from prop_tc_lib import BONE, BRONZE_D, CLOTH_D, DROCK, DROCK_L, GREEN_BR, IRON_RUST, STONE_D, STONE_M, WOOD_D, bs, crystal_cluster, ellipsoid, item, lathe, rock, tube, weight_from

CRYS_VIOLET = (0x140824, 0x8E6CC8)  # tím trầm: chân gần đen → lõi tím nhạt, không bão hòa
CLOTH_RIP = paint(0x4E1A28, 'cloth')
CLOTH_RIP_D = paint(0x2E1018, 'cloth')
EYE = paint(0x120E14, 'darkrock')
BRONZE_GREEN = paint(0x7A5C34, 'metal')  # đồng cổ: lib tự phủ patina xanh theo mặt ngửa/chỗ thấp


@item('xuong_cu_thu')
def _(b, v):
    # Xương cự thú thu nhỏ: cột sống nửa chôn, các cặp xương sườn cong, sọ nằm nghiêng có hốc mắt và hàm răng; biến thể có thêm xương sườn.
    for k in range(7):
        x = -1.6 + k * 0.5
        ellipsoid(b, x, 0.12, 0, 0.17, 0.14, 0.17, BONE, 9, 5)
    for k in range(3 if not v else 4):
        x = -1.2 + k * 0.62
        for s in (-1, 1):
            tube(b, [(x, 0.1, s * 0.1), (x, 0.9, s * 0.65), (x, 1.5, s * 0.55), (x + 0.08, 1.7, s * 0.1)], [0.07, 0.06, 0.05, 0.02], BONE, 6, sub=3)
    sx = 2.4
    ellipsoid(b, sx, 0.55, 0.2, 0.7, 0.5, 0.45, BONE, 10, 6, yaw=0.3)
    ellipsoid(b, sx + 0.8, 0.35, 0.28, 0.55, 0.25, 0.3, BONE, 10, 5, yaw=0.3)
    for z in (-0.05, 0.45):
        ellipsoid(b, sx + 0.05, 0.75, z + 0.05, 0.14, 0.14, 0.1, EYE, 7, 4)
    for k in range(5):
        b.box(sx + 0.55 + k * 0.15, 0.2, 0.52 - k * 0.02, 0.05, 0.14, 0.04, BONE, yaw=0.3)
    rock(b, 0, 0, -0.4, 0.35, DROCK_L, seed=2, squash=0.5, seg=7, rings=3)


@item('cot_ta_mau_tim')
def _(b, v):
    # Cột tà: cột đá đen vặn xoắn, nhiều khe nứt phát sáng tím trầm (gradient theo độ cao), vòng đá gai ở chân, cụm tinh thể tím nhỏ ở đỉnh.
    h = 5.0 if v else 4.0
    n = 9
    lo, hi = bs.srgb(0x1A0B2A), bs.srgb(0x8E6CC8)
    for i in range(n):
        y0, y1 = h * i / n, h * (i + 1) / n
        a0, a1 = i * 0.35, (i + 1) * 0.35
        r0, r1 = 0.65 - 0.3 * i / n, 0.65 - 0.3 * (i + 1) / n
        for k in range(5):
            t0, t1 = a0 + k / 5 * math.tau, a0 + (k + 1) / 5 * math.tau
            u0, u1 = a1 + k / 5 * math.tau, a1 + (k + 1) / 5 * math.tau
            b.face([(math.cos(t0) * r0, y0, math.sin(t0) * r0), (math.cos(u0) * r1, y1, math.sin(u0) * r1), (math.cos(u1) * r1, y1, math.sin(u1) * r1), (math.cos(t1) * r0, y0, math.sin(t1) * r0)], DROCK, False)
        a = a0 + 0.3
        t = (i + 1) / n
        col = bs.Paint(tuple(lo[c] * (1 - t) + hi[c] * t for c in range(3)), 'tcvein')
        b.box(math.cos(a) * (r0 - 0.03), (y0 + y1) / 2, math.sin(a) * (r0 - 0.03), 0.06, (y1 - y0) * 1.05, 0.05, col, yaw=-a)
    b.cylinder(0, 0, 0, 0.95, 0.3, DROCK_L, 7, 0.75)
    for k in range(7):  # đá gai quanh chân
        a = k / 7 * math.tau
        rock(b, math.cos(a) * 0.95, 0, math.sin(a) * 0.95, 0.22, DROCK_L, seed=k + 3 * v, squash=1.3, seg=6, rings=3)
    # cụm tinh thể nhỏ ở đỉnh cột
    from prop_tc_lib import crystal_prism

    rnd = random.Random(810 + v)
    for k in range(5):
        a = k / 5 * math.tau
        crystal_prism(b, math.cos(a) * 0.15, math.sin(a) * 0.15, math.cos(a) * 0.3, math.sin(a) * 0.3, rnd.uniform(0.5, 0.9), 0.07, rnd.uniform(0, 1), 0.7, rnd, CRYS_VIOLET, y0=h - 0.05)
    crystal_prism(b, 0, 0, 0.04, 0.0, 1.1, 0.11, 0.3, 0.8, rnd, CRYS_VIOLET, y0=h - 0.05)


@item('tinh_the_tim')
def _(b, v):
    # Tinh thể tím: cụm lớn mọc từ nền đá đen nứt (đứng giữa trụ cao, quanh là trụ nghiêng và mảnh vụn), tím trầm có gradient + fresnel.
    crystal_cluster(b, 2.6 if not v else 3.6, 900 + v * 13, CRYS_VIOLET, rock_color=DROCK)


@item('chan_dong_do_nat')
def _(b, v):
    # Chân đồng đổ nát phương Tây: bệ đá có vành, hai ống chân giáp đồng rỉ xanh (đồng PBR), mảnh giáp vỡ, mảnh đá, xích gỉ; v: thêm thân tượng đổ.
    b.box(0, 0.25, 0, 2.4, 0.5, 1.8, STONE_D)
    b.box(0, 0.6, 0, 2.0, 0.2, 1.4, STONE_M)
    b.box(0, 0.74, 0, 2.1, 0.06, 1.5, DROCK_L)
    for sx in (-0.5, 0.5):
        ellipsoid(b, sx, 0.9, 0.2, 0.28, 0.2, 0.55, BRONZE_GREEN, 10, 4)  # mũi giày giáp
        lathe(b, [(0.0, 0.7), (0.26, 0.7), (0.2, 1.7), (0.0, 1.7)], BRONZE_GREEN, 10, sx, -0.1)
        for yy in (0.95, 1.35):  # đai giáp
            b.cylinder(sx, yy, -0.1, 0.26, 0.07, BRONZE_D, 10, 0.24)
        b.cylinder(sx, 1.65, -0.1, 0.24, 0.08, BRONZE_D, 10)
    if v:  # thân tượng đổ: ống giáp nằm nghiêng ra trước bệ
        lathe(b, [(0.0, 0.0), (0.35, 0.0), (0.3, 1.1), (0.0, 1.1)], BRONZE_GREEN, 10, 1.8, 1.3, 0.1)
    for k in range(4):
        rock(b, -1.4 + k * 0.9, 0, 1.2 - 0.2 * (k % 2), 0.28, DROCK_L, seed=k, squash=0.5, seg=6, rings=3)
    tube(b, [(-1.2, 0.08, 1.4), (-0.6, 0.06, 1.6), (0.0, 0.1, 1.3), (0.5, 0.06, 1.55)], 0.03, IRON_RUST, 5, sub=3)


@item('co_rach')
def _(b, v):
    # Cờ rách: cột gỗ cháy xém nghiêng, cờ vải rách tua tủa bay một phía, chống đá; trọng số lắc theo độ dài vải (UV.x, shader gió ở client).
    b.cylinder(0, 0, 0, 0.1, 3.6, WOOD_D, 6, 0.07)
    for k in range(3):
        a = k * 2.1
        b.beam(math.cos(a) * 0.9, 0.0, math.sin(a) * 0.9, math.cos(a) * 0.1, 0.9, math.sin(a) * 0.1, 0.07, WOOD_D)
    strips = 5 if not v else 7
    n0 = len(b.faces)
    for k in range(strips):
        y = 3.4 - k * 0.1
        L = 1.4 - 0.18 * (k % 3) + (0.5 if k == 0 else 0)
        z0 = 0.05 * k
        w = 0.5 if k < strips - 1 else 0.35
        for s in range(5):
            t0, t1 = s / 5, (s + 1) / 5
            x0, x1 = 0.1 + t0 * L, 0.1 + t1 * L
            yy0, yy1 = y - math.sin(t0 * 3) * 0.12 - t0 * 0.2 * (k % 2), y - math.sin(t1 * 3) * 0.12 - t1 * 0.25 * (k % 2)
            col = CLOTH_RIP if (k + s) % 3 else CLOTH_RIP_D
            quad = [(x0, yy0, z0), (x1, yy1, z0), (x1, yy1 - w * (1 - 0.5 * t1), z0 + 0.02), (x0, yy0 - w * (1 - 0.5 * t0), z0 + 0.02)]
            b.face(quad, col)
            b.face(quad[::-1], col)
    weight_from(b, n0, 3.5, 2.2)
    rock(b, 0.0, 0, 0.0, 0.55, DROCK, seed=9, squash=0.5, seg=7, rings=3)
