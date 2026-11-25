# Sinh kiến trúc Lạc Kiếm Tông bằng Blender (bpy) và xuất GLB vật liệu PBR cách điệu (art bible v3, mục 3–4).
#
# Chạy (không mở giao diện; pnpm assets:build gọi qua tools/blender/run.mjs):
#   blender --background --python tools/blender/build_sect.py -- assets/build/raw/arch_sect.glb
#
# Quy ước tọa độ trong file này là tọa độ game, gốc đặt ở tâm sân tông môn:
#   x = đông, y = lên, z = nam. Hàm P() đổi sang hệ Blender (Z lên, Y bắc).
# Client đặt lưới này tại (SECT.x, SECT.y, SECT.z); vị trí các công trình phải khớp
# COLLIDERS trong packages/shared/src/level.ts.
#
# Vật liệu: mỗi mặt mang một "nước sơn" (Paint) = màu bảng màu tâm trạng + một chất liệu trong MATERIALS.
# Mỗi chất liệu là một primitive glTF (một draw call) với roughness/metalness theo art bible mục 3.
# Màu đỉnh (COLOR_0) giữ màu và AO nướng ở chân tường; texture chi tiết xám nhỏ (sinh bằng numpy, lặp theo
# UV chiếu theo thế giới) nhân vào để có chất đá, vân gỗ, hàng ngói. glTF nhân COLOR_0 với baseColorTexture.

import json
import math
import random
import struct
import sys
from collections import namedtuple

import bmesh
import bpy
import numpy as np

SEED = 20261112


def srgb(hex_color):
    """Mã màu sRGB -> bộ ba tuyến tính (glTF lưu màu đỉnh ở không gian tuyến tính)."""
    out = []
    for shift in (16, 8, 0):
        c = ((hex_color >> shift) & 255) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


# Chất liệu: roughness/metalness theo art bible mục 3; `tex` là texture chi tiết, `scale` là số mét mỗi lần lặp.
# `ao`: nướng tối ở chân mặt đứng; `jitter`: lệch sáng ngẫu nhiên theo mặt (vật liệu ghép từ nhiều viên).
Mat = namedtuple('Mat', 'rough metal tex scale ao jitter emissive', defaults=(None,))
MATERIALS = {
    'stone': Mat(0.9, 0.0, 'stone', 3.0, True, 0.05),
    'plaster': Mat(0.95, 0.0, 'stone', 6.0, True, 0.0),
    'lacquer': Mat(0.6, 0.0, 'wood', 2.5, True, 0.0),
    'wood': Mat(0.8, 0.0, 'wood', 1.6, True, 0.03),
    'tile': Mat(0.7, 0.0, 'tile', 2.0, False, 0.0),
    # Kim loại: art bible cho metalness 0,8–1, nhưng cảnh chưa có env map (chỉ ánh trời hemisphere, không phản chiếu)
    # nên kim loại gần như đen ở mọi chỗ không có ánh nắng phản xạ thẳng. Tạm hạ còn 0,45–0,5 tới khi có env map.
    'metal': Mat(0.5, 0.45, None, 1.0, False, 0.0),
    'steel': Mat(0.4, 0.5, None, 1.0, False, 0.0),
    # Giấy đèn lồng: phát sáng ấm rất nhẹ (#FFB869, dưới ngưỡng bloom 1,0 của mục 5.2).
    'lamp': Mat(0.9, 0.0, None, 1.0, False, 0.0, (0xFFB869, 0.45)),
}

# UV lưu trong [0, 1] = UV_RANGE lần lặp texture (xem face_uv). Sân rộng khoảng ±80 m, cao 25 m.
UV_RANGE = 128
UV_ORIGIN = 80.0

Paint = namedtuple('Paint', 'rgb mat')


def paint(hex_color, mat):
    return Paint(srgb(hex_color), mat)


# Bảng màu tâm trạng (assets/palette.json, art bible mục 4.1); biến thể sáng/tối là sắc độ trong cùng một màu.
PAVE = paint(0xBDB6A4, 'stone')  # stone_light: đá lát sân
STONE = paint(0xA29C8B, 'stone')  # giữa stone_light và stone
STONE_DARK = paint(0x7D786C, 'stone')  # stone
WALL = paint(0xE6DDCB, 'plaster')  # attire_ivory: tường vôi
RED = paint(0x9D392E, 'lacquer')  # wood_cinnabar: cột, cửa sơn son
RED_DARK = paint(0x7E2D25, 'lacquer')
BLUE = paint(0x22364E, 'lacquer')  # attire_elder: nền hoành phi
ROOF = paint(0x2B5552, 'tile')  # wood_roof: ngói thanh
ROOF_DARK = paint(0x21413F, 'tile')  # bờ nóc, bờ dải
GOLD = paint(0xAE8B49, 'metal')  # wood_bronze: diềm, đầu kìm, chữ hoành phi
BRONZE = paint(0x8A6B3E, 'metal')  # đồng thau sẫm: lư hương, lò đan
WOOD = paint(0x8A6944, 'wood')  # wood
WOOD_DARK = paint(0x4D3324, 'wood')  # wood_dark: xà, trần mái
STEEL = paint(0xBAC4CA, 'steel')  # lưỡi cự kiếm, kiếm trên giá
STEEL_DARK = paint(0x939EA6, 'steel')
LAMP = paint(0xEAD8B0, 'lamp')


def P(x, y, z):
    return (x, -z, y)


def newell(pts):
    """Pháp tuyến (chưa chuẩn hóa) của đa giác theo tọa độ game."""
    nx = ny = nz = 0.0
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
    n = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return nx / n, ny / n, nz / n


def face_uv(pts, mat):
    """UV chiếu theo trục chính của mặt (hộp chiếu, theo mét / scale).

    Ngói: u chạy dọc mép mái (song song đường diềm), v xuống dốc, để hàng ngói nằm ngang.
    Chất khác: chiều dài hơn của mặt nằm trên u (vân gỗ chạy dọc cột, dọc xà).
    """
    nx, ny, nz = newell(pts)
    if MATERIALS[mat].tex is None:
        return [(0.0, 0.0)] * len(pts), ny  # không có texture: UV hằng để weld gộp đỉnh
    ax, ay, az = abs(nx), abs(ny), abs(nz)
    if mat == 'tile':
        if ay >= 0.98:
            uv = [(p[0], p[2]) for p in pts]
        elif az >= ax:
            uv = [(p[0], p[2] + p[1]) for p in pts]
        else:
            uv = [(p[2], p[0] + p[1]) for p in pts]
    else:
        if ay >= ax and ay >= az:
            uv = [(p[0], p[2]) for p in pts]
        elif ax >= az:
            uv = [(p[2], p[1]) for p in pts]
        else:
            uv = [(p[0], p[1]) for p in pts]
        us = [u for u, _ in uv]
        vs = [v for _, v in uv]
        if max(vs) - min(vs) > max(us) - min(us):
            uv = [(v, u) for u, v in uv]
    s = MATERIALS[mat].scale
    # Dời mọi mặt cùng một khoảng UV_ORIGIN mét (UV liền giữa các mặt kề nhau, weld vẫn gộp đỉnh), rồi chia UV_RANGE:
    # UV nằm trong [0, 1] thì optimize.ts lượng tử hóa được (16 bit); KHR_texture_transform nhân lại UV_RANGE.
    uv = [((u + UV_ORIGIN) / s / UV_RANGE, (v + UV_ORIGIN) / s / UV_RANGE) for u, v in uv]
    assert all(0 <= c <= 1 for t in uv for c in t), f'UV ra ngoài [0, 1] ({mat}, {uv}): tăng UV_RANGE hoặc UV_ORIGIN'
    return uv, ny


class Builder:
    def __init__(self):
        self.verts = []
        self.faces = []
        self.colors = []  # màu từng góc (tuyến tính)
        self.uvs = []  # UV từng góc
        self.mats = []
        self.smooth = []
        self.rng = random.Random(SEED)

    def face(self, pts, color, smooth=False):
        base = len(self.verts)
        for p in pts:
            self.verts.append(P(*p))
        self.faces.append(tuple(range(base, base + len(pts))))
        spec = MATERIALS[color.mat]
        uv, ny = face_uv(pts, color.mat)
        k = 1.0 + (self.rng.uniform(-spec.jitter, spec.jitter) if spec.jitter else 0.0)
        corners = []
        for p in pts:
            # AO nướng: mặt đứng tối dần về sát đất (kẽ chân tường, chân cột).
            ao = 0.7 + 0.3 * min(1.0, max(0.0, p[1]) / 1.6) if spec.ao and abs(ny) < 0.5 else 1.0
            corners.append(tuple(min(1.0, c * k * ao * TEX_GAIN.get(spec.tex, 1.0)) for c in color.rgb))
        self.colors.append(corners)
        self.uvs.append(uv)
        self.mats.append(color.mat)
        self.smooth.append(smooth)

    def box(self, cx, cy, cz, sx, sy, sz, color, yaw=0.0, top_color=None):
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        c, s = math.cos(yaw), math.sin(yaw)

        def v(dx, dy, dz):
            return (cx + dx * c + dz * s, cy + dy, cz - dx * s + dz * c)

        p = [v(-hx, -hy, -hz), v(hx, -hy, -hz), v(hx, -hy, hz), v(-hx, -hy, hz), v(-hx, hy, -hz), v(hx, hy, -hz), v(hx, hy, hz), v(-hx, hy, hz)]
        self.face([p[4], p[7], p[6], p[5]], top_color or color)  # trên
        if cy - hy > 0.05:  # mặt đáy chạm đất không bao giờ thấy: bỏ
            self.face([p[0], p[1], p[2], p[3]], color)  # dưới
        self.face([p[3], p[2], p[6], p[7]], color)  # nam
        self.face([p[1], p[0], p[4], p[5]], color)  # bắc
        self.face([p[2], p[1], p[5], p[6]], color)  # đông
        self.face([p[0], p[3], p[7], p[4]], color)  # tây

    def cylinder(self, cx, y0, cz, r, h, color, seg=12, r_top=None, smooth=True, cap=True):
        rt = r if r_top is None else r_top
        ring0 = [(cx + math.cos(i / seg * math.tau) * r, y0, cz + math.sin(i / seg * math.tau) * r) for i in range(seg)]
        ring1 = [(cx + math.cos(i / seg * math.tau) * rt, y0 + h, cz + math.sin(i / seg * math.tau) * rt) for i in range(seg)]
        for i in range(seg):
            j = (i + 1) % seg
            self.face([ring0[i], ring1[i], ring1[j], ring0[j]], color, smooth)
        if cap:
            self.face(list(reversed(ring1)), color)

    def column(self, cx, y0, cz, r, h, color=RED):
        """Cột gỗ sơn son có chân tảng đá và đầu cột."""
        self.cylinder(cx, y0, cz, r * 1.5, 0.35, STONE_DARK, 10, r * 1.25)
        self.cylinder(cx, y0 + 0.35, cz, r, h - 0.7, color, 12, r * 0.92)
        self.box(cx, y0 + h - 0.2, cz, r * 2.6, 0.4, r * 2.6, WOOD_DARK)

    def hip_roof(self, cx, y0, cz, w, d, h, overhang=2.2, nu=26, nv=18, lift=1.6):
        """Mái hip cong lõm, đầu đao hất lên ở bốn góc, có diềm vàng và bờ nóc."""
        W = w / 2 + overhang
        D = d / 2 + overhang

        def height(u, v):
            # u, v trong [-1, 1]; khoảng cách tới mép quyết định độ cao.
            ex = (1 - abs(u)) * W
            ez = (1 - abs(v)) * D
            s = min(ex, ez) / D
            s = max(0.0, min(1.0, s))
            curve = s ** 1.55
            corner = (abs(u) ** 7) * (abs(v) ** 7)
            edge = max(abs(u), abs(v)) ** 10
            return y0 + h * curve + lift * corner + 0.25 * edge

        grid = [[(cx + (-1 + 2 * i / nu) * W, height(-1 + 2 * i / nu, -1 + 2 * j / nv), cz + (-1 + 2 * j / nv) * D) for i in range(nu + 1)] for j in range(nv + 1)]
        for j in range(nv):
            for i in range(nu):
                a, b, c, e = grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]
                self.face([a, e, c, b], ROOF, True)  # hàng ngói do texture `tile` vẽ
        # Diềm mái vàng chạy quanh mép.
        rim = [grid[0][i] for i in range(nu + 1)] + [grid[j][nu] for j in range(1, nv + 1)] + [grid[nv][i] for i in range(nu - 1, -1, -1)] + [grid[j][0] for j in range(nv - 1, 0, -1)]
        n = len(rim)
        for i in range(n):
            a, b = rim[i], rim[(i + 1) % n]
            self.face([a, b, (b[0], b[1] - 0.42, b[2]), (a[0], a[1] - 0.42, a[2])], GOLD)
        # Trần mái phía dưới (gỗ sẫm) để nhìn từ dưới lên không bị rỗng.
        soffit_y = y0 - 0.1
        self.face([(cx - W, soffit_y, cz - D), (cx + W, soffit_y, cz - D), (cx + W, soffit_y, cz + D), (cx - W, soffit_y, cz + D)], WOOD_DARK)
        # Bờ nóc và hai đầu kìm.
        ridge = max(0.0, W - D)
        top = y0 + h
        if ridge > 0.5:
            self.box(cx, top + 0.3, cz, ridge * 2 + 1.2, 0.7, 0.8, ROOF_DARK)
            for sx in (-1, 1):
                self.box(cx + sx * (ridge + 0.5), top + 0.95, cz, 0.7, 1.5, 0.7, GOLD, yaw=0)
                self.box(cx + sx * (ridge + 0.95), top + 1.55, cz, 0.9, 0.5, 0.5, GOLD)
        else:
            self.cylinder(cx, top, cz, 0.55, 1.2, GOLD, 8, 0.15)
        # Bốn bờ dải chạy xuống góc.
        for sx in (-1, 1):
            for sz in (-1, 1):
                steps = 7
                for k in range(steps):
                    t0, t1 = k / steps, (k + 1) / steps
                    x0 = cx + sx * (ridge + (W - ridge) * t0)
                    x1 = cx + sx * (ridge + (W - ridge) * t1)
                    z0 = cz + sz * D * t0
                    z1 = cz + sz * D * t1
                    ya = height(sx * (ridge + (W - ridge) * t0) / W, sz * t0) + 0.25
                    yb = height(sx * (ridge + (W - ridge) * t1) / W, sz * t1) + 0.25
                    mx, my, mz = (x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2
                    length = math.dist((x0, ya, z0), (x1, yb, z1))
                    self.box(mx, my, mz, length + 0.1, 0.42, 0.5, ROOF_DARK, yaw=-math.atan2(z1 - z0, x1 - x0))

    def round_roof(self, cx, y0, cz, r, h, sides=6, rings=9, lift=1.1):
        """Mái lục giác cong của đình."""
        def ring(k):
            s = k / rings
            rr = r * (1 - s) ** 0.75
            y = y0 + h * s ** 1.5
            pts = []
            for i in range(sides):
                a = i / sides * math.tau + math.pi / sides
                up = lift * (1 - s) ** 6
                pts.append((cx + math.cos(a) * rr, y + up, cz + math.sin(a) * rr))
            return pts

        prev = ring(0)
        rim = prev
        for k in range(1, rings + 1):
            cur = ring(k)
            for i in range(sides):
                j = (i + 1) % sides
                # Điểm giữa cạnh thấp hơn góc -> mép mái võng xuống giữa, hất lên ở góc.
                self.face([prev[i], cur[i], cur[j], prev[j]], ROOF, False)
            prev = cur
        for i in range(sides):
            a, b = rim[i], rim[(i + 1) % sides]
            self.face([a, b, (b[0], b[1] - 0.35, b[2]), (a[0], a[1] - 0.35, a[2])], GOLD)
        self.face([(p[0], y0 - 0.05, p[2]) for p in rim], WOOD_DARK)
        self.cylinder(cx, y0 + h - 0.1, cz, 0.45, 0.9, GOLD, 8, 0.12)
        self.cylinder(cx, y0 + h + 0.8, cz, 0.3, 0.5, GOLD, 8, 0.02)


def lantern(b, x, z):
    b.box(x, 0.2, z, 0.95, 0.4, 0.95, STONE_DARK)
    b.cylinder(x, 0.4, z, 0.2, 1.25, STONE, 8)
    b.box(x, 1.75, z, 0.75, 0.2, 0.75, STONE_DARK)
    b.box(x, 2.15, z, 0.62, 0.6, 0.62, LAMP)
    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        b.box(x + sx * 0.3, 2.15, z + sz * 0.3, 0.09, 0.62, 0.09, STONE_DARK)
    b.cylinder(x, 2.45, z, 0.72, 0.55, STONE_DARK, 4, 0.08, smooth=False)


def pavilion(b, x, z):
    b.cylinder(x, 0, z, 7.4, 0.5, STONE_DARK, 6, smooth=False)
    b.cylinder(x, 0.5, z, 6.9, 0.35, STONE, 6, smooth=False)
    for i in range(6):
        a = i / 6 * math.tau + math.pi / 6
        b.column(x + math.cos(a) * 5.3, 0.85, z + math.sin(a) * 5.3, 0.34, 5.1)
        a2 = (i + 1) / 6 * math.tau + math.pi / 6
        mx = x + (math.cos(a) + math.cos(a2)) / 2 * 5.3
        mz = z + (math.sin(a) + math.sin(a2)) / 2 * 5.3
        yaw = -math.atan2(math.sin(a2) - math.sin(a), math.cos(a2) - math.cos(a))
        b.box(mx, 5.55, mz, 5.4, 0.45, 0.3, RED_DARK, yaw=yaw)
        # Lan can thấp, chừa mặt hướng ra sân.
        if i not in (1, 4):
            b.box(mx, 1.35, mz, 5.0, 0.16, 0.16, WOOD, yaw=yaw)
            b.box(mx, 1.05, mz, 5.0, 0.1, 0.1, WOOD, yaw=yaw)
    b.round_roof(x, 5.95, z, 9.0, 4.4)


def build():
    b = Builder()

    # ----- Sân lát đá và lối đi -----
    b.box(0, 0.03, 25, 9, 0.06, 110, PAVE)
    for z in range(-26, 80, 4):
        b.box(0, 0.065, z, 9, 0.01, 0.12, STONE)

    # ----- Chính điện (tâm ở z = -44, khớp collider bán kính 17) -----
    hz = -44
    b.box(0, 0.6, hz, 33, 1.2, 23, STONE, top_color=PAVE)
    b.box(0, 1.25, hz, 31.5, 0.1, 21.5, STONE_DARK)
    # Bậc thềm phía nam.
    for k in range(4):
        b.box(0, 0.15 + k * 0.3, hz + 11.5 + (3 - k) * 0.55 + 0.3, 12, 0.3, 0.6, STONE_DARK if k % 2 else STONE)
    # Lan can đá quanh nền, chừa lối bậc thềm.
    for sx in (-1, 1):
        b.box(sx * 11.2, 1.75, hz + 11.3, 10, 0.18, 0.3, STONE)
        for k in range(5):
            b.box(sx * (6.6 + k * 2.3), 1.6, hz + 11.3, 0.36, 0.9, 0.36, STONE_DARK)
        b.box(sx * 16.3, 1.75, hz, 0.3, 0.18, 22.4, STONE)
        for k in range(8):
            b.box(sx * 16.3, 1.6, hz - 10.5 + k * 3, 0.36, 0.9, 0.36, STONE_DARK)
    # Thân điện.
    b.box(0, 4.7, hz - 1, 24.5, 6.8, 13.4, WALL)
    b.box(0, 1.55, hz - 1, 24.9, 0.6, 13.8, STONE_DARK)
    b.box(0, 7.75, hz - 1, 25.2, 0.7, 14.2, RED_DARK)
    # Cửa chính hai cánh và hoành phi.
    b.box(0, 3.7, hz + 5.75, 5.6, 4.8, 0.3, WOOD_DARK)
    for sx in (-1, 1):
        b.box(sx * 1.38, 3.7, hz + 5.93, 2.5, 4.4, 0.12, RED)
        b.box(sx * 0.3, 3.6, hz + 6.02, 0.14, 0.5, 0.1, GOLD)
        for k in range(3):
            b.box(sx * 1.38, 2.6 + k * 1.1, hz + 6.0, 2.0, 0.08, 0.06, GOLD)
    b.box(0, 6.95, hz + 5.9, 6.4, 1.3, 0.3, BLUE)
    b.box(0, 6.95, hz + 6.08, 5.4, 0.7, 0.08, GOLD)
    # Cửa sổ song gỗ hai bên.
    for sx in (-1, 1):
        b.box(sx * 7.6, 4.5, hz + 5.75, 3.6, 2.8, 0.2, WOOD_DARK)
        for k in range(6):
            b.box(sx * 7.6 - 1.5 + k * 0.6, 4.5, hz + 5.9, 0.12, 2.5, 0.1, WOOD)
        b.box(sx * 7.6, 4.5, hz + 5.9, 3.3, 0.12, 0.1, WOOD)
    # Hàng cột hiên trước và sau.
    for i in range(6):
        px = -13 + i * 5.2
        b.column(px, 1.3, hz + 8.6, 0.48, 6.9)
        b.column(px, 1.3, hz - 9.6, 0.48, 6.9)
    b.box(0, 7.95, hz + 8.6, 27.4, 0.5, 0.5, RED_DARK)
    b.box(0, 7.95, hz - 9.6, 27.4, 0.5, 0.5, RED_DARK)
    b.hip_roof(0, 8.3, hz - 0.5, 29, 20, 5.0, overhang=3.0)
    # Tầng mái trên.
    b.box(0, 14.6, hz - 0.5, 15, 3.0, 8.6, WALL)
    b.box(0, 15.9, hz - 0.5, 15.6, 0.5, 9.2, RED_DARK)
    for sx in (-1, 1):
        for k in range(4):
            b.box(sx * (2 + k * 1.6), 14.6, hz + 3.85, 0.9, 1.7, 0.12, WOOD_DARK)
    b.hip_roof(0, 16.2, hz - 0.5, 16, 9.6, 4.6, overhang=2.6, nu=20, nv=14, lift=1.9)

    # ----- Lư hương đồng trước điện -----
    b.cylinder(0, 0, -27, 1.6, 0.5, STONE_DARK, 8, smooth=False)
    for i in range(3):
        a = i / 3 * math.tau
        b.cylinder(math.cos(a) * 0.8, 0.5, -27 + math.sin(a) * 0.8, 0.16, 0.9, BRONZE, 6)
    b.cylinder(0, 1.3, -27, 0.9, 1.1, BRONZE, 10, 1.25)
    b.cylinder(0, 2.4, -27, 1.3, 0.2, GOLD, 10)
    b.cylinder(0, 2.6, -27, 1.1, 0.9, BRONZE, 10, 0.2)

    # ----- Đan phòng (trái) và Tàng Kiếm Các (phải) -----
    pavilion(b, -52, 4)
    b.cylinder(-52, 0.85, 4, 1.25, 0.5, STONE_DARK, 8, smooth=False)
    for i in range(3):
        a = i / 3 * math.tau + 0.5
        b.cylinder(-52 + math.cos(a) * 0.75, 1.35, 4 + math.sin(a) * 0.75, 0.14, 0.6, BRONZE, 6)
    b.cylinder(-52, 1.9, 4, 0.85, 1.5, BRONZE, 10, 1.25)
    b.cylinder(-52, 3.4, 4, 1.3, 0.16, GOLD, 10)
    b.cylinder(-52, 3.56, 4, 1.15, 1.0, BRONZE, 10, 0.25)
    b.cylinder(-52, 4.5, 4, 0.22, 0.4, GOLD, 8, 0.05)

    pavilion(b, 52, 4)
    b.box(52, 2.4, 4, 4.2, 0.2, 0.6, WOOD)
    b.box(52, 1.7, 4, 4.2, 0.2, 0.6, WOOD)
    for sx in (-1, 1):
        b.box(52 + sx * 2.0, 1.75, 4, 0.24, 1.8, 0.7, WOOD_DARK)
    for i in range(5):
        x = 50.6 + i * 0.7
        b.box(x, 2.9, 4, 0.11, 2.3, 0.03, STEEL, yaw=0.0)
        b.box(x, 1.82, 4, 0.34, 0.07, 0.09, GOLD)

    # ----- Cự kiếm đá cắm giữa sân: biểu tượng "Lạc Kiếm" (collider bán kính 2.4) -----
    sz = 18
    b.cylinder(0, 0, sz, 3.4, 0.7, STONE_DARK, 12, smooth=False)
    b.cylinder(0, 0.7, sz, 2.6, 0.5, STONE, 12, 2.3, smooth=False)
    tilt = 0.07
    for k in range(10):
        y = 1.6 + k * 1.05
        wdt = 1.55 if k > 0 else 1.2
        b.box(math.sin(tilt) * (y - 1.2) * -1, y, sz, wdt, 1.06, 0.34, STEEL if k % 2 else STEEL_DARK)
        b.box(math.sin(tilt) * (y - 1.2) * -1, y, sz, 0.26, 1.06, 0.5, STEEL_DARK)
    gx = -math.sin(tilt) * 10.9
    b.box(gx, 12.4, sz, 4.4, 0.6, 0.85, GOLD)
    b.box(gx - 1.9, 12.75, sz, 0.6, 0.5, 0.9, GOLD)
    b.box(gx + 1.9, 12.75, sz, 0.6, 0.5, 0.9, GOLD)
    b.cylinder(gx - 0.12, 12.7, sz, 0.3, 2.9, WOOD_DARK, 8)
    for k in range(4):
        b.cylinder(gx - 0.12, 13.0 + k * 0.6, sz, 0.34, 0.14, GOLD, 8)
    b.cylinder(gx - 0.14, 15.6, sz, 0.55, 0.7, GOLD, 8, 0.3)

    # ----- Cổng tam quan (trụ chính ở x = ±8, z = 80, khớp collider) -----
    gz = 80
    for sx in (-1, 1):
        b.box(sx * 8, 0.6, gz, 2.8, 1.2, 2.8, STONE_DARK)
        b.column(sx * 8, 1.2, gz, 0.95, 9.2)
        b.box(sx * 15, 0.4, gz, 1.8, 0.8, 1.8, STONE_DARK)
        b.column(sx * 15, 0.8, gz, 0.6, 6.6)
        b.box(sx * 11.5, 6.6, gz, 7.6, 0.7, 0.9, RED_DARK)
        b.box(sx * 11.5, 5.5, gz, 6.4, 0.9, 0.3, BLUE)
        b.hip_roof(sx * 11.9, 7.4, gz, 7.4, 2.4, 1.5, overhang=1.3, nu=12, nv=8, lift=0.9)
    b.box(0, 9.4, gz, 17.5, 1.0, 1.1, RED_DARK)
    b.box(0, 8.4, gz, 15, 0.5, 0.8, RED_DARK)
    b.box(0, 7.2, gz, 6.8, 1.9, 0.4, BLUE)
    b.box(0, 7.2, gz + 0.24, 5.8, 1.1, 0.1, GOLD)
    b.hip_roof(0, 10.4, gz, 18, 3.2, 2.4, overhang=1.8, nu=20, nv=10, lift=1.3)

    # Đèn đá dọc lối đi: từ P2-A4 là prop Tripo `prop_den_da` (packages/shared/src/props.ts), không dựng ở đây.

    return b


# ----- Texture chi tiết thủ tục (xám, lặp liền mép, 256², sRGB) -----

TEX_SIZE = 256
TEXTURES = {}  # tên -> mảng (n, n) giá trị sRGB 0..1
TEX_GAIN = {}  # tên -> hệ số bù màu đỉnh để màu trung bình (đỉnh × texture) vẫn đúng bảng màu


def value_noise(rng, n, cells_x, cells_y=None):
    """Nhiễu giá trị lặp liền mép: lưới ngẫu nhiên cells_x × cells_y, nội suy smoothstep."""
    cells_y = cells_y or cells_x
    grid = rng.random((cells_y, cells_x))
    t = np.arange(n) / n
    fx, fy = t * cells_x, t * cells_y
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    sx, sy = fx - x0, fy - y0
    sx, sy = sx * sx * (3 - 2 * sx), sy * sy * (3 - 2 * sy)
    x1, y1 = (x0 + 1) % cells_x, (y0 + 1) % cells_y
    top = grid[y0][:, x0] * (1 - sx) + grid[y0][:, x1] * sx
    bot = grid[y1][:, x0] * (1 - sx) + grid[y1][:, x1] * sx
    return top * (1 - sy)[:, None] + bot * sy[:, None]


def fbm(rng, n, base, octaves, aspect=1):
    out = np.zeros((n, n))
    amp, total = 1.0, 0.0
    for k in range(octaves):
        c = base * 2 ** k
        out += amp * value_noise(rng, n, c, max(1, c * aspect))
        total += amp
        amp *= 0.5
    return out / total


def norm01(a):
    return (a - a.min()) / (a.max() - a.min() + 1e-9)


def make_textures():
    rng = np.random.default_rng(SEED)
    n = TEX_SIZE
    # Đá: mảng loang lớn + hạt mịn + vết ố thưa.
    blot = norm01(fbm(rng, n, 4, 5))
    grain = rng.random((n, n))
    stain = np.clip((value_noise(rng, n, 6) - 0.62) * 4, 0, 1)
    stone = 0.86 + 0.1 * blot + 0.04 * (grain - 0.5) - 0.04 * stain
    # Gỗ: vân chạy theo u (hàng ngang của ảnh), uốn lượn theo nhiễu tần số thấp.
    y = np.arange(n)[:, None] / n
    warp = fbm(rng, n, 2, 3, aspect=4)
    rings = np.sin((y * 14 + warp * 1.6) * math.tau) * 0.5 + 0.5
    streak = fbm(rng, n, 2, 4, aspect=12)
    wood = 0.8 + 0.1 * rings ** 3 + 0.1 * norm01(streak) + 0.03 * (rng.random((n, n)) - 0.5)
    # Ngói: 8 rãnh ngói âm dương dọc dốc (theo u) × 4 hàng chồng mí (theo v); mép dưới mỗi hàng có bóng.
    x = np.arange(n)[None, :] / n
    channel = 0.5 + 0.5 * np.cos(x * 8 * math.tau)
    course = (y * 4) % 1.0
    lip = np.clip(1 - course / 0.12, 0, 1) ** 2
    tile = (0.74 + 0.22 * channel ** 0.6) * (1 - 0.3 * lip) + 0.06 * (norm01(fbm(rng, n, 4, 4)) - 0.5)
    for name, arr in (('stone', stone), ('wood', wood), ('tile', tile)):
        arr = np.clip(arr, 0, 1)
        TEXTURES[name] = arr
        lin = np.where(arr <= 0.04045, arr / 12.92, ((arr + 0.055) / 1.055) ** 2.4)
        TEX_GAIN[name] = 1.0 / float(lin.mean())


def texture_image(name):
    arr = TEXTURES[name]
    n = arr.shape[0]
    img = bpy.data.images.new(f'arch_sect_{name}', n, n, alpha=False)
    rgba = np.empty((n, n, 4), dtype=np.float32)
    rgba[..., :3] = arr[..., None]
    rgba[..., 3] = 1.0
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def make_material(key, images):
    spec = MATERIALS[key]
    mat = bpy.data.materials.new(f'arch_sect_{key}')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = spec.rough
    bsdf.inputs['Metallic'].default_value = spec.metal
    if spec.tex:
        if spec.tex not in images:
            images[spec.tex] = texture_image(spec.tex)
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = images[spec.tex]
        # Mapping (scale UV_RANGE) -> exporter ghi KHR_texture_transform.
        coord = nodes.new('ShaderNodeUVMap')
        mapping = nodes.new('ShaderNodeMapping')
        mapping.inputs['Scale'].default_value = (UV_RANGE, UV_RANGE, 1.0)
        mat.node_tree.links.new(coord.outputs['UV'], mapping.inputs['Vector'])
        mat.node_tree.links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if spec.emissive:
        hex_color, strength = spec.emissive
        bsdf.inputs['Emission Color'].default_value = (*srgb(hex_color), 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


def export(builder, path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mesh = bpy.data.meshes.new('lac_kiem_tong')
    mesh.from_pydata(builder.verts, [], builder.faces)
    mesh.update()
    mesh.polygons.foreach_set('use_smooth', builder.smooth)

    # Màu đỉnh và UV theo góc (loop); from_pydata giữ thứ tự mặt và góc.
    colors, uvs = [], []
    for poly, corners, uv in zip(mesh.polygons, builder.colors, builder.uvs):
        assert poly.loop_total == len(corners)
        for c, t in zip(corners, uv):
            colors.extend((c[0], c[1], c[2], 1.0))
            uvs.extend(t)
    attr = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    attr.data.foreach_set('color', colors)
    mesh.color_attributes.active_color = attr
    mesh.color_attributes.render_color_index = 0
    mesh.uv_layers.new(name='UVMap').data.foreach_set('uv', uvs)

    keys = [k for k in MATERIALS if k in set(builder.mats)]
    images = {}
    for k in keys:
        mesh.materials.append(make_material(k, images))
    mesh.polygons.foreach_set('material_index', [keys.index(m) for m in builder.mats])

    # Gộp đỉnh trùng: mặt `smooth` kề nhau (mái, thân cột) mới thật sự đổ bóng mềm và dùng chung đỉnh khi xuất;
    # màu/UV vẫn theo góc, mặt phẳng vẫn phẳng (exporter tách đỉnh khi pháp tuyến/màu/UV khác nhau).
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new('arch_lac_kiem_tong', mesh)
    bpy.context.scene.collection.objects.link(obj)

    # COLOR_0 xuất theo thuộc tính màu đang hoạt động: glTF nhân nó với baseColorTexture/baseColorFactor.
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_vertex_color='ACTIVE',
        export_image_format='JPEG',
        export_jpeg_quality=80,
    )
    return len(builder.verts), len(builder.faces), keys


def inspect(path):
    with open(path, 'rb') as f:
        blob = f.read()
    length = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20 + length].decode('utf-8'))
    prims = [p['attributes'] for m in doc.get('meshes', []) for p in m['primitives']]
    tris = sum(doc['accessors'][p['indices']]['count'] // 3 for m in doc.get('meshes', []) for p in m['primitives'] if 'indices' in p)
    return len(blob), prims, tris, doc


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = args[0] if args else 'arch_sect.glb'
    make_textures()
    b = build()
    nv, nf, keys = export(b, out)
    size, prims, tris, doc = inspect(out)
    print(f'[build_sect] {out}: {size / 1024:.0f} KB, {nf} mặt, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)}), '
          f'{len(doc.get("images", []))} ảnh')
    missing = [k for k in ('COLOR_0', 'TEXCOORD_0') if not all(k in p for p in prims)]
    if missing:
        print(f'[build_sect] LỖI: primitive thiếu {missing}')
        sys.exit(2)
