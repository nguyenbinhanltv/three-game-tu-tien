# Phần phụ của nhân vật người (M3-2, M3-10), nạp bằng runpy từ anim_biped_extra.py (bước import.post).
#
# - seam_keys / patch_hole: vá lỗ trên lưng áo chỗ lưới kiếm vừa tách ra (Tripo không dựng vải dưới kiếm). Viền lỗ là các
#   cạnh biên của thân nằm trên đường nối cũ kiếm–thân; vá bằng một quạt tam giác dùng chính đỉnh viền (không hở mép),
#   đỉnh giữa đẩy nhẹ ra ngoài theo pháp tuyến, cả tấm lấy một điểm màu vải của viền (phần lớn nằm dưới bao kiếm).
# - sword_socket: tách chuôi khỏi bao (theo trục kiếm, `hilt` = phần đầu trên), dựng lưỡi thủ tục nằm gọn trong bao, gán
#   chuôi + lưỡi 100% vào xương mới `dtl_sword` (con của xương lưng). Client đổi cha xương này giữa lưng và tay phải để
#   rút/tra kiếm: không thêm mesh/draw call, mọi LOD dùng chung skin. Ghi extras `dtl.sword` (tọa độ glTF lúc nghỉ):
#   tâm chuôi `grip`, hướng mũi `tip`, hướng lưỡi `edge`.
# - skirt_springs: 4 xương lò xo vạt áo (trước/sau × trái/phải) con của hông. Trọng số cộng thêm theo độ cao (0 ở thắt
#   lưng, đủ ở gấu áo) và theo góc quanh hông; ở tư thế nghỉ xương đứng yên nên dáng không đổi. Client mô phỏng
#   (apps/client/src/game/character/spring.ts). Ghi extras `dtl.springs`: tên xương + đuôi (tọa độ glTF lúc nghỉ).
# - steel_cell / paint_cells: ô trống trong UV atlas để tô màu thép cho lưỡi kiếm (tô sau bước recolor).

import json
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector

SWORD_BONE = 'dtl_sword'
UV_GRID = 128


def to_gltf(v):
    return [round(float(v[0]), 4), round(float(v[2]), 4), round(float(-v[1]), 4)]


def set_extra(obj, key, value):
    data = json.loads(obj.get('dtl', '{}'))
    data[key] = value
    obj['dtl'] = json.dumps(data, separators=(',', ':'))


def _key(mw, co):
    return tuple(round(c, 4) for c in (mw @ co))


def seam_keys(mesh, face_ids):
    """Vị trí (làm tròn) các đỉnh nằm chung giữa mặt kiếm và mặt thân, trước khi tách."""
    me, mw = mesh.data, mesh.matrix_world
    fs = set(face_ids)
    a, b = set(), set()
    for p in me.polygons:
        dst = a if p.index in fs else b
        for v in p.vertices:
            dst.add(_key(mw, me.vertices[v].co))
    return a & b


def _texel(img_px, W, H, uv):
    return img_px[min(H - 1, max(0, int(uv[1] * H))), min(W - 1, max(0, int(uv[0] * W))), :3]


def _color_pixels(mesh):
    for n in mesh.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and any(l.to_socket.name == 'Base Color' for l in n.outputs[0].links):
            W, H = n.image.size
            px = np.empty(W * H * 4, np.float32)
            n.image.pixels.foreach_get(px)
            return px.reshape(H, W, 4), W, H
    return None, 0, 0


def patch_hole(mesh, seam, sword, fail):
    """Vá các lỗ thân có viền nằm trên đường nối cũ với kiếm. `sword`: chỉ số đỉnh thuộc kiếm (không tính là thân)."""
    me, mw = mesh.data, mesh.matrix_world
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    dl = bm.verts.layers.deform.verify()
    uvl = bm.loops.layers.uv.active
    key = {v.index: _key(mw, v.co) for v in bm.verts}
    body = [f for f in bm.faces if not any(v.index in sword for v in f.verts)]
    count, rep, nrm = {}, {}, {}
    for f in body:
        for e in f.edges:
            k = frozenset((key[e.verts[0].index], key[e.verts[1].index]))
            count[k] = count.get(k, 0) + 1
        for v in f.verts:
            rep.setdefault(key[v.index], (v, f))
            k = key[v.index]
            nrm[k] = nrm.get(k, Vector()) + mw.to_3x3() @ f.normal
    edges = [tuple(k) for k, c in count.items() if c == 1 and len(k) == 2 and all(x in seam for x in k)]
    adj = {}
    for a, b in edges:
        adj.setdefault(a, set()).add(b)
        adj.setdefault(b, set()).add(a)
    seen, loops = set(), []
    for s in adj:
        if s in seen:
            continue
        comp, stack = [], [s]
        seen.add(s)
        while stack:
            x = stack.pop()
            comp.append(x)
            for y in adj[x]:
                if y not in seen:
                    seen.add(y)
                    stack.append(y)
        if len(comp) >= 4:
            loops.append(comp)
    px, W, H = _color_pixels(mesh)
    inv = mw.inverted()
    out = []
    for comp in loops:
        P = np.array(comp)
        c = P.mean(0)
        n = Vector()
        for k in comp:
            n += nrm[k]
        n.normalize()
        # Xếp viền theo góc quanh tâm trong mặt phẳng vuông góc pháp tuyến trung bình (lỗ gần hình sao).
        u = Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))
        u = (u - n * u.dot(n)).normalized()
        w = n.cross(u)
        ring = sorted(comp, key=lambda k: math.atan2((Vector(k) - Vector(c)).dot(w), (Vector(k) - Vector(c)).dot(u)))
        radius = float(np.mean(np.linalg.norm(P - c, axis=1)))
        if radius > 0.25:
            fail(f'patch_hole: lỗ bán kính {radius:.2f}m, quá lớn để vá bằng quạt')
        center = bm.verts.new(inv @ (Vector(c) + n * (0.12 * radius)))
        # Trọng số đỉnh giữa: trung bình các đỉnh viền, giữ 4 xương lớn nhất.
        acc = {}
        for k in ring:
            for g, wt in rep[k][0][dl].items():
                acc[g] = acc.get(g, 0.0) + wt
        top = sorted(acc.items(), key=lambda x: -x[1])[:4]
        tot = sum(x[1] for x in top) or 1.0
        for g, wt in top:
            center[dl][g] = wt / tot
        # Một điểm màu vải cho cả tấm: đỉnh viền có màu gần trung vị nhất.
        uvs = []
        for k in ring:
            v, f = rep[k]
            loop = next(l for l in f.loops if l.vert == v)
            uvs.append(loop[uvl].uv.copy())
        if px is not None:
            cols = np.array([_texel(px, W, H, uv) for uv in uvs])
            med = np.median(cols, 0)
            cloth = uvs[int(np.argmin(np.linalg.norm(cols - med, axis=1)))]
        else:
            cloth = uvs[0]
        faces = []
        for i in range(len(ring)):
            a, b = rep[ring[i]][0], rep[ring[(i + 1) % len(ring)]][0]
            if a == b:
                continue
            try:
                f = bm.faces.new((a, b, center))
            except ValueError:
                continue
            faces.append(f)
        if not faces:
            continue
        flip = sum(1 for f in faces if f.normal.dot(inv.to_3x3() @ n) < 0) > len(faces) / 2
        for f in faces:
            if flip:
                f.normal_flip()
            f.material_index = rep[ring[0]][1].material_index
            f.smooth = True
            for l in f.loops:
                l[uvl].uv = cloth
        out.append({'ring': len(ring), 'faces': len(faces), 'radius': round(radius, 3), 'center': [round(float(x), 3) for x in c]})
    bm.to_mesh(me)
    bm.free()
    me.update()
    return out


def _pca(P):
    c = P.mean(0)
    _, _, vt = np.linalg.svd(P - c)
    return c, vt


def free_uv_block(me, size=3, grid=UV_GRID, reserved=()):
    """Ô vuông size×size (lưới grid×grid trên UV) không tam giác UV nào phủ, tính cả lề 1 ô quanh mỗi tam giác."""
    occ = np.zeros((grid, grid), bool)
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        us = np.array([tuple(uv[l].uv) for l in poly.loop_indices]) * grid
        for k in range(1, len(us) - 1):
            a, b, c = us[0], us[k], us[k + 1]
            i0, j0 = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
            i1, j1 = np.floor(np.maximum(np.maximum(a, b), c)).astype(int)
            ii, jj = np.meshgrid(np.arange(max(0, i0), min(grid, i1 + 1)), np.arange(max(0, j0), min(grid, j1 + 1)))
            px, py = ii + 0.5, jj + 0.5
            d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(d) < 1e-12:
                hit = np.ones_like(px, bool)
            else:
                l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d
                l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d
                hit = (l1 >= -0.01) & (l2 >= -0.01) & (1 - l1 - l2 >= -0.01)
            occ[jj[hit], ii[hit]] = True
            for q in (a, b, c):
                occ[min(grid - 1, max(0, int(q[1]))), min(grid - 1, max(0, int(q[0])))] = True
    for ri, rj in reserved:  # ô đã cấp (size×size) trong cùng lượt
        occ[max(0, rj):rj + size, max(0, ri):ri + size] = True
    grown = occ.copy()
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            grown |= np.roll(np.roll(occ, dj, 0), di, 1)
    for j in range(1, grid - size):
        for i in range(1, grid - size):
            if not grown[j:j + size, i:i + size].any():
                return i, j
    return None


def sword_socket(mesh, arm, verts, spec, parent, fail):
    """Tách chuôi khỏi bao, dựng lưỡi trong bao, gán chuôi + lưỡi vào xương `dtl_sword` (con của `parent`).
    `verts`: chỉ số đỉnh kiếm (bao + chuôi + đảo lưới quanh kiếm) đã gán cứng vào `parent`. Trả báo cáo và ô UV cần tô."""
    me, mw = mesh.data, mesh.matrix_world
    inv = mw.inverted()
    vs = sorted(verts)
    P = np.array([tuple(mw @ me.vertices[i].co) for i in vs])
    c0, vt = _pca(P)
    ax = vt[0] if vt[0][2] > 0 else -vt[0]  # lên: về phía chuôi
    t = (P - c0) @ ax
    lo, hi = float(t.min()), float(t.max())
    cut = hi - float(spec.get('hilt', 0.28)) * (hi - lo)
    tv = dict(zip(vs, t))
    hilt_faces = [p.index for p in me.polygons if all(v in tv for v in p.vertices)
                  and np.mean([tv[v] for v in p.vertices]) > cut]
    if len(hilt_faces) < 20:
        fail(f'sword_socket: chỉ thấy {len(hilt_faces)} mặt chuôi')
    # Trục lưỡi: PCA riêng phần bao (dưới đường cắt), lưỡi bám tâm mặt cắt của bao.
    sheath = t < cut - 0.02
    cs, vs_s = _pca(P[sheath])
    bx = vs_s[0] if vs_s[0] @ ax > 0 else -vs_s[0]
    ts = (P[sheath] - cs) @ bx
    perp = P[sheath] - cs - np.outer(ts, bx)
    # Hướng bản rộng của bao = hướng lưỡi; bề dày trong lòng bao theo hướng còn lại.
    _, _, pv = np.linalg.svd(perp)
    edge = pv[0] - bx * (pv[0] @ bx)
    edge /= np.linalg.norm(edge)
    flat = np.cross(bx, edge)
    wide = float(np.percentile(np.abs(perp @ edge), 95)) * 2
    thick = float(np.percentile(np.abs(perp @ flat), 95)) * 2
    t_cut_s = float((c0 + ax * cut - cs) @ bx)
    base = cs + bx * (t_cut_s + 0.02)  # chân lưỡi ăn vào chuôi 2 cm
    tip_t = float(ts.min()) + 0.035
    length = float(t_cut_s + 0.02 - tip_t)
    width = min(0.034, wide * 0.5)
    thickness = min(0.008, thick * 0.3)
    if length < 0.3:
        fail(f'sword_socket: lưỡi chỉ dài {length:.2f}m')
    cell = free_uv_block(me)
    if cell is None:
        fail('sword_socket: atlas UV không còn ô trống để tô thép cho lưỡi')
    uc = (cell[0] + 1.5) / UV_GRID
    vc = (cell[1] + 1.5) / UV_GRID
    du = 0.45 / UV_GRID

    gi = (mesh.vertex_groups.get(SWORD_BONE) or mesh.vertex_groups.new(name=SWORD_BONE)).index
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    dl = bm.verts.layers.deform.verify()
    uvl = bm.loops.layers.uv.active
    mat = bm.faces[hilt_faces[0]].material_index
    out = bmesh.ops.split(bm, geom=[bm.faces[i] for i in hilt_faces])
    moved = {v for g in out['geom'] if isinstance(g, bmesh.types.BMFace) for v in g.verts}
    # Lưỡi: mặt cắt hình thoi (lưỡi trái, sống trên, lưỡi phải, sống dưới), thuôn về mũi.
    tipd = -bx
    rings = []
    for d, wf in ((0.0, 1.0), (length * 0.85, 0.9)):
        cen = base + tipd * d
        pts = [cen + edge * width / 2 * wf, cen + flat * thickness / 2, cen - edge * width / 2 * wf, cen - flat * thickness / 2]
        rings.append([bm.verts.new(inv @ Vector(tuple(p))) for p in pts])
    tip = bm.verts.new(inv @ Vector(tuple(base + tipd * length)))
    us = (uc - du, uc, uc + du, uc)
    blade_faces = []
    for k in range(4):
        a, b = rings[0][k], rings[0][(k + 1) % 4]
        c, d = rings[1][(k + 1) % 4], rings[1][k]
        blade_faces.append((bm.faces.new((a, b, c, d)), (us[k], us[(k + 1) % 4], us[(k + 1) % 4], us[k])))
        blade_faces.append((bm.faces.new((d, c, tip)), (us[k], us[(k + 1) % 4], uc)))
    blade_faces.append((bm.faces.new(tuple(reversed(rings[0]))), tuple(reversed(us))))
    for f, uvs in blade_faces:
        f.material_index = mat
        f.smooth = False
        for l, u in zip(f.loops, uvs):
            l[uvl].uv = (u, vc)
    bmesh.ops.recalc_face_normals(bm, faces=[f for f, _ in blade_faces])
    for v in moved | set(rings[0]) | set(rings[1]) | {tip}:
        v[dl].clear()
        v[dl][gi] = 1.0
    bm.to_mesh(me)
    bm.free()
    me.update()

    grip = c0 + ax * (cut + 0.4 * (hi - cut))
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    b = eb.new(SWORD_BONE)
    ainv = arm.matrix_world.inverted()
    b.head = ainv @ Vector(tuple(grip))
    b.tail = ainv @ Vector(tuple(grip + tipd * 0.12))
    b.parent = eb[parent]
    b.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')
    set_extra(mesh, 'sword', {'bone': SWORD_BONE, 'grip': to_gltf(grip), 'tip': to_gltf(tipd), 'edge': to_gltf(edge)})
    return {
        'hiltFaces': len(hilt_faces), 'hiltLength': round(hi - cut, 3), 'blade': {'length': round(length, 3),
        'width': round(width, 4), 'thickness': round(thickness, 4), 'sheathInner': [round(wide, 3), round(thick, 3)]},
        'uvCell': list(cell),
    }, cell


def paint_cells(mesh, cell, replace_pixels):
    """Tô ô thép cho lưỡi trong ảnh màu, ORM và normal. Cột giữa của ô: sống tối (u giữa) → lưỡi sáng (hai mép)."""
    imgs = {}
    for n in mesh.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            for role in ('color', 'orm', 'normal'):
                if n.image.name.endswith('_' + role):
                    imgs[role] = n.image
    # Kim loại vừa phải: cảnh sương sớm ít nguồn phản chiếu, metallic ~1 làm lưỡi gần như đen trong game.
    ridge = {'color': (0.66, 0.69, 0.72), 'orm': (1.0, 0.38, 0.6), 'normal': (0.5, 0.5, 1.0)}
    rim = {'color': (0.9, 0.92, 0.94), 'orm': (1.0, 0.24, 0.65), 'normal': (0.5, 0.5, 1.0)}
    done = []
    for role, img in sorted(imgs.items()):
        W, H = img.size
        px = np.empty(W * H * 4, np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(H, W, 4)
        x0, x1 = int(cell[0] / UV_GRID * W), int((cell[0] + 3) / UV_GRID * W)
        y0, y1 = int(cell[1] / UV_GRID * H), int((cell[1] + 3) / UV_GRID * H)
        uc = (cell[0] + 1.5) / UV_GRID * W
        half = 0.5 / UV_GRID * W
        for x in range(x0, x1):
            f = min(1.0, abs(x + 0.5 - uc) / half)  # 0 ở sống, 1 ở mép lưỡi
            col = [ridge[role][k] * (1 - f) + rim[role][k] * f for k in range(3)]
            px[y0:y1, x, :3] = col
            px[y0:y1, x, 3] = 1.0
        replace_pixels(img, px)
        done.append(role)
    return done


def skirt_springs(mesh, arm, spec, hips, legs, fail):
    """Thêm 4 xương lò xo vạt áo con của `hips`; `legs`: [(đầu, cuối)] các đoạn xương chân (Blender, thế giới)."""
    me, mw = mesh.data, mesh.matrix_world
    top, full, bottom = float(spec.get('top', 0.84)), float(spec.get('full', 0.35)), float(spec.get('bottom', 0.08))
    W = float(spec.get('weight', 0.6))
    r_in, r_out = spec.get('legClear', [0.05, 0.1])
    hip = arm.matrix_world @ arm.data.bones[hips].head_local
    # Trước mặt = -Y Blender, trái = +X.
    names = {'dtl_hem_fl': (1, -1), 'dtl_hem_fr': (-1, -1), 'dtl_hem_bl': (1, 1), 'dtl_hem_br': (-1, 1)}
    ang = {n: math.atan2(y, x) for n, (x, y) in names.items()}

    def smooth(e0, e1, x):
        k = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
        return k * k * (3 - 2 * k)

    def leg_dist(p):
        best = 9.0
        for a, b in legs:
            ab = b - a
            k = min(1.0, max(0.0, (p - a).dot(ab) / ab.length_squared))
            best = min(best, (p - (a + ab * k)).length)
        return best

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    ainv = arm.matrix_world.inverted()
    radius = float(spec.get('radius', 0.12))
    tails = {}
    for n, a in ang.items():
        d = Vector((math.cos(a), math.sin(a), 0))
        head = Vector((hip.x, hip.y, top)) + d * radius
        tail = Vector((hip.x, hip.y, full)) + d * (radius + 0.06)
        b = eb.new(n)
        b.head, b.tail = ainv @ head, ainv @ tail
        b.parent = eb[hips]
        b.use_deform = True
        tails[n] = tail
    bpy.ops.object.mode_set(mode='OBJECT')
    gi = {n: (mesh.vertex_groups.get(n) or mesh.vertex_groups.new(name=n)).index for n in names}
    bm = bmesh.new()
    bm.from_mesh(me)
    dl = bm.verts.layers.deform.verify()
    moved = 0
    for v in bm.verts:
        p = mw @ v.co
        if not (bottom < p.z < top):
            continue
        h = smooth(top, full, p.z) * smooth(r_in, r_out, leg_dist(p)) * W
        if h < 0.01:
            continue
        th = math.atan2(p.y - hip.y, p.x - hip.x)
        ws = {n: max(0.0, math.cos(th - a)) ** 2 for n, a in ang.items()}
        s = sum(ws.values()) or 1.0
        old = sorted(v[dl].items(), key=lambda x: -x[1])[:2]
        so = sum(x[1] for x in old) or 1.0
        v[dl].clear()
        for g, wt in old:
            v[dl][g] = wt / so * (1 - h)
        for n, wt in sorted(ws.items(), key=lambda x: -x[1])[:2]:
            if wt > 0:
                v[dl][gi[n]] = h * wt / s
        moved += 1
    bm.to_mesh(me)
    bm.free()
    me.update()
    if moved < 200:
        fail(f'skirt_springs: chỉ {moved} đỉnh vạt áo, kiểm lại top/full/bottom')
    set_extra(mesh, 'springs', [{'bone': n, 'tail': to_gltf(tails[n])} for n in names])
    return {'bones': list(names), 'vertices': moved}


# ---------- Kiếm dựng thủ tục cho thân không kiếm (nhân vật nữ Lam Chi) ----------

def _box_ring(bm, cen, e, f, hw, ht):
    pts = [cen + e * hw + f * ht, cen - e * hw + f * ht, cen - e * hw - f * ht, cen + e * hw - f * ht]
    return [bm.verts.new(p) for p in pts]


def _bridge(bm, r0, r1, cell, uvl, mat, faces):
    n = len(r0)
    for k in range(n):
        f = bm.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]))
        faces.append((f, cell))


def _cap(bm, ring, cell, faces, flip=False):
    f = bm.faces.new(tuple(reversed(ring)) if flip else tuple(ring))
    faces.append((f, cell))


def add_back_sword(mesh, arm, spec, parent, fail):
    """Thêm kiếm + bao dựng thủ tục vào thân không có kiếm. Bao gán cứng vào `parent` (lưng), chuôi + lưỡi vào xương
    `dtl_sword` (con của `parent`), cùng quy ước extras `dtl.sword` như sword_socket (client rút/tra kiếm không đổi).
    spec: grip [x, dy, dz] (lệch so với đầu xương `parent`, mét, hệ Blender: +x trái, +y sau lưng, +z lên),
    tip [x, y, z] hướng mũi (thấp xuống), length tổng chiều dài (m). Trả (báo cáo, các ô UV cần tô)."""
    me, mw = mesh.data, mesh.matrix_world
    inv = mw.inverted()
    pb = arm.matrix_world @ arm.data.bones[parent].head_local
    ox, dy, dz = spec.get('grip', [-0.2, 0.05, 0.1])
    # Mặt lưng ở độ cao xương lưng: đỉnh có y lớn nhất trong dải hẹp quanh trục giữa.
    back = [ (mw @ v.co) for v in me.vertices ]
    sel = [p for p in back if abs(p.z - (pb.z + dz)) < 0.08 and abs(p.x - (pb.x + ox)) < 0.1]
    if not sel:
        fail('add_sword: không thấy thân quanh vị trí kiếm')
    back_y = max(p.y for p in sel)
    grip = Vector((pb.x + ox, back_y + float(spec.get('clear', 0.035)), pb.z + dz))
    t = Vector(spec.get('tip', [0.55, 0.15, -0.82])).normalized()
    fl = Vector((0, 1, 0))
    fl = (fl - t * fl.dot(t)).normalized()
    e = fl.cross(t).normalized()
    L = float(spec.get('length', 0.95))
    hilt = float(spec.get('hilt', 0.2))
    # Vị trí dọc trục (0 = giữa tay cầm, dương = về mũi): chuôi [-hilt*0.55, hilt*0.45], bao [hilt*0.5, L - hilt*0.55].
    # Atlas của Tripo thường kín: thu UV về k (mặc định 0,95) để chừa dải bên phải cho 4 ô màu của kiếm. Nội dung ảnh
    # được thu theo ở bước tô (shrink_images), sau recolor.
    shrink = float(spec.get('shrink', 0.95))
    uvd = me.uv_layers.active.data
    for l in uvd:
        l.uv = (l.uv[0] * shrink, l.uv[1] * shrink)
    cells = {}
    for k in ('sheath', 'wrap', 'bronze', 'steel'):
        c = free_uv_block(me, reserved=list(cells.values()))
        if c is None:
            fail('add_sword: atlas UV không còn chỗ cho 4 ô màu')
        cells[k] = c
    uvc = {k: ((c[0] + 1.5) / UV_GRID, (c[1] + 1.5) / UV_GRID) for k, c in cells.items()}

    bm = bmesh.new()
    bm.from_mesh(me)
    dl = bm.verts.layers.deform.verify()
    uvl = bm.loops.layers.uv.active
    mat = 0
    gi_s = (mesh.vertex_groups.get(SWORD_BONE) or mesh.vertex_groups.new(name=SWORD_BONE)).index
    gi_p = (mesh.vertex_groups.get(parent) or mesh.vertex_groups.new(name=parent)).index
    made = {'sheath': [], 'sword': []}
    P = lambda d: grip + t * d  # noqa: E731

    def solid(kind, d0, d1, hw0, ht0, hw1, ht1, cell, group):
        r0 = _box_ring(bm, P(d0), e, fl, hw0, ht0)
        r1 = _box_ring(bm, P(d1), e, fl, hw1, ht1)
        faces = []
        _bridge(bm, r0, r1, cell, uvl, mat, faces)
        _cap(bm, r0, cell, faces, True)
        _cap(bm, r1, cell, faces)
        for f, c in faces:
            f.material_index = mat
            f.smooth = False
            for l in f.loops:
                l[uvl].uv = uvc[c]
        made[group] += r0 + r1

    sh0, sh1 = hilt * 0.5, L - hilt * 0.3
    solid('sheath', sh0, sh1, 0.026, 0.0125, 0.019, 0.0095, 'sheath', 'sheath')      # bao
    solid('mouth', sh0 - 0.012, sh0 + 0.035, 0.029, 0.0155, 0.029, 0.0155, 'bronze', 'sheath')  # miệng bao đồng
    solid('chape', sh1 - 0.06, sh1 + 0.008, 0.0215, 0.0115, 0.0185, 0.0095, 'bronze', 'sheath')  # mũi bao đồng
    solid('hilt', -hilt * 0.55, hilt * 0.42, 0.0145, 0.0125, 0.0145, 0.0125, 'wrap', 'sword')  # chuôi quấn dây
    solid('guard', hilt * 0.42, hilt * 0.5, 0.040, 0.011, 0.040, 0.011, 'bronze', 'sword')     # hộ thủ
    solid('pommel', -hilt * 0.55 - 0.022, -hilt * 0.55, 0.019, 0.0165, 0.019, 0.0165, 'bronze', 'sword')  # đầu chuôi
    # Lưỡi nằm gọn trong bao: hình thoi thuôn về mũi (như sword_socket).
    bl0, bl1 = hilt * 0.5 - 0.01, L - hilt * 0.3 - 0.07
    width, thick = 0.0235, 0.006
    rings = []
    for d, wf in ((bl0, 1.0), (bl1, 0.85)):
        cen = P(d)
        pts = [cen + e * width * wf, cen + fl * thick, cen - e * width * wf, cen - fl * thick]
        rings.append([bm.verts.new(p) for p in pts])
    tipv = bm.verts.new(P(bl1 + 0.05))
    faces = []
    for k in range(4):
        faces.append(bm.faces.new((rings[0][k], rings[0][(k + 1) % 4], rings[1][(k + 1) % 4], rings[1][k])))
        faces.append(bm.faces.new((rings[1][k], rings[1][(k + 1) % 4], tipv)))
    faces.append(bm.faces.new(tuple(reversed(rings[0]))))
    for f in faces:
        f.material_index = mat
        for l in f.loops:
            l[uvl].uv = uvc['steel']
    made['sword'] += rings[0] + rings[1] + [tipv]
    allf = [f for f in bm.faces if all(v in set(made['sheath'] + made['sword']) for v in f.verts)]
    bmesh.ops.recalc_face_normals(bm, faces=allf)
    for v in made['sheath']:
        v[dl].clear()
        v[dl][gi_p] = 1.0
    for v in made['sword']:
        v[dl].clear()
        v[dl][gi_s] = 1.0
    bm.to_mesh(me)
    bm.free()
    me.update()

    gp = grip
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    b = eb.new(SWORD_BONE)
    ainv = arm.matrix_world.inverted()
    b.head = ainv @ gp
    b.tail = ainv @ (gp + t * 0.12)
    b.parent = eb[parent]
    b.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')
    set_extra(mesh, 'sword', {'bone': SWORD_BONE, 'grip': to_gltf(gp), 'tip': to_gltf(t), 'edge': to_gltf(e)})
    cells['shrink'] = shrink
    return {'grip': to_gltf(gp), 'tip': to_gltf(t), 'length': L, 'backY': round(back_y, 3), 'cells': dict(cells)}, cells


def paint_flat(mesh, cell, kind, replace_pixels):
    """Tô một ô màu phẳng (3×3) cho bao/chuôi/đồng trong ảnh màu, ORM và normal."""
    look = {
        'sheath': {'color': (0.085, 0.060, 0.045), 'orm': (1.0, 0.62, 0.0)},
        'wrap': {'color': (0.075, 0.085, 0.11), 'orm': (1.0, 0.8, 0.0)},
        'bronze': {'color': (0.52, 0.38, 0.17), 'orm': (1.0, 0.42, 0.85)},
    }[kind]
    look = dict(look, normal=(0.5, 0.5, 1.0))
    imgs = {}
    for n in mesh.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            for role in ('color', 'orm', 'normal'):
                if n.image.name.endswith('_' + role):
                    imgs[role] = n.image
    for role, img in sorted(imgs.items()):
        W, H = img.size
        px = np.empty(W * H * 4, np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(H, W, 4)
        x0, x1 = int(cell[0] / UV_GRID * W), int((cell[0] + 3) / UV_GRID * W)
        y0, y1 = int(cell[1] / UV_GRID * H), int((cell[1] + 3) / UV_GRID * H)
        px[y0:y1, x0:x1, :3] = look[role]
        px[y0:y1, x0:x1, 3] = 1.0
        replace_pixels(img, px)


def shrink_images(mesh, k, replace_pixels):
    """Thu nội dung các ảnh màu/ORM/normal về k·(rộng, cao), đặt ở góc (0,0), phần còn lại nhân bản mép: khớp với UV đã thu."""
    imgs = []
    for n in mesh.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and n.image not in imgs and n.image.name.rsplit('_', 1)[-1] in ('color', 'orm', 'normal'):
            imgs.append(n.image)
    for img in imgs:
        W, H = img.size
        w2, h2 = int(W * k), int(H * k)
        tmp = img.copy()
        tmp.scale(w2, h2)
        px2 = np.empty(w2 * h2 * 4, np.float32)
        tmp.pixels.foreach_get(px2)
        px2 = px2.reshape(h2, w2, 4)
        bpy.data.images.remove(tmp)
        canvas = np.empty((H, W, 4), np.float32)
        canvas[:h2, :w2] = px2
        canvas[h2:, :w2] = px2[-1:, :, :]
        canvas[:, w2:] = canvas[:, w2 - 1:w2, :]
        replace_pixels(img, canvas)


def flatten_skin_normals(mesh, z_min, replace_pixels):
    """Làm phẳng normal map trên da mặt/cổ: Tripo vẽ nét môi, mũi, mi vào normal ở độ phân giải mà sau khi hạ về 1024 chỉ còn
    vệt tối chạy cạnh miệng (trông như ria mép). Chọn các mặt đầu (tâm cao hơn `z_min` m) có màu da ở tâm UV, rasterize
    tam giác UV thành mặt nạ rồi đặt normal về (0,5; 0,5; 1). Albedo giữ nguyên (môi, mắt vẫn do màu vẽ)."""
    me, mw = mesh.data, mesh.matrix_world
    px, W, H = _color_pixels(mesh)
    if px is None:
        return {'faces': 0}
    uv = me.uv_layers.active.data
    mask = np.zeros((H, W), bool)
    faces = 0
    for poly in me.polygons:
        cz = (mw @ poly.center).z
        if cz < z_min:
            continue
        uvs = np.array([tuple(uv[l].uv) for l in poly.loop_indices])
        c = uvs.mean(0)
        r, g, b = px[min(H - 1, max(0, int(c[1] * H))), min(W - 1, max(0, int(c[0] * W))), :3]
        if not (r > 0.45 and r > g * 1.08 and g >= b * 0.95 and r - b > 0.14):
            continue
        faces += 1
        pts = uvs * np.array([W, H])
        for k in range(1, len(pts) - 1):
            a_, b_, c_ = pts[0], pts[k], pts[k + 1]
            i0, j0 = np.floor(np.minimum(np.minimum(a_, b_), c_)).astype(int) - 2
            i1, j1 = np.floor(np.maximum(np.maximum(a_, b_), c_)).astype(int) + 2
            ii, jj = np.meshgrid(np.arange(max(0, i0), min(W, i1 + 1)), np.arange(max(0, j0), min(H, j1 + 1)))
            x, y = ii + 0.5, jj + 0.5
            d = (b_[1] - c_[1]) * (a_[0] - c_[0]) + (c_[0] - b_[0]) * (a_[1] - c_[1])
            if abs(d) < 1e-9:
                continue
            l1 = ((b_[1] - c_[1]) * (x - c_[0]) + (c_[0] - b_[0]) * (y - c_[1])) / d
            l2 = ((c_[1] - a_[1]) * (x - c_[0]) + (a_[0] - c_[0]) * (y - c_[1])) / d
            hit = (l1 >= -0.03) & (l2 >= -0.03) & (1 - l1 - l2 >= -0.03)
            mask[jj[hit], ii[hit]] = True
    for n in mesh.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image and n.image.name.endswith('_normal'):
            img = n.image
            w, h = img.size
            arr = np.empty(w * h * 4, np.float32)
            img.pixels.foreach_get(arr)
            arr = arr.reshape(h, w, 4)
            arr[mask, 0] = 0.5
            arr[mask, 1] = 0.5
            arr[mask, 2] = 1.0
            replace_pixels(img, arr)
            break
    return {'faces': faces, 'pixels': int(mask.sum())}
