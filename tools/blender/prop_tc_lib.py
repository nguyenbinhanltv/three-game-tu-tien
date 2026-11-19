# Thư viện dựng prop "Thiên Công Khai Vật" (PROP-1): đồ trang trí rời, mỗi món một GLB, dựng trên bộ kit thien_cong_kit.py.
#
# Mỗi món là hàm `fn(b, v)` (b = KB builder, v = 0 | 1 biến thể), gốc ở tâm đáy (y = 0 là mặt đất), mặt trước hướng +z.
# Vật liệu PBR Poly Haven CC0 (đá, gỗ, kim loại… như kit) nướng luma + normal + roughness; mép vát cho đá; chữ thư pháp khắc nổi.
# Thêm so với kit: đá nứt (`rock`, `darkrock`), vật liệu phát sáng (glow_*), lá thẻ alpha (`leaf`).
# Hàm hình học: lathe (tròn xoay), ellipsoid, rock (đá lệch), tube (ống uốn), crystal, card (thẻ lá).

import math
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_sect as bs  # noqa: E402
import thien_cong_kit as kit  # noqa: E402
import thien_cong_sect as ts  # noqa: E402
from build_sect import Mat, paint  # noqa: E402

# Miền UV nhỏ hơn tông môn: món cao tối đa ~16 m, rộng ±12 m.
bs.UV_ORIGIN, bs.UV_RANGE = 24.0, 48

# ---------- vật liệu thêm ----------
kit.PBR_SOURCES['rock'] = ('rock_boulder_cracked', 3.0, 1024, 1024)
kit.PBR_SOURCES['darkrock'] = ('dark_rock', 3.0, 1024, 1024)
kit.PBR_SOURCES['metal'] = ('green_metal_rust', 1.6, 2048, 2048)  # đồng cổ: vân rỗ, normal mòn, rỉ xanh (màu tô patina bằng màu đỉnh)
bs.MATERIALS['metal'] = Mat(0.55, 0.5, 'metal', 1.6, True, 0.04)
bs.MATERIALS['rock'] = Mat(0.92, 0.0, 'stone', 3.0, True, 0.03)
bs.MATERIALS['darkrock'] = Mat(0.88, 0.0, 'stone', 3.0, True, 0.03)
_old_find = kit._find_pbr


def _find_pbr(ph, kind, size='2k'):
    return _old_find(ph, kind, size) or _old_find(ph, kind, '1k')


kit._find_pbr = _find_pbr
for _k, _c, _e in (('glow_g', 0x66FFA8, 1.5), ('glow_b', 0x66C8FF, 1.5), ('glow_p', 0xB070FF, 1.7), ('glow_y', 0xFFD070, 1.4), ('glow_r', 0xFF6A3A, 1.5)):
    bs.MATERIALS[_k] = Mat(0.7, 0.0, None, 1.0, False, 0.0, (_c, _e))
bs.MATERIALS['leaf'] = Mat(0.85, 0.0, None, 1.0, False, 0.0)
bs.MATERIALS['blade'] = Mat(0.22, 0.65, None, 1.0, False, 0.0)  # thép: không texture, nhám thấp, kim loại vừa (cảnh chưa có env map)
bs.MATERIALS['cloth'] = Mat(0.95, 0.0, None, 1.0, False, 0.0, (0xFFD8B0, 0.06))  # vải, giấy, rơm: chỉ màu đỉnh; phát sáng rất nhẹ (vải mỏng thấu sáng, mặt quay lưng nắng không đen)

_orig_mm = bs.make_material


def _make_material(key, images):
    import bpy

    if key == 'leaf':
        return _leaf_material(bpy)
    m = _orig_mm(key, images)
    if key == 'cloth':
        m.use_backface_culling = False
    return m


bs.make_material = _make_material


def _leaf_material(bpy):
    n = 256
    rng = np.random.default_rng(5)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) / n
    alpha = np.zeros((n, n), np.float32)
    shade = np.zeros((n, n), np.float32)
    for _ in range(46):  # chùm lá: nhiều phiến bầu dục xoay hướng
        cx, cy = rng.uniform(0.12, 0.88, 2)
        ang = rng.uniform(0, math.pi)
        a, b = rng.uniform(0.07, 0.13), rng.uniform(0.025, 0.045)
        dx, dy = xx - cx, yy - cy
        u = dx * math.cos(ang) + dy * math.sin(ang)
        w = -dx * math.sin(ang) + dy * math.cos(ang)
        m = (u / a) ** 2 + (w / b) ** 2 < 1
        alpha[m] = 1
        shade[m] = rng.uniform(0.55, 1.0) * (0.75 + 0.25 * (1 - np.abs(w[m]) / b))
    rgba = np.zeros((n, n, 4), np.float32)
    rgba[..., 0] = shade * 0.85
    rgba[..., 1] = shade
    rgba[..., 2] = shade * 0.7
    rgba[..., 3] = alpha
    img = bpy.data.images.new('prop_tc_leaf', n, n, alpha=True)
    img.pixels.foreach_set(rgba.ravel())
    img.file_format = 'PNG'
    img.pack()
    mat = bpy.data.materials.new('prop_tc_leaf')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.85
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Color'
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    nt.links.new(tex.outputs['Color'], mix.inputs['A'])
    nt.links.new(vc.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    mat.use_backface_culling = False
    return mat


# Chữ khắc: giảm độ phân giải đường cong (bản kit gốc 12 đoạn/đường làm mỗi bia vài chục nghìn tam giác).
import inspect  # noqa: E402
import textwrap  # noqa: E402

_LOW = 'cu.extrude = depth / 2' + chr(10) + '    cu.resolution_u = TEXT_RES' + chr(10) + '    cu.bevel_resolution = 0'
_src = textwrap.dedent(inspect.getsource(kit.KB.text)).replace('cu.extrude = depth / 2', _LOW)
_ns = dict(kit.__dict__)
_ns['TEXT_RES'] = 2
exec(_src, _ns)
kit.KB.text = _ns['text']


def set_text_res(n):
    """Số đoạn mỗi đường cong của chữ khắc (1 = thô, ít tam giác; 2 = vừa)."""
    _ns['TEXT_RES'] = n

# ---------- patina cho đồng: rỉ xanh bám mặt ngửa, chỗ thấp, ngẫu nhiên; mép sáng lên (mòn) ----------
VERDIGRIS = bs.srgb(0x3F8F7A)
_orig_face = kit.KB.face


def _face(self, pts, color, smooth=False):
    if color.mat == 'metal' and getattr(self, 'patina', 0.0) > 0 and color.rgb[0] > color.rgb[2]:  # chỉ đồng/vàng (đỏ > lam), không đụng đồng đã rỉ sẵn
        _, ny, _ = bs.newell(pts)
        low = min(p[1] for p in pts)
        t = self.rng.uniform(0.0, 0.35) + 0.4 * max(0.0, ny) + 0.25 * max(0.0, 1 - low / 1.2)
        t = min(0.85, t * self.patina)
        color = bs.Paint(tuple(c * (1 - t) + v * t for c, v in zip(color.rgb, VERDIGRIS)), color.mat)
    _orig_face(self, pts, color, smooth)


kit.KB.face = _face

# bevel_hard_edges của kit: khi không có vật liệu đá/ngọc/thép trong mảnh thì `mats` rỗng và hàm vát MỌI cạnh (làm tam giác phình gấp 3–4 lần
# ở món chỉ có đồng/vải). Với prop chỉ vát khi có vật liệu cứng.
_orig_bhe = ts.bevel_hard_edges


def _bevel_hard_edges(bm, width=0.04, angle=math.radians(35), mats=(), segments=1):
    if mats:
        _orig_bhe(bm, width, angle, mats, segments)


ts.bevel_hard_edges = _bevel_hard_edges

# ---------- men gốm + đan tre/mây (PROP-1 PR2) ----------
bs.MATERIALS['glaze'] = Mat(0.16, 0.0, None, 1.0, False, 0.06)  # men gốm: trơn bóng, jitter màu theo mặt = men rạn nhẹ
kit.PBR_SOURCES['weave'] = ('weave', 0.8, 512, 512)  # chỗ giữ: nguồn do `_install_weave` sinh, không có trên Poly Haven
bs.MATERIALS['weave'] = Mat(0.85, 0.0, 'weave', 0.8, True, 0.03)


def _install_weave():
    """Texture đan nan (đan lóng đôi): luma + normal + roughness sinh bằng numpy, ghi PNG tạm để vật liệu nạp như PBR thật."""
    import bpy
    import tempfile

    n = 512
    cell = 64
    yy, xx = np.mgrid[0:n, 0:n]
    ci, cj = xx // cell, yy // cell
    fx, fy = (xx % cell) / cell, (yy % cell) / cell
    horiz = (ci + cj) % 2 == 0
    prof = lambda t: np.sin(np.clip(t, 0, 1) * math.pi) ** 0.6  # noqa: E731
    strip = np.where(horiz, prof(fy * 2 % 1.0), prof(fx * 2 % 1.0))  # hai nan song song mỗi ô
    gap = np.where(horiz, np.abs(fy - 0.5) > 0.47, np.abs(fx - 0.5) > 0.47)
    h = np.clip(strip - 0.35 * gap, 0, 1)
    gy, gx = np.gradient(h)
    nx, ny = -gx * 14.0, -gy * 14.0
    nz = np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5, np.ones_like(h)], axis=-1).astype(np.float32)
    rough = np.repeat((0.7 + 0.25 * (1 - h))[..., None], 4, axis=-1).astype(np.float32)
    rough[..., 3] = 1.0
    luma = np.clip(0.62 + 0.36 * h, 0, 1)
    d = tempfile.gettempdir()
    paths = {}
    for name, arr in (('normal', nrm), ('rough', rough)):
        img = bpy.data.images.new(f'prop_tc_weave_{name}', n, n, alpha=False)
        img.pixels.foreach_set(arr.ravel())
        img.filepath_raw = os.path.join(d, f'prop_tc_weave_{name}.png')
        img.file_format = 'PNG'
        img.save()
        paths[name] = img.filepath_raw
        bpy.data.images.remove(img)
    bs.TEXTURES['weave'] = luma.astype(np.float32)
    lin = np.where(luma <= 0.04045, luma / 12.92, ((luma + 0.055) / 1.055) ** 2.4)
    bs.TEX_GAIN['weave'] = 1.0 / float(lin.mean())
    kit.PBR_FILES['weave'] = paths


_prev_mt = bs.make_textures


def _make_textures_weave():
    _prev_mt()
    _install_weave()


bs.make_textures = _make_textures_weave

# ---------- bảng màu ----------
STONE_L = paint(0xB8B9AE, 'stone')
STONE_M = paint(0x9A9C92, 'stone')
STONE_D = paint(0x6E706A, 'stone')
JADE = kit.JADE
JADE_SH = kit.JADE_SHADE
JADE_G = kit.JADE_GREEN
BRONZE = paint(0x9A7440, 'metal')
BRONZE_D = paint(0x5E4526, 'metal')
GREEN_BR = paint(0x4F7B66, 'metal')  # đồng lên rỉ xanh
IRON = paint(0x3C4046, 'steel')
IRON_RUST = paint(0x7A4A30, 'steel')
STEEL = paint(0xC4CDD2, 'steel')
GILD = kit.GILD
WOOD = paint(0x8A6944, 'wood')
WOOD_L = paint(0xB08A58, 'wood')
WOOD_D = paint(0x4D3324, 'wood')
VERM = kit.VERMILION
VERM_D = kit.VERMILION_DARK
INK = kit.INK
CLOTH_R = paint(0xB5332D, 'cloth')
CLOTH_W = paint(0xE9E0CC, 'cloth')
CLOTH_B = paint(0x2F4E6B, 'cloth')
CLOTH_Y = paint(0xD9A93A, 'cloth')
CLOTH_D = paint(0x3A2E34, 'cloth')
INK_TEXT = paint(0x24160F, 'cloth')  # chữ khắc mực trên bia
STRAW = paint(0xC9AE62, 'cloth')
BAMBOO = paint(0x9DB05A, 'cloth')
BAMBOO_D = paint(0x6F8438, 'cloth')
LEAF_G = paint(0x7FB04F, 'leaf')
LEAF_D = paint(0x4F7D3A, 'leaf')
LEAF_Y = paint(0xC8A63A, 'leaf')
LEAF_P = paint(0xB0607A, 'leaf')
BARK = paint(0x5A4636, 'wood')
BARK_L = paint(0x7A6248, 'wood')
SOIL = paint(0x5C4A38, 'stone')
ROCK_M = paint(0x8C8A80, 'rock')
ROCK_D = paint(0x5E5C56, 'rock')
DROCK = paint(0x4A4650, 'darkrock')
DROCK_L = paint(0x6A6670, 'darkrock')
BONE = paint(0xD8CFB8, 'stone')
BLADE_STEEL = paint(0xB4C8DE, 'blade')
kit.BLADE_D = paint(0x7C91AB, 'blade')  # mép lưỡi/sống kiếm của sword_up đọc biến này
GLOW_G = paint(0x66FFA8, 'glow_g')
GLOW_B = paint(0x66C8FF, 'glow_b')
GLOW_P = paint(0xB070FF, 'glow_p')
GLOW_Y = paint(0xFFD070, 'glow_y')
GLOW_R = paint(0xFF6A3A, 'glow_r')
LAMP = kit.PAPER
GILD_TEXT = kit.GILD_TEXT


def mix(c, d, t):
    """Pha hai Paint cùng chất liệu."""
    return bs.Paint(tuple(a * (1 - t) + b * t for a, b in zip(c.rgb, d.rgb)), c.mat)


# ---------- hình học ----------


def lathe(b, prof, color, seg=12, cx=0.0, cz=0.0, y0=0.0, sx=1.0, sz=1.0, smooth=True, cap_top=True, cap_bot=False):
    """Tròn xoay quanh trục đứng: prof = [(bán kính, độ cao)], từ dưới lên; sx/sz co giãn thành elip."""
    rows = []
    for r, y in prof:
        rows.append([(cx + math.cos(i / seg * math.tau) * r * sx, y0 + y, cz + math.sin(i / seg * math.tau) * r * sz) for i in range(seg)])
    for a, c in zip(rows, rows[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            quad = [a[i], c[i], c[j], a[j]]
            ded = [quad[0]]
            for p in quad[1:]:
                if math.dist(p, ded[-1]) > 1e-5 and math.dist(p, ded[0]) > 1e-5:
                    ded.append(p)
            if len(ded) >= 3:
                b.face(ded, color, smooth)
    if cap_top and prof[-1][0] > 1e-4:
        b.face(list(reversed(rows[-1])), color)
    if cap_bot and prof[0][0] > 1e-4:
        b.face(list(rows[0]), color)


def lathe_x(b, prof, color, seg=12, cx=0.0, cy=0.0, cz=0.0, smooth=True):
    """Tròn xoay quanh trục x (vật nằm ngang): prof = [(bán kính, vị trí dọc x)]."""
    rows = [[(cx + t, cy + math.sin(i / seg * math.tau) * r, cz + math.cos(i / seg * math.tau) * r) for i in range(seg)] for r, t in prof]
    for a, c in zip(rows, rows[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            quad = [a[i], c[i], c[j], a[j]]
            ded = [quad[0]]
            for p in quad[1:]:
                if math.dist(p, ded[-1]) > 1e-5 and math.dist(p, ded[0]) > 1e-5:
                    ded.append(p)
            if len(ded) >= 3:
                b.face(ded, color, smooth)


def ellipsoid(b, cx, cy, cz, rx, ry, rz, color, seg=10, rings=6, yaw=0.0, smooth=True):
    prof = [(math.sin(math.pi * k / rings), -math.cos(math.pi * k / rings)) for k in range(rings + 1)]
    prof = [(r, y * ry + cy) for r, y in prof]
    if yaw:
        # elip xoay quanh Y: dựng rồi quay các đỉnh qua box-less path
        c, s = math.cos(yaw), math.sin(yaw)
        rows = []
        for r, y in prof:
            rows.append([(cx + (math.cos(i / seg * math.tau) * r * rx) * c + (math.sin(i / seg * math.tau) * r * rz) * s, y, cz - (math.cos(i / seg * math.tau) * r * rx) * s + (math.sin(i / seg * math.tau) * r * rz) * c) for i in range(seg)])
        for a, d in zip(rows, rows[1:]):
            for i in range(seg):
                j = (i + 1) % seg
                quad = [a[i], d[i], d[j], a[j]]
                ded = [quad[0]]
                for p in quad[1:]:
                    if math.dist(p, ded[-1]) > 1e-5 and math.dist(p, ded[0]) > 1e-5:
                        ded.append(p)
                if len(ded) >= 3:
                    b.face(ded, color, smooth)
        return
    lathe(b, prof, color, seg, cx, cz, 0.0, rx, rz, smooth, cap_top=False)


def rock(b, cx, y0, cz, r, color, seed=0, squash=0.7, seg=9, rings=5, flat=0.0):
    """Đá lệch: elip với bán kính nhiễu theo đỉnh, đáy chôn nhẹ; flat > 0 vát phẳng mặt trên."""
    import random

    rng = random.Random(seed * 7919 + 13)
    grid = []
    for k in range(rings + 1):
        row = []
        for i in range(seg):
            th = i / seg * math.tau
            n = 1 + rng.uniform(-0.22, 0.22)
            t = k / rings  # 0 đỉnh, 1 đáy
            ang = t * math.pi  # góc từ đỉnh
            rad = math.sin(ang) * r * n
            y = y0 + r * squash * (0.55 + 0.45 * math.cos(ang)) * (1 - flat * (1 if t < 0.15 else 0))
            row.append((cx + math.cos(th) * rad * 1.05, y if t < 0.999 else y0 - 0.05, cz + math.sin(th) * rad * 0.95))
        grid.append(row)
    for a, c in zip(grid, grid[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            quad = [a[i], c[i], c[j], a[j]]
            ded = [quad[0]]
            for p in quad[1:]:
                if math.dist(p, ded[-1]) > 1e-5 and math.dist(p, ded[0]) > 1e-5:
                    ded.append(p)
            if len(ded) >= 3:
                b.face(ded, color, False)
    b.face(list(reversed(grid[0])), color)


def _spline(pts, radii, sub=4):
    """Catmull-Rom qua các điểm (làm mượt đường tube)."""
    n = len(pts)
    if n < 3:
        return pts, radii
    out, ro = [], []
    for i in range(n - 1):
        p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(n - 1, i + 2)]
        for k in range(sub):
            t = k / sub
            out.append(tuple(0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t ** 3) for c in range(3)))
            ro.append(radii[i] * (1 - t) + radii[i + 1] * t)
    out.append(pts[-1])
    ro.append(radii[-1])
    return out, ro


def tube(b, pts, radii, color, seg=6, smooth=True, cap=True, sub=4):
    """Ống uốn mượt quanh đường qua pts (x, y, z), bán kính theo điểm (một số hoặc danh sách); khung xoay tịnh tiến không xoắn."""
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(pts)
    pts, radii = _spline(list(pts), list(radii), sub)
    n = len(pts)
    rows = []
    u = None
    for i, p in enumerate(pts):
        q0, q1 = pts[max(0, i - 1)], pts[min(n - 1, i + 1)]
        t = [q1[k] - q0[k] for k in range(3)]
        ln = math.sqrt(sum(c * c for c in t)) or 1.0
        t = [c / ln for c in t]
        if u is None:
            ref = (0.0, 1.0, 0.0) if abs(t[1]) < 0.95 else (1.0, 0.0, 0.0)
            u = [t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]]
        d = sum(u[k] * t[k] for k in range(3))  # chiếu u lên mặt phẳng vuông góc t
        u = [u[k] - d * t[k] for k in range(3)]
        ul = math.sqrt(sum(c * c for c in u)) or 1.0
        u = [c / ul for c in u]
        w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]]
        r = radii[i]
        rows.append([(p[0] + (u[0] * math.cos(a) + w[0] * math.sin(a)) * r, p[1] + (u[1] * math.cos(a) + w[1] * math.sin(a)) * r, p[2] + (u[2] * math.cos(a) + w[2] * math.sin(a)) * r) for a in [k / seg * math.tau for k in range(seg)]])
    for a, c in zip(rows, rows[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            b.face([a[i], a[j], c[j], c[i]], color, smooth)
    if cap:
        b.face(list(reversed(rows[0])), color)
        b.face(list(rows[-1]), color)


def crystal(b, cx, y0, cz, r, h, color, tilt=(0.0, 0.0), sides=6, tip=0.28):
    """Tinh thể lục lăng đầu nhọn; tilt = (nghiêng theo x, nghiêng theo z) tính bằng mét ở đỉnh."""
    ring0 = [(cx + math.cos(i / sides * math.tau) * r, y0, cz + math.sin(i / sides * math.tau) * r) for i in range(sides)]
    hb = h * (1 - tip)
    ring1 = [(cx + tilt[0] * (1 - tip) + math.cos(i / sides * math.tau) * r * 0.9, y0 + hb, cz + tilt[1] * (1 - tip) + math.sin(i / sides * math.tau) * r * 0.9) for i in range(sides)]
    apex = (cx + tilt[0], y0 + h, cz + tilt[1])
    for i in range(sides):
        j = (i + 1) % sides
        b.face([ring0[i], ring1[i], ring1[j], ring0[j]], color)
        b.face([ring1[i], apex, ring1[j]], color)


def card(b, p0, p1, p2, p3, color, double=True):
    """Thẻ lá alpha (4 điểm, UV phủ cả ảnh)."""
    b.face([p0, p1, p2, p3], color)
    b.uvs[-1] = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]


def leaf_cluster(b, cx, cy, cz, r, color, seed=0, n=5):
    """Một chùm lá: n thẻ xoay quanh nhau, nghiêng ngẫu nhiên."""
    import random

    rng = random.Random(seed)
    for k in range(n):
        a = rng.uniform(0, math.pi)
        tl = rng.uniform(-0.5, 0.5)
        dx, dz = math.cos(a) * r, math.sin(a) * r
        card(b, (cx - dx, cy - r * 0.7 + tl, cz - dz), (cx + dx, cy - r * 0.7 - tl, cz + dz), (cx + dx, cy + r * 0.7 - tl, cz + dz), (cx - dx, cy + r * 0.7 + tl, cz - dz), color)


def flat_ring(b, cx, y, cz, r0, r1, color, seg=24, arc=None):
    """Vành phẳng nằm ngang (mặt ngửa)."""
    for i in range(seg):
        a0, a1 = i / seg * math.tau, (i + 1) / seg * math.tau
        b.face([(cx + math.cos(a1) * r0, y, cz + math.sin(a1) * r0), (cx + math.cos(a1) * r1, y, cz + math.sin(a1) * r1), (cx + math.cos(a0) * r1, y, cz + math.sin(a0) * r1), (cx + math.cos(a0) * r0, y, cz + math.sin(a0) * r0)], color)


def wheel(b, cx, cy, cz, r, w, color, spokes=8):
    """Bánh xe nan hoa quay quanh trục x."""
    b.face([(cx - w / 2, cy + math.cos(a) * r, cz + math.sin(a) * r) for a in [i / 14 * math.tau for i in range(14)]], color)
    b.face(list(reversed([(cx + w / 2, cy + math.cos(a) * r, cz + math.sin(a) * r) for a in [i / 14 * math.tau for i in range(14)]])), color)
    for i in range(14):
        a0, a1 = i / 14 * math.tau, (i + 1) / 14 * math.tau
        b.face([(cx - w / 2, cy + math.cos(a0) * r, cz + math.sin(a0) * r), (cx + w / 2, cy + math.cos(a0) * r, cz + math.sin(a0) * r), (cx + w / 2, cy + math.cos(a1) * r, cz + math.sin(a1) * r), (cx - w / 2, cy + math.cos(a1) * r, cz + math.sin(a1) * r)], color)


# ---------- danh mục ----------

ITEMS = {}  # tên -> hàm dựng fn(b, v)


def item(name):
    def deco(fn):
        ITEMS[name] = fn
        return fn

    return deco


# ---------- dựng và xuất ----------


def new_b(seed):
    b = kit.new_builder(seed=seed, moss=0.5)
    b.patina = 1.0
    return b


def patch_leaf_alpha(path):
    """Đặt alphaMode MASK cho vật liệu lá (exporter Blender để BLEND)."""
    import json

    data = open(path, 'rb').read()
    magic, ver, total = struct.unpack('<III', data[:12])
    clen, ctype = struct.unpack('<II', data[12:20])
    doc = json.loads(data[20:20 + clen])
    changed = False
    for m in doc.get('materials', []):
        if 'leaf' in m.get('name', ''):
            m['alphaMode'] = 'MASK'
            m['alphaCutoff'] = 0.45
            m['doubleSided'] = True
            changed = True
    if not changed:
        return
    js = json.dumps(doc, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    rest = data[20 + clen:]
    out = struct.pack('<III', magic, ver, 12 + 8 + len(js) + len(rest)) + struct.pack('<II', len(js), ctype) + js + rest
    open(path, 'wb').write(out)


def build_item(pid, name, v, seed, out_path):
    import bpy

    b = new_b(seed)
    ITEMS[name](b, v)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = ts.materials_for([b])
    mesh = ts.make_mesh(pid, b, keys, images)
    obj = bpy.data.objects.new(pid, mesh)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', export_yup=True, export_apply=True, export_vertex_color='ACTIVE', export_image_format='AUTO')
    patch_leaf_alpha(out_path)
    xs = [v_[0] for v_ in b.verts]
    ys = [v_[2] for v_ in b.verts]
    zs = [-v_[1] for v_ in b.verts]
    tris = sum(len(f) - 2 for f in b.faces)
    return {'tris': tris, 'size': [round(max(xs) - min(xs), 2), round(max(ys), 2), round(max(zs) - min(zs), 2)], 'keys': keys}


# ---------- phù văn, hoa văn, vải ----------

_GLYPHS = [
    [(0, 0, 1, 0), (1, 0, 1, 1), (1, 1, 0, 1), (0, 1, 0, 2), (0, 2, 1, 2)],
    [(0, 0, 0, 2), (0, 1, 1, 1), (1, 0, 1, 2), (0.5, 2, 1, 2)],
    [(0, 0, 1, 0), (0.5, 0, 0.5, 2), (0, 1, 1, 1), (0, 2, 1, 2)],
    [(0, 0, 1, 1), (1, 0, 0, 1), (0.5, 1, 0.5, 2), (0, 2, 1, 2)],
    [(0, 0, 0, 2), (0, 0, 1, 0), (1, 0, 1, 1), (0, 1, 1, 1), (1, 1, 1, 2)],
    [(0, 1, 1, 1), (0.5, 0, 0.5, 2), (0, 0, 0, 1), (1, 1, 1, 2), (0, 2, 0.5, 2)],
    [(0, 0, 1, 0), (0, 0, 0, 2), (1, 0, 1, 2), (0, 1, 1, 1)],
    [(0, 0, 0.5, 1), (1, 0, 0.5, 1), (0.5, 1, 0.5, 2), (0, 2, 1, 2), (0, 1, 0.3, 1.4)],
]


def rune(b, cx, cy, cz, w, h, color, seed=0, yaw=0.0, depth=0.03, thick=0.07, face='z'):
    """Phù văn (một ô chữ góc cạnh) khắc/dát nổi trên mặt hướng +z (yaw quay quanh y); w × h mét, nét dày thick·w."""
    g = _GLYPHS[seed % len(_GLYPHS)]
    c, s = math.cos(yaw), math.sin(yaw)
    for x0, y0, x1, y1 in g:
        ax, ay = (x0 - 0.5) * w, (1 - y0 / 2.0 - 0.5) * h
        bx, by = (x1 - 0.5) * w, (1 - y1 / 2.0 - 0.5) * h
        L = math.hypot(bx - ax, by - ay)
        if L < 1e-4:
            continue
        mx, my = (ax + bx) / 2, (ay + by) / 2
        ang = math.atan2(by - ay, bx - ax)
        tw = max(0.012, thick * w)
        # nét = hộp mảnh xoay trong mặt phẳng chữ: dựng bằng 4 điểm rồi đùn depth
        ux, uy = math.cos(ang) * (L / 2 + tw / 2), math.sin(ang) * (L / 2 + tw / 2)
        vx, vy = -math.sin(ang) * tw / 2, math.cos(ang) * tw / 2
        quad = [(mx - ux - vx, my - uy - vy), (mx + ux - vx, my + uy - vy), (mx + ux + vx, my + uy + vy), (mx - ux + vx, my - uy + vy)]

        def P(x, y, z):
            return (cx + x * c + z * s, cy + y, cz - x * s + z * c)

        front = [P(x, y, depth) for x, y in quad]
        back = [P(x, y, 0.0) for x, y in quad]
        b.face(front, color)
        for i in range(4):
            j = (i + 1) % 4
            b.face([back[i], back[j], front[j], front[i]], color)


def rune_column(b, cx, y0, cz, w, h, n, color, seed=0, yaw=0.0, depth=0.03):
    """Cột n phù văn xếp dọc từ y0 lên, tổng cao h."""
    cell = h / n
    for i in range(n):
        rune(b, cx, y0 + h - cell * (i + 0.5), cz, w, cell * 0.8, color, seed + i * 3, yaw, depth)


def meander(b, cy, r, h, color, n=18, depth=0.03):
    """Băng hoa văn khắc liền mạch quanh thân tròn bán kính r tại độ cao cy: dải đồng sẫm khắc chìm, hai chỉ vàng viền, hai đường sóng mây cuộn đan nhau (ống mảnh liền một vòng)."""
    d = 0.012
    lathe(b, [(r + 0.002, cy - h / 2), (r + d, cy - h / 2 + 0.01), (r + d, cy + h / 2 - 0.01), (r + 0.002, cy + h / 2)], BRONZE_D, 28, cap_top=False)
    for sy in (-1, 1):
        lathe(b, [(r + d - 0.004, cy + sy * (h / 2 - 0.012) - 0.012), (r + d + 0.012, cy + sy * (h / 2 - 0.012) - 0.008), (r + d + 0.012, cy + sy * (h / 2 - 0.012) + 0.008), (r + d - 0.004, cy + sy * (h / 2 - 0.012) + 0.012)], color, 28, cap_top=False)
    waves = max(5, n // 2)
    for ph in (0.0, math.pi):
        pts = []
        for i in range(waves * 8 + 1):
            a = i / (waves * 8) * math.tau
            y = cy + math.sin(a * waves + ph) * h * 0.26
            pts.append((math.cos(a) * (r + d + 0.006), y, math.sin(a) * (r + d + 0.006)))
        tube(b, pts, 0.008, color, 4, sub=1, cap=False)


def weight_uv(b, top, length):
    """Gán trọng số lắc (0 ở mép treo, 1 ở đầu tự do) vào UV.x của mặt vừa thêm (vải không có texture nên UV rảnh); shader gió ở client đọc."""
    pts = b.verts[-len(b.faces[-1]):]
    # b.verts lưu toạ độ Blender (x, -z, y): độ cao = thành phần thứ ba
    b.uvs[-1] = [(max(0.0, min(1.0, (top - v[2]) / length)), 0.0) for v in pts]


def weight_from(b, n0, top, length):
    """Gán trọng số lắc cho mọi mặt từ chỉ số n0 (vd. chữ thêu bằng b.text trên phướn)."""
    for i in range(n0, len(b.faces)):
        b.uvs[i] = [(max(0.0, min(1.0, (top - b.verts[k][2]) / length)), 0.0) for k in b.faces[i]]


def cloth_quad(b, pts, color, top, length):
    b.face(pts, color)
    weight_uv(b, top, length)


def arch_outline(w, h, seg=10, rect=0.0):
    """Viền cổng vòm: đáy rộng w, cao h (nửa trên là cung tròn)."""
    r = w / 2
    pts = [(-r, 0.0), (r, 0.0), (r, h - r)]
    for i in range(1, seg):
        a = i / seg * math.pi
        pts.append((r * math.cos(a), h - r + r * math.sin(a)))
    pts.append((-r, h - r))
    return pts


def spoked_wheel(b, cx, cy, cz, r, w, color, band, spokes=8, seg=20):
    """Bánh xe có nan hoa, vành gỗ và đai sắt (band) bọc ngoài vành, quay quanh trục x."""

    def ring(rr, xo):
        return [(cx + xo, cy + math.cos(i / seg * math.tau) * rr, cz + math.sin(i / seg * math.tau) * rr) for i in range(seg + 1)]

    tube(b, ring(r - 0.04, 0.0), w * 0.5, color, 6, sub=1, cap=False)  # vành gỗ
    for xo in (-w * 0.35, w * 0.35):  # đai sắt hai mép vành
        tube(b, ring(r + 0.0, xo), 0.016, band, 4, sub=1, cap=False)
    lathe_x(b, [(0.0, -w * 0.9), (0.11, -w * 0.9), (0.12, 0.0), (0.11, w * 0.9), (0.0, w * 0.9)], color, 8, cx, cy, cz)
    for k in range(spokes):
        a = k / spokes * math.tau
        tube(b, [(cx, cy + math.cos(a) * 0.08, cz + math.sin(a) * 0.08), (cx, cy + math.cos(a) * (r - 0.06), cz + math.sin(a) * (r - 0.06))], 0.03, color, 4, sub=1, cap=True)
