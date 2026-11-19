# "Thiên Công Khai Vật" — bộ kiến trúc mô-đun của Lạc Kiếm Tông (MAP-1).
#
# Dựng trên `Builder` của build_sect.py (cùng hệ toạ độ game: x = đông, y = lên, z = nam, tâm sân ở gốc) nhưng đổi
# bảng vật liệu: ngọc trắng (nền, lan can, bậc), ngói lưu ly lục ngọc, cột sơn mai son, đồng/vàng. Mỗi mảnh là một hàm
# đăng ký bằng `@part(tên, nhóm)`, tự dựng quanh gốc, mặt trước hướng +z (nam), đặt chân ở y = 0.
# `thien_cong_sect.py` ghép các mảnh thành tông môn, xuất GLB và ảnh xem trước.
#
# Chất lượng mặt: mép vát (bevel) cho đá/ngọc, rêu đóng ở chân và mặt trên (tông xanh theo từng mặt), vết ố, nứt vẽ
# bằng texture ngọc thủ tục (vân mây + mạch).

import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402

import build_sect as bs  # noqa: E402
from build_sect import Mat, Paint, paint  # noqa: E402

# ---------- vật liệu và bảng màu ----------

# Tông môn mới rộng hơn ±80 m (tháp ở z = -93, cổng ở z = +96): nới miền UV (vẫn trong [0, 1] để lượng tử hóa 16 bit).
bs.UV_ORIGIN, bs.UV_RANGE = 140.0, 256

bs.MATERIALS['jade'] = Mat(0.55, 0.0, 'jade', 3.0, True, 0.04)
bs.MATERIALS['tile'] = Mat(0.38, 0.0, 'tile', 2.0, False, 0.02)  # ngói lưu ly: bóng hơn ngói thường (giữ khóa `tile`)
bs.MATERIALS['metal'] = Mat(0.35, 0.55, None, 1.0, False, 0.0)  # đồng/vàng
bs.MATERIALS['lamp'] = Mat(0.9, 0.0, None, 1.0, False, 0.0, (0xFFC27A, 0.55))  # đèn lồng, ô cửa sáng

JADE = paint(0xE9EFEA, 'jade')  # ngọc trắng (nền, lan can)
JADE_SHADE = paint(0xC9D6CF, 'jade')
JADE_GREEN = paint(0x7FB5A0, 'jade')  # ngọc lục (chạm khắc nhấn, mặt bia)
CLOUD = paint(0xF3F6F3, 'plaster')  # trắng mây: tường
GLAZE = paint(0x2F8A72, 'tile')  # ngói lưu ly lục ngọc
GLAZE_DARK = paint(0x1E6455, 'tile')  # bờ nóc, bờ dải
VERMILION = paint(0xB5332D, 'lacquer')  # son mai (cột, cửa)
VERMILION_DARK = paint(0x8E2824, 'lacquer')
PLUM = paint(0xC24B5A, 'lacquer')  # mai son nhạt (diềm, phướn)
INK = paint(0x1F2E3C, 'lacquer')  # hoành phi nền mực
GILD = paint(0xD2AA55, 'metal')
BRONZE_D = paint(0x8E6C3A, 'metal')
TIMBER = paint(0x8A6944, 'wood')
TIMBER_D = paint(0x4D3324, 'wood')
BLADE = paint(0xC9D4DA, 'steel')
BLADE_D = paint(0x8FA0AA, 'steel')
MOSS = (0.16, 0.30, 0.08)  # tuyến tính
PAPER = paint(0xFFE3B0, 'lamp')

# ---------- texture ngọc (vân mây + mạch), nạp vào hệ texture của build_sect ----------

_orig_make_textures = bs.make_textures


def _make_textures():
    _orig_make_textures()
    rng = np.random.default_rng(bs.SEED + 7)
    n = bs.TEX_SIZE
    cloud = bs.norm01(bs.fbm(rng, n, 3, 5))
    fine = bs.norm01(bs.fbm(rng, n, 10, 4))
    vein = 1 - np.abs(bs.fbm(rng, n, 4, 4) - 0.5) * 2  # đỉnh nhọn ở đường mạch
    vein = np.clip((vein - 0.82) * 6, 0, 1)
    jade = 0.88 + 0.07 * cloud + 0.03 * (fine - 0.5) - 0.07 * vein
    arr = np.clip(jade, 0, 1)
    bs.TEXTURES['jade'] = arr
    lin = np.where(arr <= 0.04045, arr / 12.92, ((arr + 0.055) / 1.055) ** 2.4)
    bs.TEX_GAIN['jade'] = 1.0 / float(lin.mean())


bs.make_textures = _make_textures

# Đổi bảng màu của build_sect (pavilion, lantern, column, hip_roof… đọc biến toàn cục lúc gọi) sang bảng Lạc Kiếm mới.
bs.PAVE, bs.STONE, bs.STONE_DARK = JADE, JADE_SHADE, paint(0xA9B7B0, 'jade')
bs.WALL, bs.RED, bs.RED_DARK, bs.BLUE = CLOUD, VERMILION, VERMILION_DARK, INK
bs.ROOF, bs.ROOF_DARK, bs.GOLD, bs.BRONZE = GLAZE, GLAZE_DARK, GILD, BRONZE_D
bs.WOOD, bs.WOOD_DARK, bs.STEEL, bs.STEEL_DARK, bs.LAMP = TIMBER, TIMBER_D, BLADE, BLADE_D, PAPER

# ---------- Builder mở rộng ----------


class KB(bs.Builder):
    """Builder có rêu/ố theo mặt và vài phép dựng mới."""

    moss_amount = 1.0
    xf = None  # (tx, ty, tz, yaw, scale): phép đặt hiện hành của `at()`, áp cho mọi mặt

    def at(self, x=0.0, y=0.0, z=0.0, yaw=0.0, scale=1.0):
        """Ngữ cảnh đặt mảnh: `with b.at(10, 0, -5, yaw=0.3): PARTS['dien_nho'][1](b)`."""
        kb = self

        class _Ctx:
            def __enter__(self):
                self.prev = kb.xf
                kb.xf = (x, y, z, yaw, scale)

            def __exit__(self, *exc):
                kb.xf = self.prev

        return _Ctx()

    def place(self, pid, x=0.0, y=0.0, z=0.0, yaw=0.0, scale=1.0):
        with self.at(x, y, z, yaw, scale):
            PARTS[pid][1](self)

    def face(self, pts, color, smooth=False):
        world = None
        if self.xf:
            # UV, rêu, AO tính theo toạ độ cục bộ của mảnh (miền UV nhỏ, rêu bám chân từng mảnh); chỉ đỉnh mới đổi sang toạ độ thế giới.
            tx, ty, tz, yaw, sc = self.xf
            c, sn = math.cos(yaw), math.sin(yaw)
            world = [((px * c + pz * sn) * sc + tx, py * sc + ty, (-px * sn + pz * c) * sc + tz) for px, py, pz in pts]
        if color.mat in ('jade', 'stone') and self.moss_amount > 0:
            low = min(p[1] for p in pts)
            nx, ny, nz = bs.newell(pts)
            t = 0.0
            if low < 0.9:  # chân tường, bậc thềm: rêu từ đất bò lên
                t = (1 - max(low, 0) / 0.9) * self.rng.uniform(0.0, 0.5)
            if ny > 0.7:  # mặt ngửa đọng rêu thưa
                t = max(t, self.rng.uniform(0.0, 0.22) if self.rng.random() < 0.5 else 0.0)
            t *= self.moss_amount
            if t > 0.01:
                color = Paint(tuple(c * (1 - t) + m * t for c, m in zip(color.rgb, MOSS)), color.mat)
        base = len(self.verts)
        super().face(pts, color, smooth)
        if world:
            for i, p in enumerate(world):
                self.verts[base + i] = bs.P(*p)

    def poly(self, pts, interior, color):
        """Đa giác tự quay chiều sao cho pháp tuyến hướng ra xa điểm `interior`."""
        nx, ny, nz = bs.newell(pts)
        c = [sum(p[i] for p in pts) / len(pts) for i in range(3)]
        d = (c[0] - interior[0]) * nx + (c[1] - interior[1]) * ny + (c[2] - interior[2]) * nz
        self.face(pts if d >= 0 else list(reversed(pts)), color)

    def prism(self, outline, z0, z1, color, cx=0.0, y0=0.0):
        """Đùn hình `outline` [(x, y)] (mặt phẳng xy) dày từ z0 tới z1."""
        mid = (sum(p[0] for p in outline) / len(outline) + cx, y0 + sum(p[1] for p in outline) / len(outline), (z0 + z1) / 2)
        front = [(cx + x, y0 + y, z1) for x, y in outline]
        back = [(cx + x, y0 + y, z0) for x, y in outline]
        self.poly(front, mid, color)
        self.poly(back, mid, color)
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            self.poly([front[i], front[j], back[j], back[i]], mid, color)

    def beam(self, x0, y0, z0, x1, y1, z1, t, color):
        """Xà tiết diện vuông t × t nối hai điểm."""
        dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
        length = math.sqrt(dx * dx + dy * dy + dz * dz)
        if length < 1e-6:
            return
        yaw = -math.atan2(dz, dx)
        pitch_y = dy
        if abs(pitch_y) < 1e-6:
            self.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, length, t, t, color, yaw=yaw)
        else:  # xà nghiêng: xấp xỉ bằng các đoạn ngang
            steps = max(2, int(abs(dy) / t))
            for k in range(steps):
                a, b = k / steps, (k + 1) / steps
                self.beam(x0 + dx * a, y0 + dy * a, z0 + dz * a, x0 + dx * b, y0 + dy * a, z0 + dz * b, t, color)

    def plinth(self, cx, cz, w, d, tiers=3, h=0.9, color=JADE, inset=0.7):
        """Nền ngọc nhiều bậc, trả về độ cao mặt nền trên cùng."""
        y = 0.0
        for k in range(tiers):
            ww, dd = w - 2 * inset * k, d - 2 * inset * k
            th = h / tiers
            self.box(cx, y + th / 2, cz, ww, th, dd, color if k % 2 == 0 else JADE_SHADE)
            self.box(cx, y + th + 0.03, cz, ww + 0.2, 0.06, dd + 0.2, JADE_SHADE)
            y += th + 0.06
        return y

    def stair(self, cx, z_front, w, rise, run=0.42, color=JADE, down=1):
        """Bậc thềm chạy về +z (down = 1) hoặc -z, cao tổng `rise`."""
        n = max(2, int(round(rise / 0.17)))
        h = rise / n
        for k in range(n):
            self.box(cx, h * (k + 0.5), z_front + down * (n - k - 0.5) * run, w, h, run, color if k % 2 == 0 else JADE_SHADE)

    def balustrade(self, x0, z0, x1, z1, y=0.0, h=1.0, post=2.2, color=JADE, cloud=True):
        """Lan can ngọc: trụ vuông đầu tròn, thanh ngang, tấm chạm mây giữa các trụ."""
        L = math.hypot(x1 - x0, z1 - z0)
        n = max(1, int(round(L / post)))
        yaw = -math.atan2(z1 - z0, x1 - x0)
        for k in range(n + 1):
            t = k / n
            px, pz = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            self.box(px, y + h / 2, pz, 0.26, h, 0.26, JADE_SHADE, yaw=yaw)
            self.cylinder(px, y + h, pz, 0.17, 0.2, color, 8, 0.05)
        for k in range(n):
            t = (k + 0.5) / n
            px, pz = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            seg = L / n - 0.26
            self.box(px, y + h - 0.1, pz, seg, 0.14, 0.16, color, yaw=yaw)
            self.box(px, y + 0.18, pz, seg, 0.28, 0.2, color, yaw=yaw)
            if cloud:  # tấm giữa: hai vòng mây nổi
                self.box(px, y + h * 0.5, pz, seg * 0.8, h * 0.4, 0.1, JADE_GREEN, yaw=yaw)
                self.box(px, y + h * 0.5, pz, seg * 0.56, h * 0.24, 0.14, JADE, yaw=yaw)

    def dougong(self, cx, y, cz, s=1.0, yaw=0.0, tiers=2):
        """Cụm đấu củng đỡ mái: các lớp củng chìa dần ra, kẹp đấu vuông."""
        c, sn = math.cos(yaw), math.sin(yaw)

        def at(dx, dz):
            return cx + dx * c + dz * sn, cz - dx * sn + dz * c

        x, z = at(0, 0)
        self.box(x, y + 0.14 * s, z, 0.7 * s, 0.28 * s, 0.7 * s, TIMBER_D, yaw=yaw)  # đấu lớn
        yy = y + 0.28 * s
        for k in range(tiers):
            reach = 0.55 * s * (k + 1)
            for sign in (-1, 1):
                x, z = at(0, sign * reach * 0.5)
                self.box(x, yy + 0.1 * s, z, 0.26 * s, 0.2 * s, reach + 0.5 * s, VERMILION_DARK, yaw=yaw)  # củng chìa dọc
            x, z = at(0, 0)
            self.box(x, yy + 0.1 * s, z, reach * 2 + 0.6 * s, 0.2 * s, 0.26 * s, VERMILION_DARK, yaw=yaw)  # củng ngang
            for sign in (-1, 1):
                for sgn2 in (-1, 1):
                    x, z = at(sign * reach, sgn2 * reach * 0.5)
                    self.box(x, yy + 0.3 * s, z, 0.3 * s, 0.2 * s, 0.3 * s, GILD if k == tiers - 1 else TIMBER_D, yaw=yaw)
            yy += 0.32 * s

    def column(self, cx, y0, cz, r, h, color=None):
        """Cột sơn son trên chân tảng ngọc chạm (ba tầng, đai ngọc lục), đai vàng ở chân và đầu cột."""
        color = color or VERMILION
        self.cylinder(cx, y0, cz, r * 2.0, 0.12, JADE_SHADE, 16, r * 1.8, smooth=False)
        self.cylinder(cx, y0 + 0.12, cz, r * 1.75, 0.34, JADE, 16, r * 1.35)
        self.cylinder(cx, y0 + 0.46, cz, r * 1.38, 0.06, JADE_GREEN, 16)
        self.cylinder(cx, y0 + 0.52, cz, r * 1.1, 0.1, GILD, 14)
        self.cylinder(cx, y0 + 0.62, cz, r, h - 1.25, color, 14, r * 0.92)
        self.cylinder(cx, y0 + h - 0.62, cz, r * 0.96, 0.12, GILD, 14)
        self.box(cx, y0 + h - 0.22, cz, r * 2.7, 0.44, r * 2.7, TIMBER_D)

    def ribbon(self, pts, w0, w1, t, color):
        """Dải gờ mái mượt: chuỗi điểm 3D, rộng w0 → w1, dày t (mặt trên + hai mặt bên), không có bậc."""
        n = len(pts)
        rows = []
        for i, (x, y, z) in enumerate(pts):
            j0, j1 = max(0, i - 1), min(n - 1, i + 1)
            dx, dz = pts[j1][0] - pts[j0][0], pts[j1][2] - pts[j0][2]
            ln = math.hypot(dx, dz) or 1.0
            sx, sz = -dz / ln, dx / ln
            w = (w0 + (w1 - w0) * i / max(1, n - 1)) / 2
            rows.append(((x - sx * w, y + t, z - sz * w), (x + sx * w, y + t, z + sz * w), (x - sx * w * 1.15, y, z - sz * w * 1.15), (x + sx * w * 1.15, y, z + sz * w * 1.15), (x, y - t, z)))
        for i in range(n - 1):
            a, b = rows[i], rows[i + 1]
            mid = ((a[4][0] + b[4][0]) / 2, a[4][1] - 1.0, (a[4][2] + b[4][2]) / 2)
            self.poly([a[0], a[1], b[1], b[0]], mid, color)  # mặt trên
            self.poly([a[0], a[2], b[2], b[0]], mid, color)  # bên trái
            self.poly([a[1], a[3], b[3], b[1]], mid, color)  # bên phải

    def hip_roof(self, cx, y0, cz, w, d, h, overhang=2.2, nu=26, nv=18, lift=1.6):
        """Mái hip cong lõm (thay bản của build_sect): bờ nóc và bốn bờ dải là dải mượt, góc mái hất cong thật (đầu đao)."""
        W = w / 2 + overhang
        D = d / 2 + overhang

        def height(u, v):
            ex = (1 - abs(u)) * W
            ez = (1 - abs(v)) * D
            sdist = max(0.0, min(1.0, min(ex, ez) / D))
            curve = sdist ** 1.55
            corner = (abs(u) ** 7) * (abs(v) ** 7)
            edge = max(abs(u), abs(v)) ** 10
            return y0 + h * curve + lift * corner + 0.25 * edge

        grid = [[(cx + (-1 + 2 * i / nu) * W, height(-1 + 2 * i / nu, -1 + 2 * j / nv), cz + (-1 + 2 * j / nv) * D) for i in range(nu + 1)] for j in range(nv + 1)]
        for j in range(nv):
            for i in range(nu):
                a, b, c, e = grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]
                self.face([a, e, c, b], bs.ROOF, True)
        rim = [grid[0][i] for i in range(nu + 1)] + [grid[j][nu] for j in range(1, nv + 1)] + [grid[nv][i] for i in range(nu - 1, -1, -1)] + [grid[j][0] for j in range(nv - 1, 0, -1)]
        n = len(rim)
        for i in range(n):
            a, b = rim[i], rim[(i + 1) % n]
            self.face([a, b, (b[0], b[1] - 0.42, b[2]), (a[0], a[1] - 0.42, a[2])], bs.GOLD)
        soffit_y = y0 - 0.1
        self.face([(cx - W, soffit_y, cz - D), (cx + W, soffit_y, cz - D), (cx + W, soffit_y, cz + D), (cx - W, soffit_y, cz + D)], bs.WOOD_DARK)
        ridge = max(0.0, W - D)
        top = y0 + h
        if ridge > 0.5:
            self.ribbon([(cx - ridge - 0.4 + k * (2 * ridge + 0.8) / 10, top + 0.55, cz) for k in range(11)], 0.9, 0.9, 0.55, bs.ROOF_DARK)
            for sx in (-1, 1):  # đầu sí vẫy lên
                self.ribbon([(cx + sx * (ridge + 0.1 + k * 0.1), top + 0.8 + k * k * 0.1, cz) for k in range(6)], 0.7, 0.4, 0.5, bs.GOLD)
        else:
            self.cylinder(cx, top, cz, 0.55, 1.2, bs.GOLD, 8, 0.15)
        # Bốn bờ dải chạy từ nóc xuống góc, rồi hất cong lên ở đầu đao.
        steps = 20
        for sx in (-1, 1):
            for sz in (-1, 1):
                pts = []
                for k in range(steps + 1):
                    t = k / steps
                    x = cx + sx * (ridge + (W - ridge) * t)
                    z = cz + sz * D * t
                    pts.append((x, height(sx * (ridge + (W - ridge) * t) / W, sz * t) + 0.3, z))
                # đuôi cong: vươn ra ngoài và hất lên
                ex, ey, ez = pts[-1]
                for k in range(1, 5):
                    q = k / 4
                    pts.append((ex + sx * 0.9 * q, ey + 0.2 + 1.5 * q * q, ez + sz * 0.55 * q))
                self.ribbon(pts, 0.7, 0.34, 0.42, bs.ROOF_DARK)

    def curved_hip(self, cx, y0, cz, w, d, h, overhang=2.4, lift=1.8):
        """Mái hip (build_sect.hip_roof) nhưng ngói lưu ly lục ngọc, bờ dải đậm, diềm vàng."""
        ROOF_SAVE = (bs.ROOF, bs.ROOF_DARK, bs.GOLD)
        bs.ROOF, bs.ROOF_DARK, bs.GOLD = GLAZE, GLAZE_DARK, GILD
        try:
            self.hip_roof(cx, y0, cz, w, d, h, overhang=overhang, nu=24, nv=16, lift=lift)
        finally:
            bs.ROOF, bs.ROOF_DARK, bs.GOLD = ROOF_SAVE

    def curved_round(self, cx, y0, cz, r, h, sides=6, lift=1.2):
        ROOF_SAVE = (bs.ROOF, bs.GOLD)
        bs.ROOF, bs.GOLD = GLAZE, GILD
        try:
            self.round_roof(cx, y0, cz, r, h, sides=sides, rings=9, lift=lift)
        finally:
            bs.ROOF, bs.GOLD = ROOF_SAVE

    def sword_planted(self, cx, cz, y0, length, width, thick=0.0, yaw=0.0):
        """Kiếm cắm mũi xuống: lưỡi thon có rãnh giữa, tay nắm chạm hình sừng vẫy lên, chuôi quấn vàng, đầu chuôi tròn."""
        w = width / 2
        th = thick or max(0.12, width * 0.07)
        outline = [(0.0, 0.0), (w * 0.8, length * 0.1), (w, length * 0.2), (w, length), (-w, length), (-w, length * 0.2), (-w * 0.8, length * 0.1)]
        c, sn = math.cos(yaw), math.sin(yaw)

        def at(x, y, z):
            return (cx + x * c + z * sn, y0 + y, cz - x * sn + z * c)

        mid = at(0, length * 0.5, 0)
        for zz in (-th, th):
            self.poly([at(x, y, zz) for x, y in outline], mid, BLADE)
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            self.poly([at(outline[i][0], outline[i][1], -th), at(outline[j][0], outline[j][1], -th), at(outline[j][0], outline[j][1], th), at(outline[i][0], outline[i][1], th)], mid, BLADE_D)
        for zz in (-1, 1):  # rãnh giữa: dải thép sẫm chìm
            self.poly([at(-w * 0.12, length * 0.14, zz * (th + 0.02)), at(w * 0.12, length * 0.14, zz * (th + 0.02)), at(w * 0.12, length * 0.97, zz * (th + 0.02)), at(-w * 0.12, length * 0.97, zz * (th + 0.02))], mid, BLADE_D)
        gx, gy, gz = at(0, length + 0.15, 0)
        self.box(gx, gy, gz, width * 2.4, 0.3, th * 3.2, GILD, yaw=yaw)
        for s in (-1, 1):  # đầu tay nắm vẫy lên
            ex, ey, ez = at(s * width * 1.15, length + 0.55, 0)
            self.box(ex, ey, ez, width * 0.35, 0.65, th * 2.6, GILD, yaw=yaw)
        hx, hy, hz = at(0, length + 0.3 + width * 0.8, 0)
        self.cylinder(hx, hy - width * 0.8, hz, width * 0.16, width * 1.6, TIMBER_D, 8)
        for k in range(4):
            self.cylinder(hx, hy - width * 0.7 + k * width * 0.38, hz, width * 0.19, width * 0.1, GILD, 8)
        px, py, pz = at(0, length + 0.3 + width * 1.7, 0)
        self.cylinder(px, py, pz, width * 0.3, width * 0.4, GILD, 8, width * 0.12)

    def sword_up(self, cx, cz, y0, length, width=0.5, tilt=0.0, yaw=0.0, color=BLADE, hilt=True):
        """Thanh kiếm cắm đứng mũi xuống (chuôi ở trên): lưỡi thon, sống nổi, tay nắm, chuôi."""
        c, sn = math.cos(yaw), math.sin(yaw)
        w = width / 2

        def at(x, y, z):  # x ngang lưỡi, y dọc theo kiếm, z dày; nghiêng theo trục z
            yy = y * math.cos(tilt) - z * math.sin(tilt) * 0
            return (cx + x * c + z * sn + math.sin(tilt) * y, y0 + yy, cz - x * sn + z * c)

        blade = [(-w, 0.0), (w, 0.0), (w, length * 0.82), (0.0, length), (-w, length * 0.82)]
        # lưỡi: mặt trước/sau và 5 cạnh (đùn theo độ dày 0.08)
        th = 0.05 + width * 0.05
        mid = at(0, length * 0.4, 0)
        for zz in (-th, th):
            self.poly([at(x, y, zz) for x, y in blade], mid, color)
        for i in range(len(blade)):
            j = (i + 1) % len(blade)
            self.poly([at(blade[i][0], blade[i][1], -th), at(blade[j][0], blade[j][1], -th), at(blade[j][0], blade[j][1], th), at(blade[i][0], blade[i][1], th)], mid, BLADE_D)
        # sống kiếm
        self.poly([at(-0.04, length * 0.05, th + 0.02), at(0.04, length * 0.05, th + 0.02), at(0.02, length * 0.86, th + 0.02), at(-0.02, length * 0.86, th + 0.02)], mid, BLADE_D)
        if hilt:
            gx, gy, gz = at(0, 0, 0)
            self.box(gx, gy, gz, width * 2.2, 0.16, 0.22, GILD, yaw=yaw)
            hx, hy, hz = at(0, -width * 0.8, 0)
            self.box(hx, hy, hz, 0.12, width * 1.6, 0.12, TIMBER_D, yaw=yaw)
            ex, ey, ez = at(0, -width * 1.7, 0)
            self.box(ex, ey, ez, 0.2, 0.2, 0.2, GILD, yaw=yaw)


# ---------- danh mục mảnh ----------

PARTS = {}  # id -> (nhóm, hàm dựng)


def part(pid, group):
    def deco(fn):
        PARTS[pid] = (group, fn)
        return fn

    return deco


def new_builder(seed=0, moss=1.0):
    b = KB()
    b.rng = random.Random(bs.SEED + seed)
    b.moss_amount = moss
    return b


# -- nền, bậc, đường --


@part('nen_ngoc_1', 'nen')
def _(b):
    b.plinth(0, 0, 12, 12, 1, 0.5)


@part('nen_ngoc_3', 'nen')
def _(b):
    b.plinth(0, 0, 14, 14, 3, 1.5)


@part('nen_ngoc_tron', 'nen')
def _(b):
    r, y = 8.0, 0.0
    for k in range(3):
        b.cylinder(0, y, 0, r - k * 0.9, 0.42, JADE if k % 2 == 0 else JADE_SHADE, 24, smooth=False)
        y += 0.42


@part('bac_them_ngoc', 'nen')
def _(b):
    b.stair(0, 0, 6, 1.6)


@part('bac_them_may', 'nen')
def _(b):
    b.stair(0, 0, 7, 2.1)
    for sx in (-1, 1):  # đá dẫn giữa hai thành bậc: dải ngọc lục chạm mây
        b.box(sx * 3.9, 0.9, 0.3, 0.8, 1.8, 3.2, JADE_SHADE)
    b.box(0, 1.1, 1.9, 2.2, 0.06, 3.6, JADE_GREEN)


@part('duong_lat_ngoc', 'nen')
def _(b):
    for k in range(6):
        b.box(0, 0.03, k * 1.6 - 4, 3.2, 0.06, 1.5, JADE if k % 2 == 0 else JADE_SHADE)


@part('thanh_da', 'nen')
def _(b):
    b.box(0, 0.25, 0, 6, 0.5, 0.6, JADE_SHADE)


@part('chan_tang_cot', 'nen')
def _(b):
    b.cylinder(0, 0, 0, 0.9, 0.12, JADE_SHADE, 16, smooth=False)
    b.cylinder(0, 0.12, 0, 0.78, 0.4, JADE, 16, 0.62)
    b.cylinder(0, 0.52, 0, 0.55, 0.06, JADE_GREEN, 16)


@part('bia_chan_tang', 'nen')
def _(b):
    b.box(0, 0.2, 0, 1.6, 0.4, 1.6, JADE_SHADE)
    b.box(0, 0.5, 0, 1.3, 0.2, 1.3, JADE)


# -- cột --


@part('cot_tron_son', 'cot')
def _(b):
    b.column(0, 0, 0, 0.45, 6.5, VERMILION)


@part('cot_vuong_ngoc', 'cot')
def _(b):
    b.box(0, 0.2, 0, 1.3, 0.4, 1.3, JADE_SHADE)
    b.box(0, 3.4, 0, 0.8, 6.0, 0.8, JADE)
    b.box(0, 6.5, 0, 1.0, 0.4, 1.0, GILD)


@part('cot_dau_cung', 'cot')
def _(b):
    b.column(0, 0, 0, 0.45, 6.5, VERMILION)
    b.dougong(0, 6.5, 0, 1.0, tiers=2)


@part('cot_rong', 'cot')
def _(b):
    b.cylinder(0, 0, 0, 0.8, 0.4, JADE_SHADE, 12, 0.65)
    b.cylinder(0, 0.4, 0, 0.5, 6.0, VERMILION, 12, 0.45)
    for k in range(9):  # vòng rồng cuốn
        a = k * 0.9
        b.cylinder(math.cos(a) * 0.02, 0.8 + k * 0.6, math.sin(a) * 0.02, 0.58, 0.16, GILD, 12)
    b.box(0, 6.5, 0, 1.2, 0.35, 1.2, TIMBER_D)


@part('tru_da_khac_phu', 'cot')
def _(b):
    b.cylinder(0, 0, 0, 0.7, 0.5, JADE_SHADE, 8, 0.6, smooth=False)
    b.cylinder(0, 0.5, 0, 0.5, 4.5, JADE, 8, smooth=False)
    for k in range(8):
        b.box(0, 1.0 + k * 0.5, 0.52, 0.34, 0.2, 0.06, JADE_GREEN)
    b.cylinder(0, 5.0, 0, 0.62, 0.3, JADE_SHADE, 8, 0.2, smooth=False)


@part('cot_co_phuong', 'cot')
def _(b):
    b.cylinder(0, 0, 0, 0.18, 8.0, TIMBER_D, 8, 0.12)
    b.box(0.0, 8.1, 0, 0.3, 0.3, 0.3, GILD)
    b.box(0.9, 6.2, 0, 1.8, 3.2, 0.05, PLUM)
    b.box(0.9, 6.2, 0.04, 1.4, 2.6, 0.05, GILD)


# -- đấu củng, mái, ngọn --


@part('dau_cung_don', 'dau')
def _(b):
    b.dougong(0, 0, 0, 1.0, tiers=1)


@part('dau_cung_doi', 'dau')
def _(b):
    b.dougong(0, 0, 0, 1.2, tiers=3)


@part('dau_cung_dai', 'dau')
def _(b):
    for k in range(5):
        b.dougong((k - 2) * 2.4, 0, 0, 1.0, tiers=2)
    b.box(0, 0.1, 0, 10.4, 0.2, 0.4, VERMILION_DARK)


@part('mai_hip_nho', 'mai')
def _(b):
    b.curved_hip(0, 0, 0, 8, 6, 2.6, overhang=1.8, lift=1.1)


@part('mai_hip_vua', 'mai')
def _(b):
    b.curved_hip(0, 0, 0, 16, 10, 3.6, overhang=2.4, lift=1.5)


@part('mai_hip_lon', 'mai')
def _(b):
    b.curved_hip(0, 0, 0, 28, 18, 5.0, overhang=3.0, lift=1.9)


@part('mai_hai_tang', 'mai')
def _(b):
    b.curved_hip(0, 0, 0, 28, 18, 4.2, overhang=3.0, lift=1.9)
    b.box(0, 4.8, 0, 14, 2.6, 8, CLOUD)
    b.curved_hip(0, 7.0, 0, 14, 8, 3.6, overhang=2.4, lift=1.6)


@part('mai_luc_giac', 'mai')
def _(b):
    b.curved_round(0, 0, 0, 5.5, 3.2, 6)


@part('mai_bat_giac', 'mai')
def _(b):
    b.curved_round(0, 0, 0, 6.5, 3.8, 8)


@part('mai_chop_thap', 'mai')
def _(b):
    b.curved_round(0, 0, 0, 4.0, 3.8, 4, lift=1.5)


@part('mai_hien', 'mai')
def _(b):
    for k in range(8):  # mái một dốc: tấm ngói bậc
        y = 2.0 - k * 0.2
        b.box(0, y + 0.1, -k * 0.55, 8, 0.2, 0.7, GLAZE)
    b.box(0, 2.1, 0.1, 8.4, 0.3, 0.3, GILD)


@part('mai_cong', 'mai')
def _(b):
    b.curved_hip(0, 0, 0, 18, 3.2, 2.4, overhang=1.8, lift=1.3)


@part('bo_noc_tri_vat', 'mai')
def _(b):
    b.box(0, 0.35, 0, 8, 0.7, 0.8, GLAZE_DARK)
    for sx in (-1, 1):  # đầu sí vẫy lên
        b.box(sx * 4.2, 1.2, 0, 0.5, 1.8, 0.7, GILD)
        b.box(sx * 3.9, 2.2, 0, 0.9, 0.4, 0.5, GILD)
    b.cylinder(0, 0.7, 0, 0.3, 1.8, GILD, 8, 0.05)


@part('dau_dao_goc', 'mai')
def _(b):
    for k in range(5):
        b.box(k * 0.55, 0.35 + k * k * 0.07, 0, 0.7, 0.3, 0.5, GLAZE_DARK)
    b.box(2.8, 1.8, 0, 0.3, 0.6, 0.3, GILD)


# -- lan can --


@part('lan_can_ngoc', 'lan_can')
def _(b):
    b.balustrade(-5, 0, 5, 0, h=1.0)


@part('lan_can_goc', 'lan_can')
def _(b):
    b.balustrade(-4, 0, 0, 0, h=1.0)
    b.balustrade(0, 0, 0, 4, h=1.0)


@part('lan_can_may', 'lan_can')
def _(b):
    b.balustrade(-5, 0, 5, 0, h=1.15, post=2.6)
    for k in range(4):
        b.box(-3.9 + k * 2.6, 1.55, 0, 0.5, 0.4, 0.5, GILD)


@part('lan_can_go', 'lan_can')
def _(b):
    for k in range(5):
        b.box(-4 + k * 2, 0.55, 0, 0.16, 1.1, 0.16, VERMILION)
    b.box(0, 1.05, 0, 8.2, 0.12, 0.2, VERMILION_DARK)
    b.box(0, 0.6, 0, 8.2, 0.08, 0.12, VERMILION_DARK)
    b.box(0, 0.2, 0, 8.2, 0.08, 0.14, VERMILION_DARK)


@part('truc_lan_can', 'lan_can')
def _(b):
    b.box(0, 0.7, 0, 0.5, 1.4, 0.5, JADE_SHADE)
    b.cylinder(0, 1.4, 0, 0.32, 0.35, JADE, 10, 0.1)
    b.box(0, 1.95, 0, 0.2, 0.3, 0.2, GILD)


# -- tường, cửa --


@part('tuong_voi', 'tuong')
def _(b):
    b.box(0, 0.35, 0, 8.4, 0.7, 0.9, JADE_SHADE)
    b.box(0, 2.6, 0, 8.0, 3.9, 0.6, CLOUD)
    b.box(0, 4.7, 0, 8.4, 0.3, 0.9, VERMILION_DARK)


@part('tuong_cua_so', 'tuong')
def _(b):
    b.box(0, 0.35, 0, 8.4, 0.7, 0.9, JADE_SHADE)
    b.box(0, 3.3, 0, 8.0, 5.0, 0.6, CLOUD)
    b.box(0, 3.4, 0.2, 3.2, 2.6, 0.2, TIMBER_D)
    for k in range(7):
        b.box(-1.5 + k * 0.5, 3.4, 0.34, 0.1, 2.4, 0.08, TIMBER)
    b.box(0, 3.4, 0.34, 3.0, 0.1, 0.08, TIMBER)
    b.box(0, 3.4, 0.1, 2.9, 2.3, 0.05, PAPER)


@part('cua_chinh_hai_canh', 'tuong')
def _(b):
    b.box(0, 2.6, 0, 6.0, 5.2, 0.4, TIMBER_D)
    for sx in (-1, 1):
        b.box(sx * 1.45, 2.5, 0.22, 2.7, 4.8, 0.14, VERMILION)
        for k in range(4):
            b.box(sx * 1.45, 1.2 + k * 1.1, 0.32, 2.2, 0.08, 0.05, GILD)
        b.box(sx * 0.45, 2.5, 0.34, 0.14, 0.4, 0.1, GILD)
    b.box(0, 5.5, 0.1, 6.6, 0.5, 0.5, VERMILION_DARK)


@part('cua_so_song', 'tuong')
def _(b):
    b.box(0, 1.6, 0, 3.4, 3.2, 0.3, TIMBER_D)
    for k in range(7):
        b.box(-1.4 + k * 0.47, 1.6, 0.16, 0.1, 3.0, 0.08, TIMBER)
    for k in range(5):
        b.box(0, 0.4 + k * 0.6, 0.16, 3.2, 0.08, 0.08, TIMBER)


@part('cua_tron_nguyet', 'tuong')
def _(b):
    R, th = 2.2, 0.8
    n = 24
    for k in range(n):
        a0, a1 = k / n * math.tau, (k + 1) / n * math.tau
        r0, r1 = R, R + th
        pts = [
            (math.cos(a0) * r0, 2.4 + math.sin(a0) * r0, 0.45),
            (math.cos(a1) * r0, 2.4 + math.sin(a1) * r0, 0.45),
            (math.cos(a1) * r1, 2.4 + math.sin(a1) * r1, 0.45),
            (math.cos(a0) * r1, 2.4 + math.sin(a0) * r1, 0.45),
        ]
        b.prism([(p[0], p[1]) for p in pts], -0.45, 0.45, JADE if k % 2 == 0 else JADE_SHADE)
    b.box(0, 0.2, 0, 3.0, 0.4, 1.2, JADE_SHADE)


@part('cua_cham_khac', 'tuong')
def _(b):
    b.box(0, 2.7, 0, 5.0, 5.4, 0.5, JADE)
    b.box(0, 2.3, 0.3, 3.2, 4.6, 0.12, JADE_GREEN)
    for k in range(5):
        b.box(0, 0.8 + k * 0.85, 0.4, 2.4 - 0.15 * k, 0.1, 0.06, GILD)
    b.box(0, 5.2, 0.3, 5.4, 0.4, 0.6, JADE_SHADE)


@part('hoanh_phi', 'tuong')
def _(b):
    b.box(0, 0, 0, 5.8, 1.3, 0.3, INK)
    b.box(0, 0, 0.18, 5.4, 0.9, 0.08, GILD)
    b.box(0, 0, 0.24, 4.2, 0.4, 0.05, INK)
    for sx in (-1, 1):
        b.box(sx * 3.0, 0, 0, 0.2, 1.5, 0.4, GILD)


@part('tuong_rao_ngoi', 'tuong')
def _(b):
    b.box(0, 0.3, 0, 8, 0.6, 0.8, JADE_SHADE)
    b.box(0, 1.4, 0, 7.6, 1.6, 0.5, CLOUD)
    b.box(0, 2.3, 0, 8.2, 0.3, 0.9, GLAZE_DARK)
    for k in range(10):
        b.box(-3.6 + k * 0.8, 2.55, 0, 0.7, 0.18, 1.0, GLAZE)


# -- cầu --


@part('cau_da_thang', 'cau')
def _(b):
    b.box(0, 0.4, 0, 5, 0.8, 14, JADE)
    for sx in (-1, 1):
        b.balustrade(sx * 2.4, -7, sx * 2.4, 7, y=0.8, h=1.0)


@part('cau_vom_ngoc', 'cau')
def _(b):
    n = 12
    for k in range(n):
        z0 = -8 + k * (16 / n)
        y0 = 2.2 * math.sin((k + 0.5) / n * math.pi)
        b.box(0, y0, z0 + 8 / n, 5, 0.7, 16 / n + 0.05, JADE if k % 2 == 0 else JADE_SHADE)
        for sx in (-1, 1):
            b.box(sx * 2.4, y0 + 0.9, z0 + 8 / n, 0.22, 0.7, 16 / n, JADE_SHADE)
    for sx in (-1, 1):
        b.box(sx * 2.4, 0.2, -8.2, 0.9, 0.9, 0.9, JADE_SHADE)
        b.box(sx * 2.4, 0.2, 8.2, 0.9, 0.9, 0.9, JADE_SHADE)


@part('cau_may_doan', 'cau')
def _(b):
    b.box(0, 0.3, 0, 6, 0.6, 12, JADE)
    for sx in (-1, 1):
        b.balustrade(sx * 2.9, -6, sx * 2.9, 6, y=0.6, h=1.0)
    b.box(0, 0.62, 0, 2.0, 0.04, 11.6, JADE_GREEN)


@part('tru_dau_cau', 'cau')
def _(b):
    b.box(0, 0.5, 0, 1.4, 1.0, 1.4, JADE_SHADE)
    b.box(0, 2.0, 0, 0.9, 2.0, 0.9, JADE)
    b.cylinder(0, 3.0, 0, 0.7, 0.5, JADE, 8, 0.3)
    b.cylinder(0, 3.5, 0, 0.35, 0.8, GILD, 8, 0.05)


# -- công trình (ghép từ mảnh) --


def _hall_body(b, w, d, h, cols_x, cols_z_front, cols_z_back, y0=0.0, wall=CLOUD):
    b.box(0, y0 + h / 2, -0.8, w - 4.5, h, d - 8.0, wall)
    for px in cols_x:
        b.column(px, y0, cols_z_front, 0.46, h + 0.6)
        b.column(px, y0, cols_z_back, 0.46, h + 0.6)
    b.box(0, y0 + h + 0.35, cols_z_front, w, 0.5, 0.5, VERMILION_DARK)
    b.box(0, y0 + h + 0.35, cols_z_back, w, 0.5, 0.5, VERMILION_DARK)
    for px in cols_x:
        b.dougong(px, y0 + h + 0.6, cols_z_front, 1.0)
        b.dougong(px, y0 + h + 0.6, cols_z_back, 1.0)


@part('dien_nho', 'cong_trinh')
def _(b):
    y = b.plinth(0, 0, 16, 12, 2, 0.9)
    _hall_body(b, 12, 8, 4.4, [-4.5, 0, 4.5], 4.0, -4.0, y0=y)
    b.curved_hip(0, y + 5.4, 0, 12, 8, 3.0, overhang=2.2, lift=1.3)
    b.box(0, y + 2.4, 4.3, 2.6, 3.6, 0.3, TIMBER_D)
    b.stair(0, 6.0, 4, y)


@part('dien_lon', 'cong_trinh')
def _(b):
    y = b.plinth(0, 0, 36, 26, 3, 2.2)
    _hall_body(b, 28, 18, 6.2, [-12, -6, 0, 6, 12], 8.5, -8.5, y0=y)
    b.curved_hip(0, y + 7.6, 0, 28, 18, 4.4, overhang=3.0, lift=1.8)
    # Tầng trên: khối tường cao + mái hip nhỏ hơn, bờ nóc vàng (dáng điện hai tầng mái).
    top = y + 12.4
    b.box(0, top + 1.8, 0, 14.4, 3.6, 8.4, CLOUD)
    b.box(0, top + 3.7, 0, 15.2, 0.5, 9.2, VERMILION_DARK)
    for k in range(4):
        for sx in (-1, 1):
            b.box(sx * (2.2 + k * 1.7), top + 1.8, 4.3, 0.9, 1.9, 0.12, TIMBER_D)
    b.box(0, top + 1.8, 4.3, 3.4, 2.4, 0.2, INK)
    b.curved_hip(0, top + 4.0, 0, 16, 10, 4.8, overhang=2.8, lift=2.0)
    b.cylinder(0, top + 8.8, 0, 0.5, 2.4, GILD, 10, 0.1)
    b.stair(0, 13.0, 12, y)


@part('lau_hai_tang', 'cong_trinh')
def _(b):
    y = b.plinth(0, 0, 18, 18, 2, 0.8)
    _hall_body(b, 12, 12, 4.4, [-4.5, 0, 4.5], 5.0, -5.0, y0=y)
    b.curved_hip(0, y + 5.4, 0, 12, 12, 2.4, overhang=2.4, lift=1.2)
    yy = y + 8.4
    b.balustrade(-5, 5, 5, 5, y=yy, h=0.9)
    b.balustrade(-5, -5, 5, -5, y=yy, h=0.9)
    b.balustrade(-5, -5, -5, 5, y=yy, h=0.9)
    b.balustrade(5, -5, 5, 5, y=yy, h=0.9)
    b.box(0, yy + 2.2, 0, 8, 4.0, 8, CLOUD)
    for px in (-4, 4):
        for pz in (-4, 4):
            b.column(px, yy, pz, 0.4, 4.4)
    b.curved_hip(0, yy + 4.8, 0, 9, 9, 3.0, overhang=2.4, lift=1.3)


def _pagoda(b, tiers, base=8.0, h_tier=3.4):
    y = b.plinth(0, 0, base + 6, base + 6, 2, 0.8)
    w = base
    for k in range(tiers):
        b.box(0, y + h_tier / 2, 0, w - 1.8, h_tier, w - 1.8, CLOUD)
        for sx in (-1, 1):
            for sz in (-1, 1):
                b.column(sx * (w / 2 - 0.9), y, sz * (w / 2 - 0.9), 0.3, h_tier + 0.3)
        b.box(0, y + h_tier * 0.55, w / 2 - 0.88, 1.8, 1.9, 0.12, PAPER)
        b.curved_hip(0, y + h_tier + 0.3, 0, w, w, 1.4, overhang=1.6 - 0.04 * k, lift=1.0)
        y += h_tier + 1.2
        w -= 0.9
    b.cylinder(0, y, 0, 0.5, 2.6, GILD, 10, 0.15)
    b.box(0, y + 2.9, 0, 0.5, 0.5, 0.5, GILD)
    b.cylinder(0, y + 3.2, 0, 0.2, 2.2, GILD, 8, 0.02)
    return y + 5.4


@part('thap_5_tang', 'cong_trinh')
def _(b):
    _pagoda(b, 5, 8.0)


@part('thap_7_tang', 'cong_trinh')
def _(b):
    _pagoda(b, 7, 9.0, 3.6)


@part('dinh_luc_giac', 'cong_trinh')
def _(b):
    bs.pavilion(b, 0, 0)


@part('dinh_bat_giac', 'cong_trinh')
def _(b):
    b.cylinder(0, 0, 0, 7.4, 0.5, JADE_SHADE, 8, smooth=False)
    b.cylinder(0, 0.5, 0, 6.9, 0.35, JADE, 8, smooth=False)
    for i in range(8):
        a = i / 8 * math.tau + math.pi / 8
        b.column(math.cos(a) * 5.4, 0.85, math.sin(a) * 5.4, 0.34, 5.1)
        b.dougong(math.cos(a) * 5.4, 5.95, math.sin(a) * 5.4, 0.9, yaw=-a)
    b.curved_round(0, 6.4, 0, 9.0, 4.4, 8)


@part('hanh_lang', 'cong_trinh')
def _(b):
    b.box(0, 0.25, 0, 4.4, 0.5, 14, JADE)
    for k in range(4):
        z = -6 + k * 4
        for sx in (-1, 1):
            b.column(sx * 1.9, 0.5, z, 0.28, 3.6)
            b.dougong(sx * 1.9, 4.1, z, 0.7)
    b.box(0, 4.5, 0, 4.8, 0.2, 14, VERMILION_DARK)
    for k in range(14):  # ngói mái hành lang
        b.box(-1.1, 4.9 + 0.0, k - 6.5, 2.4, 0.18, 0.95, GLAZE)
        b.box(1.1, 4.9 + 0.0, k - 6.5, 2.4, 0.18, 0.95, GLAZE)
    b.box(0, 5.3, 0, 0.5, 0.5, 14, GLAZE_DARK)
    for sx in (-1, 1):
        b.balustrade(sx * 2.1, -7, sx * 2.1, 7, y=0.5, h=0.9, cloud=False)


@part('cong_tam_quan', 'cong_trinh')
def _(b):
    for sx in (-1, 1):
        b.box(sx * 8, 0.6, 0, 2.8, 1.2, 2.8, JADE_SHADE)
        b.column(sx * 8, 1.2, 0, 0.95, 9.2)
        b.box(sx * 15, 0.4, 0, 1.8, 0.8, 1.8, JADE_SHADE)
        b.column(sx * 15, 0.8, 0, 0.6, 6.6)
        b.box(sx * 11.5, 6.6, 0, 7.6, 0.7, 0.9, VERMILION_DARK)
        b.box(sx * 11.5, 5.5, 0, 6.4, 0.9, 0.3, INK)
        b.curved_hip(sx * 11.9, 7.4, 0, 7.4, 2.4, 1.5, overhang=1.3, lift=0.9)
        b.dougong(sx * 8, 10.4, 0, 1.0)
    b.box(0, 9.4, 0, 17.5, 1.0, 1.1, VERMILION_DARK)
    b.box(0, 7.2, 0, 6.8, 1.9, 0.4, INK)
    b.box(0, 7.2, 0.24, 5.8, 1.1, 0.1, GILD)
    b.curved_hip(0, 10.4, 0, 18, 3.2, 2.6, overhang=1.8, lift=1.3)


@part('cong_nho', 'cong_trinh')
def _(b):
    for sx in (-1, 1):
        b.column(sx * 2.6, 0, 0, 0.4, 5.2)
        b.box(sx * 2.6, 0.2, 0, 1.2, 0.4, 1.2, JADE_SHADE)
    b.box(0, 5.2, 0, 6.4, 0.5, 0.7, VERMILION_DARK)
    b.box(0, 4.3, 0, 4.6, 0.9, 0.3, INK)
    b.curved_hip(0, 5.6, 0, 7.4, 2.6, 1.4, overhang=1.2, lift=0.8)


@part('dai_tron_kiem', 'cong_trinh')
def _(b):
    r, y = 22.0, 0.0
    for k in range(3):
        b.cylinder(0, y, 0, r - k * 3.0, 0.7, JADE if k % 2 == 0 else JADE_SHADE, 40, smooth=False)
        y += 0.7
    for k in range(8):  # vòng bát quái khảm ngọc lục trên mặt đài
        a = k / 8 * math.tau
        b.box(math.cos(a) * 11, y + 0.04, math.sin(a) * 11, 4.0, 0.08, 1.6, JADE_GREEN, yaw=-a)
    b.cylinder(0, y, 0, 3.0, 0.1, JADE_GREEN, 24)
    for k in range(24):
        a = k / 24 * math.tau
        b.box(math.cos(a) * 18.5, y + 0.7, math.sin(a) * 18.5, 0.4, 1.4, 0.4, JADE_SHADE)


# ---------- prop tông môn (~20) ----------


@part('prop_dinh_lu', 'prop')
def _(b):
    b.cylinder(0, 0, 0, 1.6, 0.5, JADE_SHADE, 8, smooth=False)
    for i in range(3):
        a = i / 3 * math.tau
        b.cylinder(math.cos(a) * 0.8, 0.5, math.sin(a) * 0.8, 0.16, 0.9, BRONZE_D, 6)
    b.cylinder(0, 1.3, 0, 0.9, 1.1, BRONZE_D, 10, 1.25)
    b.cylinder(0, 2.4, 0, 1.3, 0.2, GILD, 10)
    b.cylinder(0, 2.6, 0, 1.1, 0.9, BRONZE_D, 10, 0.2)
    for sx in (-1, 1):  # hai quai
        b.box(sx * 1.35, 2.7, 0, 0.12, 0.7, 0.3, GILD)


@part('prop_gia_kiem', 'prop')
def _(b):
    for sx in (-1, 1):
        b.box(sx * 2.0, 1.0, 0, 0.24, 2.0, 0.7, TIMBER_D)
        b.box(sx * 2.0, 0.15, 0, 0.5, 0.3, 1.2, TIMBER_D)
    b.box(0, 2.1, 0, 4.2, 0.2, 0.6, TIMBER)
    b.box(0, 1.2, 0, 4.2, 0.2, 0.6, TIMBER)
    for i in range(5):
        b.box(-1.4 + i * 0.7, 1.9, 0, 0.1, 1.8, 0.04, BLADE)
        b.box(-1.4 + i * 0.7, 0.95, 0, 0.3, 0.07, 0.09, GILD)


@part('prop_bia_khac', 'prop')
def _(b):
    b.box(0, 0.25, 0, 2.2, 0.5, 1.2, JADE_SHADE)
    b.box(0, 1.9, 0, 1.6, 2.8, 0.34, JADE)
    b.box(0, 1.9, 0.2, 1.2, 2.2, 0.06, JADE_GREEN)
    for k in range(5):
        b.box(0, 1.0 + k * 0.4, 0.24, 0.8, 0.08, 0.04, JADE)
    b.box(0, 3.4, 0, 1.9, 0.3, 0.55, JADE_SHADE)
    b.box(0, 3.65, 0, 1.3, 0.2, 0.4, JADE)


@part('prop_co_phuong', 'prop')
def _(b):
    b.cylinder(0, 0, 0, 0.7, 0.4, JADE_SHADE, 8, 0.5)
    b.cylinder(0, 0.4, 0, 0.14, 6.2, TIMBER_D, 8, 0.1)
    b.box(0, 6.7, 0, 0.26, 0.26, 0.26, GILD)
    b.box(0.8, 5.0, 0, 1.6, 2.6, 0.04, PLUM)
    b.box(0.8, 5.0, 0.03, 1.2, 2.0, 0.04, GILD)


@part('prop_lo_dan', 'prop')
def _(b):
    b.cylinder(0, 0, 0, 1.3, 0.4, JADE_SHADE, 8, smooth=False)
    b.cylinder(0, 0.4, 0, 0.95, 1.3, BRONZE_D, 10, 1.1)
    b.cylinder(0, 1.7, 0, 1.15, 0.18, GILD, 10)
    b.cylinder(0, 1.88, 0, 0.9, 0.7, BRONZE_D, 10, 0.15)
    for i in range(3):
        a = i / 3 * math.tau + 0.4
        b.cylinder(math.cos(a) * 0.9, 0, math.sin(a) * 0.9, 0.13, 0.9, GILD, 6)


@part('prop_den_da', 'prop')
def _(b):
    bs.lantern(b, 0, 0)


@part('prop_den_hoa_dang', 'prop')
def _(b):
    b.cylinder(0, 0, 0, 0.1, 3.0, TIMBER_D, 6)
    b.cylinder(0.0, 2.7, 0, 0.45, 0.8, PAPER, 10, 0.4)
    b.box(0, 3.55, 0, 0.8, 0.12, 0.8, VERMILION_DARK)
    b.box(0, 2.25, 0, 0.5, 0.1, 0.5, VERMILION_DARK)


@part('prop_trong_chuong', 'prop')
def _(b):
    for sx in (-1, 1):
        b.box(sx * 1.6, 1.8, 0, 0.3, 3.6, 0.3, VERMILION)
    b.box(0, 3.6, 0, 3.6, 0.3, 0.4, VERMILION_DARK)
    b.cylinder(0, 1.3, 0, 0.5, 1.6, BRONZE_D, 10, 0.75)
    b.cylinder(0, 2.9, 0, 0.06, 0.7, GILD, 6)
    b.box(0, 0.15, 0, 3.8, 0.3, 1.0, JADE_SHADE)


@part('prop_ban_co', 'prop')
def _(b):
    b.box(0, 0.5, 0, 1.8, 1.0, 1.8, JADE_SHADE)
    b.box(0, 1.05, 0, 2.0, 0.1, 2.0, JADE)
    for k in range(9):
        b.box(0, 1.12, -0.8 + k * 0.2, 1.7, 0.02, 0.02, INK)
        b.box(-0.8 + k * 0.2, 1.12, 0, 0.02, 0.02, 1.7, INK)
    for sx in (-1, 1):
        b.box(sx * 1.8, 0.3, 0, 0.9, 0.6, 0.9, JADE_SHADE)


@part('prop_ghe_da', 'prop')
def _(b):
    b.box(0, 0.35, 0, 1.6, 0.7, 0.8, JADE_SHADE)
    b.box(0, 0.75, 0, 1.8, 0.1, 0.9, JADE)


@part('prop_su_tu_da', 'prop')
def _(b):
    b.box(0, 0.3, 0, 1.4, 0.6, 1.4, JADE_SHADE)
    b.box(0, 1.1, 0, 0.9, 1.0, 1.2, JADE)
    b.cylinder(0, 1.5, 0.3, 0.38, 0.6, JADE, 8, 0.3)
    b.box(0, 1.2, 0.55, 0.7, 0.5, 0.3, JADE)
    b.box(0, 0.9, -0.1, 0.5, 0.6, 1.0, JADE_SHADE)


@part('prop_tru_phu_van', 'prop')
def _(b):
    b.box(0, 0.3, 0, 1.4, 0.6, 1.4, JADE_SHADE)
    b.cylinder(0, 0.6, 0, 0.5, 3.4, JADE, 8, 0.42, smooth=False)
    for k in range(6):
        b.box(0, 1.0 + k * 0.5, 0.46, 0.28, 0.2, 0.05, JADE_GREEN)
    b.cylinder(0, 4.0, 0, 0.6, 0.2, JADE_SHADE, 8, 0.25, smooth=False)


@part('prop_vai_nuoc', 'prop')
def _(b):
    b.cylinder(0, 0, 0, 0.5, 0.2, JADE_SHADE, 12, 0.55)
    b.cylinder(0, 0.2, 0, 0.85, 1.0, JADE, 12, 0.75)
    b.cylinder(0, 1.2, 0, 0.8, 0.12, JADE_SHADE, 12)
    b.cylinder(0, 1.3, 0, 0.62, 0.02, paint(0x5FA9B4, 'plaster'), 12)


@part('prop_chau_cay', 'prop')
def _(b):
    # Chậu ngọc tròn thuôn + tùng cảnh cắt tỉa tầng mây (thân uốn, ba tầng tán tròn nhiều sắc lục).
    b.cylinder(0, 0, 0, 0.95, 0.12, JADE_SHADE, 16, 0.85, smooth=False)
    b.cylinder(0, 0.12, 0, 0.85, 0.7, JADE, 16, 1.0)
    b.cylinder(0, 0.82, 0, 1.04, 0.1, JADE_SHADE, 16)
    b.cylinder(0, 0.92, 0, 0.9, 0.04, paint(0x4a6b3a, 'stone'), 16)
    for k in range(5):
        a = k * 0.5
        b.cylinder(math.sin(a) * 0.1, 0.95 + k * 0.38, math.cos(a) * 0.08, 0.13 - k * 0.012, 0.4, TIMBER_D, 8, 0.11 - k * 0.012)
    for k, (r, hh, col, ox) in enumerate([(0.95, 0.38, paint(0x2f7f5c, 'stone'), -0.25), (0.78, 0.34, paint(0x4aa06a, 'stone'), 0.3), (0.6, 0.3, paint(0x7fbf72, 'stone'), -0.05)]):
        y = 1.55 + k * 0.52
        b.cylinder(ox, y, 0.05 * k, r, hh, col, 14, r * 0.78)
        b.cylinder(ox, y + hh, 0.05 * k, r * 0.78, 0.1, col, 14, r * 0.5)


@part('prop_bat_quai', 'prop')
def _(b):
    r = 3.0
    b.cylinder(0, 0, 0, r, 0.1, JADE_SHADE, 24)
    b.cylinder(0, 0.1, 0, 0.7, 0.03, JADE_GREEN, 16)
    for k in range(8):
        a = k / 8 * math.tau
        b.box(math.cos(a) * 2.0, 0.12, math.sin(a) * 2.0, 1.1, 0.04, 0.5, JADE_GREEN, yaw=-a)


@part('prop_gia_binh_khi', 'prop')
def _(b):
    b.box(0, 0.12, 0, 3.4, 0.24, 1.0, TIMBER_D)
    b.box(0, 1.3, -0.4, 3.0, 0.1, 0.1, TIMBER_D)
    for sx in (-1, 1):
        b.box(sx * 1.6, 0.7, -0.4, 0.14, 1.4, 0.14, TIMBER_D)
    for k in range(4):
        b.box(-1.0 + k * 0.7, 0.9, -0.1, 0.07, 1.6, 0.07, TIMBER)
        b.box(-1.0 + k * 0.7, 1.75, -0.1, 0.2, 0.2, 0.05, BLADE_D)


@part('prop_cong_nho_da', 'prop')
def _(b):
    for sx in (-1, 1):
        b.box(sx * 1.2, 1.4, 0, 0.5, 2.8, 0.5, JADE)
    b.box(0, 2.9, 0, 3.4, 0.3, 0.6, JADE_SHADE)
    b.box(0, 3.3, 0, 2.6, 0.5, 0.5, JADE)
    b.box(0, 3.7, 0, 2.0, 0.3, 0.4, JADE_SHADE)


@part('prop_kiem_cam', 'prop')
def _(b):
    b.cylinder(0, 0, 0, 0.6, 0.35, JADE_SHADE, 8, 0.5, smooth=False)
    b.sword_up(0, 0, 0.3, 5.6, width=0.8)


@part('prop_dai_sen', 'prop')
def _(b):
    for k in range(3):
        b.cylinder(0, k * 0.3, 0, 2.2 - k * 0.3, 0.3, JADE if k % 2 == 0 else JADE_SHADE, 16, smooth=False)
    for k in range(8):
        a = k / 8 * math.tau
        b.cylinder(math.cos(a) * 0.9, 0.9, math.sin(a) * 0.9, 0.3, 0.14, JADE_GREEN, 6, 0.1)
    b.cylinder(0, 0.9, 0, 0.55, 0.3, PLUM, 8, 0.2)

