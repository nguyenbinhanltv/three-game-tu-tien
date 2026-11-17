# Kiếm lấy từ nguồn ngoài (không phải Tripo, ví dụ Sketchfab CC BY): gom về MỘT lưới, MỘT vật liệu rồi dựng theo quy ước
# kiếm trần của client bằng orient_sword.py. Chạy như bước `import.post` của import_tripo.py.
#
# Client gắn mesh ĐẦU TIÊN của asset kiếm vào xương `dtl_sword` (swordModel.ts: không xương, 1 draw call), nên model nhiều
# phần/nhiều vật liệu phải gom lại:
#   1. Bỏ lưới phụ không có texture màu (vỏ ngọc trong suốt dùng KHR_materials_transmission, lõi phát sáng chỉ có hệ số
#      màu...): engine không vẽ được transmission trên kiếm gắn xương và mỗi vật liệu thêm một draw call cho mỗi người.
#   2. Gộp các lưới còn lại (cùng một vật liệu có texture) thành một object.
#   3. Vật liệu không kim loại: game không có envMap nên kim loại không phản chiếu gì và ra đen (cùng lý do client ép
#      `SWORD_METALNESS = 0` cho kiếm người chơi). Gỡ map kim loại/độ nhám, đặt Metallic 0, Roughness 0,6; giữ map màu và normal.
#      Ghi thẳng vào asset để kiếm đúng màu ở mọi chỗ gắn (trang xem, tay boss) mà không cần mã riêng.
#   4. Gọi orient_sword.py: xoay đứng, đặt gốc ở cầu chuôi, đo chắn, ghi extras `dtl.blade`.
# Tam giác không giảm ở đây: optimize.ts hạ về `budget.faceLimit` của meta.

import os
import runpy

import bpy


def has_color_texture(mat):
    if not mat or not mat.use_nodes:
        return False
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            return any(link.from_node.type == 'TEX_IMAGE' for link in node.inputs['Base Color'].links)
    return False


keep, dropped = [], []
for obj in MESHES:
    mats = [s.material for s in obj.material_slots]
    (keep if any(has_color_texture(m) for m in mats) else dropped).append(obj)
if not keep:
    fail('ext_sword: không lưới nào có texture màu')
dropped_info = [{'name': o.name, 'triangles': sum(len(p.vertices) - 2 for p in o.data.polygons)} for o in dropped]
for obj in dropped:
    bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.object.select_all(action='DESELECT')
for obj in keep:
    obj.select_set(True)
bpy.context.view_layer.objects.active = keep[0]
if len(keep) > 1:
    bpy.ops.object.join()
sword = bpy.context.view_layer.objects.active
sword.name = ASSET_ID
sword.data.name = ASSET_ID
mats = {s.material.name for s in sword.material_slots if s.material}
if len(mats) != 1:
    fail(f'ext_sword: còn {len(mats)} vật liệu sau khi gộp ({sorted(mats)}), cần đúng 1')
for slot in sword.material_slots:
    tree = slot.material.node_tree
    for node in tree.nodes:
        if node.type != 'BSDF_PRINCIPLED':
            continue
        for name, value in (('Metallic', 0.0), ('Roughness', 0.6)):
            for link in list(node.inputs[name].links):
                tree.links.remove(link)
            node.inputs[name].default_value = value
    # Nút ảnh/tách kênh của map kim loại giờ không nối vào đâu: gỡ để ảnh không còn người dùng.
    used = set()
    stack = [n for n in tree.nodes if n.type == 'OUTPUT_MATERIAL']
    while stack:
        n = stack.pop()
        if n.name in used:
            continue
        used.add(n.name)
        stack.extend(link.from_node for inp in n.inputs for link in inp.links)
    for node in [n for n in tree.nodes if n.name not in used]:
        tree.nodes.remove(node)

# Vật liệu/ảnh của lưới đã bỏ và map kim loại không còn ai dùng: gỡ để không xuất kèm.
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
    for item in [b for b in block if b.users == 0]:
        block.remove(item)

result = runpy.run_path(os.path.join(REPO, 'tools/blender/orient_sword.py'), init_globals={
    'ASSET_ID': ASSET_ID, 'META': META, 'ARMATURES': ARMATURES, 'MESHES': [sword], 'REPO': REPO, 'fail': fail,
    'SOURCE_ROOT': SOURCE_ROOT, 'ascii_name': ascii_name, 'fcurves_of': fcurves_of,
}, run_name='__import_tripo_post__')

REPORT = {'dropped': dropped_info, **result.get('REPORT', {})}
