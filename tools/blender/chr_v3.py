# Nhân vật v3 (N-0): một GLB nhân vật NGUYÊN KHỐI tư thế chữ A (thân + áo + đầu + tóc, có mặt) → nhân vật có bộ xương
# UE5 Mannequin của UAL (CC0) để clip UAL phát TRỰC TIẾP, không chuyển clip lúc chạy.
#
# Dùng:
#   blender -b --factory-startup --python tools/blender/chr_v3.py -- <vào.glb> <ra.glb> --id <tên> --template <UAL1_Standard.glb>
#       [--landmarks <khớp.json>] [--tris 24000] [--sheet <thư mục ảnh> [--views]] [--report <file.json>] [--springs <cấu hình.json>]
#       [--tex 2048] [--scale <hệ số>]
#
# Đầu vào có hai kiểu:
#   - GLB đã có xương tên Mixamo (`mixamorig:`/`mixamorig_`; skin Varkessa `rig_v01.glb`, thân v2 `chr_v2_*`): mốc lấy từ xương, trọng số
#     lấy từ nhóm đỉnh có sẵn ("chép trọng số bền"), vùng thiếu thì theo khoảng cách tới đoạn xương.
#   - GLB Tripo không xương (chữ A): đưa `--landmarks` (cùng khuôn `import.autoRig.joints` của biped_autorig.py: Hips, Spine, Spine1,
#     Spine2, Neck, Head, HeadTop, Left/RightShoulder|Arm|ForeArm|Hand|HandEnd|UpLeg|Leg|Foot|ToeBase|ToeEnd, mét, hệ Blender), trọng số theo
#     khoảng cách (không có nhóm đỉnh để chép).
#
# Các bước:
#   1. Nhập bộ xương mẫu (Mannequin của UAL1) + nhân vật; gộp lưới, hàn đỉnh, giảm lưới về `--tris` (LOD0), bỏ LOD cũ.
#   2. Bộ xương khớp (F) = xương Mannequin đặt theo mốc của NHÂN VẬT. Trọng số chép/tính trên F, làm mượt, ≤ 4 xương/đỉnh.
#   3. Đặt lại tư thế nghỉ: tạo F' = hướng xương GIỮ NGUYÊN như Mannequin (để clip UAL đúng), độ dài lấy theo nhân vật; lưới biến dạng
#      (LBS) từ F sang F'. Xương xuất = chính bộ xương mẫu đã sửa vị trí, nên góc nghỉ cục bộ trùng thư viện clip `anim_ual_native`.
#   4. Thêm xương game: `dtl_sword` (cổ tay phải), `dtl_scabbard` (lưng), `dtl_head_acc` (đầu), chuỗi lò xo `dtl_o_*` (--springs).
#   5. LOD1 50%, LOD2 20% (Decimate), texture ≤ --tex.
#   6. Kiểm: số tam giác, xuyên thân qua 12 tư thế (so với tư thế nghỉ), tờ khung 8 tư thế (--sheet).
#
# Giới hạn đã biết (ghi lại, đừng quên): UAL KHÔNG có xương xoắn (twist) nên chưa chia trọng số xoắn; mặt nạ nhuộm 3 kênh và atlas
# gộp chỉ giữ nguyên texture đầu vào (chưa dựng lại); không kiểm trượt chân (thuộc animation, N-5).
import json
import math
import os
import re
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]


def opt(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default


# Hai cách gọi: `<vào> <ra>` hoặc (run.mjs) `<ra> --src <vào>`.
IN, OUT = (opt('--src'), argv[0]) if '--src' in argv else (argv[0], argv[1])
ID = opt('--id', 'chr_v3')
TEMPLATE = opt('--template')
LANDMARKS = opt('--landmarks')
TRIS = int(opt('--tris', 24000))
TEXMAX = int(opt('--tex', 2048))
SHEET = opt('--sheet')
REPORT = opt('--report')
SPRINGS = opt('--springs')
WINGS = opt('--wings')  # cánh (DV-2 đợt 4): JSON {parent, region:{min,max} (nửa +X, tọa độ lưới NGUỒN), chains:[{name, pts:[[x,y,z]…]}]}, tự lấy đối xứng nửa -X
NO_EXPORT = '--no-export' in argv
BIND = opt('--bind')  # quái dị vực (DV-2 đợt 2): JSON {binds:[{box:{min,max}, bone|blend:[[z,bone],[z,bone]]|drop:[xương…]}]} ép vùng cứng (vũ khí, khiên, áo choàng) theo một xương, tọa độ lưới NGUỒN
BIND_A = '--bind-a' in argv  # NV3-B: GIỮ mesh ở A-pose, khung xương đặt theo mesh (không biến dạng sang T-pose); sau khi xuất, góc nghỉ cục bộ của xương được đặt lại = template UAL để clip phát đúng
AUTO = '--auto' in argv  # đầu vào không xương: tự ước lượng mốc theo tỉ lệ Mannequin + đo lưới (xem estimate_landmarks)
REP = {'id': ID, 'input': os.path.basename(IN)}
HAND_HINT = (json.load(open(SPRINGS, encoding='utf-8')).get('hand') or {}) if SPRINGS else {}


def log(m):
    print(f'[chr_v3] {m}', flush=True)


def fail(m):
    raise SystemExit(f'[chr_v3] LỖI: {m}')


def np3(v):
    return np.array([v[0], v[1], v[2]], float)


# Mixamo (tên chuẩn hóa) → Mannequin
M_MAP = {'hips': 'pelvis', 'spine': 'spine_01', 'spine1': 'spine_02', 'spine2': 'spine_03', 'neck': 'neck_01', 'head': 'Head'}
LIMB = {'shoulder': 'clavicle', 'arm': 'upperarm', 'forearm': 'lowerarm', 'hand': 'hand', 'upleg': 'thigh', 'leg': 'calf', 'foot': 'foot', 'toebase': 'ball'}
FING = {'thumb': 'thumb', 'index': 'index', 'middle': 'middle', 'ring': 'ring', 'pinky': 'pinky'}


def mix_to_man(clean):
    """'leftupleg' → 'thigh_l' (None nếu không có tương ứng)."""
    if clean in M_MAP:
        return M_MAP[clean]
    m = re.match(r'(left|right)(shoulder|arm|forearm|hand|upleg|leg|foot|toebase)$', clean)
    if m:
        return f'{LIMB[m[2]]}_{m[1][0]}'
    m = re.match(r'(left|right)hand(thumb|index|middle|ring|pinky)([123])$', clean)
    if m:
        return f'{FING[m[2]]}_0{m[3]}_{m[1][0]}'
    return None


def clean_name(n):
    return re.sub(r'^mixamorig[:_]', '', n).lower()


# ---------- 1. nhập ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
if not TEMPLATE or not os.path.isfile(TEMPLATE):
    fail('thiếu --template (UAL1_Standard.glb)')
bpy.ops.import_scene.gltf(filepath=TEMPLATE)
ARM = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
ARM.name = 'Armature'
for o in list(bpy.data.objects):
    if o.type != 'ARMATURE':
        bpy.data.objects.remove(o, do_unlink=True)
ACTIONS = {a.name: a for a in bpy.data.actions}  # clip UAL1: dùng cho kiểm xuyên thân/tờ khung
if ARM.animation_data:
    ARM.animation_data.action = None

# Mẫu: đầu/đuôi/roll/cha trong không gian armature (armature gốc ở trục thế giới).
bpy.context.view_layer.objects.active = ARM
bpy.ops.object.mode_set(mode='EDIT')
T = {}
for eb in ARM.data.edit_bones:
    T[eb.name] = {'head': np3(eb.head), 'tail': np3(eb.tail), 'roll': eb.roll, 'parent': eb.parent.name if eb.parent else None}
bpy.ops.object.mode_set(mode='OBJECT')
MW_ARM = ARM.matrix_world.copy()
if not np.allclose(np.array(MW_ARM), np.eye(4), atol=1e-4):
    log(f'cảnh báo: armature mẫu có ma trận thế giới khác đơn vị {MW_ARM.to_euler()}')
CH = {}
for n, d in T.items():
    CH.setdefault(d['parent'], []).append(n)

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=IN)
new = [o for o in bpy.data.objects if o not in before]
src_arm = next((o for o in new if o.type == 'ARMATURE'), None)
meshes = [o for o in new if o.type == 'MESH' and o.name != 'Icosphere' and not re.search(r'_lod\d', o.name, re.I)]
if not meshes:
    fail('không thấy lưới nhân vật')
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
BODY = bpy.context.view_layer.objects.active
BODY.name = ID
SCALE = float(opt('--scale', 1.0))

# Lấy mốc từ xương nguồn (trước khi gỡ).
LM = {}
if src_arm:
    for b in src_arm.data.bones:
        LM[clean_name(b.name)] = (np3(src_arm.matrix_world @ b.head_local), np3(src_arm.matrix_world @ b.tail_local))
elif LANDMARKS:
    J = json.load(open(LANDMARKS, encoding='utf-8'))
    J = J.get('joints', J)
    nxt = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head', 'Head': 'HeadTop'}
    for k, v in nxt.items():
        LM[k.lower()] = (np3(J[k]), np3(J[v]))
    for S in ('Left', 'Right'):
        chain = [(f'{S}Shoulder', 'Spine2', f'{S}Arm'), (f'{S}Arm', None, f'{S}ForeArm'), (f'{S}ForeArm', None, f'{S}Hand'), (f'{S}Hand', None, f'{S}HandEnd'),
                 (f'{S}UpLeg', None, f'{S}Leg'), (f'{S}Leg', None, f'{S}Foot'), (f'{S}Foot', None, f'{S}ToeBase'), (f'{S}ToeBase', None, f'{S}ToeEnd')]
        for name, head_from, tip in chain:
            head = J[head_from] if head_from else J[name]
            LM[name.lower()] = (np3(head), np3(J[tip]))
elif not AUTO:
    fail('đầu vào không có xương: cần --landmarks hoặc --auto')
need = ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head'] + [f'{s}{b}' for s in ('left', 'right') for b in ('shoulder', 'arm', 'forearm', 'hand', 'upleg', 'leg', 'foot', 'toebase')]
miss = [] if AUTO else [n for n in need if n not in LM]
if miss:
    fail(f'thiếu mốc {miss}')

# Lưới sang không gian thế giới, bỏ xương/modifier nguồn, giữ nhóm đỉnh để chép trọng số.
BODY.parent = None
BODY.data.transform(BODY.matrix_world)
BODY.matrix_world = Matrix.Identity(4)
for m in list(BODY.modifiers):
    BODY.modifiers.remove(m)
if SCALE != 1.0:
    BODY.data.transform(Matrix.Scale(SCALE, 4))
    for k in LM:
        LM[k] = (LM[k][0] * SCALE, LM[k][1] * SCALE)
# Đưa chân về mặt đất (z = 0, đáy lưới), tùy chọn co về chiều cao --height (m).
zmin = min(v.co.z for v in BODY.data.vertices)
zmax = max(v.co.z for v in BODY.data.vertices)
HEIGHT = opt('--height')
if HEIGHT:
    k = float(HEIGHT) / (zmax - zmin)
    BODY.data.transform(Matrix.Scale(k, 4))
    for key in LM:
        LM[key] = (LM[key][0] * k, LM[key][1] * k)
    zmin *= k
BODY.data.transform(Matrix.Translation((0, 0, -zmin)))
SRC_K = SCALE * (k if HEIGHT else 1.0)
SRC_DZ = -zmin
for key in LM:
    LM[key] = (LM[key][0] - np.array([0, 0, zmin]), LM[key][1] - np.array([0, 0, zmin]))

def skin_vertices(Vs):
    """Chỉ số đỉnh có màu da (từ texture màu); None nếu không có texture. Dùng tìm bàn tay khi tay áo voan rộng che mất mốc 'điểm ngoài cùng'."""
    img = None
    for mat in BODY.data.materials:
        if mat and mat.node_tree:
            for n in mat.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED' and n.inputs['Base Color'].links:
                    src = n.inputs['Base Color'].links[0].from_node
                    if src.type == 'TEX_IMAGE' and src.image:
                        img = src.image
    uvl = BODY.data.uv_layers.active
    if img is None or uvl is None:
        return None
    small = img.copy()
    small.scale(512, 512)
    px = np.array(small.pixels[:], np.float32).reshape(512, 512, 4)[:, :, :3]
    bpy.data.images.remove(small)
    nv = len(BODY.data.vertices)
    acc, cnt = np.zeros((nv, 3)), np.zeros(nv)
    for loop in BODY.data.loops:
        u, v = uvl.data[loop.index].uv
        acc[loop.vertex_index] += px[int(np.clip(v, 0, 0.9999) * 512), int(np.clip(u % 1.0, 0, 0.9999) * 512)]
        cnt[loop.vertex_index] += 1
    c = acc / np.maximum(cnt, 1)[:, None]
    lum = c @ np.array([0.299, 0.587, 0.114])
    # sRGB (0-1): da = đỏ > lục > lam, chênh đỏ-lam vừa phải, đủ sáng (loại tóc tối, vải trắng/lam/tím).
    loose = (c[:, 0] > 0.50) & (c[:, 0] > c[:, 1] + 0.02) & (c[:, 1] > c[:, 2] - 0.01) & ((c[:, 0] - c[:, 2]) > 0.10) & ((c[:, 0] - c[:, 2]) < 0.50) & (lum > 0.45)
    # Vải ngà/kem cũng lọt bộ lọc lỏng: so với màu da MẶT của chính model (trung vị các đỉnh lọc lỏng ở vùng mặt) cho chặt.
    H0 = float(Vs[:, 2].max())
    face = np.where(loose & (Vs[:, 2] > 0.84 * H0) & (np.abs(Vs[:, 0]) < 0.06 * H0))[0]
    if len(face) < 30:
        return loose
    M = np.median(c[face], axis=0)
    log(f'màu da mặt (sRGB) {M.round(2)} từ {len(face)} đỉnh')
    if '--debug-skin' in argv:
        for sx in (1, -1):
            for zf in (0.50, 0.55, 0.60):
                m_ = np.where((np.abs(Vs[:, 0] - sx * 0.23 * H0) < 0.05 * H0) & (np.abs(Vs[:, 2] - zf * H0) < 0.03 * H0))[0]
                if len(m_):
                    log(f'DBG mẫu màu quanh (x={sx * 0.23:+.2f}H, z={zf:.2f}H): {len(m_)} đỉnh, trung vị {np.median(c[m_], axis=0).round(2)}, tối đa dist da mặt {np.median(np.linalg.norm(c[m_] - M, axis=1)):.2f}')
    return (np.linalg.norm(c - M, axis=1) < 0.17) & (lum > 0.35)


def estimate_landmarks():
    """Mốc cho GLB Tripo chữ A không xương: tỉ lệ khớp lấy từ Mannequin (8 đầu) co theo chiều cao; tay (đầu ngón) và chân (cổ chân, mũi
    chân) đo từ lưới. Đúng cho nhân vật cao ~8 đầu, tay chếch ~35°, hai chân tách nhau; sai lệch nhỏ do bước đặt lại tư thế hấp thụ."""
    Vs = np.array([v.co[:] for v in BODY.data.vertices], float)
    H = float(Vs[:, 2].max())
    SKIN = skin_vertices(Vs) if BIND_A else None
    k = H / float(T['Head']['tail'][2])
    P = {n: d['head'] * k for n, d in T.items()}
    torso = Vs[(Vs[:, 2] > 0.55 * H) & (Vs[:, 2] < 0.75 * H)]
    dy = float(torso[:, 1].mean()) - P['spine_02'][1]
    for n in P:
        P[n] = P[n] + np.array([0.0, dy, 0.0])
    if SKIN is not None:
        # Khớp đầu theo cằm thật: mão/búi tóc cao làm tỉ lệ 8 đầu đặt khớp đầu quá cao (mặt rơi xuống dưới khớp, bị trọng số cổ/đòn kéo méo).
        fs = np.where(SKIN & (Vs[:, 2] > 0.84 * H) & (np.abs(Vs[:, 0] - P['Head'][0]) < 0.06 * H))[0]
        if len(fs) >= 60:
            log('DBG da mặt z phân vị 0/3/25/50/75/97/100: ' + ' '.join(f'{np.percentile(Vs[fs, 2], q):.2f}' for q in (0, 3, 25, 50, 75, 97, 100)))
            chin, brow = float(np.percentile(Vs[fs, 2], 3)), float(np.percentile(Vs[fs, 2], 97))
            z_new = chin + 0.22 * (brow - chin)
            dz = z_new - float(P['Head'][2])
            if dz < -0.005 * H:
                for nme in ('Head', 'neck_01'):
                    P[nme] = P[nme] + np.array([0.0, 0.0, dz])
                log(f'khớp đầu theo mặt: cằm z={chin:.2f}, trán z={brow:.2f} → Head z={z_new:.2f} (mẫu {z_new - dz:.2f}, {len(fs)} đỉnh da mặt)')
    out = {}

    def lm(name, head, tail):
        out[name] = (np.array(head, float), np.array(tail, float))

    lm('hips', P['pelvis'], P['spine_01'])
    lm('spine', P['spine_01'], P['spine_02'])
    lm('spine1', P['spine_02'], P['spine_03'])
    lm('spine2', P['spine_03'], P['neck_01'])
    lm('neck', P['neck_01'], P['Head'])
    lm('head', P['Head'], np.array([P['Head'][0], P['Head'][1], H]))
    for sd, side in (('l', 'left'), ('r', 'right')):
        sg = 1.0 if P['upperarm_' + sd][0] > 0 else -1.0
        S = P['upperarm_' + sd].copy()
        arm = Vs[(Vs[:, 2] > 0.40 * H) & (Vs[:, 2] < 0.72 * H)]
        F = arm[np.argmax(sg * arm[:, 0])]  # đầu ngón tay: điểm ngoài cùng của tay
        d = F - S
        elbow, wrist = S + 0.47 * d, S + 0.86 * d
        if BIND_A:
            # Bàn tay theo gợi ý (đo trên ảnh raw của 18 model Tripo bậc cao: tay chữ A đồng nhất, tâm bàn tay x ≈ 0,265 H, z ≈ 0,49 H; voan phủ lên bàn tay
            # nên dò màu da không ổn định). Ghi đè theo bộ bằng khóa `hand` trong file lò xo: {"x":…, "z":…, "len":…} (phần chiều cao).
            hh = HAND_HINT
            C = np.array([sg * hh.get('x', 0.265) * H, 0.0, hh.get('z', 0.49) * H])
            near = Vs[(np.abs(Vs[:, 0] - C[0]) < 0.03 * H) & (np.abs(Vs[:, 2] - C[2]) < 0.03 * H)]
            C[1] = float(np.median(near[:, 1])) if len(near) else float(S[1])
            dn = (C - S) / max(np.linalg.norm(C - S), 1e-9)
            hl = hh.get('len', 0.105) * H
            F, wrist = C + dn * 0.5 * hl, C - dn * 0.5 * hl
            elbow = S + 0.5 * (wrist - S)
            log(f'bàn tay {sd} theo gợi ý: tâm ({C[0]:.2f},{C[1]:.2f},{C[2]:.2f}), dài {hl:.2f} m, vai→cổ tay {np.linalg.norm(wrist - S):.2f} m')
        lm(side + 'shoulder', P['clavicle_' + sd], S)
        lm(side + 'arm', S, elbow)
        lm(side + 'forearm', elbow, wrist)
        lm(side + 'hand', wrist, F)
        low = Vs[(Vs[:, 2] < 0.12 * H) & (sg * Vs[:, 0] > 0)]
        ank = low.mean(axis=0)
        toe_y = float(Vs[(Vs[:, 2] < 0.05 * H) & (sg * Vs[:, 0] > 0)][:, 1].min())
        hip = P['thigh_' + sd]
        foot = np.array([ank[0], ank[1], P['foot_' + sd][2]])
        knee = np.array([(hip[0] + ank[0]) / 2, (hip[1] + ank[1]) / 2, P['calf_' + sd][2]])
        ball = np.array([ank[0], 0.5 * (ank[1] + toe_y), P['ball_' + sd][2]])
        tip = np.array([ank[0], toe_y, P['ball_leaf_' + sd][2]])
        lm(side + 'upleg', hip, knee)
        lm(side + 'leg', knee, foot)
        lm(side + 'foot', foot, ball)
        lm(side + 'toebase', ball, tip)
    return out


if AUTO:
    LM = estimate_landmarks()
    log('mốc tự ước lượng: ' + ', '.join(f"{k}=({v[0][0]:.2f},{v[0][1]:.2f},{v[0][2]:.2f})" for k, v in list(LM.items())[:3]))
REP['height'] = round(float(zmax * (k if HEIGHT else 1) - zmin), 3)
src_groups = [g.name for g in BODY.vertex_groups]
log(f'nhân vật: {len(BODY.data.polygons)} mặt, {len(src_groups)} nhóm đỉnh, dao {tuple(round(x, 2) for x in BODY.dimensions)}')
if src_arm:
    for o in new:
        if o is not BODY and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)

# Dọn: hàn đỉnh trùng, bỏ đỉnh rời, tam giác hóa.
me = BODY.data
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bm.to_mesh(me)
bm.free()
tris0 = len(me.polygons)
if tris0 > TRIS:
    md = BODY.modifiers.new('dec', 'DECIMATE')
    md.ratio = TRIS / tris0
    bpy.context.view_layer.objects.active = BODY
    bpy.ops.object.modifier_apply(modifier=md.name)
REP['tris_in'] = tris0
REP['tris_lod0'] = len(BODY.data.polygons)
log(f'tam giác {tris0} → {len(BODY.data.polygons)}')

# ---------- 2. bộ xương khớp F ----------
LMs = {k: v for k, v in LM.items()}


def head_of(man):
    """Đầu xương Mannequin theo mốc nhân vật (None nếu để cho phép dựng từ mẫu: ngón tay, root)."""
    inv = {v: k for k, v in M_MAP.items()}
    if man in inv:
        return LMs[inv[man]][0]
    m = re.match(r'(clavicle|upperarm|lowerarm|hand|thigh|calf|foot|ball)_([lr])$', man)
    if m:
        k = {v: kk for kk, v in LIMB.items()}[m[1]]
        return LMs[('left' if m[2] == 'l' else 'right') + k][0]
    m = re.match(r'ball_leaf_([lr])$', man)
    if m:
        return LMs[('left' if m[1] == 'l' else 'right') + 'toebase'][1]
    return None


MAIN = {'pelvis': 'spine_01', 'spine_01': 'spine_02', 'spine_02': 'spine_03', 'spine_03': 'neck_01', 'neck_01': 'Head', 'root': 'pelvis'}
for s in 'lr':
    MAIN.update({f'clavicle_{s}': f'upperarm_{s}', f'upperarm_{s}': f'lowerarm_{s}', f'lowerarm_{s}': f'hand_{s}', f'hand_{s}': f'middle_01_{s}',
                 f'thigh_{s}': f'calf_{s}', f'calf_{s}': f'foot_{s}', f'foot_{s}': f'ball_{s}', f'ball_{s}': f'ball_leaf_{s}'})
    for f in FING.values():
        for i in (1, 2, 3):
            MAIN[f'{f}_0{i}_{s}'] = f'{f}_0{i + 1}_{s}' if i < 3 else f'{f}_04_leaf_{s}'

F_HEAD, F_TAIL = {}, {}
for n in T:
    h = head_of(n)
    if h is not None:
        F_HEAD[n] = h
F_HEAD['root'] = T['root']['head'].copy()
# Ngón tay: dựng từ mẫu theo bàn tay (tỉ lệ + quay nhỏ nhất).
for s in 'lr':
    hd = f'hand_{s}'
    side = 'left' if s == 'l' else 'right'
    hand_h, hand_t = LM[side + 'hand']
    fwd_f = hand_t - hand_h
    kT = T[f'middle_01_{s}']['head'] - T[hd]['head']
    sc = np.linalg.norm(fwd_f) / max(np.linalg.norm(kT), 1e-6)
    if BIND_A:
        # fwd_f là cả bàn tay (cổ tay → chóp ngón), nên so với cổ tay → chóp ngón giữa của MẪU (không phải tới khớp ngón), nếu không xương ngón dài gấp đôi.
        tip_key = f'middle_04_leaf_{s}'
        tipT = T[tip_key]['head'] if tip_key in T else T[f'middle_03_{s}']['tail']
        sc = np.linalg.norm(fwd_f) / max(np.linalg.norm(tipT - T[hd]['head']), 1e-6)
    sc_raw = sc
    sc = float(np.clip(sc, 0.5, 1.6)) if np.linalg.norm(fwd_f) > 1e-4 else 1.0
    log(f'DBG bàn tay {s}: dài {np.linalg.norm(fwd_f):.3f} m, mẫu tới ngón giữa {np.linalg.norm(kT):.3f} m, hệ số {sc_raw:.2f} → {sc:.2f}')
    rot = Vector(kT).rotation_difference(Vector(fwd_f)) if np.linalg.norm(fwd_f) > 1e-4 else Quaternion()
    for n in T:
        if re.match(r'(thumb|index|middle|ring|pinky)_', n) and n.endswith('_' + s):
            F_HEAD[n] = F_HEAD[hd] + np3(rot @ Vector((T[n]['head'] - T[hd]['head']) * sc))
KF = {}  # hệ số dài mỗi xương: |nhân vật| / |mẫu| theo đoạn tới xương con chính
for n in T:
    c = MAIN.get(n)
    if c and n in F_HEAD and c in F_HEAD:
        dT = np.linalg.norm(T[c]['head'] - T[n]['head'])
        KF[n] = np.linalg.norm(F_HEAD[c] - F_HEAD[n]) / max(dT, 1e-6)
for n in T:  # xương lá: dùng hệ số của cha
    if n not in KF:
        p = T[n]['parent']
        KF[n] = KF.get(p, 1.0)
for n in T:
    c = MAIN.get(n)
    if c and c in F_HEAD and n in F_HEAD:
        F_TAIL[n] = F_HEAD[c]
    elif n in F_HEAD:
        F_TAIL[n] = F_HEAD[n] + (T[n]['tail'] - T[n]['head']) * KF[n]
F_TAIL['Head'] = LM['head'][1]
F_TAIL['root'] = F_HEAD['root'] + (T['root']['tail'] - T['root']['head'])

# Bộ xương xuất F': hướng = mẫu, đầu = đầu cha' + (offset mẫu) × (|offset nhân vật| / |offset mẫu|).
Fp_HEAD, Fp_TAIL = {}, {}
order = []
stack = [None]
while stack:
    p = stack.pop(0)
    for c in CH.get(p, []):
        order.append(c)
        stack.append(c)
for n in order:
    p = T[n]['parent']
    if p is None:
        Fp_HEAD[n] = T[n]['head'].copy()
    elif n == 'pelvis':
        Fp_HEAD[n] = F_HEAD['pelvis'].copy()
    else:
        offT = T[n]['head'] - T[p]['head']
        offF = (F_HEAD[n] - F_HEAD[p]) if (n in F_HEAD and p in F_HEAD) else None
        k = (np.linalg.norm(offF) / max(np.linalg.norm(offT), 1e-6)) if offF is not None else KF.get(p, 1.0)
        Fp_HEAD[n] = Fp_HEAD[p] + offT * k
for n in order:
    Fp_TAIL[n] = Fp_HEAD[n] + (T[n]['tail'] - T[n]['head']) * KF[n] if n != 'root' else T[n]['tail'].copy()
    c = MAIN.get(n)
    if c and c in Fp_HEAD and n != 'root':
        Fp_TAIL[n] = Fp_HEAD[c].copy()
    if n == 'Head':
        Fp_TAIL[n] = Fp_HEAD[n] + (T[n]['tail'] - T[n]['head']) * KF['Head']

DEF = [n for n in order if n != 'root' and not n.endswith('_leaf_l') and not n.endswith('_leaf_r') and not re.match(r'ball_leaf', n)]
DEF = [n for n in DEF if n in F_HEAD and n in F_TAIL]
IDX = {n: i for i, n in enumerate(DEF)}


def REGION_OF(n):
    if re.match(r'(clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)', n):
        return 'arm'
    if re.match(r'(thigh|calf|foot|ball)', n):
        return 'leg'
    return 'torso'

# ---------- trọng số ----------
V = np.array([BODY.matrix_world @ v.co for v in BODY.data.vertices], float).reshape(-1, 3)
NV = len(V)


def vertex_texel_rgb():
    """Màu sRGB (0-1) của texture màu tại mỗi đỉnh (trung bình UV các loop); None nếu không tìm thấy texture."""
    img = None
    for mat in BODY.data.materials:
        if mat and mat.node_tree:
            for n in mat.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED' and n.inputs['Base Color'].links:
                    src = n.inputs['Base Color'].links[0].from_node
                    if src.type == 'TEX_IMAGE' and src.image:
                        img = src.image
    uvl = BODY.data.uv_layers.active
    if img is None or uvl is None:
        return None
    small = img.copy()
    small.scale(256, 256)
    px = np.array(small.pixels[:], np.float32).reshape(256, 256, 4)[:, :, :3]
    bpy.data.images.remove(small)
    acc = np.zeros((NV, 3))
    cnt = np.zeros(NV)
    for loop in BODY.data.loops:
        u, v = uvl.data[loop.index].uv
        acc[loop.vertex_index] += px[int(np.clip(v, 0, 0.9999) * 256), int(np.clip(u % 1.0, 0, 0.9999) * 256)]
        cnt[loop.vertex_index] += 1
    return acc / np.maximum(cnt, 1)[:, None]


TEXEL = vertex_texel_rgb()
# Tóc: tối và trung tính (lam của quần/ủng/viền có b − r lớn hơn).
HAIRV = None if TEXEL is None else ((TEXEL @ np.array([0.299, 0.587, 0.114])) < 0.17) & ((TEXEL[:, 2] - TEXEL[:, 0]) < 0.045)
W = np.zeros((NV, len(DEF)), float)
use_src = bool(src_groups)
if use_src:
    gname = {g.index: g.name for g in BODY.vertex_groups}
    for vi, v in enumerate(BODY.data.vertices):
        for ge in v.groups:
            nm = gname[ge.group]
            cn = clean_name(nm)
            tgt = mix_to_man(cn)
            if tgt is None:
                tgt = 'Head' if 'hair' in cn or 'head' in cn else ('spine_03' if 'sword' in cn else 'pelvis')
            if tgt in IDX:
                W[vi, IDX[tgt]] += ge.weight


def seg_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


D = np.stack([seg_dist(V, F_HEAD[n], F_TAIL[n]) for n in DEF], axis=1)
dist_w = 1.0 / (D ** 2 + 1e-4)
zero = W.sum(axis=1) < 0.5
if use_src:
    log(f'trọng số chép từ nhóm đỉnh nguồn; {int(zero.sum())}/{NV} đỉnh thiếu → theo khoảng cách')
dw = dist_w.copy()
# chỉ giữ 4 xương gần nhất cho đỉnh tính theo khoảng cách
for vi in np.where(zero)[0]:
    row = dw[vi]
    keep = np.argsort(row)[-4:]
    m = np.zeros_like(row)
    m[keep] = row[keep]
    W[vi] = m
# làm mượt theo cạnh lưới (nhẹ, một vòng)
adj = [[] for _ in range(NV)]
for e in BODY.data.edges:
    a, b = e.vertices
    adj[a].append(b)
    adj[b].append(a)
for it in range(2):
    Wn = W.copy()
    for vi in range(NV):
        if adj[vi]:
            Wn[vi] = 0.7 * W[vi] + 0.3 * W[adj[vi]].mean(axis=0)
    W = Wn
# vùng cứng (--bind): vũ khí/khiên/áo choàng đi theo đúng một xương, không bị kéo giãn theo khoảng cách
if BIND:
    for bd in json.load(open(BIND, encoding='utf-8'))['binds']:
        lo = np.array(bd['box']['min'], float) * SRC_K + np.array([0, 0, SRC_DZ])
        hi = np.array(bd['box']['max'], float) * SRC_K + np.array([0, 0, SRC_DZ])
        inb = np.where(np.all((V >= lo) & (V <= hi), axis=1))[0]
        if 'drop' in bd:
            # `drop`: bỏ ảnh hưởng của các xương này lên đỉnh trong hộp (ví dụ vạt áo trước hông không được theo tay), phần còn lại giữ nguyên trọng số.
            cols = [IDX[b] for b in bd['drop']]
            for vi in inb:
                W[vi, cols] = 0.0
                if W[vi].sum() <= 1e-9:
                    W[vi, IDX['pelvis']] = 1.0
                W[vi] /= W[vi].sum()
            log(f'bind (bỏ xương) {bd.get("note", "drop")}: {len(inb)} đỉnh')
            continue
        for vi in inb:
            W[vi] = 0.0
            if 'blend' in bd:
                (z0, b0), (z1, b1) = bd['blend']
                t = float(np.clip((V[vi, 2] - (z0 * SRC_K + SRC_DZ)) / ((z1 - z0) * SRC_K), 0, 1))
                W[vi, IDX[b0]] = 1 - t
                W[vi, IDX[b1]] = t
            else:
                W[vi, IDX[bd['bone']]] = 1.0
        # `feather` (đơn vị lưới nguồn): quanh hộp, trọng số chuyển dần từ xương ép sang trọng số theo khoảng cách (khỏi có tam giác nối đỉnh cứng với đỉnh tự do kéo thành mảng nhọn).
        ft = float(bd.get('feather', 0)) * SRC_K
        if ft > 0:
            d = np.linalg.norm(np.maximum(np.maximum(lo - V, V - hi), 0), axis=1)
            ring = np.where((d > 0) & (d < ft))[0]
            for vi in ring:
                t = 1 - d[vi] / ft
                tw = np.zeros(W.shape[1])
                if 'blend' in bd:
                    (z0, b0), (z1, b1) = bd['blend']
                    u = float(np.clip((V[vi, 2] - (z0 * SRC_K + SRC_DZ)) / ((z1 - z0) * SRC_K), 0, 1))
                    tw[IDX[b0]], tw[IDX[b1]] = 1 - u, u
                else:
                    tw[IDX[bd['bone']]] = 1.0
                row = W[vi] / max(W[vi].sum(), 1e-9)
                W[vi] = t * tw + (1 - t) * row
        log(f'bind {bd.get("note", bd.get("bone", "blend"))}: {len(inb)} đỉnh')
if BIND_A:
    # Đầu cứng (NV3-B): mặt/mũ/tóc búi từ đáy đầu trở lên bám 100% `Head`; dải nối cổ → đầu chuyển tuyến tính từ `neck_01`. Trọng số khoảng cách thuần
    # trộn cả đòn/cột sống/hông vào mặt nên mặt méo khi cúi hoặc xoay thân.
    z_head, z_neck = float(F_HEAD['Head'][2]), float(F_HEAD['neck_01'][2])
    band = max(z_head - z_neck, 1e-6)
    n_head = 0
    for vi in range(NV):
        z = V[vi, 2]
        if z >= z_head - 0.15 * band:
            W[vi] = 0
            W[vi, IDX['Head']] = 1.0
            n_head += 1
        elif z > z_neck:
            t = (z - z_neck) / band
            W[vi] *= (1 - t)
            W[vi, IDX['Head']] += t
            W[vi] /= max(W[vi].sum(), 1e-9)
    log(f'đầu cứng: {n_head} đỉnh bám Head')
# ≤ 4 xương/đỉnh, chuẩn hóa
for vi in range(NV):
    row = W[vi]
    if np.count_nonzero(row) > 4:
        thr = np.sort(row)[-4]
        row[row < thr] = 0
    s = row.sum()
    if s <= 0:
        row[IDX['pelvis']] = 1.0
    else:
        row /= s
REP['verts'] = NV

# ---------- 3. đặt lại tư thế nghỉ (LBS F → F') ----------
def qdiff(a, b):
    a, b = Vector(a), Vector(b)
    if a.length < 1e-9 or b.length < 1e-9:
        return Quaternion()
    return a.normalized().rotation_difference(b.normalized())


Rm, Th, Tp = [], [], []
for n in DEF:
    q = qdiff(F_TAIL[n] - F_HEAD[n], Fp_TAIL[n] - Fp_HEAD[n])
    Rm.append(np.array(q.to_matrix()))
    Th.append(F_HEAD[n])
    Tp.append(Fp_HEAD[n])
VP = np.zeros_like(V)
if BIND_A:
    # NV3-B: KHÔNG biến dạng lưới. Lưới giữ nguyên tư thế A của model; xương đặt theo lưới (F), mọi mốc/trọng số/lò xo phía sau tính trên lưới A.
    VP = V.copy()
    RMd = {n: Rm[i] for i, n in enumerate(DEF)}
    TPd = {n: Tp[i] for i, n in enumerate(DEF)}
    THd = {n: Th[i] for i, n in enumerate(DEF)}
    RM_OF, FA_HEAD, FA_TAIL = {}, {}, {}
    for n in order:  # cha trước con
        if n in RMd:
            RM_OF[n] = RMd[n]
            FA_HEAD[n], FA_TAIL[n] = F_HEAD[n].copy(), F_TAIL[n].copy()
        else:  # root, xương lá: theo phép biến đổi của cha (nghịch đảo của F → F')
            par = T[n]['parent']
            R = RM_OF.get(par, np.eye(3))
            RM_OF[n] = R
            pb = par if par in TPd else None
            if pb is None:
                FA_HEAD[n], FA_TAIL[n] = Fp_HEAD[n].copy(), Fp_TAIL[n].copy()
            else:
                FA_HEAD[n] = (Fp_HEAD[n] - TPd[pb]) @ R + THd[pb]
                FA_TAIL[n] = (Fp_TAIL[n] - TPd[pb]) @ R + THd[pb]
    FP_BACKUP = (Fp_HEAD, Fp_TAIL)
    Fp_HEAD, Fp_TAIL = FA_HEAD, FA_TAIL  # từ đây "Fp" = khung xương theo lưới A
    REP['bind_a'] = True
else:
    for bi in range(len(DEF)):
        wcol = W[:, bi]
        nz = wcol > 0
        if not nz.any():
            continue
        VP[nz] += wcol[nz, None] * ((V[nz] - Th[bi]) @ Rm[bi].T + Tp[bi])
    for i, v in enumerate(BODY.data.vertices):
        v.co = Vector(VP[i])
BODY.data.update()
for p in BODY.data.polygons:
    p.use_smooth = True
BODY.data.calc_loop_triangles()

# ---------- armature xuất = armature mẫu, sửa vị trí ----------
bpy.context.view_layer.objects.active = ARM
ARM.select_set(True)
FT_REST = {b.name: np.array(b.matrix_local.to_3x3()) for b in ARM.data.bones}  # khung xương mẫu (T) trong không gian armature, trước khi sửa
bpy.ops.object.mode_set(mode='EDIT')
eb = ARM.data.edit_bones
for b in eb:
    b.use_connect = False
FA_FRAME = {}
for n in order:
    b = eb[n]
    if BIND_A:
        # Khung xương theo lưới A = khung mẫu quay ngược phép quay tối thiểu F → F' (cùng cách `qdiff` đã dùng để biến dạng lưới ở chế độ cũ).
        fa = RM_OF[n].T @ FT_REST[n]
        FA_FRAME[n] = fa
        ln = float(np.linalg.norm(Fp_TAIL[n] - Fp_HEAD[n]))
        b.matrix = Matrix.Translation(Vector(Fp_HEAD[n])) @ Matrix(fa.tolist()).to_4x4()
        b.tail = b.head + Vector(fa[:, 1]) * ln
        continue
    b.head = Vector(Fp_HEAD[n])
    b.tail = Vector(Fp_TAIL[n])
    b.roll = T[n]['roll']
extra = {}


def add_bone(name, parent, head, tail, roll=0.0):
    b = eb.new(name)
    b.head, b.tail, b.roll = Vector(head), Vector(tail), roll
    b.parent = eb[parent]
    b.use_connect = False
    extra[name] = parent
    return b


H = Fp_HEAD
top = Fp_TAIL['Head']
height = float(max(v.co.z for v in BODY.data.vertices))
add_bone('dtl_sword', 'hand_r', H['hand_r'], H['hand_r'] + np.array([0, 0, 0.18 * height / 1.8]))
add_bone('dtl_scabbard', 'spine_03', H['spine_03'] + np.array([0, 0.10 * height / 1.8, 0]), H['spine_03'] + np.array([-0.12, 0.10, -0.55]) * height / 1.8)
add_bone('dtl_head_acc', 'Head', top - np.array([0, 0, 0.06]), top + np.array([0, 0, 0.06]))
n_spring = 0
COLS = list(DEF)
# Xương twist (UAL không có): mỗi cẳng/đùi có `<x>_twist_<l|r>` (con của xương gốc, đặt ở 1/2 đoạn, cùng hướng và roll). Client đặt xoay của nó
# = -0,8 × góc xoắn của xương cha quanh trục xương, nên đỉnh gần đầu xương chỉ xoắn khoảng 1/3, đỉnh gần cuối xoắn đủ: bớt "kẹo xoắn" ở vai/khuỷu/hông.
TWIST_OF = {'upperarm': 'lowerarm', 'lowerarm': 'hand', 'thigh': 'calf'}
N_TWIST = 0
for sd in 'lr':
    for limb in TWIST_OF:
        L = f'{limb}_{sd}'
        a, b = Fp_HEAD[L], Fp_TAIL[L]
        mid = (a + b) / 2
        add_bone(f'{limb}_twist_{sd}', L, mid, mid + (b - a) * 0.3, T[L]['roll'])
        COLS.append(f'{limb}_twist_{sd}')
        N_TWIST += 1
Wt = np.hstack([W, np.zeros((NV, N_TWIST))])
for sd in 'lr':
    for limb in TWIST_OF:
        L = f'{limb}_{sd}'
        col = COLS.index(f'{limb}_twist_{sd}')
        a, b = Fp_HEAD[L], Fp_TAIL[L]
        ab = b - a
        for vi in np.where(W[:, IDX[L]] > 0.3)[0]:
            t = float(np.clip((VP[vi] - a) @ ab / max(ab @ ab, 1e-9), 0, 1))
            share = 0.85 * (1 - t) ** 0.8
            mv = Wt[vi, IDX[L]] * share
            Wt[vi, IDX[L]] -= mv
            Wt[vi, col] += mv
W = Wt
REP['twist_bones'] = N_TWIST

if WINGS:
    # Cánh bằng chuỗi xương (không kéo dãn lưới): mỗi chuỗi `pts` (tọa độ nguồn, nửa +X; nửa -X lấy đối xứng qua x = cx) có 3 xương:
    # `dtl_wing_<tên>_<l|r>` (gốc, con của `parent`, client xoay để vỗ cánh) rồi hai lò xo `dtl_o_wing_<tên>_<l|r>_<0|1>` (lệch theo quán tính).
    # Đỉnh trong `region` thuộc chuỗi gần nhất (khoảng cách tới đường gấp khúc); trọng số nội suy tuyến tính theo vị trí dọc chuỗi giữa ba xương,
    # nhạt dần về thân trong dải `blend` (m) quanh `bodyX` để gốc cánh không rách khỏi giáp vai.
    WG = json.load(open(WINGS, encoding='utf-8'))
    wpar = WG.get('parent', 'spine_03')
    reg = WG['region']
    def src2w(pt):
        return np.array(pt, float) * SRC_K + np.array([0, 0, SRC_DZ])

    def SRC_OF_WORLD(w):
        return (np.array(w, float) - np.array([0, 0, SRC_DZ])) / SRC_K
    chains = []
    for ch in WG['chains']:
        for sd in 'lr':
            mir = 1.0 if sd == 'l' else -1.0
            pts = [src2w([mir * q[0], q[1], q[2]]) for q in ch['pts']]
            chains.append((ch['name'], sd, np.array(pts)))
    cols_new = []
    seg_len = {}
    for name, sd, P in chains:
        n = len(P)
        # ba mốc dọc chuỗi: P[0] → gốc, 1/3, 2/3, cuối
        tot = [0.0]
        for i in range(1, n):
            tot.append(tot[-1] + float(np.linalg.norm(P[i] - P[i - 1])))
        def at(f):
            d = f * tot[-1]
            for i in range(1, n):
                if d <= tot[i] + 1e-9:
                    u = (d - tot[i - 1]) / max(tot[i] - tot[i - 1], 1e-9)
                    return P[i - 1] + (P[i] - P[i - 1]) * u
            return P[-1]
        q0, q1, q2, q3 = at(0), at(1 / 3), at(2 / 3), at(1.0)
        nm0 = f'dtl_wing_{name}_{sd}'
        add_bone(nm0, wpar, q0, q1)
        add_bone(f'dtl_o_wing_{name}_{sd}_0', nm0, q1, q2)
        add_bone(f'dtl_o_wing_{name}_{sd}_1', f'dtl_o_wing_{name}_{sd}_0', q2, q3)
        cols_new += [nm0, f'dtl_o_wing_{name}_{sd}_0', f'dtl_o_wing_{name}_{sd}_1']
        seg_len[(name, sd)] = tot[-1]
    base_w = len(COLS)
    COLS += cols_new
    W = np.hstack([W, np.zeros((NV, len(cols_new)))])
    # Vùng chọn (nguồn → thế giới qua hai góc, lấy đối xứng).
    lo, hi = np.array(reg['min'], float), np.array(reg['max'], float)
    n_w = 0
    for i in range(NV):
        sx = SRC_OF_WORLD(V[i])
        side = 'l' if sx[0] > 0 else 'r'
        ax = abs(sx[0])
        if not (lo[0] <= ax <= hi[0] and lo[1] <= sx[1] <= hi[1] and lo[2] <= sx[2] <= hi[2]):
            continue
        best = None
        for ci, (name, sd, P) in enumerate(chains):
            if sd != side:
                continue
            for j in range(len(P) - 1):
                a, b = P[j], P[j + 1]
                ab = b - a
                t = float(np.clip((V[i] - a) @ ab / max(ab @ ab, 1e-12), 0, 1))
                d = float(np.linalg.norm(V[i] - (a + ab * t)))
                if best is None or d < best[0]:
                    best = (d, ci, j, t)
        if best is None:
            continue
        _, ci, j, t = best
        name, sd, P = chains[ci]
        # vị trí dọc chuỗi theo độ dài
        seg = [float(np.linalg.norm(P[k + 1] - P[k])) for k in range(len(P) - 1)]
        f = (sum(seg[:j]) + seg[j] * t) / max(sum(seg), 1e-9)
        # trọng số tuyến tính giữa ba xương, tâm ở 1/6, 1/2, 5/6
        cs = [1 / 6, 0.5, 5 / 6]
        ws = [max(0.0, 1 - abs(f - c) / (1 / 3)) for c in cs]
        sm = sum(ws) or 1.0
        ws = [w / sm for w in ws]
        share = float(np.clip((ax - WG.get('bodyX', 0.12)) / max(WG.get('blend', 0.12), 1e-6), 0, 1))
        W[i] *= (1 - share)
        cbase = base_w + 3 * ci
        for k in range(3):
            W[i, cbase + k] += share * ws[k]
        n_w += 1
    log(f'cánh: {len(chains)} chuỗi, {n_w} đỉnh')
    n_spring += 2 * len(chains)
    REP['wing_verts'] = n_w
if SPRINGS:
    # Cấu hình: {"groups":[{"name":"skirt","parent":"pelvis","axis":"angle|x","zMin":0.16,"zMax":0.5,"minRadius":0.09,"count":8,"links":2,
    #   "domRegion":["torso","leg"],"yMinRel":0.0,"xAbsMax":0.12}]}; z, bán kính, y, x tính theo PHẦN CHIỀU CAO (mặc định, "frac": false = mét).
    SP = json.load(open(SPRINGS, encoding='utf-8'))
    cx, cy = H['pelvis'][0], H['pelvis'][1]
    # Vạt đạo bào: ở giữa (trước/sau) bám hông, ra ngoài mới bám đùi cùng phía; tránh vạt bị xé khi hai chân tách nhau.
    sgn_l = 1.0 if T['thigh_l']['head'][0] > 0 else -1.0
    SLEEVE = np.zeros(NV, bool)
    SL = SP.get('sleeve', {} if BIND_A else None)  # chế độ A: tay buông xuống nên đầu tay áo rơi vào vùng robe → luôn phân loại tay áo
    if SL is not None:
        # NV3-B: voan tay áo rộng (tấm vải treo từ cẳng tay xuống gấu) KHÔNG được để `robe` ghi đè sang đùi/cẳng chân: phân loại bằng khoảng cách
        # trên lưới (geodesic): đỉnh nào "gần tay hơn hông" theo đường đi trên mặt lưới thì là voan tay áo. Trọng số: bám cung tay theo độ gần trục tay,
        # phần còn lại về hông; lò xo tay áo (`limbs`) lo phần chuyển động trễ.
        import heapq

        def geod(seeds):
            d = np.full(NV, 1e9)
            h = []
            for s0 in seeds:
                d[s0] = 0.0
                heapq.heappush(h, (0.0, int(s0)))
            while h:
                dd, u = heapq.heappop(h)
                if dd > d[u]:
                    continue
                for w2 in adj[u]:
                    nd = dd + float(np.linalg.norm(VP[u] - VP[w2]))
                    if nd < d[w2]:
                        d[w2] = nd
                        heapq.heappush(h, (nd, w2))
            return d

        hip_axis = seg_dist(VP, Fp_HEAD['pelvis'], Fp_HEAD['spine_02'])
        d_hip = geod(np.where(hip_axis < SL.get('hipR', 0.09) * height)[0])
        for sd in 'lr':
            arm_axis = seg_dist(VP, Fp_HEAD[f'lowerarm_{sd}'], Fp_TAIL[f'hand_{sd}'])
            d_arm = geod(np.where(arm_axis < SL.get('armR', 0.05) * height)[0])
            on_side = ((VP[:, 0] - cx) * sgn_l > 0) == (sd == 'l')
            SLEEVE |= on_side & (d_arm < d_hip - SL.get('margin', 0.0) * height)
        log(f'voan tay áo (geodesic): {int(SLEEVE.sum())}/{NV} đỉnh')
        R_S = SL.get('falloff', 0.12) * height
        for i in np.where(SLEEVE)[0]:
            sd = 'l' if (VP[i][0] - cx) * sgn_l > 0 else 'r'
            names = [f'upperarm_{sd}', f'lowerarm_{sd}', f'hand_{sd}']
            dd = np.array([seg_dist(VP[i][None], Fp_HEAD[n], Fp_TAIL[n])[0] for n in names])
            iw = 1.0 / (dd ** 2 + 1e-4)
            iw /= iw.sum()
            g = float(math.exp(-((dd.min() / max(R_S, 1e-6)) ** 2)))
            W[i] = 0
            for n, wv in zip(names, iw):
                W[i, IDX[n]] = g * wv
            W[i, IDX['pelvis']] += (1 - g) * SL.get('hipShare', 1.0)
            W[i, IDX['spine_02']] += (1 - g) * (1 - SL.get('hipShare', 1.0))
    RB = SP.get('robe')
    if RB:
        n_rb = 0
        for i in range(NV):
            x, y, z = VP[i]
            if SLEEVE[i] or not (RB['zMin'] * height <= z <= RB['zMax'] * height) or math.hypot(x - cx, y - cy) < RB['minRadius'] * height:
                continue
            zlo_r, zhi_r = RB['zMin'] * height, RB['zMax'] * height
            tz = (z - zlo_r) / max(zhi_r - zlo_r, 1e-6)  # 0 ở gấu, 1 ở hông
            sd = 'l' if (x - cx) * sgn_l > 0 else 'r'
            W[i] = 0
            if 'front' in RB:
                # Vạt trước theo đùi (gấu phủ lên gối khi ngồi), vạt sau theo hông + lò xo; trái/phải nội suy liên tục theo x.
                fb = float(np.clip((cy - y) / (0.08 * height) + 0.5, 0, 1))  # 1 = trước (−Y), 0 = sau
                hem = (RB['back'] + (RB['front'] - RB['back']) * fb) * (1 - tz) ** RB.get('pow', 0.7)
                lshare = 0.5 + 0.5 * float(np.clip((x - cx) * sgn_l / (RB['xOuter'] * height), -1, 1))
                lowk = float(np.clip((0.32 * height - z) / (0.1 * height), 0, 1)) * RB.get('calf', 0.4)
                W[i, IDX['pelvis']] = 1 - hem
                W[i, IDX['thigh_l']] = hem * lshare * (1 - lowk)
                W[i, IDX['thigh_r']] = hem * (1 - lshare) * (1 - lowk)
                W[i, IDX['calf_l']] = hem * lshare * lowk
                W[i, IDX['calf_r']] = hem * (1 - lshare) * lowk
            else:
                wgt = float(np.clip((abs(x - cx) - RB['xInner'] * height) / max((RB['xOuter'] - RB['xInner']) * height, 1e-6), 0, 1)) * RB.get('outerShare', 0.7)
                W[i, IDX['pelvis']] = 1 - wgt
                lowk = float(np.clip((0.32 * height - z) / (0.1 * height), 0, 1))
                W[i, IDX['thigh_' + sd]] = wgt * (1 - 0.5 * lowk)
                W[i, IDX['calf_' + sd]] = wgt * 0.5 * lowk
            n_rb += 1
        log(f'vạt áo: {n_rb} đỉnh bám hông/đùi theo khoảng cách ngang')
    domreg = np.array([REGION_OF(COLS[i]) for i in W.argmax(axis=1)])
    Wx = W.copy()
    # Tay áo rộng: chuỗi lò xo dọc cẳng tay (từ `tMin` tới cổ tay), chia cung quanh trục tay; quán tính làm ống tay lắc theo tay.
    # Cấu hình: {"name":"sleeve","limb":["lowerarm_l","lowerarm_r"],"tMin":0.3,"minRadius":0.035,"count":4,"links":2,"share":0.7}
    for g in SP.get('limbs', []):
        f = height if g.get('frac', True) else 1.0
        for bone in g['limb']:
            ax_a, ax_b = Fp_HEAD[bone], Fp_TAIL[bone]
            axv = ax_b - ax_a
            L = float(np.linalg.norm(axv))
            if L < 1e-6:
                continue
            ax_u = axv / L
            u = np.cross(ax_u, [0.0, 0.0, 1.0] if abs(ax_u[2]) < 0.9 else [1.0, 0.0, 0.0])
            u /= np.linalg.norm(u)
            vv = np.cross(ax_u, u)
            cols = [COLS.index(bone), COLS.index(bone.replace('lowerarm', 'lowerarm_twist')) if 'lowerarm' in bone else COLS.index(bone)]
            wsum = Wx[:, cols[0]] + (Wx[:, cols[1]] if cols[1] != cols[0] else 0)
            rel = VP - ax_a
            tt = rel @ ax_u / L
            radial = np.linalg.norm(rel - np.outer(tt * L, ax_u), axis=1)
            sel = np.where((wsum > 0.3) & (tt >= g['tMin']) & (radial >= g.get('minRadius', 0.03) * f))[0]
            if len(sel) == 0:
                log(f"lò xo {g['name']} {bone}: không có đỉnh nào")
                continue
            cnt, links = g.get('count', 4), g.get('links', 2)
            ang = np.arctan2(rel[sel] @ vv, rel[sel] @ u)
            cen = [-math.pi + 2 * math.pi * (k + 0.5) / cnt for k in range(cnt)]
            names = []
            rr_all = float(np.median(radial[sel]))
            for k in range(cnt):
                d = math.cos(cen[k]) * u + math.sin(cen[k]) * vv
                top = ax_a + ax_u * L * g['tMin'] + d * rr_all
                bot = ax_a + ax_u * L * 1.02 + d * rr_all
                prev, prev_n = top, bone
                for l in range(links):
                    nxt = top + (bot - top) * (l + 1) / links
                    nm = f"dtl_o_{g['name']}_{bone}_{k}_{l}"
                    add_bone(nm, prev_n, prev, nxt)
                    names.append(nm)
                    prev, prev_n = nxt, nm
                    n_spring += 1
            base = len(COLS)
            COLS += names
            Wx = np.hstack([Wx, np.zeros((NV, len(names)))])
            for j, vi in enumerate(sel):
                depth = float(np.clip((tt[vi] - g['tMin']) / max(1.0 - g['tMin'], 1e-6), 0, 1))
                fr = g.get('share', 0.7) * min(1.0, depth / 0.35)
                if fr <= 0:
                    continue
                dd = np.abs(ang[j] - np.array(cen))
                dd = np.minimum(dd, 2 * math.pi - dd)
                o2 = list(np.argsort(dd)[:2])
                ws = [dd[o2[1]], dd[o2[0]]]
                sm = sum(ws) or 1.0
                li = min(links - 1, int(depth * links))
                Wx[vi, :base] *= (1 - fr)
                for kk, wv in zip(o2, ws):
                    Wx[vi, base + kk * links + li] += fr * wv / sm
    for g in SP['groups']:
        f = height if g.get('frac', True) else 1.0
        zlo, zhi, rmin = g['zMin'] * f, g['zMax'] * f, g.get('minRadius', 0.0) * f
        regs = g.get('domRegion')
        sel = np.array([i for i in range(NV) if zlo <= VP[i][2] <= zhi and math.hypot(VP[i][0] - cx, VP[i][1] - cy) >= rmin
                        and (regs is None or domreg[i] in regs)
                        and (g.get('tex') != 'hair' or (HAIRV is not None and HAIRV[i]))
                        and VP[i][1] - cy >= g.get('yMinRel', -9.0) * f and abs(VP[i][0] - cx) <= g.get('xAbsMax', 9.0) * f], int)
        if len(sel) == 0:
            log(f"lò xo {g['name']}: không có đỉnh nào (y rel max {float((VP[:, 1] - cy).max()):.3f}, ngưỡng {g.get('yMinRel', -9.0) * f:.3f})")
            continue
        cnt, links = g.get('count', 6), g.get('links', 2)
        if g.get('axis', 'angle') == 'angle':
            coord = np.array([math.atan2(VP[i][1] - cy, VP[i][0] - cx) for i in sel])
            cen = [-math.pi + 2 * math.pi * (k + 0.5) / cnt for k in range(cnt)]
            wrap = 2 * math.pi
        else:
            coord = VP[sel, 0]
            lo_, hi_ = float(coord.min()), float(coord.max())
            cen = [lo_ + (hi_ - lo_) * (k + 0.5) / cnt for k in range(cnt)] if cnt > 1 else [(lo_ + hi_) / 2]
            wrap = None
        span = (cen[1] - cen[0]) if cnt > 1 else 1.0
        names = []
        for k in range(cnt):
            dd = np.abs(coord - cen[k])
            if wrap:
                dd = np.minimum(dd, wrap - dd)
            m = dd < span * 0.55
            pts = VP[sel[m]] if m.any() else VP[sel]
            c = pts.mean(axis=0)
            if g.get('axis', 'angle') == 'angle':
                ang = cen[k]
                rr = max(float(np.median(np.hypot(pts[:, 0] - cx, pts[:, 1] - cy))), 1e-3)
                top = np.array([cx + rr * math.cos(ang), cy + rr * math.sin(ang), zhi])
                bot = np.array([top[0], top[1], zlo])
            else:
                top, bot = np.array([c[0], c[1], zhi]), np.array([c[0], c[1], zlo])
            prev, prev_n = top, g.get('parent', 'pelvis')
            for l in range(links):
                nxt = top + (bot - top) * (l + 1) / links
                nm = f"dtl_o_{g['name']}_{k}_{l}"
                add_bone(nm, prev_n, prev, nxt)
                names.append(nm)
                prev, prev_n = nxt, nm
                n_spring += 1
        # Trọng số: đỉnh chuyển phần `fr` từ xương cũ sang chuỗi lò xo gần nhất (nội suy hai chuỗi kề), tăng dần theo độ sâu.
        base = len(COLS)
        COLS += names
        Wx = np.hstack([Wx, np.zeros((NV, len(names)))])
        for j, vi in enumerate(sel):
            t = float(np.clip((zhi - VP[vi][2]) / max(zhi - zlo, 1e-6), 0, 1))
            fr = g.get('share', 0.95) * min(1.0, t / 0.35)
            if fr <= 0:
                continue
            dd = np.abs(coord[j] - np.array(cen))
            if wrap:
                dd = np.minimum(dd, wrap - dd)
            order_k = [0] if cnt == 1 else list(np.argsort(dd)[:2])
            ws = [1.0] if cnt == 1 else [dd[order_k[1]], dd[order_k[0]]]
            sm = sum(ws) or 1.0
            li = min(links - 1, int(t * links))
            Wx[vi, :base] *= (1 - fr)
            for kk, wv in zip(order_k, ws):
                Wx[vi, base + kk * links + li] += fr * wv / sm
    W = Wx
    for vi in range(NV):
        row = W[vi]
        if np.count_nonzero(row) > 4:
            row[row < np.sort(row)[-4]] = 0
        row /= row.sum()
bpy.ops.object.mode_set(mode='OBJECT')
REP['bones'] = len(ARM.data.bones)
REP['spring_bones'] = n_spring

# nhóm đỉnh Mannequin + modifier
BODY.vertex_groups.clear()
vgs = {n: BODY.vertex_groups.new(name=n) for n in COLS}
for vi in range(NV):
    for bi in np.nonzero(W[vi])[0]:
        vgs[COLS[bi]].add([vi], float(W[vi, bi]), 'REPLACE')
BODY.parent = ARM
BODY.parent_type = 'OBJECT'
BODY.matrix_parent_inverse = Matrix.Identity(4)
am = BODY.modifiers.new('Armature', 'ARMATURE')
am.object = ARM

# ---------- 5. LOD, texture ----------
LODS = [BODY]
for lvl, ratio in ((1, 0.5), (2, 0.2)):
    ob = BODY.copy()
    ob.data = BODY.data.copy()
    ob.name = f'{ID}_lod{lvl}'
    bpy.context.collection.objects.link(ob)
    md = ob.modifiers.new('dec', 'DECIMATE')
    md.ratio = ratio
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='dec')
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    ob.parent = ARM
    LODS.append(ob)
for o in LODS:
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
REP['tris'] = [len(o.data.polygons) for o in LODS]
for img in bpy.data.images:
    if img.type == 'IMAGE' and max(img.size) > TEXMAX and img.users:
        k = TEXMAX / max(img.size)
        img.scale(int(img.size[0] * k), int(img.size[1] * k))
        log(f'texture {img.name} → {tuple(img.size)}')
REP['textures'] = {i.name: list(i.size) for i in bpy.data.images if i.users and i.type == 'IMAGE' and i.size[0] > 0}

# ---------- 6. kiểm ----------
POSES = [  # (clip, tỉ lệ thời gian)
    ('Idle_Loop', 0.0), ('Jog_Fwd_Loop', 0.25), ('Jog_Fwd_Loop', 0.75), ('Sword_Attack', 0.35), ('Sword_Attack', 0.6), ('Sitting_Idle_Loop', 0.0),
    ('Death01', 1.0), ('Roll', 0.4), ('Jump_Loop', 0.5), ('Spell_Simple_Idle_Loop', 0.5), ('Hit_Chest', 0.3), ('Crouch_Fwd_Loop', 0.5),
]


REST_FIX = {}
if BIND_A:
    for n in order:
        p = T[n]['parent']
        if p is None or n not in FT_REST:
            continue
        qT = Matrix(FT_REST[p].T.tolist()) @ Matrix(FT_REST[n].tolist())          # (khung cha mẫu)⁻¹ · khung xương mẫu
        qA = Matrix(FA_FRAME[p].T.tolist()) @ Matrix(FA_FRAME[n].tolist())
        REST_FIX[n] = (qA.inverted() @ qT).to_quaternion()


def find_act(name):
    for k, a in ACTIONS.items():
        if k == name or re.sub(r'\.\d+$', '', k) == name or k.endswith('|' + name):
            return a
    return None


def set_pose(clip, t):
    if clip is None:
        ARM.animation_data_create()
        ARM.animation_data.action = None
        for pb in ARM.pose.bones:
            pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), (1, 0, 0, 0), (1, 1, 1)
        bpy.context.view_layer.update()
        return
    act = find_act(clip)
    ARM.animation_data_create()
    ARM.animation_data.action = act
    if hasattr(ARM.animation_data, 'action_slot') and getattr(act, 'slots', None) and len(act.slots):
        ARM.animation_data.action_slot = act.slots[0]
    f0, f1 = act.frame_range
    bpy.context.scene.frame_set(int(round(f0 + (f1 - f0) * t)))
    bpy.context.view_layer.update()
    if BIND_A:
        # Clip UAL là delta so với khung nghỉ của MẪU (T). Khung nghỉ của ta là A nên đổi delta: basis_A = (Qrel_A⁻¹ · Qrel_T) · basis_T,
        # Qrel = (khung cha)⁻¹ · (khung xương); nhờ đó hướng thế giới của từng xương đúng như clip gốc (giống việc client phát clip tuyệt đối).
        for pb in ARM.pose.bones:
            c = REST_FIX.get(pb.name)
            if c is not None:
                pb.rotation_mode = 'QUATERNION'
                pb.rotation_quaternion = c @ pb.rotation_quaternion
        ARM.animation_data.action = None
        bpy.context.view_layer.update()


def region_col(n):
    """Vùng (kèm phía trái/phải) của một cột trọng số, kể cả xương twist (`<limb>_twist_<l|r>`) và lò xo tay áo (`dtl_o_sleeve_lowerarm_<l|r>_…`)."""
    m = re.search(r'(upperarm|lowerarm|clavicle|hand|thumb|index|middle|ring|pinky)(?:_\d+)?(?:_twist)?_([lr])(?:_|$)', n)
    if m:
        return 'arm_' + m[2]
    m = re.match(r'(thigh|calf|foot|ball)(?:_twist)?_([lr])$', n)
    if m:
        return 'leg_' + m[2]
    return 'torso'


REGION = {n: region_col(n) for n in COLS}
dom = np.array([REGION[COLS[i]] for i in W.argmax(axis=1)])
PAIRS = [('arm_l', 'torso'), ('arm_r', 'torso'), ('arm_l', 'arm_r'), ('leg_l', 'leg_r'), ('arm_l', 'leg_l'), ('arm_r', 'leg_r')]


def pen_count():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = BODY.evaluated_get(dg)
    m = ev.to_mesh()
    try:
        co = [v.co.copy() for v in m.vertices]
        polys = [tuple(p.vertices) for p in m.polygons]  # mesh gốc đã tam giác hóa; decimate giữ tam giác
        trees = {}
        for r in set(dom):
            ids = [i for i, p in enumerate(polys) if sum(1 for v in p if dom[v] == r) >= 2]
            trees[r] = (BVHTree.FromPolygons(co, [polys[i] for i in ids]), ids) if ids else None
        total = {}
        for a, b in PAIRS:
            if not trees.get(a) or not trees.get(b):
                continue
            ta, ia = trees[a]
            tb, ib = trees[b]
            c = 0
            for x, y in ta.overlap(tb):
                if not (set(polys[ia[x]]) & set(polys[ib[y]])):
                    c += 1
            total[f'{a}×{b}'] = c
        return total
    finally:
        ev.to_mesh_clear()


# Số đỉnh vải xuyên vào thân (N-6): đo bằng viên nang thân (hông, ngực, đùi, cẳng, cánh/cẳng tay) lấy từ xương ở từng tư thế; chỉ đếm đỉnh
# nằm NGOÀI viên nang ở tư thế nghỉ nhưng nằm TRONG ở tư thế đang đo (đỉnh da/giày vốn nằm trong viên nang của chính nó không tính).
# Khác `pen_count` (cặp mặt chồng giữa các vùng trọng số, nhạy với cách chia vùng của chính vạt).
KC = height / 1.8
CAPS = [('pelvis', 'spine_01', 0.11), ('spine_01', 'spine_03', 0.13), ('spine_03', 'neck_01', 0.10)]
for _sd in 'lr':
    CAPS += [(f'thigh_{_sd}', f'calf_{_sd}', 0.085), (f'calf_{_sd}', f'foot_{_sd}', 0.06), (f'upperarm_{_sd}', f'lowerarm_{_sd}', 0.05),
             (f'lowerarm_{_sd}', f'hand_{_sd}', 0.04)]


def cap_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def cap_inside():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = BODY.evaluated_get(dg)
    m = ev.to_mesh()
    try:
        P = np.array([v.co[:] for v in m.vertices], float)
    finally:
        ev.to_mesh_clear()
    mw = ARM.matrix_world
    ins = np.zeros(len(P), bool)
    for a_, b_, r in CAPS:
        pa = np.array(mw @ ARM.pose.bones[a_].head)
        pb = np.array(mw @ ARM.pose.bones[b_].head)
        ins |= cap_dist(P, pa, pb) < r * KC * 0.9
    return ins


set_pose(None, 0)
cap_rest = cap_inside()
cap_pen = []
for clip, t in POSES:
    if find_act(clip) is None:
        cap_pen.append(None)
        continue
    set_pose(clip, t)
    cap_pen.append(int((cap_inside() & ~cap_rest).sum()))
set_pose(None, 0)
REP['cap_pen'] = cap_pen
log('đỉnh vải xuyên viên nang thân: ' + ', '.join(f"{c[0]}@{c[1]}={n}" for c, n in zip(POSES, cap_pen)) + f' | tổng {sum(n or 0 for n in cap_pen)}')
set_pose(None, 0)
base = pen_count()
pen = []
for clip, t in POSES:
    if find_act(clip) is None:
        pen.append({'pose': f'{clip}@{t}', 'error': 'không có clip'})
        continue
    set_pose(clip, t)
    c = pen_count()
    delta = {k: max(0, c.get(k, 0) - base.get(k, 0)) for k in c}
    pen.append({'pose': f'{clip}@{t}', 'pairs': c, 'delta': sum(delta.values())})
REP['rest_overlap'] = base
REP['pen_poses'] = pen
set_pose(None, 0)
log('xuyên thân (tăng so với tư thế nghỉ): ' + ', '.join(f"{p['pose']}={p.get('delta', 'x')}" for p in pen))


def render_sheet(outdir):
    os.makedirs(outdir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x, sc.render.resolution_y = 320, 440
    sc.render.film_transparent = False
    sc.world = bpy.data.worlds.new('w')
    sc.world.color = (0.55, 0.57, 0.6)
    cam_d = bpy.data.cameras.new('c')
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = max(2.3, height * 1.28)
    cam = bpy.data.objects.new('c', cam_d)
    bpy.context.collection.objects.link(cam)
    sc.camera = cam
    for o in LODS[1:]:
        o.hide_render = True
    sheet = [(None, 0.0), ('Idle_Loop', 0.0), ('Jog_Fwd_Loop', 0.25), ('Sword_Attack', 0.4), ('Sitting_Idle_Loop', 0.0), ('Death01', 1.0),
             ('Roll', 0.4), ('Spell_Simple_Idle_Loop', 0.5)]
    tiles = []
    for i, (clip, t) in enumerate(sheet):
        set_pose(clip, t)
        zc = height * 0.5 + 0.0
        cam.location = (0, -6, zc)
        cam.rotation_euler = (math.radians(90), 0, 0)
        p = os.path.join(outdir, f'_t{i}.png')
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        tiles.append(p)
    set_pose(None, 0)
    imgs = [bpy.data.images.load(p) for p in tiles]
    w, h = imgs[0].size
    sheet_px = np.zeros((h * 2, w * 4, 4), np.float32)
    for i, im in enumerate(imgs):
        a = np.array(im.pixels[:], np.float32).reshape(h, w, 4)
        r, c = divmod(i, 4)
        sheet_px[(1 - r) * h:(2 - r) * h, c * w:(c + 1) * w] = a
    out = bpy.data.images.new('sheet', w * 4, h * 2, alpha=True)
    out.pixels = sheet_px.ravel().tolist()
    out.filepath_raw = os.path.join(outdir, f'{ID}-sheet.png')
    out.file_format = 'PNG'
    out.save()
    for p in tiles:
        os.remove(p)
    log(f'tờ khung → {out.filepath_raw}')


def render_views(outdir):
    """Tờ góc nhìn ở tư thế nghỉ: toàn thân trước / 3-4 / bên / sau, cận mặt trước + 3-4, hông trước + sau (soát đối xứng vạt, mặt, tay)."""
    os.makedirs(outdir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x, sc.render.resolution_y = 320, 440
    sc.render.film_transparent = False
    sc.world = bpy.data.worlds.new('w2')
    sc.world.color = (0.55, 0.57, 0.6)
    cam_d = bpy.data.cameras.new('c2')
    cam_d.type = 'ORTHO'
    cam = bpy.data.objects.new('c2', cam_d)
    bpy.context.collection.objects.link(cam)
    sc.camera = cam
    for o in LODS[1:]:
        o.hide_render = True
    set_pose(None, 0)
    if '--debug-pose' in argv:
        set_pose(argv[argv.index('--debug-pose') + 1], 0.0)
    if '--debug-weights' in argv:
        # Tô màu theo xương trội: tay trái đỏ, tay phải cam, chân trái xanh dương, chân phải lam nhạt, thân lục, lò xo tím, twist vàng.
        pal = {'arm_l': (1, 0.1, 0.1), 'arm_r': (1, 0.6, 0.1), 'leg_l': (0.1, 0.2, 1), 'leg_r': (0.1, 0.9, 1), 'torso': (0.2, 0.8, 0.2)}
        ca = BODY.data.color_attributes.new('dbg', 'FLOAT_COLOR', 'POINT')
        for vi in range(NV):
            cn = COLS[int(W[vi].argmax())]
            col = (0.9, 0.2, 0.9) if cn.startswith('dtl_o_') else (1, 1, 0.1) if 'twist' in cn else pal[REGION[cn]]
            ca.data[vi].color = (*col, 1.0)
        sc.display.shading.color_type = 'VERTEX'
        hv = np.where((VP[:, 2] > 0.86 * height) & (np.abs(VP[:, 0] - cx) < 0.06 * height))[0]
        tot = W[hv].sum(0)
        log('DBG đầu: ' + ', '.join(f'{COLS[i]}={tot[i] / max(len(hv), 1):.2f}' for i in np.argsort(-tot)[:6]) + f' ({len(hv)} đỉnh); Head {Fp_HEAD["Head"].round(2)}→{Fp_TAIL["Head"].round(2)} cao {height:.2f}')
        for sd in 'lr':
            log(f'DBG tay {sd}: upperarm {Fp_HEAD["upperarm_" + sd].round(2)} lowerarm {Fp_HEAD["lowerarm_" + sd].round(2)} hand {Fp_HEAD["hand_" + sd].round(2)}→{Fp_TAIL["hand_" + sd].round(2)}')
    full = max(2.3, height * 1.28)
    views = [(0, full, 0.5), (45, full, 0.5), (90, full, 0.5), (180, full, 0.5),
             (0, height * 0.24, 0.93), (35, height * 0.24, 0.93), (0, height * 0.42, 0.42), (180, height * 0.42, 0.42)]
    tiles = []
    for i, (az, scale, zf) in enumerate(views):
        cam_d.ortho_scale = scale
        a = math.radians(az)
        cam.location = (6 * math.sin(a), -6 * math.cos(a), height * zf)
        cam.rotation_euler = (math.radians(90), 0, a)
        pth = os.path.join(outdir, f'_v{i}.png')
        sc.render.filepath = pth
        bpy.ops.render.render(write_still=True)
        tiles.append(pth)
    imgs = [bpy.data.images.load(q) for q in tiles]
    w, h = imgs[0].size
    px = np.zeros((h * 2, w * 4, 4), np.float32)
    for i, im in enumerate(imgs):
        arr = np.array(im.pixels[:], np.float32).reshape(h, w, 4)
        r, c = divmod(i, 4)
        px[(1 - r) * h:(2 - r) * h, c * w:(c + 1) * w] = arr
    out = bpy.data.images.new('views', w * 4, h * 2, alpha=True)
    out.pixels = px.ravel().tolist()
    out.filepath_raw = os.path.join(outdir, f'{ID}-views.png')
    out.file_format = 'PNG'
    out.save()
    for q in tiles:
        os.remove(q)
    log(f'tờ góc nhìn → {out.filepath_raw}')


if SHEET:
    render_sheet(SHEET)
    if '--views' in argv:
        render_views(SHEET)
    if '--debug-hand' in argv:
        # Ảnh cận bàn tay trái ở tư thế `--debug-pose` (mặc định Idle): thấy ngón có bị kéo dài/cong sai không.
        sc = bpy.context.scene
        sc.render.engine = 'BLENDER_WORKBENCH'
        sc.display.shading.light = 'STUDIO'
        sc.display.shading.color_type = 'TEXTURE'
        sc.render.resolution_x, sc.render.resolution_y = 480, 480
        set_pose(argv[argv.index('--debug-pose') + 1] if '--debug-pose' in argv else 'Idle_Loop', 0.0)
        hp = np.array(ARM.matrix_world @ ARM.pose.bones['hand_l'].head)
        cd = bpy.data.cameras.new('c3')
        cd.type = 'ORTHO'
        cd.ortho_scale = 0.55
        cam3 = bpy.data.objects.new('c3', cd)
        bpy.context.collection.objects.link(cam3)
        sc.camera = cam3
        for o in LODS[1:]:
            o.hide_render = True
        for i, az in enumerate((0, 90)):
            a_ = math.radians(az)
            cam3.location = (hp[0] + 6 * math.sin(a_), hp[1] - 6 * math.cos(a_), hp[2] - 0.05)
            cam3.rotation_euler = (math.radians(90), 0, a_)
            sc.render.filepath = os.path.join(SHEET, f'{ID}-hand{i}.png')
            bpy.ops.render.render(write_still=True)

# ---------- xuất ----------
# optimize.ts tự sinh LOD từ LOD0 theo ngân sách (--keep-lods để giữ LOD của script này).
if '--keep-lods' not in argv:
    for o in LODS[1:]:
        bpy.data.objects.remove(o, do_unlink=True)
ARM.name = f'{ID}_rig'
ARM.data.name = f'{ID}_rig'
if ARM.animation_data:
    ARM.animation_data_clear()
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
for o in list(bpy.data.objects):
    if o.type == 'CAMERA':
        bpy.data.objects.remove(o, do_unlink=True)
if REPORT:
    json.dump(REP, open(REPORT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if not NO_EXPORT:
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', export_yup=True, export_skins=True, export_animations=False,
        export_extras=True, export_image_format='AUTO', use_selection=False,
    )
    log(f'xuất {OUT} {os.path.getsize(OUT) // 1024} KB; ' + json.dumps({k: REP[k] for k in ('tris', 'bones', 'spring_bones')}))
    if BIND_A:
        # Đặt lại góc nghỉ cục bộ của các nút xương = template UAL (clip phát tuyệt đối nên không đổi, nhưng mã client đọc "tư thế nghỉ" của xương);
        # ma trận bind nghịch đảo (A) giữ nguyên nên lưới vẫn đứng ở tư thế A khi đang phát clip.
        import struct

        def read_glb(path):
            raw = open(path, 'rb').read()
            jl = struct.unpack('<I', raw[12:16])[0]
            return raw, json.loads(raw[20:20 + jl]), jl

        _, tj, _ = read_glb(TEMPLATE)
        trot = {n['name']: n.get('rotation', [0, 0, 0, 1]) for n in tj['nodes'] if 'name' in n}
        raw, gj, jl = read_glb(OUT)
        npatched = 0
        for nd in gj['nodes']:
            nm = nd.get('name')
            if nm in trot and nm not in ('root', 'Armature'):
                nd['rotation'] = [float(x) for x in trot[nm]]
                npatched += 1
        jb = json.dumps(gj, separators=(',', ':')).encode('utf8')
        jb += b' ' * ((4 - len(jb) % 4) % 4)
        rest = raw[20 + jl:]
        out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(jb) + len(rest)) + struct.pack('<I', len(jb)) + b'JSON' + jb + rest
        open(OUT, 'wb').write(out)
        log(f'bind A: đặt lại góc nghỉ cục bộ của {npatched} nút xương theo template')

