// Thân Pháp T4: sinh bản pose "pose-to-pose kiểu anime" `<id>_tp.json` từ pose K-5 sẵn có, cho camera chéo.
//   node tools/poses/thanphap.mjs [id,id,...]      (mặc định: kiem_khi_tram, phi_kiem, thien_kiem_vu = ba chiêu Kiếm tu của pilot TP-1)
// Giữ nguyên thời lượng và khung trúng `hit[0]` (khớp `hitAt` của chiêu, timeline FX, hit-stop). Thay đổi, đều dạng dữ liệu key:
//   1. Dồn lực: độ lệch so với thế đầu của thân/hông/đầu/tay kiếm nhân `WIND` (kéo lại sâu hơn) và GIỮ tới `hit − SNAP`.
//   2. Đường chém: từ hết dồn lực tới đỉnh đòn chỉ `SNAP` giây (2 khung 60 Hz) — nhanh, nét kéo của lưỡi (BladeSmear) bám vào đây.
//   3. Đỉnh đòn: tư thế đỉnh nhấn `PUNCH` (thân/hông xoay mạnh hơn) và GIỮ `HOLD` giây (≥ 3 khung 60 Hz, key `linear` hai khung liền nhau).
//   4. Thu đòn: các key sau đó giữ nguyên thời gian/tư thế gốc (kiểu vung rồi thu về).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'packages/content/data/poses');
export const WIND = 1.3;
export const SNAP = 0.034;
export const HOLD = 0.058;
export const PUNCH = 1.12;
export const DEFAULT_IDS = ['kiem_khi_tram', 'phi_kiem', 'thien_kiem_vu'];
const r3 = (n) => Math.round(n * 1000) / 1000;
const rv = (a) => a.map(r3);
const dev = (v, base, k) => v.map((x, i) => base[i] + (x - base[i]) * k);

/** Vai phải (người tham chiếu của `POSE_REF`: vai trái [0.18, 0.45, 0], bên phải đổi dấu x) và tầm với tối đa an toàn (content:check cho 0,62 m). */
const SHOULDER_R = [-0.18, 0.45, 0];
const MAX_REACH = 0.58;
/** Kéo cổ tay về phía vai nếu xa quá tầm với (vai đi theo hông đã dời). */
function clampReach(v, hipsPos) {
  const s = [SHOULDER_R[0] + hipsPos[0], SHOULDER_R[1] + hipsPos[1], SHOULDER_R[2] + hipsPos[2]];
  const d = v.map((x, i) => x - s[i]);
  const len = Math.hypot(...d);
  return len <= MAX_REACH ? v : v.map((_, i) => s[i] + (d[i] * MAX_REACH) / len);
}

/** Nhân độ lệch so với `base` (key đầu) của các trường xoay; trường IK dạng vị trí cổ tay chỉ nhân nhẹ để kiếm không xuyên thân. */
function amplify(key, base, kRot, kPos) {
  const o = { ...key };
  if (key.spine && base.spine) o.spine = rv(dev(key.spine, base.spine, kRot));
  if (key.head && base.head) o.head = rv(dev(key.head, base.head, kRot));
  if (key.hips?.rot && base.hips?.rot) o.hips = { ...key.hips, rot: rv(dev(key.hips.rot, base.hips.rot, kRot)) };
  if (key.handR && base.handR) o.handR = rv(clampReach(dev(key.handR, base.handR, kPos), o.hips?.pos ?? [0, 0, 0]));
  return o;
}

export function convert(def) {
  const h = def.hit?.[0];
  if (!h) throw new Error(`${def.id}: không có hit`);
  const keys = def.keys;
  const base = keys[0];
  const hitIdx = keys.findIndex((k) => Math.abs(k.t - h) < 1e-6);
  if (hitIdx < 2) throw new Error(`${def.id}: không có key đỉnh đòn tại hit[0]`);
  const out = [{ ...base }];
  // 1) dồn lực: các key trước đỉnh (trừ key đầu và key ngay trước đỉnh, vốn là điểm giữ).
  const pre = keys.slice(1, hitIdx);
  let last = null;
  for (const k of pre) {
    last = { ...amplify(k, base, WIND, 1.2), ease: k.ease };
    out.push(last);
  }
  // giữ dồn lực tới h − SNAP (nếu key giữ cuối cùng còn sớm hơn).
  if (last.t < h - SNAP - 1e-6) out.push({ ...last, t: r3(h - SNAP), ease: 'linear' });
  else last.t = Math.min(last.t, r3(h - SNAP));
  // 2) đỉnh đòn nhấn + giữ.
  const peak = { ...amplify(keys[hitIdx], base, PUNCH, 1.0), t: h, ease: 'quartOut' };
  out.push(peak);
  out.push({ ...peak, t: r3(h + HOLD), ease: 'linear' });
  // 3) thu đòn: key sau đỉnh và còn lại giữ nguyên, bỏ key trôi nằm trong cửa sổ giữ.
  for (const k of keys.slice(hitIdx + 1)) if (k.t > h + HOLD + 0.02) out.push(k);
  const res = { ...def, id: `${def.id}_tp`, keys: out };
  res.keys = res.keys.map((k, i, a) => (i > 0 && k.t <= a[i - 1].t ? { ...k, t: r3(a[i - 1].t + 0.004) } : k));
  return res;
}

function fmtKey(k) {
  const parts = [`"t":${k.t}`];
  if (k.ease) parts.push(`"ease":"${k.ease}"`);
  for (const [n, v] of Object.entries(k)) {
    if (n === 't' || n === 'ease') continue;
    parts.push(`"${n}":${JSON.stringify(v)}`);
  }
  return `    { ${parts.join(', ')} }`;
}

export function format(def) {
  const head = [`  "id": "${def.id}"`, `  "duration": ${def.duration}`, `  "loop": ${def.loop}`];
  if (def.hit) head.push(`  "hit": ${JSON.stringify(def.hit)}`);
  return `{\n${head.join(',\n')},\n  "keys": [\n${def.keys.map(fmtKey).join(',\n')}\n  ]\n}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ids = process.argv[2] ? process.argv[2].split(',') : DEFAULT_IDS;
  for (const id of ids) {
    const def = JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8'));
    const tp = convert(def);
    fs.writeFileSync(path.join(DIR, `${tp.id}.json`), format(tp));
    console.log(`${tp.id}: ${tp.keys.length} key, đỉnh ${tp.hit[0]} s, giữ ${HOLD * 1000} ms`);
  }
}
