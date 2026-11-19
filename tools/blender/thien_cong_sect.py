# Ghép bộ "Thiên Công Khai Vật" (thien_cong_kit.py) thành Lạc Kiếm Tông và xuất GLB.
#
#   blender --background --python tools/blender/thien_cong_sect.py -- sect assets/build/raw/arch_sect.glb
#   blender --background --python tools/blender/thien_cong_sect.py -- kit  <thư mục ra>   # lưới mảnh + GLB kit để xem trước
#
# Toạ độ như build_sect.py: gốc ở tâm sân tông môn (client đặt tại SECT), x = đông, y = lên, z = nam.
# Công trình có va chạm phải khớp COLLIDERS ở packages/shared/src/level.ts (chính điện (0,-44) r17, hai đình (±52,4) r8,
# cự kiếm (0,18) r2,4, trụ cổng (±8,80), hai lầu (±40,-52) r6, tháp (0,-93) r6,5, hai bia (±30,30) r1,2).

import json
import math
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_sect as bs  # noqa: E402
import thien_cong_kit as kit  # noqa: E402
from thien_cong_kit import PARTS, new_builder  # noqa: E402


def giant_sword(b, x, z):
    """Cự kiếm đá cắm giữa sân: biểu tượng "Lạc Kiếm" (va chạm r2,4): đài ngọc hai tầng, thân kiếm thép thon có rãnh, tay nắm vẫy lên."""
    b.cylinder(x, 0, z, 3.6, 0.5, kit.JADE_SHADE, 20, smooth=False)
    b.cylinder(x, 0.5, z, 3.0, 0.45, kit.JADE, 20, 2.6, smooth=False)
    b.cylinder(x, 0.95, z, 2.5, 0.08, kit.JADE_GREEN, 20)
    b.sword_planted(x, z, 1.1, 11.5, 2.3, yaw=0.0)
    for i, word in enumerate(('Vạn', 'Kiếm', 'Quy', 'Tông')):  # chữ khắc nổi vàng dọc thân kiếm (Vạn Kiếm Quy Tông), mỗi tiếng một hàng
        b.text(word, x, 1.1 + 3.4 + i * 1.75, z + 0.17, 0.85, 0.1, kit.GILD_TEXT, fit_w=1.6, fit_h=1.15, bold=0.04)
    for k in range(6):  # đá chèn quanh chân kiếm
        a = k / 6 * math.tau
        b.box(x + math.cos(a) * 1.9, 1.15, z + math.sin(a) * 1.9, 0.9, 0.55, 0.9, kit.JADE_SHADE, yaw=-a)


def sky_data():
    """Dữ liệu đảo nổi dùng chung với client (levels/van_lam.assets.json, khối lacKiemSky)."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'packages', 'content', 'data', 'levels', 'van_lam.assets.json')
    with open(path, encoding='utf8') as f:
        return json.load(f)['lacKiemSky']


def build_islands(b):
    """Công trình trên các đảo nổi (toạ độ tương đối tâm tông môn, y tương đối SECT.y); thân đảo/cầu/thác do client dựng."""
    P = b.place
    for isl in sky_data()['islands']:
        x, z, y, r, kind = isl['x'], isl['z'], isl['y'] + 0.45, isl['r'], isl['kind']
        if kind == 'kiem_dai':
            P('dai_tron_kiem', x, y, z, scale=0.95)
            P('prop_dinh_lu', x, y + 0.7, z, scale=1.3)
            for k in range(8):
                a = k / 8 * math.tau
                P('tru_da_khac_phu', x + math.cos(a) * 16, y + 0.7, z + math.sin(a) * 16, yaw=-a, scale=1.0)
        elif kind == 'dinh':
            P('dinh_bat_giac', x, y, z, scale=0.8)
            for k in range(4):
                a = k / 4 * math.tau + 0.4
                P('prop_den_da', x + math.cos(a) * 17, y, z + math.sin(a) * 17)
            P('prop_chau_cay', x + 14, y, z - 6)
        elif kind == 'dinh_luc':
            P('dinh_luc_giac', x, y, z, scale=0.85)
            P('prop_ban_co', x + 12, y, z + 4)
        elif kind == 'thap':
            P('thap_5_tang', x, y, z, scale=0.62)
        elif kind == 'dien':
            P('dien_nho', x, y, z, scale=1.15)
            P('cong_nho', x, y, z + 14, scale=0.9)
            P('prop_co_phuong', x + 12, y, z + 8)


def build_sect():
    b = new_builder(seed=1)
    P = b.place

    # ----- Trục thần đạo: đại lộ ngọc từ sơn môn lên chính điện, vòng bát quái quanh cự kiếm -----
    # Lát đá thành từng tấm có khe: nền tối làm mạch, mỗi tấm 2,9 × 3,9 m cao thấp lệch nhẹ (vát mép, rêu bám kẽ do bevel + màu rêu theo mặt).
    b.box(0, 0.02, 26, 12.2, 0.04, 108, kit.STONE_JOINT)
    for k in range(26):
        z = 78 - k * 4.0
        for col in range(4):
            x = -4.5 + col * 3.0
            lift = b.rng.uniform(0.0, 0.025)
            b.box(x, 0.07 + lift, z, 2.86, 0.1, 3.86, kit.JADE if (k + col) % 2 == 0 else kit.JADE_SHADE)
    for sx in (-1, 1):
        b.box(sx * 6.4, 0.07, 22, 0.8, 0.14, 108, kit.JADE_GREEN)
    P('prop_bat_quai', 0, 0.02, 18, scale=3.4)

    # ----- Chính điện Thiên Kiếm (0,-44) -----
    P('dien_lon', 0, 0, -44)
    P('bac_them_may', 0, 0, -31.5, scale=1.15)
    for sx in (-1, 1):
        P('prop_dinh_lu', sx * 19, 0, -30)
        P('truc_lan_can', sx * 4.6, 1.6, -31.0)
    b.balustrade(-17.5, -31.2, -6.5, -31.2, y=1.55, h=1.0)
    b.balustrade(6.5, -31.2, 17.5, -31.2, y=1.55, h=1.0)
    P('hoanh_phi', 0, 8.7, -35.2, scale=1.0)

    # ----- Hai lầu hai tầng hai bên chính điện + hành lang nối -----
    for sx in (-1, 1):
        P('lau_hai_tang', sx * 40, 0, -52, yaw=0)
        P('hanh_lang', sx * 27, 0, -52, yaw=math.pi / 2)
    # ----- Tháp Kiếm Thất Trọng phía sau -----
    P('thap_7_tang', 0, 0, -93)
    for sx in (-1, 1):
        P('cot_co_phuong', sx * 12, 0, -70)

    # ----- Hai đình lục giác: Đan Phòng (trái) và Tàng Kiếm Các (phải) -----
    P('dinh_luc_giac', -52, 0, 4)
    P('prop_lo_dan', -52, 0.85, 4, scale=0.9)
    P('dinh_luc_giac', 52, 0, 4)
    P('prop_gia_kiem', 52, 1.0, 4)
    # ----- Cự kiếm giữa sân -----
    giant_sword(b, 0, 18)

    # ----- Sơn môn tam quan (0,80) và hai cổng phụ -----
    P('cong_tam_quan', 0, 0, 80)
    for sx in (-1, 1):
        P('cong_nho', sx * 40, 0, 78)
        P('tuong_rao_ngoi', sx * 25, 0, 78, scale=1.0)
        P('tuong_rao_ngoi', sx * 33, 0, 78, scale=1.0)

    # ----- Sân hai bên: bia khắc, trụ phù văn, ván cờ, ghế đá, phướn, chậu cây, vại nước -----
    for sx in (-1, 1):
        P('prop_bia_khac', sx * 30, 0, 30, yaw=-sx * 0.5)
        P('prop_tru_phu_van', sx * 22, 0, 58)
        P('prop_co_phuong', sx * 16, 0, 72)
        P('prop_den_hoa_dang', sx * 10, 0, -22)
        P('prop_ghe_da', sx * 34, 0, 14, yaw=math.pi / 2)
        P('prop_ghe_da', sx * 34, 0, 20, yaw=math.pi / 2)
        P('prop_chau_cay', sx * 12, 0, 46)
        P('prop_vai_nuoc', sx * 44, 0, -18)
        P('prop_su_tu_da', sx * 11, 0, 76, yaw=-sx * 0.2)
        P('prop_gia_binh_khi', sx * 44, 0, 34, yaw=-sx * math.pi / 2)
        P('prop_den_da', sx * 9, 0, -36)
    P('prop_ban_co', -34, 0, -22)
    P('prop_trong_chuong', 60, 0, -14, yaw=-math.pi / 2)
    P('prop_trong_chuong', -60, 0, -14, yaw=math.pi / 2)
    P('prop_dai_sen', 14, 0, 50)
    P('prop_kiem_cam', -14, 0, 50)
    build_islands(b)
    return b


# ---------- xuất GLB ----------


def bevel_hard_edges(bm, width=0.04, angle=math.radians(35), mats=(), segments=1):
    edges = []
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        if mats and not all(f.material_index in mats for f in e.link_faces):
            continue
        if e.calc_face_angle(0.0) >= angle:
            edges.append(e)
    if edges:
        bmesh.ops.bevel(bm, geom=edges, offset=width, segments=segments, affect='EDGES')


def make_mesh(name, builder, keys, images, bevel=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(builder.verts, [], builder.faces)
    mesh.update()
    mesh.polygons.foreach_set('use_smooth', builder.smooth)
    colors, uvs = [], []
    for poly, corners, uv in zip(mesh.polygons, builder.colors, builder.uvs):
        for c, t in zip(corners, uv):
            colors.extend((c[0], c[1], c[2], 1.0))
            uvs.extend(t)
    attr = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    attr.data.foreach_set('color', colors)
    mesh.color_attributes.active_color = attr
    mesh.color_attributes.render_color_index = 0
    mesh.uv_layers.new(name='UVMap').data.foreach_set('uv', uvs)
    for k in keys:
        mesh.materials.append(images['_mat'][k])
    mesh.polygons.foreach_set('material_index', [keys.index(m) for m in builder.mats])
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    if bevel:
        # Vát mép đá/ngọc (mép mòn, bắt sáng): chỉ giữa hai mặt cùng chất liệu đá.
        # Vát 1 đoạn cho mọi chất liệu (tam giác kiến trúc tính hai lần vì có pass bóng; 2 đoạn làm đỉnh vượt ngân sách 1,7 triệu).
        hard = {keys.index(k) for k in ('jade', 'stone', 'steel') if k in keys}
        soft = {keys.index(k) for k in ('plaster', 'lacquer', 'wood') if k in keys}
        bevel_hard_edges(bm, 0.05, mats=hard, segments=1)
        bevel_hard_edges(bm, 0.04, mats=soft, segments=1)
    bm.to_mesh(mesh)
    bm.free()
    return mesh


def materials_for(builders):
    keys = [k for k in bs.MATERIALS if any(k in set(b.mats) for b in builders)]
    images = {}
    mats = {k: bs.make_material(k, images) for k in keys}
    images['_mat'] = mats
    return keys, images


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_vertex_color='ACTIVE',
        export_image_format='JPEG',
        export_jpeg_quality=82,
    )


def run_sect(out):
    bs.make_textures()
    b = build_sect()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = materials_for([b])
    mesh = make_mesh('lac_kiem_tong', b, keys, images)
    obj = bpy.data.objects.new('arch_lac_kiem_tong', mesh)
    bpy.context.scene.collection.objects.link(obj)
    export_glb(out)
    size, prims, tris, doc = bs.inspect(out)
    print(f'[thien_cong] {out}: {size / 1024:.0f} KB, {len(b.faces)} mặt, {tris} tam giác, {len(prims)} primitive ({", ".join(keys)}), {len(doc.get("images", []))} ảnh')
    missing = [k for k in ('COLOR_0', 'TEXCOORD_0') if not all(k in p for p in prims)]
    if missing:
        print(f'[thien_cong] LỖI: primitive thiếu {missing}')
        sys.exit(2)


def run_kit(outdir):
    """Một lưới mảnh (mỗi mảnh một object tên `kit_<id>`, xếp hàng theo nhóm) + GLB kit; dùng để dựng ảnh xem trước."""
    os.makedirs(outdir, exist_ok=True)
    bs.make_textures()
    built = {}
    for pid, (group, fn) in PARTS.items():
        b = new_builder(seed=hash(pid) % 1000, moss=0.6)
        fn(b)
        built[pid] = (group, b)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    keys, images = materials_for([b for _, b in built.values()])
    for pid, (group, b) in built.items():
        mesh = make_mesh(f'kit_{pid}', b, keys, images)
        obj = bpy.data.objects.new(f'kit_{pid}', mesh)
        obj['group'] = group
        bpy.context.scene.collection.objects.link(obj)
    out = os.path.join(outdir, 'kit_thien_cong.glb')
    export_glb(out)
    tri = sum(len(p.vertices) - 2 for o in bpy.data.objects for p in o.data.polygons)
    print(f'[thien_cong] kit: {len(built)} mảnh, {tri} tam giác -> {out}')
    # Danh mục để script ảnh xem trước dùng.
    with open(os.path.join(outdir, 'kit_parts.txt'), 'w', encoding='utf8') as f:
        for pid, (group, b) in built.items():
            f.write(f'{pid}\t{group}\t{len(b.faces)}\n')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if args and args[0] in ('sect', 'kit'):
        mode, target = args[0], (args[1] if len(args) > 1 else None)
    else:  # run.mjs truyền thẳng đường dẫn GLB ra
        mode, target = 'sect', (args[0] if args else None)
    target = target or ('sect.glb' if mode == 'sect' else 'kit_out')
    (run_sect if mode == 'sect' else run_kit)(target)
