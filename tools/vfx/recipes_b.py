# Công thức VFX-V2 cho các chiêu Kiếm tu của công pháp Lạc Kiếm Quyết (bậc 1–3). Nạp từ gen-fx-kiem.py.
import math


def register(R, H):
    mesh, parts, decal, stop, shake, flash, ring_spikes = H['mesh'], H['parts'], H['decal'], H['stop'], H['shake'], H['flash'], H['ring_spikes']

    def line_spikes(zs, t0, step, scale, dur, tier=1, tilt=0):
        out = []
        for i, z in enumerate(zs):
            out.append(mesh('spike', round(t0 + step * i, 3), dur, at='ahead', offset=[round(((i * 37) % 7 - 3) * 0.12, 2), -1.15, z], rot=[-90 + (tilt if i % 2 else -tilt), 0, 0],
                            scale=round(scale * (1.0 - 0.04 * i), 2), sweep=0.2, erodeFrom=0.5, alpha=0.97, seed=60 + i, tier=tier))
        return out

    # ---- Kiếm Ảnh Bộ (lướt): tàn ảnh kiếm lam ở chỗ cũ, vệt sáng kéo dọc đường lướt. ----
    R['skl_kiem_anh_bo'] = lambda: {
        'skill': 'skl_kiem_anh_bo', 'trigger': 'fx', 'fxKind': 'dash', 'method': 'lac_kiem_quyet',
        'events': [
            mesh('burst', 0.0, 0.11, at='self', scale=1.0, billboard=True, sweep=0.0, tone='rim', tier=0),
            mesh('kite', 0.0, 0.45, at='self', offset=[0, 0.1, 0.2], scale=[0.5, 0.5, 1.3], sweep=0.1, erodeFrom=0.2, tone='core', alpha=0.6, tier=1, seed=2),
            mesh('helix', 0.0, 0.3, at='ahead', offset=[0, 0.1, 3.6], scale=[1.0, 1.0, 7.0], sweep=0.2, erodeFrom=0.2, spin=700, tone='body', tier=0, seed=7),
            mesh('ripple', 0.0, 0.4, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=1.4, sweep=0.4, erodeFrom=0.4, tone='body', tier=1, seed=4),
            parts('spark', 0.0, 22, 9, 0.12, 0.3, 0.05, at='ahead', offset=[0, -0.4, 1.0], tone='accent', tier=0),
            parts('dust', 0.0, 10, 2, 0.7, 0.5, 0.2, at='self', offset=[0, -1.0, 0], tone='body', tier=1),
        ],
    }

    # ---- Phi Kiếm Truy Hồn (kiếm ảnh phân quang): bóng kiếm sẫm lướt trước, bản thể sáng theo sau, cắm dấu ấn tinh thể trên đầu mục tiêu. ----
    def truy_hon():
        return {
            'skill': 'skl_phi_kiem_truy_hon', 'replaces': ['kanh'],
            'events': [
                parts('spark', -0.3, 16, 1.2, 1, 0.26, 0.05, at='self', offset=[0.2, 0, 0.4], inward=True, tone='rim', tier=1),
                mesh('kite', -0.14, 0.2, at='ahead', offset=[0.45, 0.15, 0.4], scale=[0.5, 0.5, 1.3], sweep=0.1, erodeFrom=0.85, tone='core', alpha=0.7, move={'to': 'target', 'ease': 'in'}, seed=3, tier=1),
                mesh('kite', -0.1, 0.18, at='ahead', offset=[0, 0.05, 0.6], scale=[0.55, 0.55, 1.7], sweep=0.1, erodeFrom=0.85, tone='rim', move={'to': 'target', 'ease': 'in'}, seed=4, tier=0),
                mesh('helix', -0.1, 0.2, at='ahead', offset=[0, 0.05, -0.6], scale=[0.9, 0.9, 2.2], sweep=0.2, erodeFrom=0.6, spin=-800, tone='body', move={'to': 'target', 'ease': 'in'}, seed=5, tier=1),
                mesh('crescent', 0.07, 0.22, at='target', rot=[0, 0, -78], scale=1.1, scaleTo=1.5, sweep=0.5, erodeFrom=0.5, ragged=0.7, tone='body', seed=6, tier=0),
                mesh('burst', 0.07, 0.1, at='target', scale=1.2, billboard=True, sweep=0.0, tone='body', tier=0),
                decal('rune', 0.07, 1.4, 2.4, at='ground', grow=0.2, tone='accent', alpha=0.85, tier=1),
                mesh('spike', 0.1, 1.0, at='ground', offset=[0, 0.9, 0], rot=[90, 0, 0], scale=0.28, sweep=0.2, erodeFrom=0.7, tone='accent', tier=0, seed=8),
                mesh('ripple', 0.08, 0.5, at='ground', scale=0.2, scaleTo=1.2, sweep=0.4, erodeFrom=0.4, tone='body', tier=1, seed=9),
                parts('spark', 0.07, 16, 6, 0.6, 0.35, 0.06, at='target', back=True, tone='rim', tier=0),
                stop(0.07, 50),
                shake(0.07, 0.12, tier=1),
            ],
            'variants': {
                'deep': [mesh('spike', 0.14, 1.1, at='ground', offset=[0, 1.7, 0], rot=[90, 0, 0], scale=0.4, sweep=0.2, erodeFrom=0.7, tone='rim', tier=0, seed=10),
                         mesh('crescent', 0.1, 0.25, at='target', rot=[0, 0, 12], scale=1.7, sweep=0.5, erodeFrom=0.5, ragged=0.6, tone='rim', tier=1, seed=11)],
                'spread': [mesh('kite', 0.12, 0.22, at='target', scale=[0.4, 0.4, 1.0], sweep=0.1, erodeFrom=0.85, tone='body',
                                move={'to': 'target', 'offset': [dx, 0, dz], 'ease': 'out'}, tier=1, seed=12 + i)
                           for i, (dx, dz) in enumerate([(2.6, 1.2), (-2.4, 1.8), (0.4, -2.8)])]
                          + [mesh('ripple', 0.2, 0.5, at='ground', scale=0.4, scaleTo=2.2, sweep=0.4, tone='body', alpha=0.7, tier=1, seed=16)],
            },
        }

    R['skl_phi_kiem_truy_hon'] = truy_hon

    # ---- Vạn Kiếm Quy Tông (tối thượng): vạn kiếm tinh thể trút xuống, hai nhát chém dọc khổng lồ, trụ gai giữa trận. ----
    def van_kiem():
        ev = [
            parts('spark', -0.5, 40, 2.4, 1, 0.45, 0.07, at='self', offset=[0, 0.8, 0.2], inward=True, tone='rim', tier=1),
            decal('rune', -0.45, 12.0, 2.4, at='area', grow=0.4, tone='body', alpha=0.6, tier=1),
            mesh('crescent', -0.1, 0.34, at='target', offset=[0, 1.2, 0], rot=[0, 0, -86], scale=2.6, scaleTo=3.4, sweep=0.4, erodeFrom=0.55, ragged=0.65, tone='body', seed=2, tier=0),
            mesh('crescent', 0.0, 0.3, at='target', offset=[0, 1.0, 0], rot=[0, 0, -38], scale=2.0, scaleTo=2.8, sweep=0.4, erodeFrom=0.5, ragged=0.7, tone='rim', alpha=0.9, seed=3, tier=1),
            mesh('spike', 0.0, 0.9, at='area', rot=[-90, 0, 0], scale=1.1, sweep=0.2, erodeFrom=0.6, tone='body', seed=4, tier=0),
            mesh('ripple', 0.0, 0.8, at='area', scale=0.2, scaleTo=1.0, fit='area', sweep=0.45, erodeFrom=0.55, ragged=0.6, tone='body', alpha=0.9, seed=5, tier=0),
            mesh('ripple', 0.12, 0.7, at='area', scale=0.15, scaleTo=0.6, fit='area', sweep=0.4, erodeFrom=0.5, tone='accent', alpha=0.75, seed=6, tier=2),
            mesh('burst', 0.0, 0.12, at='area', offset=[0, 1.4, 0], scale=2.4, billboard=True, sweep=0.0, tone='rim', tier=0),
            decal('crack', 0.0, 5.0, 3.0, at='area', grow=0.14, tone='body', alpha=0.95, tier=1),
            *[mesh('spike', round(0.03 + 0.025 * i, 3), 0.7, at='area', offset=[round(math.cos(i / 7 * 6.28) * 3.4, 2), 0, round(math.sin(i / 7 * 6.28) * 3.4, 2)], rot=[-90, 0, 0],
                   scale=0.7, sweep=0.2, erodeFrom=0.5, tone='body', seed=20 + i, tier=1) for i in range(7)],
            parts('spark', 0.0, 60, 9, 1, 0.5, 0.07, at='area', offset=[0, 0.6, 0], tone='rim', tier=0),
            flash(0.0, 0.14, tier=1),
            stop(0.0, 80),
            shake(0.0, 0.5),
        ]
        for i in range(14):
            a = i * 2.399
            rr = 1.5 + (i * 0.55) % 6.5
            dx, dz = round(math.cos(a) * rr, 2), round(math.sin(a) * rr, 2)
            t = round(-0.34 + i * 0.035, 3)
            ev.append(mesh('kite', t, 0.3, at='area', offset=[dx, 12, dz], scale=[0.8, 0.8, 2.2], sweep=0.1, erodeFrom=0.85, tone='rim' if i % 2 else 'body',
                           move={'to': 'area', 'offset': [dx, 0.4, dz], 'ease': 'in'}, seed=40 + i, tier=0 if i < 6 else 1))
            ev.append(mesh('ripple', round(t + 0.3, 3), 0.4, at='area', offset=[dx, 0, dz], scale=0.15, scaleTo=0.8, sweep=0.5, erodeFrom=0.4, tone='body', alpha=0.8, seed=60 + i, tier=1))
        return {'skill': 'skl_van_kiem_quy_tong', 'replaces': ['vankiem'], 'events': ev}

    R['skl_van_kiem_quy_tong'] = van_kiem

    # ---- Hoành Kiếm Phá Mạch: một nhát quét ngang trải dài theo đường chém, gai tinh thể trồi nối tiếp về phía trước. ----
    R['skl_hoanh_kiem_pha_mach'] = lambda: {
        'skill': 'skl_hoanh_kiem_pha_mach', 'replaces': ['hoanhkiem'],
        'events': [
            parts('spark', -0.35, 18, 1.3, 1, 0.28, 0.06, at='self', offset=[0.4, 0, -0.1], inward=True, tone='rim', tier=1),
            decal('rune', -0.3, 1.8, 0.9, at='self', grow=0.2, tone='body', alpha=0.8, tier=1),
            mesh('crescent', -0.08, 0.45, at='ahead', offset=[0, -0.3, 0.2], rot=[0, 0, -62], scale=1.9, scaleTo=3.6, sweep=0.45, erodeFrom=0.55, ragged=0.6, tone='body', move={'to': 'ahead', 'ahead': 6, 'ease': 'out'}, seed=2, tier=0),
            mesh('crescent', 0.0, 0.3, at='ahead', offset=[0, -0.15, 0.1], rot=[0, 0, -40], scale=1.1, scaleTo=2.2, sweep=0.45, erodeFrom=0.5, ragged=0.75, tone='rim', alpha=0.85, move={'to': 'ahead', 'ahead': 6, 'ease': 'out'}, seed=3, tier=2),
            mesh('helix', 0.0, 0.3, at='ahead', offset=[0, -0.5, 6], scale=[1.0, 1.0, 11], sweep=0.2, erodeFrom=0.5, spin=500, tone='body', alpha=0.7, tier=1, seed=4),
            *line_spikes([1.0, 2.4, 3.8, 5.2, 6.6, 8.0], 0.05, 0.07, 0.55, 0.7, tier=1),
            parts('spark', 0.1, 44, 10, 0.1, 0.35, 0.06, at='ahead', offset=[0, -0.5, 1], tone='accent', tier=0),
            decal('crack', 0.12, 2.2, 2.0, at='ahead', offset=[0, 0, 5], grow=0.15, tone='body', alpha=0.9, tier=1),
            stop(0.12, 55),
            shake(0.12, 0.16, tier=1),
        ],
        'variants': {
            'long': [*line_spikes([13.0, 14.8, 16.6], 0.28, 0.04, 0.45, 0.4, tier=1), mesh('burst', 0.12, 0.1, at='ahead', offset=[0, 0, 12], scale=1.1, billboard=True, sweep=0.0, tone='rim', tier=0)],
            'twin': [mesh('crescent', 0.12, 0.34, at='ahead', offset=[0, -0.3, 0.2], rot=[0, 0, -62], scale=1.4, scaleTo=3.0, sweep=0.45, erodeFrom=0.55, ragged=0.65, tone='body', move={'to': 'ahead', 'ahead': 9, 'ease': 'out'}, seed=9, tier=1)],
        },
    }

    # ---- Kiếm Vũ Tam Điệp: ba nhát chém khác hướng (chéo trái, chéo phải, bổ đứng) mỗi nhát khựng riêng, nhát cuối nổ gai. ----
    R['skl_kiem_vu_tam_diep'] = lambda: {
        'skill': 'skl_kiem_vu_tam_diep', 'replaces': ['kiemvu'],
        'events': [
            mesh('crescent', -0.1, 0.2, hit=0, at='ahead', offset=[0, 0.1, 0.6], rot=[0, 0, -32], scale=1.4, scaleTo=2.3, sweep=0.4, erodeFrom=0.5, ragged=0.6, tone='body', seed=2, move={'to': 'target', 'ease': 'out'}, tier=0),
            mesh('crescent', -0.1, 0.2, hit=1, at='ahead', offset=[0, 0.1, 0.6], rot=[0, 0, 150], scale=1.4, scaleTo=2.3, sweep=0.4, erodeFrom=0.5, ragged=0.6, tone='body', seed=3, move={'to': 'target', 'ease': 'out'}, tier=0),
            mesh('crescent', -0.1, 0.24, hit=2, at='ahead', offset=[0, 0.2, 0.6], rot=[0, 0, -88], scale=1.8, scaleTo=2.8, sweep=0.4, erodeFrom=0.5, ragged=0.55, tone='rim', seed=4, move={'to': 'target', 'ease': 'out'}, tier=0),
            mesh('burst', 0.04, 0.1, at='target', scale=1.0, billboard=True, sweep=0.0, tone='body', tier=0),
            parts('spark', 0.04, 14, 6, 0.7, 0.3, 0.05, at='target', tone='rim', tier=0),
            stop(0.04, 40, hit=[0, 1]),
            stop(0.04, 70, hit=2),
            shake(0.04, 0.1, hit=[0, 1], tier=1),
            shake(0.04, 0.26, hit=2),
            *[mesh('spike', round(0.05 + 0.02 * i, 3), 0.5, hit=2, at='ground', offset=[round(math.cos(i / 5 * 6.28) * 1.1, 2), 0, round(math.sin(i / 5 * 6.28) * 1.1, 2)], rot=[-90, 0, 0], scale=0.42, sweep=0.2, erodeFrom=0.5, tone='body', seed=30 + i, tier=1) for i in range(5)],
            decal('crack', 0.05, 2.2, 2.2, hit=2, at='ground', grow=0.12, tone='body', alpha=0.95, tier=1),
            mesh('ripple', 0.05, 0.5, hit=2, at='ground', scale=0.3, scaleTo=2.0, sweep=0.4, erodeFrom=0.4, tone='body', tier=1, seed=8),
        ],
        'variants': {
            'knock': [mesh('ripple', 0.1, 0.6, hit=2, at='ground', scale=0.4, scaleTo=2.6, sweep=0.4, tone='accent', alpha=0.8, tier=1, seed=14)],
        },
    }

    # ---- Kiếm Đan Bản Mệnh (triệu hồi): kiếm nhỏ vọt ra từ đan điền. Hình quay quanh thân cũ giữ nguyên, thêm lớp khai triển. ----
    R['skl_kiem_dan_ban_menh'] = lambda: {
        'skill': 'skl_kiem_dan_ban_menh',
        'events': [
            parts('spark', -0.5, 24, 1.4, 1, 0.4, 0.06, at='self', offset=[0, -0.2, 0.1], inward=True, tone='accent', tier=1),
            decal('rune', -0.45, 1.7, 1.2, at='self', grow=0.3, tone='body', alpha=0.85, tier=1),
            mesh('ripple', 0.0, 0.6, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=1.8, sweep=0.5, erodeFrom=0.4, tone='body', tier=0, seed=3),
            mesh('burst', 0.0, 0.11, at='self', offset=[0, -0.2, 0], scale=1.2, billboard=True, sweep=0.0, tone='accent', tier=0),
            mesh('kite', 0.0, 0.5, at='self', offset=[0.5, -1.0, 0.2], rot=[-80, 0, 0], scale=[0.3, 0.3, 0.8], sweep=0.2, erodeFrom=0.7, tone='rim', tier=0, seed=2),
            mesh('kite', 0.05, 0.5, at='self', offset=[-0.5, -1.0, 0.2], rot=[-80, 0, 0], scale=[0.3, 0.3, 0.8], sweep=0.2, erodeFrom=0.7, tone='body', tier=1, seed=4),
            mesh('helix', 0.0, 0.8, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[1.2, 1.2, 2.2], sweep=0.3, erodeFrom=0.5, spin=520, follow=True, tone='accent', tier=1, seed=7),
            parts('spark', 0.0, 22, 3.5, 1, 0.5, 0.05, at='self', tone='rim', tier=0),
        ],
    }

    # ---- Nghịch Kiếm Chuyển Phong (lướt ngược): vệt kiếm quang kéo ngược chỗ cũ, gợn phản xung. Thay hình `nghichkiem` cũ. ----
    R['skl_nghich_kiem_chuyen_phong'] = lambda: {
        'skill': 'skl_nghich_kiem_chuyen_phong', 'trigger': 'fx', 'fxKind': 'nghichkiem', 'replaces': ['nghichkiem'],
        'events': [
            mesh('burst', 0.0, 0.11, at='self', scale=1.1, billboard=True, sweep=0.0, tone='rim', tier=0),
            mesh('crescent', 0.0, 0.3, at='self', offset=[0, 0, -0.3], rot=[0, 0, 90], scale=1.3, scaleTo=2.0, sweep=0.4, erodeFrom=0.45, ragged=0.6, tone='body', seed=2, tier=0),
            mesh('crescent', 0.03, 0.26, at='self', offset=[0, 0, -0.9], rot=[0, 0, 90], scale=0.9, scaleTo=1.6, sweep=0.4, erodeFrom=0.45, ragged=0.7, tone='core', alpha=0.8, seed=3, tier=1),
            mesh('ripple', 0.0, 0.45, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=1.6, sweep=0.4, erodeFrom=0.4, tone='body', tier=1, seed=5),
            mesh('helix', 0.0, 0.3, at='ahead', offset=[0, 0, -2.4], scale=[1.0, 1.0, 5], sweep=0.2, erodeFrom=0.3, spin=-700, tone='accent', alpha=0.8, tier=1, seed=6),
            parts('spark', 0.0, 22, 7, 0.4, 0.35, 0.05, at='self', back=True, tone='rim', tier=0),
        ],
        'variants': {'return': [mesh('ripple', 0.3, 0.45, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=1.3, sweep=0.4, tone='accent', alpha=0.8, tier=1, seed=15)]},
    }

    # ---- Phản Ảnh Kiếm Ảnh (buff): hai bóng kiếm sẫm hiện hai bên như gương. ----
    R['skl_phan_anh_kiem_anh'] = lambda: {
        'skill': 'skl_phan_anh_kiem_anh',
        'events': [
            parts('spark', -0.4, 20, 1.4, 1, 0.34, 0.06, at='self', inward=True, tone='body', tier=1),
            decal('rune', -0.35, 2.0, 1.4, at='self', grow=0.3, tone='core', alpha=0.9, tier=1),
            mesh('ripple', 0.0, 0.6, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=1.9, sweep=0.45, erodeFrom=0.4, tone='core', tier=0, seed=2),
            mesh('kite', 0.0, 0.8, at='self', offset=[1.1, -0.2, 0.1], rot=[-86, 0, 0], scale=[0.6, 0.6, 1.5], sweep=0.2, erodeFrom=0.55, tone='core', alpha=0.75, tier=0, seed=3),
            mesh('kite', 0.04, 0.8, at='self', offset=[-1.1, -0.2, 0.1], rot=[-86, 0, 0], scale=[0.6, 0.6, 1.5], sweep=0.2, erodeFrom=0.55, tone='core', alpha=0.75, tier=0, seed=4),
            mesh('burst', 0.0, 0.11, at='self', scale=1.1, billboard=True, sweep=0.0, tone='rim', tier=0),
            mesh('helix', 0.0, 0.7, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[1.6, 1.6, 2.4], sweep=0.3, erodeFrom=0.5, spin=-380, follow=True, tone='rim', tier=1, seed=8),
        ],
    }

    # ---- Thuấn Di Trảm: vệt xé không gian từ chỗ đứng tới mục tiêu, nhát bổ dọc lớn kèm gai nổ. ----
    R['skl_thuan_di_tram'] = lambda: {
        'skill': 'skl_thuan_di_tram',
        'events': [
            mesh('burst', -0.12, 0.1, at='self', scale=1.1, billboard=True, sweep=0.0, tone='rim', tier=0),
            mesh('ripple', -0.12, 0.4, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=1.5, sweep=0.4, erodeFrom=0.4, tone='core', tier=1, seed=2),
            mesh('helix', -0.12, 0.16, at='ahead', offset=[0, 0, 0.8], scale=[0.8, 0.8, 2.6], sweep=0.1, erodeFrom=0.7, spin=900, tone='body', move={'to': 'target', 'ease': 'in'}, tier=0, seed=3),
            mesh('crescent', 0.05, 0.26, at='target', offset=[0, 0.9, 0], rot=[0, 0, -84], scale=1.9, scaleTo=2.7, sweep=0.4, erodeFrom=0.5, ragged=0.6, tone='body', seed=4, tier=0),
            mesh('crescent', 0.08, 0.22, at='target', offset=[0, 0.6, 0], rot=[0, 0, -40], scale=1.3, scaleTo=2.0, sweep=0.4, erodeFrom=0.5, ragged=0.7, tone='rim', alpha=0.9, seed=5, tier=2),
            mesh('burst', 0.05, 0.11, at='target', scale=1.5, billboard=True, sweep=0.0, tone='body', tier=0),
            *ring_spikes(6, 1.1, 0.07, 'ground', 0.5, 0.45, tier=1, tilt=22),
            decal('crack', 0.07, 2.6, 2.2, at='ground', grow=0.12, tone='body', alpha=0.95, tier=1),
            parts('spark', 0.05, 30, 8, 1, 0.4, 0.06, at='target', tone='rim', tier=0),
            stop(0.05, 60),
            shake(0.05, 0.2),
        ],
        'variants': {'blast': [mesh('ripple', 0.12, 0.6, at='ground', scale=0.4, scaleTo=3.2, sweep=0.4, tone='accent', alpha=0.8, tier=1, seed=16)]},
    }

    # ---- Thiên Kiếm Hóa Hình (tối thượng): thanh kiếm khổng lồ giáng từ trời, bốn vầng trăng tỏa ra, trận triện văn phủ rộng. ----
    R['skl_thien_kiem_hoa_hinh'] = lambda: {
        'skill': 'skl_thien_kiem_hoa_hinh',
        'events': [
            parts('spark', -0.6, 50, 2.6, 1, 0.5, 0.07, at='self', offset=[0, 0.9, 0.2], inward=True, tone='rim', tier=1),
            decal('rune', -0.55, 14.0, 2.6, at='area', grow=0.5, tone='body', alpha=0.6, tier=1),
            mesh('kite', -0.3, 0.32, at='area', offset=[0, 18, 0], scale=[2.6, 2.6, 9], sweep=0.1, erodeFrom=0.9, tone='rim', move={'to': 'area', 'offset': [0, 1.5, 0], 'ease': 'in'}, seed=2, tier=0),
            mesh('helix', -0.3, 0.32, at='area', offset=[0, 18, 0], scale=[4.0, 4.0, 9], sweep=0.2, erodeFrom=0.7, spin=700, tone='body', move={'to': 'area', 'offset': [0, 1.5, 0], 'ease': 'in'}, seed=3, tier=1),
            mesh('burst', 0.02, 0.12, at='area', offset=[0, 1.5, 0], scale=3.2, billboard=True, sweep=0.0, tone='rim', tier=0),
            *[mesh('crescent', round(0.02 + 0.03 * i, 3), 0.4, at='area', offset=[0, 0.5, 0], rot=[0, 90 * i, 0], scale=0.5, scaleTo=0.3, fit='area', sweep=0.45, erodeFrom=0.5, ragged=0.65,
                   tone='body' if i % 2 == 0 else 'rim', seed=10 + i, tier=0 if i < 2 else 1) for i in range(4)],
            mesh('ripple', 0.02, 0.9, at='area', scale=0.2, scaleTo=1.0, fit='area', sweep=0.45, erodeFrom=0.55, ragged=0.6, tone='body', alpha=0.9, seed=5, tier=0),
            mesh('ripple', 0.15, 0.8, at='area', scale=0.15, scaleTo=0.6, fit='area', sweep=0.4, erodeFrom=0.5, tone='accent', alpha=0.75, seed=6, tier=2),
            *[mesh('spike', round(0.05 + 0.02 * i, 3), 0.8, at='area', offset=[round(math.cos(i / 8 * 6.28) * 5.2, 2), 0, round(math.sin(i / 8 * 6.28) * 5.2, 2)], rot=[-90, 0, 0],
                   scale=0.9, sweep=0.2, erodeFrom=0.55, tone='body', seed=30 + i, tier=1) for i in range(8)],
            decal('crack', 0.02, 7.0, 3.0, at='area', grow=0.16, tone='body', alpha=0.95, tier=1),
            parts('spark', 0.02, 70, 10, 1, 0.55, 0.07, at='area', offset=[0, 0.8, 0], tone='rim', tier=0),
            flash(0.02, 0.15, tier=1),
            stop(0.02, 80),
            shake(0.02, 0.55),
        ],
        'variants': {
            'freeze': [mesh('ripple', 0.3, 0.9, at='area', scale=0.1, scaleTo=0.9, fit='area', sweep=0.5, tone='core', alpha=0.7, tier=1, seed=20)],
            'echo': [mesh('burst', 0.4, 0.12, at='area', offset=[0, 1.5, 0], scale=2.4, billboard=True, sweep=0.0, tone='accent', tier=0),
                     mesh('ripple', 0.4, 0.8, at='area', scale=0.1, scaleTo=0.8, fit='area', sweep=0.5, tone='accent', alpha=0.7, tier=1, seed=21)],
        },
    }
