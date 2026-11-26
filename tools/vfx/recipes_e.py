# VFX-V4 phần 2: đột phá cảnh giới, độ kiếp (khởi vòng trận), di chuyển (ngự kiếm, xuất khiếu, thuấn di). Chỉ thêm lớp hình
# (timeline kích hoạt theo S.FX, id giả `fx_*`), không đổi luật. Nạp từ gen-fx-kiem.py sau recipes_d.


def register(R, H):
    mesh, parts, decal, flash, shake, ring_spikes = H['mesh'], H['parts'], H['decal'], H['flash'], H['shake'], H['ring_spikes']

    def cam(t, pull, dur):
        return {'type': 'camera', 't': t, 'pull': pull, 'dur': dur}

    def bolt(t, at, off, scale, tone, seed, tier=0, thick=1):
        e = {'type': 'bolt', 't': t, 'at': at, 'offset': off, 'scale': scale, 'tone': tone, 'seed': seed, 'tier': tier}
        if thick != 1:
            e['thick'] = thick
        return e

    # Đột phá cảnh giới + lên tầng: từ V-P10 do `node tools/vfx-forge/dot-pha.mjs` sinh (sprite vẽ tay Họa Pháp Lô 2); không còn ở đây.

    # Độ kiếp (mở kiếp + chỗ sét đánh): từ V-P10 do `node tools/vfx-forge/do-kiep.mjs` sinh; không còn ở đây.

    # ---------- Nguyên anh xuất khiếu / nhập thể: hồn thể bán trong suốt (bản sao nhân vật màu lam) tách ra bay lên / hạ xuống nhập thể ----------
    R['fx_soul_out'] = lambda: {
        'skill': 'fx_soul_out', 'trigger': 'fx', 'fxKind': 'soul_out', 'palette': 'than_hanh',
        'events': [
            decal('rune', -0.2, 3.4, 2.4, at='self', offset=[0, -1.15, 0], grow=0.3, tone='core', alpha=0.95, tier=0),
            mesh('card', 0.0, 1.9, card='ghost', at='self', offset=[0, 0.1, 0], billboard=True, scale=[0.95, 1.9, 1], sweep=0.25, erodeFrom=0.6, alpha=0.7, tone='body', seed=11,
                 move={'to': 'self', 'offset': [0, 3.2, 0], 'ease': 'out'}, tier=0),
            mesh('card', 0.12, 1.5, card='ghost', at='self', offset=[0, 0.1, 0], billboard=True, scale=[0.95, 1.9, 1], sweep=0.25, erodeFrom=0.5, alpha=0.35, tone='rim', seed=12,
                 move={'to': 'self', 'offset': [0, 2.0, 0], 'ease': 'out'}, tier=1),
            mesh('ripple', 0.0, 0.9, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=2.8, sweep=0.4, erodeFrom=0.45, tone='body', alpha=0.9, seed=2, tier=0),
            mesh('helix', 0.0, 1.2, at='self', offset=[0, -1.0, 0], rot=[-90, 0, 0], scale=[1.6, 1.6, 5.0], sweep=0.3, erodeFrom=0.55, spin=300, tone='accent', alpha=0.8, seed=4, tier=1),
            mesh('burst', 0.0, 0.1, at='self', scale=1.6, billboard=True, sweep=0.0, tone='rim', tier=0),
            parts('spark', 0.0, 50, 2.6, 1, 1.6, 0.08, at='self', offset=[0, 0.4, 0], grav=-1.8, tone='rim', tier=0),
        ],
    }
    R['fx_soul_in'] = lambda: {
        'skill': 'fx_soul_in', 'trigger': 'fx', 'fxKind': 'soul_in', 'palette': 'than_hanh',
        'events': [
            parts('spark', -0.4, 40, 3.0, 1, 0.45, 0.07, at='self', offset=[0, 0.4, 0], inward=True, tone='rim', tier=0),
            mesh('card', -0.5, 0.9, card='ghost', at='self', offset=[0, 3.2, 0], billboard=True, scale=[0.95, 1.9, 1], sweep=0.2, erodeFrom=0.55, alpha=0.7, tone='body', seed=13,
                 move={'to': 'self', 'offset': [0, 0.1, 0], 'ease': 'in'}, tier=0),
            mesh('ripple', -0.1, 0.6, at='self', offset=[0, -1.1, 0], scale=2.6, scaleTo=0.4, sweep=0.1, erodeFrom=0.55, tone='body', alpha=0.9, seed=2, tier=0),
            mesh('burst', 0.3, 0.1, at='self', scale=1.6, billboard=True, sweep=0.0, tone='accent', tier=0),
            mesh('ripple', 0.32, 0.7, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=2.4, sweep=0.4, erodeFrom=0.4, tone='core', alpha=0.85, seed=3, tier=1),
        ],
    }

    # ---------- Thuấn di: tàn ảnh mờ ở điểm đi, vệt sáng nối hai điểm, nổ nhỏ ở điểm đến ----------
    R['fx_blink'] = lambda: {
        'skill': 'fx_blink', 'trigger': 'fx', 'fxKind': 'blink', 'palette': 'than_hanh',
        'events': [
            mesh('card', -0.05, 0.7, card='ghost', at='origin', offset=[0, 0, 0], billboard=True, scale=[0.95, 1.9, 1], sweep=0.05, erodeFrom=0.1, alpha=0.65, tone='body', seed=21, tier=0),
            mesh('burst', -0.05, 0.1, at='origin', scale=1.8, billboard=True, sweep=0.0, tone='rim', tier=0),
            mesh('ripple', -0.05, 0.5, at='origin', offset=[0, -1.1, 0], scale=0.3, scaleTo=2.4, sweep=0.4, erodeFrom=0.4, tone='core', alpha=0.85, seed=22, tier=1),
            mesh('helix', 0.0, 0.3, at='origin', scale=[1.4, 1.4, 6.0], sweep=0.2, erodeFrom=0.3, spin=800, tone='accent', alpha=0.9, move={'to': 'self', 'ease': 'in'}, seed=23, tier=0),
            mesh('crescent', 0.0, 0.3, at='origin', rot=[0, 0, 90], scale=2.2, sweep=0.3, erodeFrom=0.3, ragged=0.6, tone='body', alpha=0.9, move={'to': 'self', 'ease': 'in'}, seed=24, tier=0),
            mesh('gust', -0.02, 0.4, at='origin', scale=[1.6, 1.6, 5.0], tone='rim', alpha=0.85, move={'to': 'self', 'ease': 'in'}, seed=26, tier=1),
            mesh('burst', 0.28, 0.11, at='self', scale=2.4, billboard=True, sweep=0.0, tone='rim', tier=0),
            mesh('ripple', 0.28, 0.6, at='self', offset=[0, -1.1, 0], scale=0.3, scaleTo=3.2, sweep=0.4, erodeFrom=0.4, tone='body', seed=25, tier=0),
            *ring_spikes(6, 1.5, 0.3, 'self', 0.8, 0.7, tier=1, y=-1.15, tilt=20),
            parts('spark', 0.28, 50, 7, 1, 0.5, 0.07, at='self', tone='rim', tier=0),
            shake(0.28, 0.14, tier=1),
        ],
    }

    # Ngự kiếm (cất cánh `fx_fly_on`, hạ cánh `fx_fly_off`): từ V-P10 do `node tools/vfx-forge/ngu-kiem.mjs` sinh; không còn ở đây.
