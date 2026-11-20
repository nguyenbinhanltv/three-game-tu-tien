# VFX VS-1 cho Hộ pháp (Bất Động Kim Thân): vàng đồng, đá vỡ, sóng xung. Dùng helper và ngôn ngữ của recipes_vs1.py (Kiếm tu, đã duyệt).
#   python tools/vfx/recipes_vs1_hp.py [id chiêu ...]
# Bản sắc Hộ pháp: nặng, chắc, nổ dưới đất: sóng xung nón rộng, nứt tỏa, cột/đá văng, bụi nhiều, khựng lâu hơn kiếm (70-90 ms), rung mạnh,
# KHÔNG vết chém mảnh; hình chính là khối (đá, ấn, chuông). Màu theo bảng `bat_dong_kim_than` (đồng vàng, viền kem, bóng nâu).
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recipes_vs1 import (  # noqa: E402
    cam, decal, feel, flash, flip, mesh, parts, shake, slow, snd, stop, vig, write,
)

R = {}


def debris(t, at, n, r, up, scale, seed0=1, tone='core'):
    """n tảng đá 3D tối màu bung lên từ vòng bán kính r rồi RƠI LẠI mặt đất (hai pha: bay lên ease-out, rơi xuống ease-in)."""
    ev = []
    for i in range(n):
        a = i / n * math.tau + seed0
        x, z = round(math.cos(a) * r, 2), round(math.sin(a) * r, 2)
        h = up * (0.7 + 0.3 * ((i * 37) % 10) / 10)
        shp = 'rubble_a' if i % 2 == 0 else 'rubble_c'
        rot = [35 * i, 70 * i, 15 * i]
        ev.append(mesh(shp, t, 0.22, at=at, offset=[x, 0.1, z], rot=rot, scale=scale, sweep=0, erodeFrom=0.98, alpha=1,
                       move={'to': at, 'offset': [x * 1.15, h, z * 1.15], 'ease': 'out'}, tone=tone, tier=0 if i < 6 else 1, seed=seed0 + i))
        ev.append(mesh(shp, t + 0.22, 0.3, at=at, offset=[x * 1.15, h, z * 1.15], rot=rot, scale=scale, scaleTo=scale * 0.8, sweep=0, erodeFrom=0.7, alpha=1,
                       move={'to': at, 'offset': [x * 1.3, 0.1, z * 1.3], 'ease': 'in'}, tone=tone, tier=0 if i < 6 else 1, seed=seed0 + i))
    return ev


def thiet_quyen():
    """Thiết Quyền Chấn Địa (AoE r 6, hit 0,45 s): nắm đấm giáng xuống đất: vòng nứt tỏa tối + viền sáng, vòng sóng xung SẮC NÉT đồng-vàng đậm (không phủ mờ), tảng đá tối bung lên rồi rơi lại, bụi nâu ở chân. Màu đồng (body/core), KHÔNG dùng accent/rim (vàng chanh/kem)."""
    ev = [
        parts('dust', -0.45, 22, 1.4, 1, 0.38, 0.18, at='self', offset=[0.3, 0, 0.5], inward=True, tone='core', tier=1),
        parts('spark', -0.45, 16, 1.4, 1, 0.3, 0.07, at='self', offset=[0.3, 0.9, 0.5], inward=True, tone='body', tier=1),
        snd(-0.45, 'cast', 0.45, 0.8),
        decal('rune', -0.4, 5.5, 0.9, at='area', grow=0.3, tone='body', alpha=1, tier=0),
        # giáng (t = 0 là khung hit; mọi thứ bật NGAY, không mọc dần): chớp + khựng + rung + âm nặng
        snd(0.0, 'impact', 0.95, 0.65, 0.04),
        snd(0.0, 'block', 0.55, 0.62, 0.05),
        mesh('burst', -0.02, 0.11, at='area', offset=[0, 0.4, 0], scale=2.6, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', -0.02, 0.34, 3.4, at='area', offset=[0, 0.7, 0], alpha=0.8, tone='body', tier=0),
        # vòng nứt tỏa (hiện đủ ngay) tối + viền sáng; decal nứt/cháy lưu lại
        mesh('crack_radial', -0.03, 1.0, at='area', scale=1.0, fit='area', alpha=1, sweep=0.02, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=2),
        mesh('crack_radial', -0.03, 0.7, at='area', offset=[0, 0.03, 0], scale=1.0, fit='area', alpha=0.9, sweep=0.02, erodeFrom=0.5, shadow=False, tone='body', tier=0, seed=2),
        decal('crack', -0.03, 7.0, 2.8, at='area', grow=0.05, tone='core', alpha=1, tier=1),
        decal('scorch', -0.03, 5.4, 3.0, at='area', grow=0.05, tone='shadow', alpha=0.85, tier=0),
        # vòng sóng xung sắc nét: hai vành mảnh (rune_ring2) mở rộng nhanh, màu đồng đậm, không phủ mờ
        # vòng sóng xung theo VÙNG THẬT của server (`fit: area`, scale tương đối theo bán kính S.FX: 6 m mặc định, ~8 m ở biến thức wide)
        mesh('rune_ring2', -0.03, 0.4, at='area', offset=[0, 0.08, 0], scale=0.45, scaleTo=1.25, fit='area', sweep=0.04, erodeFrom=0.7, alpha=1, shadow=False, tone='body', tier=0, seed=3),
        mesh('rune_ring2', 0.04, 0.36, at='area', offset=[0, 0.1, 0], scale=0.4, scaleTo=1.05, fit='area', sweep=0.04, erodeFrom=0.65, alpha=1, shadow=False, tone='core', tier=1, seed=4),
        # bụi nâu ở chân (thấp, dày) + hạt
        flip('dust_kick', 0.0, 0.8, 5.0, at='area', offset=[0, 0.7, 0], alpha=0.7, tone='core', tier=0),
        flip('dust_kick', 0.1, 0.8, 3.8, at='area', offset=[2.0, 0.6, 1.4], alpha=0.6, tone='core', tier=1),
        flip('dust_kick', 0.14, 0.8, 3.8, at='area', offset=[-2.0, 0.6, -1.2], alpha=0.6, tone='core', tier=2),
        parts('spark', 0.0, 50, 8, 1, 0.45, 0.1, at='area', offset=[0, 0.8, 0], tone='body', tier=0),
        parts('dust', 0.0, 60, 5, 1, 0.8, 0.3, at='area', offset=[0, 0.3, 0], tone='core', tier=1),
    ]
    ev += debris(-0.02, 'area', 10, 2.4, 3.4, 1.3, seed0=0.5)
    ev += feel(0.0, ms=80, sh=0.55, fl=0.15, vg=0.35, fov=3.0)
    return {
        'skill': 'skl_thiet_quyen_chan_dia',
        'replaces': ['thietquyen'],
        'events': ev,
        'variants': {
            # a = vùng rộng ×1,33: vòng ngoài thứ ba quét ra rìa + decal nứt lớn hơn + thêm 4 tảng đá xa
            'wide': [
                mesh('rune_ring2', 0.08, 0.4, at='area', offset=[0, 0.12, 0], scale=0.5, scaleTo=1.15, fit='area', sweep=0.04, erodeFrom=0.5, alpha=0.9, shadow=False, tone='body', tier=1, seed=5),
                decal('crack', 0.0, 8.6, 2.8, at='area', grow=0.08, tone='core', alpha=0.9, tier=1),
            ]
            + debris(0.02, 'area', 4, 6.0, 2.8, 1.5, seed0=1.2),
            # b = làm chậm: dấu hiệu thị giác = vòng triện tối + vành `core` ở lại lâu dưới chân (vùng đang làm chậm kẻ địch)
            'slow': [
                decal('rune', 0.1, 6.5, 3.4, at='area', grow=0.3, tone='shadow', alpha=0.9, tier=0),
                mesh('rune_ring2', 0.15, 2.6, at='area', offset=[0, 0.14, 0], scale=0.55, scaleTo=0.6, fit='area', sweep=0.3, erodeFrom=0.8, alpha=0.85, shadow=False, tone='core', tier=0, seed=6),
            ],
        },
    }


R['skl_thiet_quyen_chan_dia'] = thiet_quyen


# --------------------------------------------------------------------------------------------------------------------------------
# VS-1 Hộ pháp phần 2: 5 chiêu còn lại. Mỗi chiêu MỘT hình khối chủ đạo (ấn / chuông / núi đá / thuẫn + kim cương / tứ trụ + pháp luân),
# chung tông đồng-nâu-đá với Thiết Quyền. Chiêu tự thân (khiên, hộ thể, hóa thân) neo `self` (S.FX của chúng không có vùng nên `area`
# sẽ rơi về 5 m trước mặt); mặt đất dưới chân = offset y G. Hình khối Hộ pháp đứng theo +Y: rơi/bay phải có `keepUp`.
# Vùng tác dụng luôn có một vành `rune_ring2` Ở LẠI đúng bán kính (vành ngoài của hình ở 0,96 → scale = r × EDGE).
G = -1.12
EDGE = 1.04


def around(n, r, a0=0.0):
    """n điểm quanh vòng bán kính r (hệ cục bộ người ra chiêu): (x, z, góc độ để mặt +Z của hình hướng RA NGOÀI)."""
    out = []
    for i in range(n):
        a = a0 + i / n * math.tau
        out.append((round(math.sin(a) * r, 2), round(math.cos(a) * r, 2), round(math.degrees(a), 1)))
    return out


def arc(degs, r):
    """Điểm theo góc (độ, 0 = trước mặt người ra chiêu, dương = bên phải) trên vòng bán kính r: (x, z, góc)."""
    return [(round(math.sin(math.radians(d)) * r, 2), round(math.cos(math.radians(d)) * r, 2), d) for d in degs]


def quake(t, at, y, crack, r_decal, burst=2.2, sparks=40, dust=3.6, tier_decal=1):
    """Cụm chạm đất dùng chung (ngôn ngữ Thiết Quyền): chớp + spark_burst, nứt tỏa tối + viền sáng, decal nứt/cháy, bụi nâu, hạt."""
    return [
        mesh('burst', t - 0.02, 0.11, at=at, offset=[0, y + 0.5, 0], scale=burst, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        flip('spark_burst', t - 0.02, 0.34, burst * 1.3, at=at, offset=[0, y + 0.8, 0], alpha=0.8, tone='body', tier=0),
        mesh('crack_radial', t - 0.02, 1.0, at=at, offset=[0, y + 0.05, 0], scale=crack, alpha=1, sweep=0.02, erodeFrom=0.8, shadow=False, tone='core', tier=0, seed=2),
        mesh('crack_radial', t - 0.02, 0.7, at=at, offset=[0, y + 0.08, 0], scale=crack, alpha=0.9, sweep=0.02, erodeFrom=0.5, shadow=False, tone='body', tier=1, seed=2),
        decal('crack', t, r_decal, 2.8, at=at, offset=[0, y, 0], grow=0.05, tone='core', alpha=1, tier=tier_decal),
        decal('scorch', t, r_decal * 0.8, 3.0, at=at, offset=[0, y, 0], grow=0.05, tone='shadow', alpha=0.8, tier=0),
        flip('dust_kick', t, 0.8, dust, at=at, offset=[0, y + 0.7, 0], alpha=0.65, tone='core', tier=0),
        parts('spark', t, sparks, 7, 1, 0.45, 0.1, at=at, offset=[0, y + 0.8, 0], tone='body', tier=0),
        parts('dust', t, 50, 4.5, 1, 0.8, 0.28, at=at, offset=[0, y + 0.3, 0], tone='core', tier=1),
    ]


def debris_at(t, at, base, n, r, up, scale, seed0=1.0):
    """Như `debris` nhưng quanh điểm `base` = [x, y, z] (hệ cục bộ), cho chiêu neo `self`."""
    ev = debris(t, at, n, r, up, scale, seed0=seed0)
    for e in ev:
        for key in ('offset',):
            e[key] = [round(e[key][0] + base[0], 2), round(e[key][1] + base[1], 2), round(e[key][2] + base[2], 2)]
        o = e['move']['offset']
        e['move']['offset'] = [round(o[0] + base[0], 2), round(o[1] + base[1], 2), round(o[2] + base[2], 2)]
    return ev


def zone_ring(t, at, y, r, hold, tone='core', fit=False, tier=0, seed=7, alpha=0.9):
    """Vành Ở LẠI đúng mép vùng tác dụng trong `hold` giây (đọc được "trong vòng này có hiệu lực")."""
    k = {'fit': 'area'} if fit else {}
    s = EDGE if fit else round(r * EDGE, 2)
    return mesh('rune_ring2', t, hold, at=at, offset=[0, y + 0.12, 0], scale=s, scaleTo=s, sweep=0.12, erodeFrom=0.75, alpha=alpha, shadow=False, tone=tone, tier=tier, seed=seed, **k)


def wave(t, at, y, r0, r1, dur=0.42, tone='body', fit=False, tier=0, seed=3, alpha=1):
    """Vành sóng xung sắc nét quét từ r0 ra r1 (mét; `fit` thì là tỉ lệ bán kính vùng S.FX)."""
    k = {'fit': 'area'} if fit else {}
    return mesh('rune_ring2', t, dur, at=at, offset=[0, y + 0.1, 0], scale=r0, scaleTo=r1, sweep=0.04, erodeFrom=0.7, alpha=alpha, shadow=False, tone=tone, tier=tier, seed=seed, **k)


def tran_son():
    """Trấn Sơn Ấn (khiêu khích r 12, hit 0,4 s): một quả ẤN đồng to bản giáng từ trên trời xuống, khựng lại ngay TRÊN ĐẦU người ra chiêu
    (đáy ấn cao 2,9 m: không che nhân vật, không đè lên quái), sức ép làm nứt nền; sóng chấn quét ra tới MÉP vùng khiêu khích và một vành
    ở lại ở mép (quái trong vành bị kéo về mình)."""
    Z = 0
    H = 2.9  # độ cao đáy ấn khi dừng
    S = 2.1
    ev = [
        parts('dust', -0.4, 22, 1.4, 1, 0.36, 0.18, at='self', offset=[0, G + 0.2, 0.4], inward=True, tone='core', tier=1),
        snd(-0.4, 'cast', 0.45, 0.78),
        # báo trước: bóng ấn dưới đất + ấn rơi (ease in) trong 0,3 s
        decal('scorch', -0.38, 1.9, 0.5, at='self', offset=[0, G, Z], grow=0.3, tone='shadow', alpha=0.7, tier=0),
        mesh('seal_block', -0.3, 0.3, at='self', offset=[0, G + 13, Z], scale=S, sweep=0, erodeFrom=0.98, alpha=1, keepUp=True,
             move={'to': 'self', 'offset': [0, G + H, Z], 'ease': 'in'}, tone='core', tier=0, seed=1),
        snd(-0.16, 'slash', 0.4, 0.7, 0.04),
        # trấn: ấn treo trên đầu 1,1 s rồi tan
        mesh('seal_block', 0.0, 1.1, at='self', offset=[0, G + H, Z], scale=S, sweep=0, erodeFrom=0.6, alpha=1, follow=True, tone='core', tier=0, seed=1),
        snd(0.0, 'impact', 0.95, 0.62, 0.04),
        snd(0.0, 'block', 0.6, 0.6, 0.05),
        # sóng chấn theo VÙNG THẬT (fit area): hai vành quét ra mép + một vành ở lại ở mép suốt nhịp đầu khiêu khích
        wave(0.0, 'area', 0, 0.12, 1.0, dur=0.5, tone='body', fit=True, seed=3),
        wave(0.07, 'area', 0, 0.1, 0.8, dur=0.46, tone='core', fit=True, tier=1, seed=4),
        zone_ring(0.3, 'area', 0, 12, 1.8, tone='core', fit=True, seed=5),
        flip('dust_kick', 0.1, 0.8, 3.6, at='self', offset=[1.8, G + 0.6, Z + 1.2], alpha=0.55, tone='core', tier=1),
        flip('dust_kick', 0.14, 0.8, 3.6, at='self', offset=[-1.8, G + 0.6, Z - 0.8], alpha=0.55, tone='core', tier=2),
    ]
    ev += quake(0.0, 'self', G, 4.2, 4.6)
    ev += debris_at(-0.02, 'self', [0, G, Z], 8, 2.5, 1.9, 0.6, seed0=0.4)
    ev += feel(0.0, ms=80, sh=0.5, fl=0.12, vg=0.35, fov=2.5)
    return {
        'skill': 'skl_tran_son_an',
        'replaces': ['transon'],
        'events': ev,
        'variants': {
            # a = vùng rộng ×1,5: thêm một vành thứ ba quét chậm ra mép (vành ở lại đã theo bán kính thật)
            'wide': [
                wave(0.16, 'area', 0, 0.3, 1.02, dur=0.6, tone='body', fit=True, tier=0, seed=8),
                decal('rune', 0.1, 9.0, 1.8, at='area', grow=0.4, tone='shadow', alpha=0.7, tier=1),
            ],
            # b = khiêu khích mạnh + tự giảm sát thương 3 s: bốn tấm thuẫn dựng quanh thân, ở lại ~3 s
            'guard': [
                mesh('shield_plate', 0.05 + 0.03 * i, 2.8, at='self', offset=[x, G, z], rot=[0, a, 0], scale=[1.1, 1.15, 1.1], sweep=0.12, erodeFrom=0.82, alpha=1, camFade=True,
                     follow=True, tone='core', tier=0, seed=20 + i)
                for i, (x, z, a) in enumerate(around(4, 1.25, math.pi / 4))
            ],
        },
    }


R['skl_tran_son_an'] = tran_son


def kim_chung():
    """Kim Chung Tráo (giảm 30% + phản đòn, 6 s; hit 0,4 s): một quả CHUÔNG đồng dạng khung úp từ trên xuống quanh thân, "boong" một vành
    sóng tỏa ngang; chuông ở lại (khung hở, vẫn thấy nhân vật) rồi tan, quầng nền cũ báo thời gian còn lại."""
    B = [1.5, 1.55, 1.5]  # miệng chuông r 1,5 m, cao 3,1 m
    ev = [
        parts('spark', -0.4, 20, 1.6, 1, 0.34, 0.06, at='self', inward=True, tone='body', tier=1),
        snd(-0.4, 'cast', 0.4, 0.9),
        decal('rune', -0.36, 1.9, 1.4, at='self', offset=[0, G, 0], grow=0.25, tone='body', alpha=0.9, tier=0),
        # chuông úp xuống
        mesh('bell_cage', -0.24, 0.24, at='self', offset=[0, G + 7, 0], scale=B, sweep=0, erodeFrom=0.98, alpha=1, keepUp=True,
             move={'to': 'self', 'offset': [0, G, 0], 'ease': 'in'}, tone='body', tier=0, seed=1),
        # chuông ở lại 3,6 s (bám theo người), tan dần từ chân lên
        mesh('bell_cage', 0.0, 3.6, at='self', offset=[0, G, 0], scale=B, sweep=0, erodeFrom=0.8, alpha=0.95, follow=True, tone='body', tier=0, seed=1),
        snd(0.0, 'block', 0.85, 0.7, 0.03),
        snd(0.0, 'shield', 0.5, 0.85, 0.04),
        snd(0.03, 'impact', 0.5, 0.75, 0.04),
        # "boong": vành sóng ở chân + một vành ngang ngực (tiếng chuông lan)
        wave(0.0, 'self', G, 1.5, 4.4, dur=0.45, tone='body', seed=3),
        mesh('rune_ring2', 0.05, 0.42, at='self', offset=[0, 0.1, 0], scale=1.6, scaleTo=3.6, sweep=0.04, erodeFrom=0.6, alpha=0.9, shadow=False, tone='core', tier=1, seed=4),
        mesh('burst', -0.02, 0.11, at='self', offset=[0, 1.9, 0], scale=1.5, billboard=True, sweep=0, tone='body', cross=True, tier=0),
        mesh('crack_radial', 0.0, 0.9, at='self', offset=[0, G + 0.05, 0], scale=2.6, alpha=1, sweep=0.02, erodeFrom=0.75, shadow=False, tone='core', tier=0, seed=2),
        decal('scorch', 0.0, 2.2, 2.6, at='self', offset=[0, G, 0], grow=0.05, tone='shadow', alpha=0.7, tier=1),
        flip('dust_kick', 0.0, 0.7, 3.0, at='self', offset=[0, G + 0.5, 0], alpha=0.55, tone='core', tier=1),
        parts('spark', 0.0, 30, 5, 1, 0.4, 0.08, at='self', offset=[0, G + 0.3, 0], tone='body', tier=0),
        parts('dust', 0.0, 36, 3.6, 1, 0.7, 0.24, at='self', offset=[0, G + 0.2, 0], tone='core', tier=1),
    ]
    ev += debris_at(-0.02, 'self', [0, G, 0], 6, 1.7, 1.3, 0.5, seed0=0.9)
    ev += feel(0.0, ms=60, sh=0.32, fl=0.08, vg=0.25, fov=1.5)
    return {
        'skill': 'skl_kim_chung_tran',
        'events': ev,
        'variants': {
            # a = phản đòn mạnh (thời gian ngắn hơn): tám gai đá chĩa ra quanh miệng chuông
            'thorn': [
                mesh('rock_spire', 0.06 + 0.02 * i, 2.4, at='self', offset=[x, G + 0.1, z], rot=[58, a, 0], scale=[0.75, 1.5, 0.75], sweep=0.15, erodeFrom=0.75, alpha=1,
                     follow=True, tone='core', tier=0 if i % 2 == 0 else 1, seed=30 + i)
                for i, (x, z, a) in enumerate(around(8, 1.45))
            ],
            # b = che cho đồng đội trong 8 m: sóng quét ra 8 m + vành ở lại đúng mép 8 m + triện mờ
            'ally': [
                wave(0.08, 'self', G, 1.5, 8 * EDGE, dur=0.55, tone='body', seed=40),
                zone_ring(0.4, 'self', G, 8, 3.2, tone='core', seed=41),
                decal('rune', 0.1, 8.0, 3.2, at='self', offset=[0, G, 0], grow=0.4, tone='shadow', alpha=0.6, tier=1),
            ],
        },
    }


R['skl_kim_chung_tran'] = kim_chung


def son_nhac():
    """Sơn Nhạc Hóa Thân (buff giảm 20%, 10 s; hit 0,6 s): đá dưới chân bị hút lên trong lúc tụ, rồi một VÀNH NÚI ĐÁ tối trồi lên quanh thân
    (thấp phía camera nhìn xuyên được), nền nứt rộng; núi tan thì vài tảng đá lơ lửng bám theo người (thân đã hóa núi)."""
    ev = [
        parts('dust', -0.6, 30, 1.8, 1, 0.5, 0.2, at='self', offset=[0, G + 0.2, 0], inward=True, tone='core', tier=1),
        snd(-0.6, 'cast', 0.45, 0.7),
        snd(-0.3, 'thunder', 0.3, 0.6, 0.04),
    ]
    # tụ: đá nhỏ rời đất bay lên quanh người
    for i, (x, z, _a) in enumerate(around(8, 2.3, 0.3)):
        ev.append(mesh('rubble_a' if i % 2 else 'rubble_c', -0.55 + 0.03 * i, 0.5, at='self', offset=[x, G + 0.1, z], rot=[40 * i, 70 * i, 15 * i], scale=0.45, sweep=0, erodeFrom=0.9, alpha=1,
                       move={'to': 'self', 'offset': [round(x * 0.6, 2), 0.2 + 0.25 * (i % 3), round(z * 0.6, 2)], 'ease': 'out'}, tone='core', tier=0 if i < 4 else 1, seed=50 + i))
    # vành núi: 7 trụ đá quanh thân, ngả ra ngoài; trụ sau lưng cao, trụ phía trước thấp
    for i, (x, z, a) in enumerate(around(7, 2.1, 0.2)):
        h = 1.2 + 1.3 * (0.5 + 0.5 * math.cos(math.radians(a)))  # a = 0 (trước mặt người, xa camera sau lưng) cao nhất
        ev.append(mesh('rock_spire', -0.1 + 0.015 * i, 1.8, at='self', offset=[x, G, z], rot=[14, a, 0], scale=[1.9, round(h, 2), 1.9], sweep=0.08, erodeFrom=0.62, alpha=1, camFade=True,
                       tone='shadow', tier=0 if i % 2 == 0 else 1, seed=60 + i))
    ev += [
        snd(0.0, 'impact', 0.95, 0.6, 0.04),
        snd(0.02, 'block', 0.5, 0.62, 0.05),
        wave(0.0, 'self', G, 1.2, 5.6, dur=0.45, tone='body', seed=3),
        wave(0.07, 'self', G, 1.0, 4.4, dur=0.4, tone='core', tier=1, seed=4),
        flip('dust_kick', 0.1, 0.8, 3.8, at='self', offset=[2.0, G + 0.6, 1.2], alpha=0.6, tone='core', tier=1),
        flip('dust_kick', 0.14, 0.8, 3.8, at='self', offset=[-2.0, G + 0.6, -1.0], alpha=0.6, tone='core', tier=2),
    ]
    ev += quake(0.0, 'self', G, 4.6, 5.0, burst=2.0, dust=4.4)
    # hóa thân: 5 tảng đá lơ lửng quanh người ở lại 3 s
    for i, (x, z, _a) in enumerate(around(5, 1.25, 0.7)):
        ev.append(mesh('rubble_b', 1.1 + 0.05 * i, 3.0, at='self', offset=[x, -0.3 + 0.35 * (i % 3), z], rot=[25 * i, 80 * i, 10 * i], scale=0.42, sweep=0.15, erodeFrom=0.8, alpha=1,
                       follow=True, tone='core', tier=1, seed=70 + i))
    ev += feel(0.0, ms=75, sh=0.45, fl=0.1, vg=0.3, fov=2.5)
    return {
        'skill': 'skl_son_nhac_hoa_than',
        'events': ev,
        'variants': {
            # a = hồi máu mỗi giây: ba nhịp vành nhỏ dâng + cánh sáng bay lên quanh thân
            'regen': [
                e
                for k, t in enumerate([0.3, 1.1, 1.9])
                for e in (
                    mesh('rune_ring2', t, 0.7, at='self', offset=[0, G + 0.2, 0], scale=1.9, scaleTo=1.2, sweep=0.1, erodeFrom=0.5, alpha=0.8, shadow=False, follow=True, tone='body', tier=0, seed=80 + k),
                    parts('petal', t, 14, 1.6, 1, 1.1, 0.1, at='self', offset=[0, G + 0.4, 0], grav=-1.2, tone='body', tier=0),
                )
            ],
            # b = giậm mỗi 2 s trong 6 m: vành ở lại đúng mép 6 m + triện tối (vùng sẽ bị giậm)
            'stomp': [
                wave(0.1, 'self', G, 1.5, 6 * EDGE, dur=0.5, tone='body', seed=90),
                zone_ring(0.4, 'self', G, 6, 3.0, tone='core', seed=91),
                decal('rune', 0.1, 6.0, 3.2, at='self', offset=[0, G, 0], grow=0.4, tone='shadow', alpha=0.7, tier=1),
            ],
        },
    }


R['skl_son_nhac_hoa_than'] = son_nhac


def kim_cuong():
    """Kim Cương Bất Hoại (tối thượng, giảm 60% trong 6 s; hit 0,4 s): sáu tấm THUẪN đồng bay từ ngoài vào khép thành vách sáu cạnh quanh thân,
    khóa lại thành KHUNG KIM CƯƠNG ở lại 4 s; pháp tướng La Hán (thẻ) hiện lệch một bên ≤ 1,5 s. Tối thượng nên có slowmo + kéo camera."""
    plates = around(6, 2.35)
    ev = [
        parts('spark', -0.42, 34, 2.2, 1, 0.4, 0.07, at='self', inward=True, tone='body', tier=1),
        snd(-0.42, 'cast', 0.55, 0.75),
        vig(-0.4, 0.3, 450, tier=1),
        cam(-0.36, 0.15, 2.0, fov=4.0, tier=1),
        decal('rune', -0.4, 2.6, 1.6, at='self', offset=[0, G, 0], grow=0.3, tone='body', alpha=0.95, tier=0),
    ]
    for i, (x, z, a) in enumerate(plates):
        far = [round(x * 3.4, 2), G + 2.0, round(z * 3.4, 2)]
        ev.append(mesh('shield_plate', -0.34 + 0.012 * i, 0.32, at='self', offset=far, rot=[0, a, 0], scale=1.0, sweep=0, erodeFrom=0.98, alpha=1, keepUp=True, camFade=True,
                       move={'to': 'self', 'offset': [x, G, z], 'ease': 'in'}, tone='core', tier=0 if i % 2 == 0 else 1, seed=10 + i))
        ev.append(mesh('shield_plate', 0.0, 1.0, at='self', offset=[x, G, z], rot=[0, a, 0], scale=1.0, sweep=0, erodeFrom=0.5, alpha=1, follow=True, camFade=True,
                       tone='core', tier=0 if i % 2 == 0 else 1, seed=10 + i))
    ev += [
        snd(-0.2, 'slash', 0.45, 0.72, 0.04),
        # khóa: khung kim cương ở lại 4 s quanh thân
        mesh('diamond_cage', 0.0, 4.0, at='self', offset=[0, G - 0.25, 0], scale=[1.85, 1.75, 1.85], sweep=0.1, erodeFrom=0.85, alpha=1, follow=True, tone='body', tier=0, seed=2),
        slow(0.0, 0.4, 250, tier=2),
        snd(0.0, 'block', 0.95, 0.66, 0.03),
        snd(0.0, 'impact', 0.85, 0.7, 0.04),
        snd(0.03, 'shield', 0.6, 0.8, 0.04),
        wave(0.0, 'self', G, 1.6, 6.5, dur=0.46, tone='body', seed=3),
        wave(0.07, 'self', G, 1.4, 5.0, dur=0.42, tone='core', tier=1, seed=4),
        # pháp tướng La Hán: thẻ vẽ, lệch trái trước mặt, mọc rồi tan trong 1,5 s
        mesh('card', -0.3, 1.5, card='arhat', at='self', offset=[-3.4, 6.5 / 2 - 1.15 + 0.4, 6.0], billboard=True, scale=[round(6.5 * 512 / 768 / 2, 2), 3.25, 1], sweep=0.3, erodeFrom=0.6,
             alpha=0.9, tone='body', seed=960, tier=0),
        parts('spark', 0.0, 60, 2.0, 1, 1.4, 0.09, at='self', offset=[-3.4, 3.2, 6.0], grav=-0.5, tone='body', tier=1),
    ]
    ev += quake(0.0, 'self', G, 4.0, 4.4, burst=2.6, sparks=60, dust=4.2)
    ev += debris_at(-0.02, 'self', [0, G, 0], 8, 3.2, 2.4, 0.65, seed0=0.2)
    ev += [stop(0.0, 70), shake(0.0, 0.45), flash(0.0, 0.1, tier=0), vig(0.0, 0.4, 320, tier=1)]
    return {'skill': 'skl_kim_cuong_bat_hoai', 'events': ev}


R['skl_kim_cuong_bat_hoai'] = kim_cuong


def phap_tuong():
    """Thiên Kim Pháp Tướng (cấp 28, buff giảm 25% + giậm mỗi 3 s trong 8 m, 12 s; hit 0,6 s): TỨ TRỤ đá tối gân đồng lần lượt trồi lên bốn góc (trụ nào nằm giữa camera và người thì tự ẩn, `camFade`),
    PHÁP LUÂN (hai vành đứng) hiện sau đầu, sóng chấn quét ra và vành ở lại ở mép 8 m (vùng giậm)."""
    ev = [
        parts('spark', -0.6, 44, 2.6, 1, 0.5, 0.08, at='self', inward=True, tone='body', tier=1),
        snd(-0.6, 'cast', 0.55, 0.68),
        vig(-0.55, 0.3, 550, tier=1),
        decal('rune', -0.55, 4.6, 2.0, at='self', offset=[0, G, 0], grow=0.4, tone='body', alpha=0.95, tier=0),
    ]
    # tứ trụ: trồi lần lượt (mỗi trụ một nhịp), trụ cuối đúng khung hit
    for i, (x, z, a) in enumerate(arc([-135, -45, 45, 135], 5.2)):
        t0 = -0.36 + 0.12 * i
        ev.append(mesh('rock_spire', t0, 2.6 - t0, at='self', offset=[x, G, z], rot=[0, a + 40 * i, 0], scale=[2.1, 4.4, 2.1], sweep=0.1, erodeFrom=0.72, alpha=1, camFade=True,
                       tone='shadow', tier=0, seed=10 + i))
        ev.append(flip('dust_kick', t0, 0.7, 2.8, at='self', offset=[x, G + 0.6, z], alpha=0.55, tone='core', tier=1))
        if i < 3:
            ev.append(snd(t0, 'impact', 0.4, 0.8 - 0.05 * i, 0.05))
    ev += [
        # pháp luân: hai vành ĐỨNG sau đầu, bám theo người 3,6 s
        mesh('rune_ring2', -0.1, 3.7, at='self', offset=[0, 1.9, -0.9], rot=[90, 0, 0], scale=2.5, scaleTo=2.7, sweep=0.2, erodeFrom=0.85, alpha=1, shadow=False, follow=True, tone='body', tier=0, seed=20),
        mesh('rune_ring2', 0.0, 3.6, at='self', offset=[0, 1.9, -0.95], rot=[90, 0, 22], scale=1.5, scaleTo=1.6, sweep=0.2, erodeFrom=0.85, alpha=0.95, shadow=False, follow=True, tone='core', tier=1, seed=21),
        snd(0.0, 'impact', 0.95, 0.6, 0.04),
        snd(0.0, 'block', 0.6, 0.6, 0.05),
        snd(0.03, 'thunder', 0.35, 0.62, 0.04),
        # sóng chấn ra mép 8 m (vùng giậm) + vành ở lại
        wave(0.0, 'self', G, 1.5, 8 * EDGE, dur=0.5, tone='body', seed=3),
        wave(0.08, 'self', G, 1.2, 6.2, dur=0.46, tone='core', tier=1, seed=4),
        zone_ring(0.35, 'self', G, 8, 3.2, tone='core', seed=5),
    ]
    ev += quake(0.0, 'self', G, 6.0, 6.4, burst=2.8, sparks=60, dust=5.0, tier_decal=0)
    ev += debris_at(-0.02, 'self', [0, G, 0], 10, 3.4, 3.0, 0.8, seed0=0.6)
    ev += feel(0.0, ms=80, sh=0.55, fl=0.12, vg=0.35, fov=4.0, pull=0.12)
    return {
        'skill': 'skl_thien_kim_phap_tuong',
        'events': ev,
        'variants': {
            # a = giảm thêm 15%: ba tấm thuẫn lớn dựng giữa các trụ (thành chắn phía trước), ở lại 3 s
            'immune': [
                mesh('shield_plate', 0.08 + 0.04 * i, 3.0, at='self', offset=[x, G, z], rot=[0, a, 0], scale=[2.0, 1.6, 2.0], sweep=0.14, erodeFrom=0.8, alpha=1, camFade=True,
                     tone='core', tier=0, seed=40 + i)
                for i, (x, z, a) in enumerate(arc([-78, 0, 78], 4.2))
            ],
            # b = giậm mạnh hơn: ba nhịp sóng nối nhau ra mép 8 m + nứt lớn
            'stomp': [
                *[wave(0.3 + 0.5 * k, 'self', G, 1.0, 8 * EDGE, dur=0.5, tone='body', tier=0 if k == 0 else 1, seed=50 + k) for k in range(3)],
                decal('crack', 0.3, 8.0, 3.0, at='self', offset=[0, G, 0], grow=0.2, tone='core', alpha=0.9, tier=1),
            ],
        },
    }


R['skl_thien_kim_phap_tuong'] = phap_tuong


# --------------------------------------------------------------------------------------------------------------------------------
# VS-1 Hộ pháp phần 3: 4 chiêu còn lại (hai chiêu lướt kích theo S.FX, một hộ thể, một khiên cho đồng đội).
# Chiêu lướt (`trigger: fx`): t = 0 là lúc nhận S.FX (người đã được server đặt ở ĐÍCH, model trượt ~0,3 s từ chỗ cũ), mọi t ≥ 0;
# đường lướt nằm SAU lưng (`self` offset z âm), cú húc ở DASH_HIT. Thuấn Di Hộ Thể neo `self` (sau thuấn di người đứng cạnh đồng đội 1,8 m;
# S.FX của chiêu không có `dst` nên `target` không đáng tin).
DASH_HIT = 0.24


def thiet_bich():
    """Thiết Bích Xung (lướt húc 8 m, choáng 1 s): một tấm THUẪN sắt lớn lao dọc đường lướt (hai bóng thuẫn nối đuôi), dừng sầm trước mặt
    ngay chỗ húc: nứt nền nhỏ, đá văng, bụi dọc đường."""
    T = DASH_HIT
    P = [1.9, 1.5, 1.9]
    ev = [
        snd(0.0, 'slash', 0.5, 0.7, 0.05),
        parts('dust', 0.0, 24, 3.0, 0.9, 0.5, 0.22, at='self', offset=[0, G + 0.2, -6.0], tone='core', tier=1),
        mesh('shield_plate', 0.0, T, at='self', offset=[0, G, -5.5], scale=P, sweep=0, erodeFrom=0.98, alpha=1, keepUp=True,
             move={'to': 'self', 'offset': [0, G, 1.0], 'ease': 'out'}, tone='core', tier=0, seed=1),
        mesh('shield_plate', 0.04, T, at='self', offset=[0, G, -5.5], scale=P, sweep=0, erodeFrom=0.5, alpha=0.5, keepUp=True,
             move={'to': 'self', 'offset': [0, G, 0.2], 'ease': 'out'}, tone='body', tier=1, seed=2),
        mesh('shield_plate', 0.08, T, at='self', offset=[0, G, -5.5], scale=P, sweep=0, erodeFrom=0.4, alpha=0.3, keepUp=True,
             move={'to': 'self', 'offset': [0, G, -0.8], 'ease': 'out'}, tone='body', tier=2, seed=3),
        flip('dust_kick', 0.05, 0.7, 2.6, at='self', offset=[0.3, G + 0.5, -5.0], alpha=0.5, tone='core', tier=1),
        flip('dust_kick', 0.13, 0.7, 2.6, at='self', offset=[-0.3, G + 0.5, -2.4], alpha=0.5, tone='core', tier=1),
        # húc: thuẫn đứng sững trước mặt rồi tan
        mesh('shield_plate', T, 0.55, at='self', offset=[0, G, 1.0], scale=P, sweep=0, erodeFrom=0.35, alpha=1, tone='core', tier=0, seed=1),
        snd(T, 'impact', 0.85, 0.75, 0.04),
        snd(T, 'block', 0.6, 0.8, 0.05),
        wave(T, 'self', G, 0.8, 3.2, dur=0.36, tone='body', seed=3),
    ]
    for i, (dx, dy, dz) in enumerate([(1.6, 0.9, 0.6), (-1.5, 0.8, 0.8), (0.3, 1.8, 0.4)]):
        ev.append(mesh('spark_streak', T, 0.24, at='self', offset=[0, 0, 1.4], scale=1.4, move={'to': 'self', 'offset': [dx, dy, 1.4 + dz], 'ease': 'out'},
                       shadow=False, tone='body', alpha=1, seed=i + 1, tier=1))
    q = quake(T, 'self', G, 2.6, 2.8, burst=1.8, sparks=36, dust=3.0)
    for e in q:
        e['offset'] = [e['offset'][0], e['offset'][1], 1.6]
    ev += q
    ev += debris_at(T - 0.02, 'self', [0, G, 1.6], 6, 1.2, 1.4, 0.45, seed0=0.3)
    ev += [stop(T, 55), shake(T, 0.32), flash(T, 0.08, tier=0), vig(T, 0.25, 300, tier=1), cam(T, 0, 0.5, fov=1.5, tier=1)]
    return {'skill': 'skl_thiet_bich_xung', 'trigger': 'fx', 'fxKind': 'dash', 'method': 'bat_dong_kim_than', 'events': ev}


R['skl_thiet_bich_xung'] = thiet_bich


def dich_son():
    """Dịch Sơn Xung (lướt đẩy lùi 6 m): chỗ húc trồi lên một VÁCH ĐÁ ba tảng, vách trượt về trước 6 m cày một rãnh nứt dài (đẩy kẻ địch đi);
    biến thức kéo (`pull`) thì bỏ vách trượt (`unless`), thay bằng đá và vành sóng co VỀ phía mình."""
    T = DASH_HIT
    Z0, PUSH = 1.5, 6.0
    ev = [
        snd(0.0, 'slash', 0.5, 0.66, 0.05),
        parts('dust', 0.0, 26, 3.0, 0.9, 0.55, 0.24, at='self', offset=[0, G + 0.2, -5.0], tone='core', tier=1),
        flip('dust_kick', 0.06, 0.7, 2.8, at='self', offset=[0, G + 0.5, -4.0], alpha=0.5, tone='core', tier=1),
        snd(T, 'impact', 0.9, 0.66, 0.04),
        snd(T, 'thunder', 0.35, 0.62, 0.04),
        # rãnh cày dọc đường đẩy (tối + viền sáng)
        mesh('rift_line', T, 1.3, at='self', offset=[0, G + 0.1, Z0 - 0.3], scale=[2.4, 1, PUSH + 0.6], alpha=1, sweep=0.38, erodeFrom=0.75, shadow=False, tone='core', tier=0, seed=3),
        mesh('rift_line', T, 0.9, at='self', offset=[0, G + 0.13, Z0 - 0.3], scale=[1.5, 1, PUSH + 0.6], alpha=0.85, sweep=0.38, erodeFrom=0.5, shadow=False, tone='body', tier=1, seed=3),
        flip('dust_kick', T + 0.12, 0.7, 3.0, at='self', offset=[0.4, G + 0.6, Z0 + 2.5], alpha=0.55, tone='core', tier=1),
        flip('dust_kick', T + 0.26, 0.7, 3.0, at='self', offset=[-0.4, G + 0.6, Z0 + 5.0], alpha=0.55, tone='core', tier=2),
    ]
    # vách đá ba tảng: trồi ở chỗ húc rồi trượt về trước (bỏ khi biến thức kéo)
    for i, (x, h) in enumerate([(-1.15, 2.1), (0.0, 2.8), (1.15, 2.2)]):
        k = dict(at='self', rot=[16, 25 * (i - 1), 0], scale=[1.7, h, 1.7], alpha=1, tone='shadow', tier=0 if i == 1 else 1, seed=10 + i, unless='pull')
        ev.append(mesh('rock_spire', T - 0.02, 0.5, offset=[x, G, Z0], sweep=0.2, erodeFrom=0.98, keepUp=True,
                       move={'to': 'self', 'offset': [x, G, Z0 + PUSH], 'ease': 'out'}, **k))
        ev.append(mesh('rock_spire', T + 0.48, 0.7, offset=[x, G, Z0 + PUSH], sweep=0, erodeFrom=0.35, **k))
    q = quake(T, 'self', G, 3.2, 3.4, burst=2.0, sparks=40, dust=3.4)
    for e in q:
        e['offset'] = [e['offset'][0], e['offset'][1], Z0]
    ev += q
    ev += debris_at(T - 0.02, 'self', [0, G, Z0], 6, 1.5, 1.8, 0.55, seed0=0.8)
    ev += [stop(T, 60), shake(T, 0.4), flash(T, 0.1, tier=0), vig(T, 0.3, 300, tier=1), cam(T, 0, 0.5, fov=2.0, tier=1)]
    end = Z0 + PUSH
    return {
        'skill': 'skl_dich_son_xung', 'trigger': 'fx', 'fxKind': 'dichson', 'replaces': ['dichson'],
        'events': ev,
        'variants': {
            # a = choáng lâu: cuối đường đẩy vách đá vỡ nổ, vành choáng mở ra
            'stun': [
                mesh('burst', T + 0.5, 0.11, at='self', offset=[0, G + 1.0, end], scale=1.8, billboard=True, sweep=0, tone='body', cross=True, tier=0),
                mesh('crack_radial', T + 0.5, 0.9, at='self', offset=[0, G + 0.05, end], scale=2.6, alpha=1, sweep=0.02, erodeFrom=0.75, shadow=False, tone='core', tier=0, seed=5),
                wave(T + 0.5, 'self', G, 0.6, 2.6, dur=0.4, tone='body', seed=6),
                snd(T + 0.5, 'crit', 0.5, 0.8, 0.05),
            ],
            # b = kéo về: hai tảng đá và vành sóng co từ xa VỀ phía mình (không có vách trượt đi)
            'pull': [
                mesh('rune_ring2', T, 0.45, at='self', offset=[0, G + 0.1, Z0], scale=6.0, scaleTo=1.4, sweep=0.04, erodeFrom=0.75, alpha=1, shadow=False, tone='body', tier=0, seed=7),
                *[mesh('rock_spire', T + 0.02, 0.42, at='self', offset=[x, G, end + 1.0], rot=[-16, 180, 0], scale=[1.5, 1.9, 1.5], sweep=0.2, erodeFrom=0.8, alpha=1, keepUp=True,
                       move={'to': 'self', 'offset': [x * 0.8, G, Z0 + 1.4], 'ease': 'in'}, tone='shadow', tier=0, seed=20 + i) for i, x in enumerate([-1.2, 1.2])],
            ],
        },
    }


R['skl_dich_son_xung'] = dich_son


def anh_thiet():
    """Ảnh Thiết Thân (giảm 30% trong 8 s; hit 0,35 s): ba BÓNG SẮT (thẻ bóng người tông đồng sẫm) từ hai bên và sau lưng nhập vào thân,
    khóa lại thành BA ĐAI GIÁP (vành ngang gối, bụng, vai) bám theo người ~3,8 s."""
    GH = [0.95, 1.9, 1]
    ev = [
        parts('spark', -0.35, 24, 1.8, 1, 0.3, 0.06, at='self', inward=True, tone='body', tier=1),
        snd(-0.35, 'cast', 0.45, 0.85),
        decal('rune', -0.32, 1.7, 1.2, at='self', offset=[0, G, 0], grow=0.2, tone='body', alpha=0.9, tier=0),
    ]
    for i, (x, z) in enumerate([(-1.9, 0.3), (1.9, 0.3), (0.0, -1.9)]):
        ev.append(mesh('card', -0.32 + 0.03 * i, 0.3, card='ghost', at='self', offset=[x, 0.1, z], billboard=True, scale=GH, sweep=0.15, erodeFrom=0.85, alpha=0.85,
                       move={'to': 'self', 'offset': [0, 0.1, 0], 'ease': 'in'}, tone='core', tier=0 if i < 2 else 1, seed=11 + i))
    ev += [
        snd(-0.1, 'slash', 0.35, 0.8, 0.04),
        # nhập thân: bóng phình ra rồi tan + ba đai giáp khóa quanh người
        mesh('card', 0.0, 0.34, card='ghost', at='self', offset=[0, 0.1, 0], billboard=True, scale=GH, scaleTo=[1.35, 2.7, 1], sweep=0, erodeFrom=0.2, alpha=0.55,
             follow=True, tone='body', tier=0, seed=15),
        snd(0.0, 'block', 0.85, 0.74, 0.03),
        snd(0.0, 'shield', 0.5, 0.9, 0.04),
        snd(0.03, 'impact', 0.45, 0.8, 0.04),
        mesh('burst', -0.02, 0.11, at='self', offset=[0, 0.2, 0], scale=1.5, billboard=True, sweep=0, tone='body', cross=True, tier=0),
    ]
    for i, (y, s, tone) in enumerate([(G + 0.45, 1.0, 'body'), (G + 1.05, 1.12, 'core'), (G + 1.65, 0.95, 'body')]):
        ev.append(mesh('rune_ring2', 0.05 * i, 3.8 - 0.05 * i, at='self', offset=[0, y, 0], rot=[0, 40 * i, 0], scale=s, scaleTo=s, sweep=0.06, erodeFrom=0.85, alpha=1, shadow=False,
                       follow=True, tone=tone, tier=0 if i != 1 else 1, seed=20 + i))
    ev += [
        wave(0.0, 'self', G, 1.0, 3.6, dur=0.42, tone='body', seed=3),
        mesh('crack_radial', 0.0, 0.9, at='self', offset=[0, G + 0.05, 0], scale=2.2, alpha=1, sweep=0.02, erodeFrom=0.75, shadow=False, tone='core', tier=0, seed=2),
        decal('scorch', 0.0, 2.0, 2.6, at='self', offset=[0, G, 0], grow=0.05, tone='shadow', alpha=0.7, tier=1),
        flip('dust_kick', 0.0, 0.7, 2.8, at='self', offset=[0, G + 0.5, 0], alpha=0.5, tone='core', tier=1),
        parts('spark', 0.0, 28, 5, 1, 0.4, 0.08, at='self', offset=[0, 0, 0], tone='body', tier=0),
    ]
    ev += debris_at(-0.02, 'self', [0, G, 0], 6, 1.5, 1.2, 0.42, seed0=1.1)
    ev += feel(0.0, ms=60, sh=0.3, fl=0.08, vg=0.25, fov=1.5)
    return {
        'skill': 'skl_anh_thiet_than',
        'events': ev,
        'variants': {
            # a = kéo dài: thêm đai thứ tư trên đầu và hai nhịp vành chân nhắc "vẫn còn hiệu lực"
            'long': [
                mesh('rune_ring2', 0.15, 3.8, at='self', offset=[0, G + 2.2, 0], scale=0.7, scaleTo=0.7, sweep=0.06, erodeFrom=0.85, alpha=1, shadow=False, follow=True, tone='core', tier=0, seed=30),
                *[mesh('rune_ring2', t, 0.6, at='self', offset=[0, G + 0.12, 0], scale=1.0, scaleTo=2.4, sweep=0.06, erodeFrom=0.5, alpha=0.8, shadow=False, follow=True, tone='body', tier=1, seed=31 + k)
                  for k, t in enumerate([1.4, 2.8])],
            ],
            # b = thêm giảm sát thương cho riêng mình 3 s: hai tấm thuẫn chắn chéo trước mặt
            'self': [
                mesh('shield_plate', 0.06 + 0.04 * i, 2.8, at='self', offset=[x, G, z], rot=[0, a, 0], scale=[1.15, 1.1, 1.15], sweep=0.12, erodeFrom=0.82, alpha=1, camFade=True,
                     follow=True, tone='core', tier=0, seed=40 + i)
                for i, (x, z, a) in enumerate(arc([-38, 38], 1.35))
            ],
        },
    }


R['skl_anh_thiet_than'] = anh_thiet


def thuan_di_ho_the():
    """Thuấn Di Hộ Thể (thuấn di tới đồng đội + khiên 6 s; hit 0,25 s): đáp xuống cạnh đồng đội, một LŨY THUẪN thấp tám tấm dựng vòng r 3 m
    quanh chỗ đáp (thấp ngang hông: không che người), vành ở lại ở mép lũy. Neo `self`: sau thuấn di người đứng cách đồng đội 1,8 m."""
    RW = 3.0
    ev = [
        parts('spark', -0.25, 18, 2.0, 1, 0.24, 0.06, at='self', inward=True, tone='body', tier=1),
        snd(-0.25, 'cast', 0.45, 1.1),
        mesh('burst', -0.06, 0.1, at='self', offset=[0, 0.2, 0], scale=1.3, billboard=True, sweep=0, tone='body', tier=0),
    ]
    # đáp: ba tia từ trên cao cắm xuống chỗ đáp
    for i, (x, z) in enumerate([(0.5, 0.2), (-0.4, 0.5), (0.0, -0.5)]):
        ev.append(mesh('spark_streak', -0.02 + 0.01 * i, 0.12, at='self', offset=[x * 3, 7.0, z * 3], scale=2.2, move={'to': 'self', 'offset': [x, G + 0.2, z], 'ease': 'in'},
                       shadow=False, tone='body', alpha=1, seed=i + 1, tier=1))
    ev += [
        snd(0.0, 'impact', 0.8, 0.8, 0.04),
        snd(0.0, 'shield', 0.6, 0.85, 0.04),
        snd(0.04, 'block', 0.5, 0.78, 0.05),
        wave(0.0, 'self', G, 0.8, RW * EDGE, dur=0.4, tone='body', seed=3),
        zone_ring(0.3, 'self', G, RW, 3.2, tone='core', seed=5),
    ]
    for i, (x, z, a) in enumerate(around(8, RW, math.pi / 8)):
        ev.append(mesh('shield_plate', 0.02 + 0.02 * i, 3.3, at='self', offset=[x, G, z], rot=[0, a, 0], scale=[1.7, 0.72, 1.7], sweep=0.08, erodeFrom=0.82, alpha=1, camFade=True,
                       tone='core', tier=0 if i % 2 == 0 else 1, seed=10 + i))
    ev += quake(0.0, 'self', G, 2.8, 3.0, burst=1.8, sparks=36, dust=3.2)
    ev += debris_at(-0.02, 'self', [0, G, 0], 6, 1.4, 1.5, 0.45, seed0=0.5)
    ev += feel(0.0, ms=55, sh=0.3, fl=0.08, vg=0.25, fov=1.5)
    return {
        'skill': 'skl_thuan_di_ho_the',
        'events': ev,
        'variants': {
            # a = khiêu khích quái trong 8 m ở chỗ đáp: sóng ra mép 8 m + vành ở lại + triện tối
            'taunt': [
                wave(0.08, 'self', G, 1.5, 8 * EDGE, dur=0.55, tone='body', seed=40),
                zone_ring(0.4, 'self', G, 8, 2.6, tone='core', seed=41),
                decal('rune', 0.1, 8.0, 2.6, at='self', offset=[0, G, 0], grow=0.4, tone='shadow', alpha=0.6, tier=1),
            ],
            # b = khiên dày hơn nhưng ngắn: thêm vòng lũy trong bốn tấm CAO, tan sớm
            'big': [
                mesh('shield_plate', 0.06 + 0.03 * i, 1.6, at='self', offset=[x, G, z], rot=[0, a, 0], scale=[1.5, 1.35, 1.5], sweep=0.1, erodeFrom=0.7, alpha=1, camFade=True,
                     tone='body', tier=0, seed=50 + i)
                for i, (x, z, a) in enumerate(around(4, 1.9))
            ],
        },
    }


R['skl_thuan_di_ho_the'] = thuan_di_ho_the

if __name__ == '__main__':
    for i in sys.argv[1:] or list(R):
        write(R[i]())
