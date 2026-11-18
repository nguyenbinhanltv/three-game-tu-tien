// Bước 1 của bản nghe thử "đi bộ qua sân đá → đường đất → cỏ → ven hồ" (xem walkthrough.mjs).
//
// Chạy CHÍNH code của game để quyết định âm thanh: chất liệu mặt đất (surface.ts), nhịp bước (footsteps.ts: StepClock),
// chọn nguồn theo vị trí và lịch chuông (soundscape.ts). Ghi events.json (+ crackle.f32) cho walkthrough.mjs trộn ra MP3.
//
//   cd apps/client && node <đường dẫn tsx>/cli.mjs ../../tools/audio/walkthrough/route.ts <thư mục ra>
//   (walkthrough.mjs tự gọi lệnh này nên thường không cần chạy tay)
import fs from 'node:fs';
import path from 'node:path';
import { LAKE, RUN_SPEED, SECT } from '@dtl/shared';
import { StepClock, stepVolume } from '../../../apps/client/src/game/audio/footsteps';
import { pathPolylines } from '../../../apps/client/src/render/groundMask';
import {
  buildSources,
  KINDS,
  makeCrackle,
  Soundscape,
  type SpatialApi,
  templeBellPartials,
} from '../../../apps/client/src/game/audio/soundscape';
import { surfaceAt, type Surface } from '../../../apps/client/src/game/world/surface';

const outDir = process.argv[2];
if (!outDir) throw new Error('thiếu thư mục ra');
fs.mkdirSync(outDir, { recursive: true });

// Vị trí bầu đèn như SECT_LANTERNS (game/sect.ts); sect.ts kéo theo three nên không import vào script chạy bằng node.
const LANTERNS: { x: number; z: number }[] = [];
for (let z = 2080; z <= 2118; z += 12) for (const sx of [-1, 1]) LANTERNS.push({ x: SECT.x + sx * 7.5, z });
const SOURCES = buildSources(LANTERNS);

interface P {
  x: number;
  z: number;
}
interface Clip {
  name: string;
  zone: 'sect' | 'wild' | 'lake';
  dur: number;
  footsteps: { t: number; surface: Surface; vol: number }[];
  track: { t: number; x: number; z: number; yaw: number }[];
  sources: { id: string; kind: string; x: number; z: number; t0: number; t1: number }[];
  bells: { t: number; x: number; z: number }[];
}

/** Đi dọc đa tuyến `pts` với RUN_SPEED trong `dur` giây, bước 100 Hz. Camera ở sau lưng (yaw như engine: nhìn theo hướng đi). */
function walk(name: string, zone: Clip['zone'], pts: P[], dur: number, bellSeed: number): Clip {
  const seg: number[] = [0];
  for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const total = seg[seg.length - 1];
  const at = (s: number): P & { dx: number; dz: number } => {
    s = Math.min(s, total);
    let i = 1;
    while (i < seg.length - 1 && seg[i] < s) i++;
    const f = (s - seg[i - 1]) / Math.max(1e-6, seg[i] - seg[i - 1]);
    const dx = pts[i].x - pts[i - 1].x;
    const dz = pts[i].z - pts[i - 1].z;
    const L = Math.hypot(dx, dz) || 1;
    return { x: pts[i - 1].x + dx * f, z: pts[i - 1].z + dz * f, dx: dx / L, dz: dz / L };
  };
  const clip: Clip = { name, zone, dur, footsteps: [], track: [], sources: [], bells: [] };
  let T = 0;
  const open = new Map<string, { kind: string; x: number; z: number; t0: number }>();
  const api: SpatialApi = {
    ready: () => true,
    loop: async () => null,
    bell: (x, z) => {
      clip.bells.push({ t: T, x, z });
      return true;
    },
  };
  // Soundscape ghi nguồn đang hoạt động qua nhật ký (+id / -id); `loop` của api giả trả null nên đọc state() mỗi bước.
  let seed = bellSeed;
  const sc = new Soundscape(SOURCES, api).seed(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
  const clock = new StepClock();
  let lastYaw = 0;
  const dt = 0.01;
  for (let k = 0; k <= Math.round(dur / dt); k++) {
    T = k * dt;
    const p = at(RUN_SPEED * T);
    const moving = RUN_SPEED * T < total;
    const yaw = moving ? Math.atan2(-p.dx, -p.dz) : lastYaw;
    lastYaw = yaw;
    if (k % 5 === 0) {
      clip.track.push({ t: T, x: p.x, z: p.z, yaw });
      sc.update(p.x, p.z, T);
      const now = new Set(sc.state().map((s) => s.id));
      for (const id of now) if (!open.has(id)) open.set(id, { ...SOURCES.find((s) => s.id === id)!, t0: T });
      for (const [id, o] of open) {
        if (now.has(id)) continue;
        clip.sources.push({ id, kind: o.kind, x: o.x, z: o.z, t0: o.t0, t1: T });
        open.delete(id);
      }
    }
    if (clock.advance(p.x, p.z, RUN_SPEED, moving) > 0)
      clip.footsteps.push({ t: T, surface: surfaceAt(p.x, p.z), vol: stepVolume(0, true, false) });
  }
  for (const [id, o] of open) clip.sources.push({ id, kind: o.kind, x: o.x, z: o.z, t0: o.t0, t1: dur });
  return clip;
}

// --- lộ trình ---
const path3 = pathPolylines()[3];
const pathAt = (s: number): P => {
  let acc = 0;
  for (let i = 1; i < path3.length; i++) {
    const L = Math.hypot(path3[i].x - path3[i - 1].x, path3[i].z - path3[i - 1].z);
    if (acc + L >= s) {
      const f = (s - acc) / L;
      return { x: path3[i - 1].x + (path3[i].x - path3[i - 1].x) * f, z: path3[i - 1].z + (path3[i].z - path3[i - 1].z) * f };
    }
    acc += L;
  }
  return path3[path3.length - 1];
};
const pathPts = (s0: number, s1: number): P[] => {
  const out: P[] = [];
  for (let s = s0; s <= s1; s += 2) out.push(pathAt(s));
  return out;
};
// Bờ tây hồ (góc π): dốc thoải, cỏ rồi cát rồi lội nước. r = khoảng cách tới tâm hồ.
const lakePt = (r: number): P => ({ x: LAKE.x - r, z: LAKE.z });

const clips = [
  // Lối đèn đá: đi bắc dọc trục sân (đèn hai bên), rẽ tây về phía lối ra. Chuông chính điện ở phía bắc.
  walk(
    'san_da',
    'sect',
    [
      { x: SECT.x, z: 2128 },
      { x: SECT.x, z: 2080 },
      { x: SECT.x - 50, z: 2058 },
      { x: SECT.x - 90, z: 2048 },
    ],
    20,
    11,
  ),
  walk('duong_dat', 'wild', pathPts(120, 160), 5, 3),
  walk('co_ven_ho', 'lake', [lakePt(290), lakePt(205)], 12, 5),
];
for (const c of clips) {
  const by: Record<string, number> = {};
  for (const f of c.footsteps) by[f.surface] = (by[f.surface] ?? 0) + 1;
  console.log(
    `${c.name}: ${c.dur}s, bước ${JSON.stringify(by)}, nguồn ${c.sources.map((s) => `${s.id}[${s.t0.toFixed(1)}-${s.t1.toFixed(1)}]`).join(' ')}, chuông ${c.bells.map((b) => b.t.toFixed(1)).join(',') || '—'}`,
  );
}
fs.writeFileSync(path.join(outDir, 'events.json'), JSON.stringify({ clips, kinds: KINDS, bell: templeBellPartials() }));
fs.writeFileSync(path.join(outDir, 'crackle.f32'), Buffer.from(makeCrackle(48000).buffer));
