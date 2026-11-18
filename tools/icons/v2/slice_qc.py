"""Cắt tờ Codex 3×2 (1536×1024) thành icon 256 px: nền đa thức, căn giữa, độ lấp đầy 74 %, QC (chạm biên, đọc ở 32 px, trùng hình).

Dùng: DTL_ASSET_SOURCE=<thư mục> python tools/icons/v2/slice_qc.py   (cần pillow + numpy). Đọc `<src>/2d/icons-v2/sheets/<tờ>.png`, ghi `png256/` và `qc.json`.
"""
import json, io, os, glob, sys, math
import numpy as np
from PIL import Image, ImageDraw
import sys
SRC = os.environ.get("DTL_ASSET_SOURCE", os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../../dtl-asset-source")) + "/2d/icons-v2/"
HERE = os.path.dirname(os.path.abspath(__file__))
SH = json.load(io.open(os.path.join(HERE, "sheets.v2.json"), encoding="utf-8"))
# tờ thử đã có (4 bộ) cũng đưa vào
P = SRC + "png256/"; os.makedirs(P, exist_ok=True)
def sheet_path(sid):
    return SRC + f"sheets/{sid}.png"
def lum(a): return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
def analyse(cell):
    """Nền mô hình hóa bằng đa thức bậc 2 khớp trên dải viền ngoài (chịu được quầng sáng góc); chủ thể = pixel lệch nền."""
    a = np.asarray(cell.convert("RGB")).astype(np.float32)
    h, w, _ = a.shape; b = max(3, int(min(h, w) * .07))
    yy, xx = np.mgrid[0:h, 0:w]; xn = xx / w - .5; yn = yy / h - .5
    X = np.stack([np.ones_like(xn), xn, yn, xn * xn, yn * yn, xn * yn], -1)
    band = np.zeros((h, w), bool); band[:b] = band[-b:] = True; band[:, :b] = band[:, -b:] = True
    sel = band.copy()
    bgimg = None
    for it in range(3):
        coef = np.linalg.lstsq(X[sel], a[sel], rcond=None)[0]
        bgimg = X @ coef
        d = np.sqrt(((a - bgimg) ** 2).sum(-1))
        sel = band & (d < 28)
        if sel.sum() < 200: sel = band
    d = np.sqrt(((a - bgimg) ** 2).sum(-1))
    return a, d > 34, np.median(bgimg[band], axis=0)
def bbox_of(mask):
    ys, xs = np.where(mask)
    if len(ys) < 50: return None
    # bỏ nhiễu: dùng phân vị
    return (int(np.percentile(xs, 1)), int(np.percentile(ys, 1)), int(np.percentile(xs, 99)), int(np.percentile(ys, 99)))
def dhash(img, n=16):
    g = np.asarray(img.convert("L").resize((n + 1, n), Image.LANCZOS)).astype(np.int16)
    return (g[:, 1:] > g[:, :-1]).flatten()
results = {}; hashes = {}
for s in SH:
    p = sheet_path(s["id"])
    if not os.path.exists(p): continue
    im = Image.open(p).convert("RGB"); W, H = im.size; cw, ch = W / 3, H / 2
    for i, iid in enumerate(s["cells"]):
        c, r = i % 3, i // 3
        box = (int(c * cw + cw * .02), int(r * ch + ch * .02), int((c + 1) * cw - cw * .02), int((r + 1) * ch - ch * .02))
        cell = im.crop(box)
        a, mask, bg = analyse(cell)
        h, w = mask.shape; flags = []
        bb = bbox_of(mask)
        if bb is None:
            results[iid] = {"sheet": s["id"], "flags": ["rỗng"]}; continue
        x0, y0, x1, y1 = bb; bw, bh = x1 - x0, y1 - y0
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        fill = max(bw, bh) / min(h, w)
        off = max(abs(cx - w / 2) / w, abs(cy - h / 2) / h)
        # chạm biên: chủ thể sát mép ô => dính ô bên cạnh hoặc bị cắt
        e = int(min(h, w) * .03)
        edge = np.concatenate([mask[:e].ravel(), mask[-e:].ravel(), mask[:, :e].ravel(), mask[:, -e:].ravel()]).mean()
        if edge > .06: flags.append("chạm biên ô")
        if fill < .30: flags.append("quá nhỏ")
        if fill > .97: flags.append("quá lớn/cắt")
        if off > .22: flags.append("lệch tâm")
        bgL = float(lum(bg[None, None])[0, 0])
        if bgL > 70: flags.append("nền sáng/lạc phong cách")
        # căn giữa lại + chuẩn hóa độ lấp đầy 74 %
        side = int(max(bw, bh) / .74); side = max(side, 64)
        sx0 = int(cx - side / 2); sy0 = int(cy - side / 2)
        arr = np.asarray(cell).astype(np.uint8); pad = max(0, -sx0, -sy0, sx0 + side - w, sy0 + side - h)
        arr = np.pad(arr, ((pad, pad), (pad, pad), (0, 0)), mode="edge")
        can = Image.fromarray(arr[sy0 + pad: sy0 + pad + side, sx0 + pad: sx0 + pad + side])
        out = can.resize((256, 256), Image.LANCZOS)
        out.save(P + iid + ".png")
        # đọc ở 32 px
        sm = np.asarray(out.resize((32, 32), Image.LANCZOS)).astype(np.float32)
        L = lum(sm); cen = L[6:26, 6:26]
        contrast = float(cen.std())
        gx = np.abs(np.diff(L, axis=1)).mean() + np.abs(np.diff(L, axis=0)).mean()
        if contrast < 16 or gx < 3.0: flags.append("khó đọc ở 32 px")
        sat = float(np.asarray(out.convert("HSV"))[..., 1][mask.shape[0] // 2 - 20: mask.shape[0] // 2 + 20].mean()) if False else 0
        mcol = a[mask].mean(0)
        results[iid] = {"sheet": s["id"], "fill": round(fill, 2), "off": round(off, 2), "edge": round(float(edge), 3), "c32": round(contrast, 1), "g32": round(float(gx), 2), "bgL": round(bgL, 1), "color": [int(v) for v in mcol], "flags": flags}
        hashes[iid] = dhash(out)
# trùng hình giữa icon khác id
ids = list(hashes)
for i in range(len(ids)):
    for j in range(i + 1, len(ids)):
        d = int((hashes[ids[i]] != hashes[ids[j]]).sum())
        if d <= 18:
            for k in (ids[i], ids[j]): results[k]["flags"].append(f"gần trùng {ids[j] if k==ids[i] else ids[i]} (d={d})")
# trong bộ: độ lệch màu giữa các bộ cùng bậc (đo màu trung bình của món)
json.dump(results, io.open(SRC + "qc.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
bad = {k: v["flags"] for k, v in results.items() if v["flags"]}
print(len(results), "icon xử lý;", len(bad), "bị gắn cờ")
for k, f in list(bad.items())[:60]: print(" ", k, f)
