# Sinh kiến trúc Lạc Kiếm Tông bằng Blender (bpy) và xuất GLB tô màu theo đỉnh.
#
# Chạy (không mở giao diện):
#   blender --background --python tools/blender/build_sect.py -- apps/client/public/assets/sect.glb
#
# Quy ước tọa độ trong file này là tọa độ game, gốc đặt ở tâm sân tông môn:
#   x = đông, y = lên, z = nam. Hàm P() đổi sang hệ Blender (Z lên, Y bắc).
# Client đặt lưới này tại (SECT.x, SECT.y, SECT.z); vị trí các công trình phải khớp
# COLLIDERS trong packages/shared/src/level.ts.

import json
import math
import struct
import sys

import bpy

SEED = 20261112


def srgb(hex_color):
    """Mã màu sRGB -> bộ ba tuyến tính (glTF lưu màu đỉnh ở không gian tuyến tính)."""
    out = []
    for shift in (16, 8, 0):
        c = ((hex_color >> shift) & 255) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


STONE = srgb(0xA9A59B)
STONE_DARK = srgb(0x86827A)
PAVE = srgb(0xCFC9BA)
WALL = srgb(0xE9E3D3)
RED = srgb(0x9A2E29)
RED_DARK = srgb(0x7A211E)
ROOF = srgb(0x2F5560)
ROOF_ALT = srgb(0x386470)
ROOF_DARK = srgb(0x23424C)
GOLD = srgb(0xCAA24C)
WOOD = srgb(0x6B4A33)
WOOD_DARK = srgb(0x4A3324)
STEEL = srgb(0xC2CED6)
STEEL_DARK = srgb(0x9FB0BB)
BRONZE = srgb(0x8A6B3C)
BLUE = srgb(0x27506E)
LAMP = srgb(0xFFE2A0)


def P(x, y, z):
    return (x, -z, y)


class Builder:
    def __init__(self):
        self.verts = []
        self.faces = []
        self.colors = []
        self.smooth = []

    def face(self, pts, color, smooth=False):
        base = len(self.verts)
        for p in pts:
            self.verts.append(P(*p))
        self.faces.append(tuple(range(base, base + len(pts))))
        self.colors.append(color)
        self.smooth.append(smooth)

    def box(self, cx, cy, cz, sx, sy, sz, color, yaw=0.0, top_color=None):
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        c, s = math.cos(yaw), math.sin(yaw)

        def v(dx, dy, dz):
            return (cx + dx * c + dz * s, cy + dy, cz - dx * s + dz * c)

        p = [v(-hx, -hy, -hz), v(hx, -hy, -hz), v(hx, -hy, hz), v(-hx, -hy, hz), v(-hx, hy, -hz), v(hx, hy, -hz), v(hx, hy, hz), v(-hx, hy, hz)]
        self.face([p[4], p[7], p[6], p[5]], top_color or color)  # trên
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
                # Xen kẽ hai sắc ngói theo hàng để gợi các lớp ngói.
                stripe = ROOF if ((i if abs(-1 + 2 * (j + 0.5) / nv) * D > abs(-1 + 2 * (i + 0.5) / nu) * W - (W - D) else j) % 2 == 0) else ROOF_ALT
                self.face([a, e, c, b], stripe, True)
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
                self.face([prev[i], cur[i], cur[j], prev[j]], ROOF if (i + k) % 2 else ROOF_ALT, False)
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

    # ----- Đèn đá dọc lối đi -----
    for z in range(32, 72, 12):
        lantern(b, -7.5, z)
        lantern(b, 7.5, z)

    return b


def export(builder, path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mesh = bpy.data.meshes.new('lac_kiem_tong')
    mesh.from_pydata(builder.verts, [], builder.faces)
    mesh.update()
    mesh.polygons.foreach_set('use_smooth', builder.smooth)
    attr = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    data = []
    for poly, colr in zip(mesh.polygons, builder.colors):
        for _ in range(poly.loop_total):
            data.extend((colr[0], colr[1], colr[2], 1.0))
    attr.data.foreach_set('color', data)
    mesh.color_attributes.active_color = attr
    mesh.color_attributes.render_color_index = 0

    mat = bpy.data.materials.new('vcol')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is not None:
        vc = nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Color'
        mat.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.9
    mesh.materials.append(mat)

    obj = bpy.data.objects.new('arch_lac_kiem_tong', mesh)
    bpy.context.scene.collection.objects.link(obj)

    base = dict(filepath=path, export_format='GLB', export_yup=True, export_apply=True)
    for extra in (dict(export_vertex_color='MATERIAL'), dict(export_vertex_color='ACTIVE'), dict()):
        try:
            bpy.ops.export_scene.gltf(**base, **extra)
            break
        except TypeError:
            continue
    return len(builder.verts), len(builder.faces)


def inspect(path):
    with open(path, 'rb') as f:
        blob = f.read()
    length = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20 + length].decode('utf-8'))
    prims = [p['attributes'] for m in doc.get('meshes', []) for p in m['primitives']]
    tris = sum(doc['accessors'][p['indices']]['count'] // 3 for m in doc.get('meshes', []) for p in m['primitives'] if 'indices' in p)
    return len(blob), prims, tris


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = args[0] if args else 'sect.glb'
    b = build()
    nv, nf = export(b, out)
    size, prims, tris = inspect(out)
    print(f'[build_sect] {out}: {size / 1024:.0f} KB, {nf} mặt, {tris} tam giác, thuộc tính: {[sorted(p.keys()) for p in prims]}')
    if not any('COLOR_0' in p for p in prims):
        print('[build_sect] CẢNH BÁO: GLB không có màu đỉnh (COLOR_0)')
        sys.exit(2)
