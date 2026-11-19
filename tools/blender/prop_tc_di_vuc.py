# Nhóm "Dị Vực" (Bắc Hoang) của PROP-1 (PR5): kẻ xâm lăng dark fantasy phương Tây — sắt đen, xương, cờ chiến rách, tà trận tím.
# Món: xương cự thú thu nhỏ, cột tà màu tím, tinh thể tím, tàn tích tượng chiến binh Dị Vực gãy (id `chan_dong_do_nat`), cờ chiến rách.
# Chuẩn v3: đá đen PBR, tinh thể gradient tím trầm (`propCrystal`), sắt đen gỉ PBR (thép), vải rách có độ võng + mép xơ + lay gió; không pastel.
import math
import random

from build_sect import paint
from prop_tc_lib import BONE, DROCK, DROCK_L, STONE_D, STONE_M, bs, crystal_cluster, crystal_prism, ellipsoid, item, lathe, rock, tube, weight_from

CRYS_VIOLET = (0x2A1248, 0xA07CD8)  # tím trầm: chân tím sẫm vẫn phát sáng nhẹ (emissive đáy) → lõi tím nhạt
CLOTH_BLOOD = paint(0x4A1418, 'cloth')  # đỏ máu khô
CLOTH_DARK = paint(0x1E0D10, 'cloth')
CLOTH_EMBLEM = paint(0x0E0709, 'cloth')
BONE_D = paint(0x9A8C70, 'stone')  # xương ngà bẩn
BONE_DD = paint(0x5E5444, 'stone')  # vết bẩn/đất
SNOW = paint(0xC8D0D8, 'stone')
MOSS_B = paint(0x1B241C, 'cloth')  # rêu đen
EYE = paint(0x0A090B, 'darkrock')
IRON = paint(0x25272B, 'steel')  # sắt đen
IRON_R = paint(0x5C3A28, 'steel')  # sắt gỉ
IRON_L = paint(0x3A3D42, 'steel')


def _dirty(k):
    return BONE_D if k % 3 else BONE_DD


@item('xuong_cu_thu')
def _(b, v):
    # Xương cự thú: cột sống nửa chôn, xương sườn cong bẩn, sọ điêu khắc (gờ mày, hốc mắt sâu, hốc mũi, gò má, hàm dưới có răng, hai sừng, vết nứt), phủ tuyết/rêu đen.
    rng = random.Random(30 + v)
    for k in range(7):
        x = -1.7 + k * 0.5
        ellipsoid(b, x, 0.12, 0, 0.17, 0.14, 0.17, _dirty(k), 9, 5)
        b.box(x, 0.28, 0.0, 0.05, 0.16, 0.05, BONE_DD)
    for k in range(3 if not v else 4):
        x = -1.3 + k * 0.62
        for s in (-1, 1):
            tube(b, [(x, 0.1, s * 0.1), (x, 0.9, s * 0.65), (x, 1.5, s * 0.55), (x + 0.08, 1.7 - 0.2 * (k % 2), s * 0.1)], [0.07, 0.06, 0.05, 0.02], _dirty(k + s + 1), 6, sub=3)
    sx, sy, sz = 2.2, 0.0, 0.2
    ellipsoid(b, sx, sy + 0.55, sz, 0.62, 0.45, 0.42, BONE_D, 12, 7, yaw=0.3)
    ellipsoid(b, sx + 0.25, sy + 0.78, sz, 0.4, 0.14, 0.4, BONE_DD, 10, 4, yaw=0.3)
    for dz in (-0.2, 0.2):
        ellipsoid(b, sx + 0.52, sy + 0.55, sz + dz, 0.2, 0.18, 0.15, EYE, 9, 5, yaw=0.3)
        ellipsoid(b, sx + 0.4, sy + 0.4, sz + dz * 1.7, 0.12, 0.1, 0.07, BONE_DD, 7, 4)
    b.box(sx + 0.72, sy + 0.38, sz, 0.14, 0.2, 0.1, EYE, yaw=0.3)
    ellipsoid(b, sx + 0.95, sy + 0.34, sz + 0.02, 0.42, 0.2, 0.26, BONE_D, 10, 5, yaw=0.3)
    ellipsoid(b, sx + 0.85, sy + 0.12, sz + 0.05, 0.4, 0.1, 0.22, BONE_DD, 10, 4, yaw=0.3)
    for k in range(6):
        b.box(sx + 0.72 + k * 0.13, sy + 0.23, sz + 0.2 - 0.02 * k, 0.05, 0.13, 0.04, SNOW, yaw=0.3)
        b.box(sx + 0.72 + k * 0.13, sy + 0.2, sz - 0.14 + 0.01 * k, 0.05, 0.1, 0.04, BONE_D, yaw=0.3)
    for s in (-1, 1):
        tube(b, [(sx - 0.05, sy + 0.85, sz + s * 0.3), (sx - 0.2, sy + 1.25, sz + s * 0.55), (sx + 0.1, sy + 1.6, sz + s * 0.6), (sx + 0.4, sy + 1.7, sz + s * 0.5)], [0.1, 0.075, 0.05, 0.015], BONE_DD, 7, sub=3)
    for k in range(5):
        b.box(sx - 0.1 + k * 0.12, sy + 0.9 - k * 0.07, sz + 0.02 * k, 0.03, 0.18, 0.03, EYE, yaw=0.2 * k)
    for k in range(6):
        a = rng.uniform(0, math.tau)
        ellipsoid(b, sx + math.cos(a) * 0.3, sy + 0.92 - 0.15 * (k % 3), sz + math.sin(a) * 0.3, 0.18, 0.05, 0.16, SNOW, 9, 3)
    for k in range(7):
        ellipsoid(b, -1.7 + k * 0.55, 0.04, rng.uniform(-0.2, 0.2), 0.3, 0.06, 0.2, MOSS_B, 10, 3)
    rock(b, 0, 0, -0.4, 0.35, DROCK_L, seed=2, squash=0.5, seg=7, rings=3)


@item('cot_ta_mau_tim')
def _(b, v):
    # Cột tà: cột đá đen vặn xoắn, khe nứt phát sáng tím trầm theo gradient, đá gai ở chân, chùm tinh thể ở đỉnh.
    h = 5.0 if v else 4.0
    n = 9
    lo, hi = bs.srgb(0x2A1248), bs.srgb(0xA07CD8)
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
    for k in range(7):
        a = k / 7 * math.tau
        rock(b, math.cos(a) * 0.95, 0, math.sin(a) * 0.95, 0.22, DROCK_L, seed=k + 3 * v, squash=1.3, seg=6, rings=3)
    rnd = random.Random(810 + v)
    for k in range(5):
        a = k / 5 * math.tau
        crystal_prism(b, math.cos(a) * 0.15, math.sin(a) * 0.15, math.cos(a) * 0.3, math.sin(a) * 0.3, rnd.uniform(0.5, 0.9), 0.07, rnd.uniform(0, 1), 0.7, rnd, CRYS_VIOLET, y0=h - 0.05)
    crystal_prism(b, 0, 0, 0.04, 0.0, 1.1, 0.11, 0.3, 0.8, rnd, CRYS_VIOLET, y0=h - 0.05)


def _glow_ground(b, r, rng):
    """Quầng tím dưới gốc tinh thể: vài đĩa phẳng chồng, tối dần ra ngoài (màu đỉnh, phát sáng nhẹ), thay cho sương."""
    lo = bs.srgb(0x1C0C30)
    for k in range(4):
        rr = r * (1.0 - 0.2 * k)
        col = bs.Paint(tuple(c * (0.35 + 0.22 * k) for c in lo), 'tcvein')
        y = 0.02 + 0.012 * k
        pts = [(math.cos(i / 14 * math.tau) * rr * (0.9 + 0.2 * rng.random()), y, math.sin(i / 14 * math.tau) * rr * (0.9 + 0.2 * rng.random())) for i in range(14)]
        b.face(pts[::-1], col)


@item('tinh_the_tim')
def _(b, v):
    # Tinh thể tím: cụm gradient lớn mọc từ nền đá đen nứt, trụ giữa cao, trụ bên nghiêng, mảnh vụn rải quanh, quầng tím phát sáng dưới gốc.
    rng = random.Random(77 + v)
    crystal_cluster(b, 2.6 if not v else 3.6, 900 + v * 13, CRYS_VIOLET, rock_color=DROCK)
    _glow_ground(b, 2.2 if not v else 2.8, rng)
    for k in range(10):
        a = rng.uniform(0, math.tau)
        d = rng.uniform(1.0, 2.3)
        crystal_prism(b, math.cos(a) * d, math.sin(a) * d, rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0.12, 0.3), rng.uniform(0.03, 0.06), rng.uniform(0, 1), 0.8, rng, CRYS_VIOLET)


def _iron_sword(b, x, z, y0, length, yaw):
    """Kiếm sắt đen cắm mũi xuống: lưỡi rộng thon, rãnh giữa, chắn chữ thập, chuôi, đầu chuôi tròn; gỉ ở mũi."""
    c, s = math.cos(yaw), math.sin(yaw)

    def at(lx, ly, lz):
        return (x + lx * c + lz * s, y0 + ly, z - lx * s + lz * c)

    w, th = 0.13, 0.035
    outline = [(-w, 0.0), (w, 0.0), (w * 0.9, length * 0.85), (0.0, length), (-w * 0.9, length * 0.85)]
    b.face([at(px, py, th) for px, py in outline][::-1], IRON_L)
    b.face([at(px, py, -th) for px, py in outline], IRON_L)
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        b.face([at(outline[i][0], outline[i][1], -th), at(outline[j][0], outline[j][1], -th), at(outline[j][0], outline[j][1], th), at(outline[i][0], outline[i][1], th)], IRON)
    b.box(*at(0, length * 0.5, th + 0.01), 0.03, length * 0.7, 0.012, IRON, yaw=yaw)
    b.box(*at(0, 0.02, 0), 0.26, 0.1, 0.09, IRON_R, yaw=yaw)
    b.box(*at(0, length + 0.05, 0), 0.7, 0.09, 0.1, IRON, yaw=yaw)
    for sx in (-1, 1):
        b.box(*at(sx * 0.36, length + 0.12, 0), 0.08, 0.2, 0.09, IRON, yaw=yaw)
    b.cylinder(*at(0, length + 0.1, 0), 0.035, 0.4, IRON_R, 6)
    ellipsoid(b, *at(0, length + 0.52, 0), 0.07, 0.07, 0.07, IRON, 6, 4)


@item('chan_dong_do_nat')
def _(b, v):
    # Tàn tích tượng chiến binh Dị Vực gãy: bệ đá nứt, hai chân giáp sắt đen gỉ gãy ngang đầu gối (đầu gãy lởm chởm), mảnh giáp vai + sừng mũ đổ, kiếm lớn cắm xiên; v: thêm thân tượng đổ.
    b.box(0, 0.25, 0, 2.4, 0.5, 1.8, STONE_D)
    b.box(0, 0.6, 0, 2.0, 0.2, 1.4, STONE_M)
    b.box(0, 0.74, 0, 2.1, 0.06, 1.5, DROCK_L)
    for k, sx in enumerate((-0.5, 0.5)):
        ellipsoid(b, sx, 0.88, 0.2, 0.28, 0.17, 0.5, IRON, 10, 4)
        top = 1.45 + 0.35 * k
        lathe(b, [(0.0, 0.78), (0.27, 0.78), (0.24, 1.0), (0.2, top - 0.05), (0.0, top - 0.05)], IRON, 10, sx, -0.1)
        for yy in (1.0, 1.2):
            b.cylinder(sx, yy, -0.1, 0.25, 0.06, IRON_R, 10, 0.23)
        for j in range(7):
            a = j / 7 * math.tau
            b.box(sx + math.cos(a) * 0.2, top + 0.04 * (j % 3), -0.1 + math.sin(a) * 0.2, 0.08, 0.1 + 0.06 * (j % 3), 0.05, IRON_R, yaw=-a)
        ellipsoid(b, sx, 1.12, -0.1 + 0.25, 0.14, 0.2, 0.06, IRON_L, 8, 4)
    _iron_sword(b, -0.2, 0.9, 0.5, 1.9 if not v else 2.3, 0.3)
    ellipsoid(b, 1.6, 0.16, 1.1, 0.32, 0.16, 0.26, IRON, 9, 4)
    tube(b, [(1.45, 0.2, 1.2), (1.8, 0.45, 1.35), (2.05, 0.8, 1.3)], [0.07, 0.05, 0.02], BONE, 6, sub=3)
    if v:
        lathe(b, [(0.0, 0.0), (0.38, 0.0), (0.34, 1.2), (0.0, 1.2)], IRON, 10, 2.0, -0.9, 0.12)
        ellipsoid(b, 2.0, 0.55, -0.9, 0.42, 0.14, 0.42, IRON_R, 10, 4)
    for k in range(4):
        rock(b, -1.4 + k * 0.9, 0, 1.3 - 0.2 * (k % 2), 0.26, DROCK_L, seed=k, squash=0.5, seg=6, rings=3)
    for k in range(4):
        ellipsoid(b, -0.9 + k * 0.6, 0.78, -0.55, 0.25, 0.05, 0.2, MOSS_B if k % 2 else SNOW, 9, 3)


def _torn_cloth(b, x0, y_top, w, L, rng, sag, thick=0.02):
    """Vải rách: lưới n cột × m hàng treo ngang từ xà, võng giữa, gấu mép xơ (mỗi cột dài một khác, hai vết xé sâu), hai mặt."""
    n, m = 12, 7
    lens = [L * (0.72 + 0.5 * rng.random()) for _ in range(n)]
    lens[3] *= 0.45
    lens[8] *= 0.55
    cols = []
    for i in range(n):
        u = (i + 0.5) / n
        col = []
        for j in range(m + 1):
            vv = j / m
            y = y_top - vv * lens[i]
            z = sag * math.sin(u * math.pi) * (0.3 + 0.7 * vv) + 0.05 * math.sin(vv * 5 + i)
            col.append((x0 + (u - 0.5) * w + 0.04 * math.sin(vv * 3 + i * 1.3), y, z))
        cols.append(col)
    for i in range(n - 1):
        for j in range(m):
            q = [cols[i][j], cols[i + 1][j], cols[i + 1][j + 1], cols[i][j + 1]]
            col = CLOTH_BLOOD if (i + j) % 4 else CLOTH_DARK
            front = [(p[0], p[1], p[2] + thick) for p in q]
            back = [(p[0], p[1], p[2] - thick) for p in q]
            b.face(front[::-1], col)
            b.face(back, col)
    return cols


@item('co_rach')
def _(b, v):
    # Cờ chiến Dị Vực: cán sắt đen đầu nhọn, xà ngang, cờ vải đỏ máu khô rách tả tơi (võng, gấu xơ, vết xé), huy hiệu sừng + mắt in mờ; chống sắt gỉ; lay gió.
    rng = random.Random(40 + v)
    b.cylinder(0, 0, 0, 0.09, 4.1, IRON, 6, 0.06)
    lathe(b, [(0.0, 4.1), (0.09, 4.1), (0.06, 4.3), (0.0, 4.7)], IRON_L, 6)
    for k in range(3):
        a = k * 2.1
        b.beam(math.cos(a) * 0.9, 0.0, math.sin(a) * 0.9, math.cos(a) * 0.1, 0.9, math.sin(a) * 0.1, 0.07, IRON_R)
    b.box(0.9, 3.85, 0, 1.9, 0.07, 0.07, IRON)
    for sx in (0.0, 1.85):
        ellipsoid(b, sx + 0.04, 3.85, 0, 0.07, 0.07, 0.07, IRON_L, 6, 3)
    n0 = len(b.faces)
    _torn_cloth(b, 0.95, 3.8, 1.7, 2.3, rng, 0.12)
    zf = 0.12 * 0.9 + 0.035
    ey = 3.8 - 0.8
    b.face([(0.95 + 0.18 * math.cos(a), ey + 0.1 * math.sin(a), zf) for a in [i / 12 * math.tau for i in range(12)]], CLOTH_EMBLEM)
    b.face([(0.95 + 0.05 * math.cos(a), ey + 0.04 * math.sin(a), zf + 0.004) for a in [i / 10 * math.tau for i in range(10)]][::-1], CLOTH_BLOOD)
    for s in (-1, 1):
        pts = [(0.95 + s * 0.2, ey + 0.1, zf), (0.95 + s * 0.45, ey + 0.4, zf), (0.95 + s * 0.62, ey + 0.74, zf), (0.95 + s * 0.52, ey + 0.38, zf), (0.95 + s * 0.3, ey + 0.05, zf)]
        b.face(pts[::-1] if s > 0 else pts, CLOTH_EMBLEM)
    weight_from(b, n0, 3.85, 2.4)
    rock(b, 0.0, 0, 0.0, 0.55, DROCK, seed=9, squash=0.5, seg=7, rings=3)
