"""Dựng thủ tục 28 icon trang bị (tay, giày, đai, ngọc bội, nhẫn, đạo bào, kiếm) bằng Blender, xuất PNG nền trong suốt.
Chạy: node tools/icons/equipment.mjs (gọi file này rồi ghép khung/nền, ghi vào <DTL_ASSET_SOURCE>/icons).
Trực tiếp: blender --background --factory-startup --python tools/icons/render_equipment.py -- <thư mục ra> [id ...]
Không dùng Tripo hay dịch vụ ngoài. Bảng màu theo art bible v3 và `look` của bộ trong sets.json."""
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0]
ONLY = set(argv[1:])
os.makedirs(OUT, exist_ok=True)

def hexc(h, a=1.0):
    h = h.lstrip('#')
    f = lambda i: (int(h[i:i + 2], 16) / 255.0) ** 2.2
    return (f(0), f(2), f(4), a)

_mats = {}
def mat(name, color, metal=0.0, rough=0.5, emit=None, bump=0.0, bump_scale=60.0, trans=0.0, clearcoat=0.0):
    key = (name, color, metal, rough, emit, bump, trans)
    if key in _mats: return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = hexc(color)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if trans:
        b.inputs['Transmission Weight'].default_value = trans
        b.inputs['IOR'].default_value = 1.5
    if clearcoat:
        b.inputs['Coat Weight'].default_value = clearcoat
    if emit:
        b.inputs['Emission Color'].default_value = hexc(emit)
        b.inputs['Emission Strength'].default_value = 0.6
    if bump:
        tex = nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = bump_scale; tex.inputs['Detail'].default_value = 6
        bn = nt.nodes.new('ShaderNodeBump'); bn.inputs['Strength'].default_value = bump
        nt.links.new(tex.outputs['Fac'], bn.inputs['Height'])
        nt.links.new(bn.outputs['Normal'], b.inputs['Normal'])
    _mats[key] = m
    return m

def put(o, m, smooth=True, sub=0):
    o.data.materials.append(m)
    if smooth: bpy.ops.object.shade_smooth()
    if sub:
        md = o.modifiers.new('s', 'SUBSURF'); md.levels = sub; md.render_levels = sub
    return o

def cyl(r, d, loc=(0, 0, 0), rot=(0, 0, 0), m=None, cap=True, v=48, scale=(1, 1, 1), thick=0, sub=0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, vertices=v, location=loc, rotation=rot, end_fill_type='NGON' if cap else 'NOTHING')
    o = bpy.context.object; o.scale = scale
    if thick:
        md = o.modifiers.new('sol', 'SOLIDIFY'); md.thickness = thick; md.offset = 0
    return put(o, m, sub=sub)

def cone(r1, r2, d, loc=(0, 0, 0), rot=(0, 0, 0), m=None, cap=False, v=48, scale=(1, 1, 1), thick=0, sub=0):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=d, vertices=v, location=loc, rotation=rot, end_fill_type='NGON' if cap else 'NOTHING')
    o = bpy.context.object; o.scale = scale
    if thick:
        md = o.modifiers.new('sol', 'SOLIDIFY'); md.thickness = thick; md.offset = 0
    return put(o, m, sub=sub)

def torus(R, r, loc=(0, 0, 0), rot=(0, 0, 0), m=None, scale=(1, 1, 1), seg=64):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=20, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = scale
    return put(o, m)

def sph(r, loc=(0, 0, 0), m=None, scale=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=48, ring_count=24, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = scale
    return put(o, m)

def box(size, loc=(0, 0, 0), rot=(0, 0, 0), m=None, bevel=0.02, sub=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = size
    md = o.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = 3
    return put(o, m, smooth=True, sub=sub)

def displace(o, strength=0.05, scale=0.5, tex='CLOUDS'):
    t = bpy.data.textures.new('d', tex); t.noise_scale = scale
    md = o.modifiers.new('disp', 'DISPLACE'); md.texture = t; md.strength = strength; md.mid_level = 0.5
    return o

# ---------------- bảng chất liệu ----------------
def plain(kind):
    return {
        'vai': dict(body=mat('vai', '#B79A6A', rough=0.9, bump=0.5, bump_scale=140), trim=mat('vaiT', '#8A6944', rough=0.85)),
        'da': dict(body=mat('da', '#6A4228', rough=0.55, bump=0.35, bump_scale=70), trim=mat('daT', '#AE8B49', metal=0.8, rough=0.35)),
        'thiet': dict(body=mat('thiet', '#6E747B', metal=0.9, rough=0.32), trim=mat('thietT', '#2E3036', metal=0.6, rough=0.5)),
        'ngoc': dict(body=mat('ngoc', '#5FB39A', rough=0.18, trans=0.35, clearcoat=0.6), trim=mat('ngocT', '#AE8B49', metal=0.85, rough=0.3)),
        'dong': dict(body=mat('dong', '#AE8B49', metal=1.0, rough=0.3), trim=mat('dongT', '#7A5C2E', metal=0.9, rough=0.4)),
        'van': dict(body=mat('van', '#6E8F95', rough=0.8, bump=0.4, bump_scale=120), trim=mat('vanT', '#E6DDCB', rough=0.7)),
    }[kind]

def _sets():
  return {
      'lk': dict(body=mat('lk', '#E4DEC8', rough=0.75, bump=0.45, bump_scale=130), trim=mat('lkT', '#27476E', rough=0.55), acc=mat('lkA', '#C9B27A', metal=0.9, rough=0.3), gem='#7FE3D0'),
      'hg': dict(body=mat('hg', '#2A2C32', metal=0.55, rough=0.38), trim=mat('hgT', '#A9873F', metal=0.9, rough=0.3), acc=mat('hgA', '#D6B45E', metal=1.0, rough=0.25), gem='#D6B45E'),
      'dt': dict(body=mat('dt', '#4D7D68', rough=0.6, bump=0.4, bump_scale=130), trim=mat('dtT', '#D8C58A', metal=0.8, rough=0.3), acc=mat('dtA', '#E7D79E', metal=0.9, rough=0.25), gem='#9BE8A8'),
      'hgl': dict(body=mat('hgl', '#2F8798', rough=0.25, trans=0.25, clearcoat=0.6), trim=mat('hglT', '#C9D8DE', metal=0.95, rough=0.2), acc=mat('hglA', '#DDEBF0', metal=1.0, rough=0.18), gem='#7FE9FF'),
}

def SETS_(k): return _sets()[k]

def gem(color, loc, r=0.1, scale=(1, 1, 1)):
    return sph(r, loc, mat('gem' + color, color, rough=0.1, emit=color, trans=0.4), scale=scale)

# ---------------- các loại (dựng ở toạ độ tự nhiên, sau đó xoay cả vật theo VIEW) ----------------
def build_belt(S, buckle='plain'):
    # trục Z, đai nằm trong mặt XY, khóa ở -Y
    cyl(1.05, 0.56, m=S['body'], cap=False, v=96, thick=0.09)
    for z in (0.27, -0.27):
        torus(1.07, 0.028, loc=(0, 0, z), m=S['trim'], seg=96)
    torus(1.07, 0.018, loc=(0, 0, 0), m=S['trim'], seg=96)
    box((0.74, 0.1, 0.62), loc=(0, -1.1, 0), m=S.get('acc', S['trim']), bevel=0.05)
    box((0.52, 0.04, 0.4), loc=(0, -1.17, 0), m=S['trim'], bevel=0.03)
    if buckle == 'gem':
        gem(S['gem'], (0, -1.22, 0), 0.12, scale=(1, 0.6, 1))
    elif buckle == 'ring':
        torus(0.15, 0.035, loc=(0, -1.2, 0), rot=(math.pi / 2, 0, 0), m=S['body'])
    box((0.28, 0.06, 0.5), loc=(0.6, -1.0, 0.0), rot=(0, 0, math.radians(-30)), m=S['body'], bevel=0.015)

def build_ring(S, kind='plain'):
    # trục Z, mặt chính ở +Y
    torus(0.78, 0.17, m=S['body'])
    if kind == 'band':
        for z in (-0.1, 0.1): torus(0.78, 0.05, loc=(0, 0, z * 1.2), m=S['trim'])
        box((0.4, 0.2, 0.26), loc=(0, 0.88, 0), m=S['trim'], bevel=0.07)
    elif kind == 'gem':
        box((0.46, 0.3, 0.3), loc=(0, 0.88, 0.0), m=S['trim'], bevel=0.07)
        gem(S['gem'], (0, 0.95, 0.12), 0.2, scale=(1, 0.9, 1.1))
    elif kind == 'horn':
        for a in (-0.42, 0, 0.42):
            c = cone(0.11, 0.0, 0.55, loc=(math.sin(a) * 0.95, math.cos(a) * 0.95 + 0.2, 0), m=S['trim'], cap=True, v=16)
            c.rotation_euler = (-math.pi / 2, 0, a)
        gem(S['gem'], (0, 0.88, 0.1), 0.15)

def build_jade(S, cord='#9D392E', style='bi'):
    # mặt phẳng XY, Y hướng lên, độ dày theo Z
    cm = mat('cord' + cord, cord, rough=0.6, bump=0.3, bump_scale=200)
    torus(0.52, 0.34, m=S['body'], scale=(1, 1, 0.5))
    torus(0.87, 0.035, m=S['trim'], scale=(1, 1, 1.2))
    torus(0.17, 0.03, m=S['trim'])
    for a in range(0, 360, 45):
        r = math.radians(a)
        sph(0.07, loc=(math.sin(r) * 0.52, math.cos(r) * 0.52, 0.17), m=S['trim'], scale=(1, 1, 0.5))
    torus(0.42, 0.03, loc=(0, 1.55, 0), rot=(0, math.pi / 2, 0), m=cm, scale=(1, 1.4, 1))
    sph(0.13, loc=(0, 1.02, 0), m=S['trim'] if style != 'wood' else cm)
    cyl(0.018, 0.2, loc=(0, -0.98, 0), rot=(math.pi / 2, 0, 0), m=cm, v=8)
    sph(0.075, loc=(0, -1.0, 0), m=S['trim'])
    cone(0.11, 0.02, 0.55, loc=(0, -1.28, 0), rot=(math.pi / 2, 0, 0), m=cm, cap=True, v=24)
    for dx in (-0.07, 0, 0.07):
        cyl(0.014, 0.4, loc=(dx, -1.7, 0), rot=(math.pi / 2, 0, 0), m=cm, v=8)

def build_bracer(S, plate='plain'):
    # trục Z (miệng +Z rộng), mảnh giáp phía -Y
    cone(0.62, 0.82, 1.7, m=S['body'], cap=False, thick=0.09, v=64)
    for z in (-0.6, -0.1, 0.5):
        r = 0.62 + (z + 0.85) / 1.7 * 0.2
        torus(r + 0.03, 0.05, loc=(0, 0, z), m=S['trim'])
    torus(0.82, 0.06, loc=(0, 0, 0.85), m=S.get('acc', S['trim']))
    box((0.7, 0.1, 1.15), loc=(0, -0.76, 0.05), m=S.get('acc', S['trim']), bevel=0.04)
    box((0.5, 0.05, 0.9), loc=(0, -0.83, 0.05), m=S['body'], bevel=0.03)
    if plate == 'gem': gem(S.get('gem', '#7FE3D0'), (0, -0.88, 0.05), 0.11, scale=(1, 0.6, 1))
    if plate == 'plates':
        for z in (-0.4, 0.0, 0.4):
            box((0.82, 0.1, 0.3), loc=(0, -0.78, z), m=S['trim'], bevel=0.04)

def build_boot(S, cloud=False):
    # hướng mũi giày +X, đứng thẳng
    cone(0.52, 0.62, 1.3, loc=(-0.45, 0, 0.5), m=S['body'], cap=False, thick=0.08, v=48, scale=(1, 0.85, 1))
    sph(0.55, loc=(0.3, 0, -0.3), m=S['body'], scale=(1.6, 0.8, 0.75))
    sph(0.52, loc=(-0.5, 0, -0.35), m=S['body'], scale=(1.0, 0.82, 0.85))
    sph(0.65, loc=(0.05, 0, -0.78), m=S['trim'], scale=(2.0, 0.88, 0.17))
    torus(0.62, 0.075, loc=(-0.45, 0, 1.15), m=S['trim'], scale=(1, 0.85, 1))
    torus(0.52, 0.035, loc=(-0.45, 0, 0.6), m=S['trim'], scale=(1, 0.85, 1))
    torus(0.52, 0.035, loc=(-0.45, 0, 0.1), m=S['trim'], scale=(1, 0.85, 1))
    if cloud:
        sph(0.3, loc=(1.28, 0, 0.0), m=S['body'], scale=(0.9, 0.62, 0.55))
        cone(0.2, 0.0, 0.7, loc=(1.62, 0, 0.35), rot=(0, math.radians(60), 0), m=S['body'], cap=True, v=24)
        for x, z in ((0.1, 0.3), (0.65, 0.1)):
            torus(0.14, 0.035, loc=(x, -0.64, z), rot=(math.pi / 2, 0, 0), m=S['trim'])
            torus(0.08, 0.03, loc=(x + 0.12, -0.65, z - 0.12), rot=(math.pi / 2, 0, 0), m=S['trim'])
    else:
        box((0.5, 0.06, 0.5), loc=(-0.45, -0.7, 0.5), m=S.get('acc', S['trim']), bevel=0.04)
        for z in (0.7, 0.35, 0.0):
            box((0.7, 0.05, 0.07), loc=(-0.45, -0.69, z), m=S['trim'], bevel=0.015)

def build_robe(S, sash='plain', hem=True):
    body = cone(1.05, 0.5, 2.0, loc=(0, 0, -0.1), m=S['body'], cap=False, thick=0.05, v=80)
    md = body.modifiers.new('sub', 'SUBSURF'); md.levels = 2; md.render_levels = 2
    displace(body, 0.06, 0.5)
    for s in (-1, 1):
        box((0.13, 0.05, 1.05), loc=(s * 0.14, -0.57, 0.62), rot=(0, 0, s * math.radians(-32)), m=S['trim'], bevel=0.02)
    for s in (-1, 1):
        phi = math.radians(110) * s
        d = Vector((math.sin(phi), 0, math.cos(phi)))
        shoulder = Vector((s * 0.4, 0, 0.78))
        c = shoulder + d * 0.8
        sl = cone(0.3, 0.7, 1.6, loc=c, rot=(0, phi, 0), m=S['body'], cap=False, thick=0.05, v=48)
        md = sl.modifiers.new('sub', 'SUBSURF'); md.levels = 1; md.render_levels = 1
        displace(sl, 0.05, 0.4)
        torus(0.7, 0.055, loc=shoulder + d * 1.6, rot=(0, phi, 0), m=S['trim'])
    cyl(0.5, 0.05, loc=(0, 0, 0.9), m=mat('neck', '#17120E', rough=0.9), v=48)
    torus(0.5, 0.06, loc=(0, 0, 0.9), m=S['trim'])
    torus(0.79, 0.075, loc=(0, 0, -0.02), m=S.get('acc', S['trim']) if sash == 'acc' else S['trim'])
    if sash == 'jade': gem(S['gem'], (0.0, -0.85, -0.02), 0.12)
    if hem: torus(1.06, 0.05, loc=(0, 0, -1.1), m=S['trim'])

def build_sword(S):
    blade = mat('blade', '#BFD8E4', metal=1.0, rough=0.12)
    box((0.42, 0.06, 3.1), loc=(0, 0, 0.55), m=blade, bevel=0.012)
    c = cone(0.12, 0.0, 0.45, loc=(0, 0, 2.3), m=blade, cap=True, v=4); c.scale = (1.7, 0.16, 1); c.rotation_euler = (0, 0, math.radians(45))
    box((0.12, 0.02, 2.8), loc=(0, -0.04, 0.5), m=mat('fuller', '#7FE9FF', metal=0.6, rough=0.2, emit='#7FE9FF'), bevel=0.005)
    box((0.95, 0.14, 0.15), loc=(0, 0, -1.02), m=S['trim'], bevel=0.05)
    gem(S['gem'], (0, -0.1, -1.02), 0.13)
    for s in (-1, 1):
        cone(0.11, 0.0, 0.4, loc=(s * 0.6, 0, -0.95), rot=(0, s * math.radians(90), 0), m=S['trim'], cap=True, v=16)
    cyl(0.075, 0.65, loc=(0, 0, -1.45), m=mat('grip', '#1E2A33', rough=0.6, bump=0.3), v=24)
    sph(0.13, loc=(0, 0, -1.85), m=S['trim'])
    cord = mat('tassel', '#7FE9FF', rough=0.6)
    cyl(0.014, 0.4, loc=(0, -0.05, -2.1), m=cord, v=8)
    cone(0.08, 0.02, 0.55, loc=(0, -0.05, -2.5), rot=(math.pi, 0, 0), m=cord, cap=True, v=16)

# ---------------- danh sách icon ----------------
def P(k): return plain(k)
JOBS = {
    'itm_ho_uyen_vai':   lambda: build_bracer(P('vai')),
    'itm_ho_uyen_da':    lambda: build_bracer(P('da'), 'plain'),
    'itm_ho_uyen_thiet': lambda: build_bracer(P('thiet'), 'plates'),
    'itm_van_ngoa_vai':  lambda: build_boot(P('vai')),
    'itm_van_ngoa_da':   lambda: build_boot(P('da')),
    'itm_van_ngoa_van':  lambda: build_boot(P('van'), cloud=True),
    'itm_dai_lung_vai':  lambda: build_belt(P('vai'), 'ring'),
    'itm_dai_lung_da':   lambda: build_belt(dict(P('da'), acc=P('da')['trim']), 'plain'),
    'itm_dai_lung_ngoc': lambda: build_belt(dict(P('ngoc'), acc=P('ngoc')['trim'], gem='#7FE3D0'), 'gem'),
    'itm_ngoc_boi_moc':  lambda: build_jade(dict(body=mat('moc', '#8A6944', rough=0.6, bump=0.5, bump_scale=90), trim=P('da')['trim']), '#8A6944', 'wood'),
    'itm_ngoc_boi_thanh': lambda: build_jade(dict(P('ngoc'), body=mat('ngocT2', '#6FBF9F', rough=0.14, trans=0.3, clearcoat=0.8)), '#9D392E'),
    'itm_ngoc_boi_linh': lambda: build_jade(dict(body=mat('linh', '#B5F3E6', rough=0.1, trans=0.5, emit='#7FE3D0', clearcoat=0.9), trim=P('ngoc')['trim']), '#2B5552'),
    'itm_gioi_chi_dong': lambda: build_ring(P('dong'), 'band'),
    'itm_lk_dao_bao':    lambda: build_robe(SETS_('lk'), 'acc'),
    'itm_lk_ho_uyen':    lambda: build_bracer(SETS_('lk'), 'gem'),
    'itm_lk_dai_lung':   lambda: build_belt(SETS_('lk'), 'gem'),
    'itm_lk_van_ngoa':   lambda: build_boot(SETS_('lk'), cloud=True),
    'itm_hg_dao_bao':    lambda: build_robe(SETS_('hg'), 'acc'),
    'itm_hg_ho_uyen':    lambda: build_bracer(SETS_('hg'), 'plates'),
    'itm_hg_dai_lung':   lambda: build_belt(SETS_('hg'), 'ring'),
    'itm_hg_van_ngoa':   lambda: build_boot(SETS_('hg')),
    'itm_dt_dao_bao':    lambda: build_robe(SETS_('dt'), 'jade'),
    'itm_dt_ngoc_boi':   lambda: build_jade(dict(body=mat('dtjade', '#3F8F73', rough=0.12, trans=0.3, clearcoat=0.8), trim=SETS_('dt')['trim']), '#D8C58A'),
    'itm_dt_dai_lung':   lambda: build_belt(SETS_('dt'), 'gem'),
    'itm_dt_gioi_chi':   lambda: build_ring(dict(body=SETS_('dt')['trim'], trim=SETS_('dt')['acc'], gem=SETS_('dt')['gem']), 'gem'),
    'itm_hgl_kiem':      lambda: build_sword(SETS_('hgl')),
    'itm_hgl_dao_bao':   lambda: build_robe(SETS_('hgl'), 'jade'),
    'itm_hgl_gioi_chi':  lambda: build_ring(dict(body=SETS_('hgl')['body'], trim=SETS_('hgl')['trim'], gem=SETS_('hgl')['gem']), 'horn'),
}
# xoay cả vật (độ, XYZ) và độ lớn khung ortho; camera nhìn từ -Y
VIEW = {'robe': ((6, 0, 0), 3.8), 'boot': ((0, 0, -32), 3.2), 'bracer': ((62, 18, 0), 2.85), 'belt': ((54, 0, 0), 2.6),
        'jade': ((90, 0, 8), 3.9), 'ring': ((68, 0, 0), 2.25), 'sword': ((0, 38, 0), 4.9)}
def kind_of(i):
    if 'dao_bao' in i: return 'robe'
    if 'van_ngoa' in i: return 'boot'
    if 'ho_uyen' in i: return 'bracer'
    if 'dai_lung' in i: return 'belt'
    if 'ngoc_boi' in i: return 'jade'
    if 'gioi_chi' in i: return 'ring'
    return 'sword'

def setup_scene(scale):
    sc = bpy.context.scene
    for t in ('CYCLES',):
        sc.render.engine = t
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    sc.cycles.device = 'CPU'
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Filmic' if 'Filmic' in [i.identifier for i in bpy.types.ColorManagedViewSettings.bl_rna.properties['view_transform'].enum_items] else 'Standard'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = hexc('#6FA39C'); bg.inputs['Strength'].default_value = 0.55
    cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = scale
    co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    return co

def light(name, kind, loc, energy, color, size=4):
    l = bpy.data.lights.new(name, kind); l.energy = energy; l.color = color[:3]
    if kind == 'AREA': l.size = size
    o = bpy.data.objects.new(name, l); o.location = loc
    bpy.context.scene.collection.objects.link(o)
    o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()

for iid, fn in JOBS.items():
    if ONLY and iid not in ONLY: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    k = kind_of(iid)
    rot, scale = VIEW[k]
    cam = setup_scene(scale)
    fn()
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    root = bpy.data.objects.new('root', None); bpy.context.scene.collection.objects.link(root)
    for o in objs: o.parent = root
    root.rotation_euler = tuple(math.radians(v) for v in rot)
    cam.location = (0, -12, 0.0)
    cam.rotation_euler = (math.radians(90), 0, 0)
    light('key', 'AREA', (-5, -6, 6), 900, hexc('#FFD9A0'), 5)
    light('fill', 'AREA', (6, -5, 2), 260, hexc('#7FD6CF'), 6)
    light('rim', 'AREA', (3, 6, 4), 400, hexc('#BFEFE8'), 4)
    bpy.context.scene.render.filepath = os.path.join(OUT, iid + '.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', iid)
