# PROP-1 "Thiên Công Khai Vật": sinh GLB cho một nhóm prop (mọi món × 2 biến thể) từ tools/blender/prop_tc_items.json.
#   blender --background --python tools/blender/prop_tc.py -- <out.glb> --group tong_mon
# run.mjs truyền <out.glb> = assets/build/raw/<id đầu của nhóm>.glb; các GLB còn lại ghi cạnh nó (cùng thư mục).
# Chế độ ảnh duyệt: `-- --preview <thư mục> [--group g]` dựng một GLB gom mọi món xếp hàng + danh sách (xem prop_tc_preview.py).
import json
import os
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import prop_tc_lib as L  # noqa: E402

GROUP_MODULES = {
    'tong_mon': 'prop_tc_tong_mon',
    'cho_lang': 'prop_tc_cho_lang',
    'hoang_da': 'prop_tc_hoang_da',
    'tran_phap': 'prop_tc_tran_phap',
    'di_vuc': 'prop_tc_di_vuc',
}


def load_items():
    with open(os.path.join(HERE, 'prop_tc_items.json'), encoding='utf8') as f:
        return json.load(f)['groups']


def ids_of(name):
    return [f'prop_tc_{name}', f'prop_tc_{name}_2']


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    group = args[args.index('--group') + 1] if '--group' in args else 'tong_mon'
    only = args[args.index('--only') + 1] if '--only' in args else None
    out = args[0] if args and not args[0].startswith('--') else None
    import importlib

    L.kit.bs.make_textures() if hasattr(L.kit, 'bs') else L.bs.make_textures()
    importlib.import_module(GROUP_MODULES[group])
    outdir = os.path.dirname(out) if out else 'prop_tc_out'
    os.makedirs(outdir, exist_ok=True)
    report = {}
    for it in load_items()[group]:
        if only and it['name'] != only:
            continue
        for v, pid in enumerate(ids_of(it['name'])):
            seed = zlib.crc32(pid.encode()) % 1000
            info = L.build_item(pid, it['name'], v, seed, os.path.join(outdir, pid + '.glb'))
            report[pid] = info
            print(f"[prop_tc] {pid}: {info['tris']} tam giác, cao {info['size'][1]} m, rộng {info['size'][0]}×{info['size'][2]}, vật liệu {info['keys']}")
    with open(os.path.join(outdir, f'prop_tc_{group}_report.json'), 'w', encoding='utf8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
