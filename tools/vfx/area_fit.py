# Co hình VFX vùng theo bán kính sát thương thật (Thiên Nhãn P5a-2: AoE nhắm điểm 9/8 m → `AOE_R` = 6 m, xem `radius` trong packages/content/data/methods.json).
# Recipe dựng timeline theo cỡ cũ (R cũ = 9 hoặc 8 m); gọi `fit_area(events, R_cũ)` / `fit_area_skill(timeline, R_cũ)` để nhân tỉ lệ AOE_R / R_cũ vào:
#   - offset ngang (x, z) của mọi sự kiện neo `area`;
#   - scale ngang của hình nằm đất `GROUND` (`rune_ring2`, `shock_cone`, `crack_radial`, `ripple`; y giữ nguyên), chiều dài `rift_line` (z);
#   - bán kính `r` của decal `rune`/`scorch`/`crack` neo `area`.
# Giữ nguyên: sự kiện `fit: 'area'` (runtime tự nhân theo bán kính vùng), tia sét, decal `strike` (dấu điểm rơi cục bộ), billboard, hạt, chiều cao.
AOE_R = 6.0
GROUND = {'rune_ring2', 'shock_cone', 'crack_radial', 'ripple'}
LOCAL_DECALS = {'strike'}


def _scale(v, k):
    if isinstance(v, list):
        return [round(v[0] * k, 3), v[1], round(v[2] * k, 3)]
    return round(v * k, 3)


def fit_area(events, old_r, new_r=AOE_R):
    k = new_r / old_r
    out = []
    for src in events:
        e = dict(src)
        if e.get('at') == 'area':
            if e.get('offset'):
                o = e['offset']
                e['offset'] = [round(o[0] * k, 3), o[1], round(o[2] * k, 3)]
            if e['type'] == 'mesh' and e.get('fit') != 'area':
                sh = e.get('shape')
                if sh in GROUND:
                    for key in ('scale', 'scaleTo'):
                        if key in e:
                            e[key] = _scale(e[key], k)
                elif sh == 'rift_line':
                    for key in ('scale', 'scaleTo'):
                        if isinstance(e.get(key), list):
                            e[key] = [e[key][0], e[key][1], round(e[key][2] * k, 3)]
            elif e['type'] == 'decal' and 'r' in e and e.get('tex') not in LOCAL_DECALS:
                e['r'] = round(e['r'] * k, 3)
        out.append(e)
    return out


def fit_area_skill(tl, old_r, new_r=AOE_R):
    """Áp `fit_area` cho `events` và mọi biến thức (`variants`) của một timeline."""
    d = dict(tl)
    d['events'] = fit_area(d['events'], old_r, new_r)
    if 'variants' in d:
        d['variants'] = {name: fit_area(evs, old_r, new_r) for name, evs in d['variants'].items()}
    return d
