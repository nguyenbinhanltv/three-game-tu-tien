# Công thức VFX-V3: Hộ pháp (Bất Động Kim Thân: hổ phách/vàng kim, bóng nâu, gai đá, chưởng ấn nứt đất, chuông vàng)
# và Đan sư (Thanh Mộc Đan Kinh: ngọc lục + đỏ son, sen nở, lá, dải lụa, đan hỏa xoáy). Nạp từ gen-fx-kiem.py.
import math


def register(R, H):
    mesh, parts, decal, stop, shake, flash, ring_spikes = H['mesh'], H['parts'], H['decal'], H['stop'], H['shake'], H['flash'], H['ring_spikes']

    def lotus(at, t, r=0.5, scale=1.0, tone='body', inner_tone='rim', y=-1.1, tier=0, n=8, seed0=100, dur=0.9, offset_xz=(0, 0), **k):
        """Sen nở: hai lớp cánh (kite nghiêng ra ngoài) bung từ khép sang mở trong `dur`."""
        out = []
        for layer in range(2):
            m = n if layer == 0 else n // 2 + 2
            for i in range(m):
                a = i / m * 360 + (0 if layer == 0 else 180 / m)
                rad = math.radians(a)
                rr = r * (1.0 if layer == 0 else 0.55)
                out.append(mesh('kite', round(t + 0.025 * i + 0.1 * layer, 3), dur, at=at,
                                offset=[round(offset_xz[0] + math.sin(rad) * rr, 2), y, round(offset_xz[1] + math.cos(rad) * rr, 2)],
                                rot=[-62 if layer == 0 else -78, round(a), 0],
                                scale=[round(0.32 * scale, 2), round(0.32 * scale, 2), round((0.95 if layer == 0 else 0.75) * scale, 2)],
                                sweep=0.3, erodeFrom=0.6, alpha=0.95, tone=tone if layer == 0 else inner_tone, seed=seed0 + i + 20 * layer,
                                tier=tier if layer == 0 else max(tier, 1), **k))
        return out

    def dust(t, n, at='ground', offset=None, **k):
        e = parts('dust', t, n, 3.0, 0.9, 0.55, 0.22, at=at, tone='core', grav=3, tier=1, **k)
        if offset:
            e['offset'] = offset
        return e

    # =============== HỘ PHÁP ===============

    # Trấn Sơn Ấn (khiêu khích diện rộng bán kính 12): ấn đóng đất, vòng chấn tỏa tới mép, gai đá bao quanh. Thay hình cũ.
    R['skl_tran_son_an'] = lambda: {
        'skill': 'skl_tran_son_an', 'replaces': ['transon'],
        'events': [
            parts('dust', -0.45, 22, 1.4, 1, 0.4, 0.18, at='self', offset=[0, -0.9, 0], inward=True, tone='core', tier=1),
            decal('rune', -0.4, 2.6, 1.2, at='self', offset=[0, -1.15, 0], grow=0.3, tone='body', alpha=0.9, tier=0),
            mesh('ripple', 0.0, 0.7, at='area', scale=0.1, scaleTo=1.0, fit='area', sweep=0.4, erodeFrom=0.5, ragged=0.7, tone='body', alpha=0.95, seed=2, tier=0),
            mesh('ripple', 0.1, 0.6, at='area', scale=0.1, scaleTo=0.6, fit='area', sweep=0.4, erodeFrom=0.5, tone='accent', alpha=0.7, seed=3, tier=2),
            mesh('burst', 0.0, 0.11, at='self', offset=[0, -0.6, 0], scale=1.4, billboard=True, sweep=0.0, tone='accent', tier=0),
            *ring_spikes(8, 1.6, 0.0, 'self', 0.55, 0.9, tier=0, y=-1.15, tilt=-16),
            decal('crack', 0.02, 3.6, 2.4, at='self', offset=[0, -1.15, 0], grow=0.14, tone='accent', alpha=0.95, tier=1),
            dust(0.02, 28, at='self', offset=[0, -1.0, 0]),
            stop(0.0, 70),
            shake(0.0, 0.3),
        ],
        'variants': {
            'wide': [mesh('ripple', 0.3, 0.6, at='area', scale=0.1, scaleTo=0.6, fit='area', sweep=0.4, tone='rim', alpha=0.7, seed=4, tier=1)],
            'guard': [mesh('helix', 0.0, 1.0, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[2.0, 2.0, 2.2], sweep=0.3, erodeFrom=0.55, spin=300, follow=True, tone='body', seed=5, tier=1)],
        },
    }

    # Kim Cương Bất Hoại (tối thượng, giảm sát thương): vàng kim bọc thân. Giữ quầng cũ, thêm bệ trận + trụ gai + vòng xoáy.
    R['skl_kim_cuong_bat_hoai'] = lambda: {
        'skill': 'skl_kim_cuong_bat_hoai',
        'events': [
            parts('spark', -0.45, 30, 1.8, 1, 0.4, 0.06, at='self', inward=True, tone='accent', tier=1),
            decal('rune', -0.4, 2.4, 2.4, at='self', offset=[0, -1.15, 0], grow=0.3, tone='accent', alpha=0.9, tier=0),
            mesh('ripple', 0.0, 0.7, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=2.4, sweep=0.4, erodeFrom=0.45, ragged=0.5, tone='body', tier=0, seed=2),
            *ring_spikes(6, 1.3, 0.0, 'self', 0.7, 1.6, tier=0, y=-1.15, tilt=-10, stagger=0.04),
            mesh('helix', 0.05, 1.6, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[2.2, 2.2, 3.0], sweep=0.3, erodeFrom=0.7, spin=-260, follow=True, tone='accent', alpha=0.85, tier=1, seed=6),
            mesh('burst', 0.0, 0.11, at='self', scale=1.5, billboard=True, sweep=0.0, tone='rim', tier=0),
            flash(0.0, 0.1, tier=1),
            stop(0.0, 60),
            shake(0.0, 0.25),
        ],
    }

    # Thiết Quyền Chấn Địa (AoE bán kính 6): nắm đấm đập, nứt đất, gai đá trồi tỏa tròn. Thay hình cũ.
    R['skl_thiet_quyen_chan_dia'] = lambda: {
        'skill': 'skl_thiet_quyen_chan_dia', 'replaces': ['thietquyen'],
        'events': [
            parts('dust', -0.4, 20, 1.4, 1, 0.35, 0.16, at='self', offset=[0.3, 0, 0.5], inward=True, tone='core', tier=1),
            mesh('ripple', 0.0, 0.6, at='area', scale=0.15, scaleTo=1.0, fit='area', sweep=0.4, erodeFrom=0.45, ragged=0.8, tone='body', alpha=0.95, seed=2, tier=0),
            mesh('ripple', 0.08, 0.5, at='area', scale=0.1, scaleTo=0.65, fit='area', sweep=0.4, erodeFrom=0.4, tone='accent', alpha=0.8, seed=3, tier=1),
            decal('scorch', 0.0, 5.5, 2.2, at='area', grow=0.1, tone='core', alpha=0.6, tier=1),
            decal('crack', 0.02, 6.0, 2.8, at='area', grow=0.14, tone='accent', alpha=0.95, tier=0),
            mesh('burst', 0.0, 0.11, at='area', offset=[0, 0.4, 0], scale=1.6, billboard=True, sweep=0.0, tone='accent', tier=0),
            *[mesh('spike', round(0.02 + 0.015 * i, 3), 0.75, at='area', offset=[round(math.cos(i / 10 * 6.283) * 3.6, 2), 0, round(math.sin(i / 10 * 6.283) * 3.6, 2)], rot=[-90 + (i % 2) * 12, 0, 0],
                   scale=round(0.7 + 0.15 * (i % 3), 2), sweep=0.2, erodeFrom=0.55, tone='body', seed=20 + i, tier=0 if i % 2 == 0 else 1) for i in range(10)],
            dust(0.0, 40, at='area', offset=[0, 0.2, 0]),
            stop(0.0, 80),
            shake(0.0, 0.5),
        ],
        'variants': {'wide': [mesh('ripple', 0.2, 0.6, at='area', scale=0.1, scaleTo=0.9, fit='area', sweep=0.4, tone='rim', alpha=0.6, seed=4, tier=1)],
                     'slow': [decal('rune', 0.1, 5.0, 2.4, at='area', grow=0.3, tone='core', alpha=0.8, tier=1)]},
    }

    # Kim Chung Trấn (giữ thế): chuông vàng úp quanh thân. Giữ quầng cũ; thêm vòng chuông dâng từ chân lên đầu và gai gai nhọn (biến thức thorn).
    R['skl_kim_chung_tran'] = lambda: {
        'skill': 'skl_kim_chung_tran',
        'events': [
            decal('rune', -0.35, 2.0, 1.6, at='self', offset=[0, -1.15, 0], grow=0.25, tone='body', alpha=0.9, tier=0),
            mesh('ripple', 0.0, 0.5, at='self', offset=[0, -1.1, 0], scale=0.4, scaleTo=1.6, sweep=0.4, erodeFrom=0.4, tone='body', tier=0, seed=2),
            mesh('ripple', 0.1, 0.5, at='self', offset=[0, -0.2, 0], scale=0.4, scaleTo=1.3, sweep=0.4, erodeFrom=0.4, tone='accent', alpha=0.9, tier=1, seed=3),
            mesh('ripple', 0.2, 0.5, at='self', offset=[0, 0.7, 0], scale=0.3, scaleTo=1.0, sweep=0.4, erodeFrom=0.4, tone='rim', alpha=0.8, tier=2, seed=4),
            mesh('burst', 0.0, 0.11, at='self', scale=1.2, billboard=True, sweep=0.0, tone='accent', tier=0),
            parts('spark', 0.0, 20, 3, 1, 0.5, 0.05, at='self', tone='accent', tier=0),
            *ring_spikes(5, 1.1, 0.05, 'self', 0.4, 0.8, tier=1, y=-1.15, tilt=0),
            stop(0.0, 40, tier=1),
        ],
        'variants': {'thorn': [*ring_spikes(8, 1.7, 0.12, 'self', 0.55, 1.0, tier=0, y=-1.15, tilt=22, seed0=40)]},
    }

    # Sơn Nhạc Hóa Thân (buff): thân hóa đá, gai núi ôm quanh người, nứt đất; mỗi nhịp giậm có hình riêng ở `sonnhac_stomp`.
    R['skl_son_nhac_hoa_than'] = lambda: {
        'skill': 'skl_son_nhac_hoa_than',
        'events': [
            parts('dust', -0.55, 30, 1.6, 1, 0.5, 0.2, at='self', offset=[0, -0.9, 0], inward=True, tone='core', tier=1),
            decal('rune', -0.5, 3.0, 1.8, at='self', offset=[0, -1.15, 0], grow=0.35, tone='accent', alpha=0.9, tier=0),
            decal('crack', 0.0, 3.2, 2.6, at='self', offset=[0, -1.15, 0], grow=0.14, tone='body', alpha=0.95, tier=1),
            *ring_spikes(7, 1.9, 0.0, 'self', 0.6, 0.9, tier=0, y=-1.15, tilt=-14, stagger=0.035),
            mesh('ripple', 0.0, 0.8, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=2.6, sweep=0.4, erodeFrom=0.4, ragged=0.7, tone='body', tier=0, seed=2),
            mesh('burst', 0.0, 0.11, at='self', scale=1.4, billboard=True, sweep=0.0, tone='accent', tier=0),
            dust(0.0, 40, at='self', offset=[0, -1.0, 0]),
            stop(0.0, 75),
            shake(0.0, 0.4),
        ],
    }

    # Ảnh Thiết Thân (tối thượng, miễn sát thương): da vàng kim, xoáy dải sáng cuốn thân.
    R['skl_anh_thiet_than'] = lambda: {
        'skill': 'skl_anh_thiet_than',
        'events': [
            parts('spark', -0.35, 30, 1.8, 1, 0.34, 0.06, at='self', inward=True, tone='accent', tier=1),
            decal('rune', -0.3, 2.6, 2.2, at='self', offset=[0, -1.15, 0], grow=0.25, tone='accent', alpha=0.95, tier=0),
            mesh('helix', 0.0, 1.4, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[1.8, 1.8, 3.2], sweep=0.3, erodeFrom=0.7, spin=420, follow=True, tone='accent', tier=0, seed=2),
            mesh('helix', 0.05, 1.3, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[2.3, 2.3, 2.8], sweep=0.3, erodeFrom=0.7, spin=-300, follow=True, tone='body', tier=1, seed=3),
            mesh('ripple', 0.0, 0.7, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=2.2, sweep=0.4, erodeFrom=0.4, tone='body', tier=0, seed=4),
            mesh('burst', 0.0, 0.11, at='self', scale=1.6, billboard=True, sweep=0.0, tone='rim', tier=0),
            *ring_spikes(6, 1.4, 0.02, 'self', 0.6, 1.2, tier=1, y=-1.15, tilt=-12),
            flash(0.0, 0.1, tier=1),
            stop(0.0, 60),
            shake(0.0, 0.3),
        ],
    }

    # Thuấn Di Hộ Thể (khiên cho đồng đội, tối thượng): vọt tới bạn, dựng tường chắn bằng gai vàng.
    R['skl_thuan_di_ho_the'] = lambda: {
        'skill': 'skl_thuan_di_ho_the',
        'events': [
            mesh('burst', -0.1, 0.1, at='self', scale=1.2, billboard=True, sweep=0.0, tone='accent', tier=0),
            mesh('helix', -0.1, 0.2, at='ahead', offset=[0, 0, 0.8], scale=[0.8, 0.8, 3.0], sweep=0.1, erodeFrom=0.7, spin=700, tone='body', move={'to': 'target', 'ease': 'in'}, seed=2, tier=0),
            decal('rune', 0.05, 2.4, 1.8, at='ground', grow=0.25, tone='accent', alpha=0.9, tier=0),
            mesh('ripple', 0.05, 0.6, at='ground', scale=0.3, scaleTo=2.0, sweep=0.4, erodeFrom=0.4, tone='body', tier=0, seed=3),
            *ring_spikes(6, 1.3, 0.05, 'ground', 0.7, 1.4, tier=0, tilt=-10),
            mesh('burst', 0.05, 0.11, at='target', scale=1.4, billboard=True, sweep=0.0, tone='rim', tier=0),
            stop(0.05, 50),
            shake(0.05, 0.25),
        ],
    }

    # Thiên Kim Pháp Tướng (tối thượng, buff): pháp tướng vàng: trụ gai khổng lồ bao quanh, vòng trận, trụ sáng.
    R['skl_thien_kim_phap_tuong'] = lambda: {
        'skill': 'skl_thien_kim_phap_tuong',
        'events': [
            parts('spark', -0.55, 44, 2.2, 1, 0.5, 0.07, at='self', inward=True, tone='accent', tier=1),
            decal('rune', -0.5, 5.0, 3.0, at='self', offset=[0, -1.15, 0], grow=0.4, tone='accent', alpha=0.95, tier=0),
            decal('crack', 0.0, 5.4, 3.0, at='self', offset=[0, -1.15, 0], grow=0.15, tone='body', alpha=0.95, tier=1),
            *ring_spikes(8, 2.6, 0.0, 'self', 1.7, 2.2, tier=0, y=-1.15, tilt=-8, stagger=0.04),
            *ring_spikes(6, 1.3, 0.08, 'self', 0.9, 2.0, tier=1, y=-1.15, tilt=-14, seed0=30),
            mesh('helix', 0.0, 2.0, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[3.0, 3.0, 5.0], sweep=0.3, erodeFrom=0.7, spin=240, follow=True, tone='accent', alpha=0.8, tier=1, seed=2),
            mesh('ripple', 0.0, 0.9, at='self', offset=[0, -1.1, 0], scale=0.4, scaleTo=4.0, sweep=0.4, erodeFrom=0.4, ragged=0.6, tone='body', tier=0, seed=4),
            mesh('burst', 0.0, 0.12, at='self', offset=[0, 1.0, 0], scale=2.6, billboard=True, sweep=0.0, tone='rim', tier=0),
            flash(0.0, 0.12, tier=1),
            stop(0.0, 80),
            shake(0.0, 0.5),
        ],
    }

    # Thiết Bích Xung (lướt húc): bụi đá sau lưng, gai nối theo đường lướt.
    R['skl_thiet_bich_xung'] = lambda: {
        'skill': 'skl_thiet_bich_xung', 'trigger': 'fx', 'fxKind': 'dash', 'method': 'bat_dong_kim_than',
        'events': [
            mesh('burst', 0.0, 0.11, at='self', scale=1.2, billboard=True, sweep=0.0, tone='accent', tier=0),
            mesh('ripple', 0.0, 0.5, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=1.8, sweep=0.4, erodeFrom=0.4, ragged=0.7, tone='body', tier=0, seed=2),
            *[mesh('spike', round(0.03 * i, 3), 0.6, at='ahead', offset=[round(((i * 5) % 3 - 1) * 0.5, 2), -1.15, round(-0.8 - 1.2 * i, 2)], rot=[-90 + (i % 2) * 14, 0, 0], scale=round(0.5 - 0.04 * i, 2),
                   sweep=0.2, erodeFrom=0.5, tone='body', seed=10 + i, tier=0 if i < 3 else 1) for i in range(5)],
            dust(0.0, 30, at='self', offset=[0, -1.0, -0.5]),
            shake(0.0, 0.12, tier=1),
        ],
    }

    # Dịch Sơn Xung (lướt đẩy núi): sóng chắn trước mặt, gai đá trồi ngay chỗ húc. Thay hình cũ.
    R['skl_dich_son_xung'] = lambda: {
        'skill': 'skl_dich_son_xung', 'trigger': 'fx', 'fxKind': 'dichson', 'replaces': ['dichson'],
        'events': [
            mesh('burst', 0.0, 0.11, at='self', scale=1.3, billboard=True, sweep=0.0, tone='accent', tier=0),
            mesh('crescent', 0.0, 0.4, at='ahead', offset=[0, -0.3, 0.5], rot=[0, 0, -75], scale=1.3, scaleTo=2.4, sweep=0.4, erodeFrom=0.4, ragged=0.7, tone='body', seed=2, move={'to': 'ahead', 'ahead': 5, 'ease': 'out'}, tier=0),
            mesh('ripple', 0.0, 0.5, at='ground', scale=0.3, scaleTo=1.8, sweep=0.4, erodeFrom=0.4, tone='body', tier=1, seed=3),
            *ring_spikes(5, 1.2, 0.05, 'ground', 0.6, 0.8, tier=0, tilt=22),
            dust(0.0, 32, at='self', offset=[0, -1.0, 0]),
            stop(0.05, 45, tier=1),
            shake(0.05, 0.2),
        ],
    }

    # =============== ĐAN SƯ ===============

    # Hồi Xuân Quyết (hồi máu diện rộng): sen ngọc nở dưới chân, cánh sáng và lá bay lên.
    R['skl_hoi_xuan_quyet'] = lambda: {
        'skill': 'skl_hoi_xuan_quyet', 'replaces': ['xuanphong'],
        'events': [
            parts('spark', -0.4, 24, 1.6, 1, 0.34, 0.05, at='self', inward=True, tone='body', tier=1),
            decal('rune', -0.35, 2.6, 1.6, at='self', offset=[0, -1.15, 0], grow=0.3, tone='core', alpha=0.95, tier=0),
            *lotus('self', 0.0, r=1.0, scale=1.8, tier=0),
            mesh('ripple', 0.0, 0.8, at='area', scale=0.1, scaleTo=1.0, fit='area', sweep=0.45, erodeFrom=0.5, ragged=0.35, tone='body', alpha=0.85, seed=2, tier=0),
            mesh('burst', 0.0, 0.11, at='self', scale=1.2, billboard=True, sweep=0.0, tone='rim', alpha=0.8, tier=0),
            mesh('helix', 0.05, 1.2, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[1.5, 1.5, 3.0], sweep=0.35, erodeFrom=0.6, spin=-300, follow=True, tone='rim', tier=1, seed=3),
            parts('petal', 0.0, 36, 1.2, 0.6, 1.5, 0.09, at='self', offset=[0, -1.0, 0], grav=-0.9, tone='rim', tier=0),
            parts('petal', 0.1, 18, 1.0, 0.6, 1.3, 0.08, at='area', offset=[0, 0.3, 0], grav=-1.0, tone='body', tier=1),
        ],
        'variants': {
            'wide': [mesh('ripple', 0.3, 0.6, at='area', scale=0.1, scaleTo=0.6, fit='area', sweep=0.4, tone='accent', alpha=0.6, seed=4, tier=1)],
            'self': [*lotus('self', 0.4, r=0.9, scale=1.4, tone='accent', inner_tone='rim', tier=1, seed0=60)],
        },
    }

    # Hồi Thiên Đan Lộ (hồi sinh/hồi diện rộng, tối thượng): sen ngàn cánh khổng lồ, cột lục từ trời, trận phủ rộng.
    R['skl_hoi_thien_dan_lo'] = lambda: {
        'skill': 'skl_hoi_thien_dan_lo', 'replaces': ['hoithien'],
        'events': [
            parts('spark', -0.5, 44, 2.4, 1, 0.45, 0.07, at='self', inward=True, tone='body', tier=1),
            decal('rune', -0.45, 12.0, 2.8, at='area', grow=0.45, tone='core', alpha=0.9, tier=0),
            *lotus('area', 0.0, r=2.6, scale=2.6, tier=0, y=0.0, dur=1.1, seed0=200),
            mesh('helix', -0.1, 1.6, at='area', offset=[0, 0, 0], rot=[-90, 0, 0], scale=[3.0, 3.0, 8.0], sweep=0.3, erodeFrom=0.7, spin=200, tone='rim', alpha=0.75, tier=0, seed=2),
            mesh('ripple', 0.0, 1.0, at='area', scale=0.2, scaleTo=1.0, fit='area', sweep=0.45, erodeFrom=0.55, ragged=0.4, tone='body', alpha=0.9, seed=3, tier=0),
            mesh('ripple', 0.15, 0.8, at='area', scale=0.15, scaleTo=0.6, fit='area', sweep=0.4, tone='accent', alpha=0.7, seed=4, tier=2),
            mesh('burst', 0.0, 0.12, at='area', offset=[0, 1.6, 0], scale=2.6, billboard=True, sweep=0.0, tone='rim', alpha=0.85, tier=0),
            parts('petal', 0.0, 70, 1.6, 0.7, 2.0, 0.1, at='area', offset=[0, 0.5, 0], grav=-0.8, tone='rim', tier=0),
            parts('petal', 0.1, 40, 1.4, 0.7, 1.8, 0.09, at='area', offset=[0, 0.5, 0], grav=-0.8, tone='accent', tier=1),
            flash(0.0, 0.1, tier=1),
            shake(0.0, 0.2),
        ],
    }

    # Mộc Linh Trận (trận hồi theo thời gian): trận ngọc lục đậm lõi sẫm, sen nở từ tâm rồi tan, dải lụa lục/đỏ son xoắn quanh vùng,
    # lá thuốc bay, hạt hồi linh lục nhạt bay lên khắp vùng. Thay hình cũ.
    def moc_linh():
        ev = [
            decal('rune', -0.3, 8.0, 3.8, at='area', grow=0.5, tone='core', alpha=0.95, tier=0),
            decal('rune', -0.2, 7.0, 3.4, at='area', grow=0.6, tone='body', alpha=0.55, yaw=17, tier=1),
            decal('crack', 0.1, 6.5, 3.4, at='area', grow=0.4, tone='body', alpha=0.85, tier=1),
            mesh('ripple', 0.0, 1.0, at='area', scale=0.1, scaleTo=1.0, fit='area', sweep=0.5, erodeFrom=0.55, ragged=0.5, tone='core', alpha=0.95, seed=2, tier=0),
            mesh('ripple', 0.1, 0.9, at='area', scale=0.1, scaleTo=0.62, fit='area', sweep=0.5, erodeFrom=0.5, tone='body', alpha=0.85, seed=3, tier=1),
            # Sen nở từ tâm, cánh tách lớp, nở rồi tan.
            *lotus('area', 0.0, r=1.5, scale=2.4, tier=0, y=0.0, seed0=300, dur=1.6, tone='body', inner_tone='accent'),
            *lotus('area', 0.35, r=0.9, scale=1.6, tier=1, y=0.1, seed0=340, dur=1.4, tone='rim', inner_tone='body', n=6),
            # Hai dải lụa bút lông xoắn quanh vùng (bán kính ~4 m), một lục ngọc một đỏ son.
            mesh('ribbon', 0.0, 2.2, at='area', rot=[-90, 0, 0], scale=[18, 18, 3.0], sweep=0.35, erodeFrom=0.7, spin=70, tone='body', alpha=0.95, seed=4, tier=0),
            mesh('ribbon', 0.15, 2.0, at='area', rot=[-90, 0, 0], scale=[21, 21, 2.2], sweep=0.35, erodeFrom=0.7, spin=-55, tone='accent', alpha=0.9, seed=5, tier=1),
            mesh('burst', 0.0, 0.11, at='area', offset=[0, 0.5, 0], scale=1.4, billboard=True, sweep=0.0, tone='rim', alpha=0.8, tier=0),
            # Lá thuốc bay + hạt hồi linh lục nhạt bay lên (rải sáu điểm trong vùng).
            parts('petal', 0.0, 40, 1.0, 0.8, 2.2, 0.1, at='area', offset=[0, 0.6, 0], grav=-0.4, tone='body', tier=0),
            parts('petal', 0.1, 24, 1.0, 0.8, 2.0, 0.09, at='area', offset=[0, 0.6, 0], grav=-0.4, tone='accent', tier=1),
        ]
        for i in range(6):
            a = i / 6 * 6.283
            ev.append(parts('spark', round(0.1 + 0.08 * i, 3), 14, 0.6, 0.2, 1.6, 0.07, at='area', offset=[round(math.cos(a) * 3.2, 2), 0.2, round(math.sin(a) * 3.2, 2)], grav=-1.6, tone='rim', tier=0 if i < 3 else 1))
        return {'skill': 'skl_moc_linh_tran', 'replaces': ['moclinh'], 'events': ev,
                'variants': {
                    'dense': [*lotus('area', 0.5, r=2.4, scale=2.8, tier=1, y=0.0, seed0=380, dur=1.3, tone='accent', inner_tone='body', n=10)],
                    'venom': [mesh('ripple', 0.1, 0.9, at='area', scale=0.1, scaleTo=0.8, fit='area', sweep=0.4, tone='accent', alpha=0.85, seed=6, tier=0),
                              parts('spark', 0.2, 24, 2.4, 1, 0.8, 0.06, at='area', offset=[0, 0.3, 0], tone='accent', tier=1)],
                }}

    R['skl_moc_linh_tran'] = moc_linh

    # Dược Vũ (mưa dược hồi diện rộng): mưa lá ngọc rơi từ trên cao cả vùng, gợn khi chạm. Thay hình cũ.
    def duoc_vu():
        ev = [
            decal('rune', -0.35, 9.0, 2.4, at='area', grow=0.4, tone='core', alpha=0.9, tier=0),
            mesh('ripple', 0.0, 0.9, at='area', scale=0.1, scaleTo=1.0, fit='area', sweep=0.45, erodeFrom=0.5, ragged=0.4, tone='body', alpha=0.85, seed=2, tier=0),
        ]
        for i in range(10):
            a = i * 2.399
            rr = 8.0 * math.sqrt((i + 0.5) / 10)
            dx, dz = round(math.cos(a) * rr, 2), round(math.sin(a) * rr, 2)
            t = round(-0.1 + i * 0.07, 3)
            ev.append(mesh('kite', t, 0.6, at='area', offset=[dx, 7, dz], scale=[0.25, 0.25, 0.8], sweep=0.1, erodeFrom=0.9, tone='body' if i % 2 else 'rim',
                           move={'to': 'area', 'offset': [dx, 0.3, dz], 'ease': 'in'}, seed=400 + i, tier=0 if i < 6 else 1))
            ev.append(mesh('ripple', round(t + 0.6, 3), 0.4, at='area', offset=[dx, 0, dz], scale=0.25, scaleTo=0.9, sweep=0.5, erodeFrom=0.4, tone='body', alpha=0.8, seed=420 + i, tier=1))
        ev += [parts('petal', 0.0, 60, 0.8, 0.5, 1.8, 0.09, at='area', offset=[0, 6, 0], grav=2.0, tone='rim', tier=0),
               parts('petal', 0.2, 40, 0.8, 0.5, 1.6, 0.08, at='area', offset=[0, 6, 0], grav=2.2, tone='body', tier=1)]
        return {'skill': 'skl_duoc_vu', 'replaces': ['duocvu'], 'events': ev,
                'variants': {'ward': [mesh('ripple', 0.4, 0.6, at='area', scale=0.1, scaleTo=0.6, fit='area', sweep=0.4, tone='accent', alpha=0.7, seed=5, tier=1)],
                             'wide': [mesh('ripple', 0.3, 0.7, at='area', scale=0.1, scaleTo=1.1, fit='area', sweep=0.4, tone='rim', alpha=0.6, seed=6, tier=1)]}}

    R['skl_duoc_vu'] = duoc_vu

    # Ngưng Đan Hộ Thế (khiên): viên đan ngọc xoay quanh thân, dải lụa xoáy, nhịp đỏ son. Giữ quầng cũ.
    R['skl_ngung_dan_ho_the'] = lambda: {
        'skill': 'skl_ngung_dan_ho_the',
        'events': [
            parts('spark', -0.5, 22, 1.4, 1, 0.4, 0.06, at='target', offset=[0, 0, 0], inward=True, tone='body', tier=1),
            decal('rune', -0.4, 1.8, 1.6, at='ground', grow=0.3, tone='body', alpha=0.9, tier=0),
            mesh('ripple', 0.0, 0.6, at='ground', scale=0.3, scaleTo=1.5, sweep=0.4, erodeFrom=0.4, tone='body', tier=0, seed=2),
            mesh('helix', 0.0, 1.4, at='target', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[1.8, 1.8, 2.8], sweep=0.3, erodeFrom=0.6, spin=360, follow=True, tone='rim', tier=0, seed=3),
            mesh('helix', 0.05, 1.3, at='target', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[2.3, 2.3, 2.2], sweep=0.3, erodeFrom=0.6, spin=-260, follow=True, tone='accent', alpha=0.85, tier=1, seed=4),
            mesh('burst', 0.0, 0.11, at='target', scale=1.1, billboard=True, sweep=0.0, tone='accent', alpha=0.8, tier=0),
            *lotus('ground', 0.05, r=0.4, scale=0.7, tier=1, y=0.1, seed0=500),
        ],
    }

    # Đan Hỏa Phong Tràn (AoE bán kính 6, tầm 26): cầu đan hỏa đỏ son xoáy bay tới, nổ vòng lửa, lá cháy. Thay hình cũ.
    R['skl_dan_hoa_phong_tran'] = lambda: {
        'skill': 'skl_dan_hoa_phong_tran', 'replaces': ['danhoa'],
        'events': [
            parts('spark', -0.3, 18, 1.2, 1, 0.26, 0.05, at='self', offset=[0.2, 0, 0.4], inward=True, tone='accent', tier=1),
            mesh('kite', -0.1, 0.24, at='ahead', offset=[0, 0.05, 0.6], scale=[0.7, 0.7, 1.4], sweep=0.1, erodeFrom=0.85, tone='accent', move={'to': 'target', 'ease': 'in'}, seed=2, tier=0),
            mesh('helix', -0.1, 0.26, at='ahead', offset=[0, 0.05, -0.4], scale=[1.4, 1.4, 3.2], sweep=0.2, erodeFrom=0.6, spin=-900, tone='accent', move={'to': 'target', 'ease': 'in'}, seed=3, tier=0),
            mesh('helix', -0.1, 0.26, at='ahead', offset=[0, 0.05, -0.4], scale=[1.0, 1.0, 2.6], sweep=0.2, erodeFrom=0.6, spin=700, tone='body', move={'to': 'target', 'ease': 'in'}, seed=4, tier=1),
            mesh('burst', 0.12, 0.11, at='target', scale=1.6, billboard=True, sweep=0.0, tone='accent', tier=0),
            mesh('ripple', 0.12, 0.8, at='area', scale=0.1, scaleTo=1.0, fit='area', sweep=0.4, erodeFrom=0.5, ragged=0.8, tone='accent', alpha=0.9, seed=5, tier=0),
            mesh('ripple', 0.2, 0.7, at='area', scale=0.1, scaleTo=0.6, fit='area', sweep=0.4, erodeFrom=0.5, tone='core', alpha=0.9, seed=6, tier=1),
            decal('scorch', 0.12, 5.5, 2.2, at='area', grow=0.1, tone='core', alpha=0.55, tier=0),
            decal('crack', 0.14, 4.8, 2.4, at='area', grow=0.15, tone='accent', alpha=0.9, tier=1),
            parts('spark', 0.12, 36, 7, 1, 0.5, 0.06, at='area', offset=[0, 0.4, 0], tone='accent', tier=0),
            parts('petal', 0.14, 20, 3, 1, 0.9, 0.1, at='area', offset=[0, 0.5, 0], grav=-1, tone='body', tier=1),
            stop(0.12, 55),
            shake(0.12, 0.22),
        ],
        'variants': {'wide': [mesh('ripple', 0.3, 0.6, at='area', scale=0.1, scaleTo=0.9, fit='area', sweep=0.4, tone='rim', alpha=0.6, seed=7, tier=1)]},
    }

    # Ảnh Dược Hóa Thân (hồi theo thời gian, tối thượng): bóng đan sư sen nở quanh thân, lụa xoáy đỏ-lục.
    R['skl_anh_duoc_hoa_than'] = lambda: {
        'skill': 'skl_anh_duoc_hoa_than',
        'events': [
            parts('spark', -0.4, 30, 1.8, 1, 0.4, 0.06, at='self', inward=True, tone='body', tier=1),
            decal('rune', -0.35, 3.0, 2.4, at='self', offset=[0, -1.15, 0], grow=0.3, tone='body', alpha=0.9, tier=0),
            *lotus('self', 0.0, r=0.8, scale=1.3, tier=0, seed0=600),
            mesh('helix', 0.0, 1.6, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[2.0, 2.0, 3.2], sweep=0.3, erodeFrom=0.7, spin=-320, follow=True, tone='accent', tier=0, seed=2),
            mesh('helix', 0.05, 1.5, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[2.4, 2.4, 2.6], sweep=0.3, erodeFrom=0.7, spin=260, follow=True, tone='rim', tier=1, seed=3),
            mesh('ripple', 0.0, 0.8, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=2.4, sweep=0.4, erodeFrom=0.4, tone='body', tier=0, seed=4),
            mesh('burst', 0.0, 0.11, at='self', scale=1.5, billboard=True, sweep=0.0, tone='rim', alpha=0.85, tier=0),
            parts('petal', 0.0, 40, 1.3, 0.6, 1.6, 0.09, at='self', offset=[0, -1.0, 0], grav=-0.9, tone='accent', tier=1),
            flash(0.0, 0.08, tier=2),
        ],
    }

    # Thuấn Di Cứu Viện (hồi sinh đồng đội, tối thượng): vọt tới bạn, sen nở trên người ngã, cột lục.
    R['skl_thuan_di_cuu_vien'] = lambda: {
        'skill': 'skl_thuan_di_cuu_vien',
        'events': [
            mesh('burst', -0.12, 0.1, at='self', scale=1.2, billboard=True, sweep=0.0, tone='rim', tier=0),
            mesh('helix', -0.12, 0.2, at='ahead', offset=[0, 0, 0.8], scale=[0.8, 0.8, 3.0], sweep=0.1, erodeFrom=0.7, spin=700, tone='body', move={'to': 'target', 'ease': 'in'}, seed=2, tier=0),
            decal('rune', 0.05, 3.0, 2.2, at='ground', grow=0.3, tone='body', alpha=0.9, tier=0),
            *lotus('ground', 0.06, r=0.8, scale=1.3, y=0.1, tier=0, seed0=700),
            mesh('ripple', 0.05, 0.7, at='ground', scale=0.3, scaleTo=2.4, sweep=0.4, erodeFrom=0.4, tone='body', tier=0, seed=3),
            mesh('helix', 0.06, 1.2, at='ground', rot=[-90, 0, 0], scale=[1.8, 1.8, 6.0], sweep=0.3, erodeFrom=0.6, spin=240, tone='rim', alpha=0.8, tier=1, seed=4),
            mesh('burst', 0.05, 0.11, at='target', scale=1.6, billboard=True, sweep=0.0, tone='rim', alpha=0.85, tier=0),
            parts('petal', 0.06, 40, 1.4, 0.6, 1.6, 0.09, at='ground', offset=[0, 0.3, 0], grav=-0.9, tone='accent', tier=1),
        ],
    }

    # Thiên Đan Pháp Giới (hồi + buff diện rộng, tối thượng): trận giới khổng lồ, hai tầng sen, lụa xoáy đỏ-lục.
    R['skl_thien_dan_phap_gioi'] = lambda: {
        'skill': 'skl_thien_dan_phap_gioi',
        'events': [
            parts('spark', -0.55, 50, 2.6, 1, 0.5, 0.07, at='self', inward=True, tone='body', tier=1),
            decal('rune', -0.5, 12.0, 3.2, at='self', offset=[0, -1.15, 0], grow=0.5, tone='core', alpha=0.9, tier=0),
            decal('crack', 0.0, 9.0, 3.0, at='self', offset=[0, -1.15, 0], grow=0.3, tone='accent', alpha=0.6, tier=1),
            *lotus('self', 0.0, r=1.4, scale=1.9, tier=0, seed0=800, dur=1.0),
            mesh('helix', 0.0, 2.0, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[3.0, 3.0, 6.0], sweep=0.3, erodeFrom=0.7, spin=220, follow=True, tone='accent', alpha=0.8, tier=0, seed=2),
            mesh('helix', 0.05, 1.8, at='self', offset=[0, -1.1, 0], rot=[-90, 0, 0], scale=[4.0, 4.0, 4.0], sweep=0.3, erodeFrom=0.7, spin=-180, follow=True, tone='rim', alpha=0.8, tier=1, seed=3),
            mesh('ripple', 0.0, 1.0, at='self', offset=[0, -1.1, 0], scale=0.4, scaleTo=6.0, sweep=0.45, erodeFrom=0.5, ragged=0.4, tone='body', alpha=0.85, tier=0, seed=4),
            mesh('burst', 0.0, 0.12, at='self', scale=2.4, billboard=True, sweep=0.0, tone='rim', alpha=0.85, tier=0),
            parts('petal', 0.0, 70, 1.8, 0.8, 2.0, 0.1, at='self', offset=[0, -0.5, 0], grav=-0.7, tone='rim', tier=0),
            flash(0.0, 0.1, tier=1),
            shake(0.0, 0.25),
        ],
    }

    # Lưu Hương Bộ (lướt Đan sư): dải lụa bút lông kéo theo đường lướt, cánh hoa rụng.
    R['skl_luu_huong_bo'] = lambda: {
        'skill': 'skl_luu_huong_bo', 'trigger': 'fx', 'fxKind': 'dash', 'method': 'thanh_moc_dan_kinh',
        'events': [
            mesh('burst', 0.0, 0.11, at='self', scale=1.0, billboard=True, sweep=0.0, tone='rim', alpha=0.8, tier=0),
            mesh('helix', 0.0, 0.5, at='ahead', offset=[0, 0.1, 3.0], scale=[1.4, 1.4, 6.0], sweep=0.25, erodeFrom=0.3, spin=400, tone='body', tier=0, seed=2),
            mesh('helix', 0.03, 0.45, at='ahead', offset=[0, 0.1, 2.4], scale=[1.0, 1.0, 4.5], sweep=0.25, erodeFrom=0.3, spin=-500, tone='accent', alpha=0.9, tier=1, seed=3),
            mesh('ripple', 0.0, 0.4, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=1.4, sweep=0.4, erodeFrom=0.4, tone='body', tier=1, seed=4),
            parts('petal', 0.0, 30, 3.0, 0.5, 0.9, 0.09, at='self', offset=[0, -0.4, 0], back=True, grav=-0.5, tone='rim', tier=0),
        ],
    }
