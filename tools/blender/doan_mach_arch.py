# Vách đá Đoạn Mạch (POLISH-1, làm đúng theo ghi chú của #377): thay dải màu trên lưới địa hình bằng MESH đá thật đặt dọc vách.
# Mỗi biến thể là một cụm khối đá sa thạch đỏ nâu: các tầng phiến DÀY MỎNG KHÔNG ĐỀU chồng lệch nhau (nhô ra/lõm vào, nghiêng nhẹ, mép gãy khúc), khe nứt dọc tối có đất vàng,
# rêu xanh trên mặt ngửa, đá lở dưới chân; thêm cột đá gãy bậc và đá tròn viền hồ chân thác.
#
#   blender --background --python tools/blender/doan_mach_arch.py -- assets/build/raw/arch_doan_mach.glb
#
# Gốc của mỗi biến thể = (0, 0, 0) ở CHÂN khối, mặt hướng ra +z (client xoay theo pháp tuyến vách, chân lún vào sườn); lưng khối (z < 0) chôn vào vách.
# Mỗi biến thể là MỘT object `dm_<tên>` (client gộp InstancedMesh theo biến thể).

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
from kiem_trung_arch import C, blob, mix, new_b, tbox  # noqa: E402
from thien_khuyet_arch import fbm3  # noqa: E402

bs.MATERIALS['cliff'] = Mat(0.93, 0.0, None, 1.0, False, 0.0)

SEED = 20261121

RED_DK = C(0x6E3626)
RED = C(0x8E5538)
RED_LT = C(0xB98660)
OCHRE = C(0xC8A468)
MOSS = C(0x56662E)
SHADE = C(0x2A1812)


def rock_col(seed, lift=0.0, moss=0.0):
    """Sa thạch đỏ nâu: sắc đổi theo nhiễu lớn từng tầng, hạt mịn, chân sẫm, mặt ngửa lốm đốm rêu."""

    def fn(pos, nrm):
        n = fbm3(pos[0] * 0.18, pos[1] * 0.45, pos[2] * 0.18, seed, 3)
        g = fbm3(pos[0] * 1.6, pos[1] * 1.6, pos[2] * 1.6, seed + 5, 2)
        rgb = mix(RED_DK, RED, min(1.0, 0.25 + 0.9 * n + lift))
        rgb = mix(rgb, RED_LT, max(0.0, g - 0.55) * 1.2)
        # vỉa vàng đất theo độ cao (mỗi 2–3 m một vỉa mảnh)
        band = 0.5 + 0.5 * math.sin(pos[1] * 2.4 + n * 6)
        rgb = mix(rgb, OCHRE, max(0.0, band - 0.78) * 1.4)
        if moss and nrm[1] > 0.5:
            m = fbm3(pos[0] * 0.5 + 2, pos[1] * 0.5, pos[2] * 0.5, seed + 9, 3)
            if m > 0.5:
                rgb = mix(rgb, MOSS, min(0.85, (m - 0.5) * 3.2) * moss)
        low = max(0.0, 1.0 - pos[1] / 2.5)
        rgb = mix(rgb, SHADE, low * 0.3)
        return Paint(tuple(rgb), 'cliff')

    return fn


def cp(seed, lift=0.0, moss=0.0, at=(0, 1, 0)):
    return rock_col(seed, lift, moss)(at, (0, 1, 0))


def slab_stack(b, seed, width, height):
    """Cụm phiến GÓC CẠNH: mỗi tầng dày 0,9–3,4 m, gồm 1–4 khối hộp lệch (nghiêng ±6°, xoay nhẹ), cả tầng xô ngang ±15% bề rộng và thu hẹp theo đường viền ngẫu nhiên nên
    hình bao KHÔNG phải chữ nhật; nhô ra/lõm vào, mép trên sứt thành mảnh góc cạnh; khe tối giữa tầng; vài vết nứt dọc có đất vàng; đá lở góc cạnh dưới chân. Lưng chôn vào vách (z < 0)."""
    rnd = random.Random(seed)
    # đường viền bề rộng theo độ cao: phình ra/thắt lại, đỉnh thu nhọn bất đối xứng
    prof = [rnd.uniform(0.55, 1.0) for _ in range(6)]
    lean = rnd.uniform(-0.18, 0.18) * width
    y = 0.0
    row = 0
    while y < height - 0.8:
        th = rnd.choice((1.6, 2.2, 3.0, 3.8, 4.8)) * rnd.uniform(0.85, 1.15)
        th = min(th, height - y)
        q = y / max(height, 1.0)
        k0 = int(q * 5)
        pw = prof[k0] * (1 - q) ** 0.35 * (1 - (prof[k0 + 1] if k0 < 5 else 0.5) * 0.0)
        rw = width * max(0.28, pw)
        shift = rnd.uniform(-0.15, 0.15) * width + lean * q
        nb = rnd.choice((1, 2, 2, 3, 4))
        cuts = sorted(rnd.uniform(0.15, 0.85) for _ in range(nb - 1))
        edges = [0.0] + cuts + [1.0]
        for k in range(nb):
            w = (edges[k + 1] - edges[k]) * rw
            x = shift + ((edges[k] + edges[k + 1]) / 2 - 0.5) * rw
            out = rnd.uniform(-0.6, 1.0) + (rnd.choice((0.0, 1.0, 2.2)) if rnd.random() < 0.4 else 0.0)
            depth = rnd.uniform(4.5, 7.0)
            lift = rnd.uniform(-0.18, 0.16)
            yaw = rnd.uniform(-0.12, 0.12)
            tbox(b, (x, y + th / 2, out - depth / 2 + 1.4), (w * 0.98, th * 0.97, depth), cp(seed + row * 7 + k, lift, 0.55), rx=rnd.uniform(-0.08, 0.08), rz=rnd.uniform(-0.1, 0.1), yaw=yaw)
            # vát mặt trước: một nêm góc cạnh nhỏ hơn đè lên mặt hộp (không dùng khối tròn)
            if rnd.random() < 0.75:
                tbox(b, (x + rnd.uniform(-w * 0.2, w * 0.2), y + th * rnd.uniform(0.3, 0.7), out + 1.5), (w * rnd.uniform(0.35, 0.7), th * rnd.uniform(0.4, 0.8), rnd.uniform(0.5, 1.1)), cp(seed + row * 13 + k, lift + 0.05, 0.4), rx=rnd.uniform(-0.25, 0.25), rz=rnd.uniform(-0.25, 0.25), yaw=rnd.uniform(-0.4, 0.4))
            # mép trên sứt: mảnh góc cạnh
            for _ in range(rnd.randint(0, 3)):
                sx = x + rnd.uniform(-w * 0.4, w * 0.4)
                tbox(b, (sx, y + th + 0.1, out + rnd.uniform(0.0, 1.2)), (rnd.uniform(0.6, 1.8), rnd.uniform(0.3, 0.9), rnd.uniform(0.8, 1.8)), cp(seed + 50 + row, 0.08, 0.8), rx=rnd.uniform(-0.5, 0.5), rz=rnd.uniform(-0.5, 0.5), yaw=rnd.uniform(0, 3))
        y += th
        row += 1
    for k in range(rnd.randint(6, 10)):  # đá lở góc cạnh dưới chân
        bx = rnd.uniform(-width * 0.5, width * 0.5)
        bz = rnd.uniform(1.0, 4.5)
        sz = rnd.uniform(0.5, 1.5)
        tbox(b, (bx, sz * 0.35, bz), (sz * rnd.uniform(0.9, 1.6), sz * 0.7, sz * rnd.uniform(0.9, 1.4)), cp(seed + 90 + k, 0.0, 0.7), rx=rnd.uniform(-0.5, 0.5), rz=rnd.uniform(-0.5, 0.5), yaw=rnd.uniform(0, 3))


def spire(b, seed, height):
    """Cột đá gãy bậc: 3–5 đoạn chồng lệch (mỗi đoạn một độ rộng, nghiêng nhẹ, sứt mép), đỉnh vỡ nhọn, vài vết nứt và rêu; cao ~`height`."""
    rnd = random.Random(seed)
    y = 0.0
    w = rnd.uniform(3.2, 5.0)
    n = rnd.randint(3, 5)
    for i in range(n):
        th = height / n * rnd.uniform(0.75, 1.25)
        ww = w * rnd.uniform(0.7, 1.0) * (1 - 0.14 * i)
        ox, oz = rnd.uniform(-0.5, 0.5), rnd.uniform(-0.4, 0.6)
        tbox(b, (ox, y + th / 2, oz), (ww, th, ww * rnd.uniform(0.7, 1.0)), cp(seed + i * 11, rnd.uniform(-0.08, 0.12), 0.6), rx=rnd.uniform(-0.05, 0.05), rz=rnd.uniform(-0.05, 0.05), yaw=rnd.uniform(0, 3))
        tbox(b, (ox, y + th * 0.5, oz + ww * 0.45), (ww * 0.5, th * 0.7, 0.9), cp(seed + i * 17, 0.05, 0.6), rx=rnd.uniform(-0.2, 0.2), rz=rnd.uniform(-0.2, 0.2), yaw=rnd.uniform(-0.5, 0.5))
        tbox(b, (ox + rnd.uniform(-0.3, 0.3), y + th, oz), (ww * 0.5, 0.2, ww * 0.5), Paint(tuple(SHADE), 'cliff'))
        y += th
    tbox(b, (0, y + 0.7, 0), (w * 0.45, 1.5, w * 0.4), cp(seed + 99, 0.1, 0.8), rx=0.25, rz=-0.3, yaw=0.6)
    tbox(b, (0.3, y + 1.5, 0.1), (w * 0.22, 1.2, w * 0.2), cp(seed + 98, 0.12, 0.8), rx=-0.2, rz=0.35, yaw=1.2)
    for k in range(rnd.randint(4, 7)):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(w * 0.6, w * 1.4)
        sz = rnd.uniform(0.4, 1.1)
        tbox(b, (math.cos(a) * d, sz * 0.35, math.sin(a) * d), (sz, sz * 0.7, sz), cp(seed + 120 + k, 0.0, 0.7), rx=rnd.uniform(-0.5, 0.5), rz=rnd.uniform(-0.5, 0.5), yaw=a)


def boulder(b, seed):
    """Đá tảng tròn mép cho viền hồ chân thác: một khối lớn + hai khối nhỏ, mặt ngửa có rêu."""
    rnd = random.Random(seed)
    for k, (r, ox, oz) in enumerate(((1.0, 0, 0), (0.55, 1.1, 0.4), (0.4, -0.9, 0.7))):
        blob(b, (ox, r * 0.55, oz), (r * 1.3, r * 0.85, r * 1.1), rock_col(seed + k, 0.0, 0.9), nu=12, nv=8, e=1.8, amp=0.3, seed=seed + k)


def build_variants():
    v = {}
    for i in range(6):
        b = new_b(1500 + i)
        slab_stack(b, 1500 + i * 17, (12.0, 18.0, 22.0, 15.0, 26.0, 19.0)[i], (11.0, 17.0, 25.0, 14.0, 30.0, 20.0)[i])
        v[f'slab{i}'] = b
    for i in range(3):
        b = new_b(1520 + i)
        spire(b, 1520 + i * 13, (14.0, 20.0, 27.0)[i])
        v[f'spire{i}'] = b
    for i in range(2):
        b = new_b(1530 + i)
        boulder(b, 1530 + i * 9)
        v[f'boulder{i}'] = b
    return v


def run(out):
    bs.make_textures()
    variants = build_variants()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = ts.materials_for(list(variants.values()))
    for k, b in variants.items():
        mesh = ts.make_mesh(f'dm_{k}', b, keys, images, bevel=False)
        kta.place(f'dm_{k}', mesh, 0.0, 0.0)
    ts.export_glb(out)
    size, prims, tris, doc = bs.inspect(out)
    print(f'[doan_mach] {out}: {size / 1024:.0f} KB, {len(variants)} biến thể, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)})')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    run(args[0] if args else 'arch_doan_mach.glb')
