// Phần thuần của `pnpm perf:iso` (tính phân vị, gom nhóm draw call, so baseline, dựng bảng markdown). Không đụng trình duyệt nên có test.

export type Cat = 'địa hình' | 'kiến trúc/đá' | 'prop/cây' | 'cỏ' | 'VFX' | 'nhân vật/quái' | 'UI/hậu kỳ' | 'khác';
export const CATS: Cat[] = ['địa hình', 'kiến trúc/đá', 'prop/cây', 'cỏ', 'VFX', 'nhân vật/quái', 'UI/hậu kỳ', 'khác'];

/** Gom khóa nhóm của `drawSources` (`<nhóm cha> | <tên mesh> | <loại vật liệu>`) vào nhóm lớn. Thứ tự luật quan trọng (đặc thù trước). */
export function categorize(key: string): Cat {
  const k = key.toLowerCase();
  if (/grass|\bco\b|cỏ|flower|reed|foliage-blade|linh_?thao/.test(k)) return 'cỏ';
  if (
    /vfx|\bfx\b|particle|spark|aura|decal|ring|halo|trail|bolt|hazard|telegraph|slash|beam|lightning|lei|mist|cloud|butterfl|firefl|petal|leaf-fall|dmg|float/.test(
      k,
    )
  )
    return 'VFX';
  if (/player|monster|mon_|boss|npc|skin|body|hair|head|sword|weapon|char|ent[s_-]|avatar|clone|soul|v3/.test(k)) return 'nhân vật/quái';
  if (/terrain|ground|tile|water|lake|river|sea|ocean|sky|dome/.test(k)) return 'địa hình';
  if (
    /sect|arch|build|pagoda|roof|wall|bridge|cliff|rock|stone|boulder|pillar|gate|hall|tower|kit|palace|temple|ruin|mesa|spire|vách|dinh/.test(
      k,
    )
  )
    return 'kiến trúc/đá';
  if (/prop|tree|plant|bamboo|pine|lantern|banner|flag|bush|rack|stele|statue/.test(k)) return 'prop/cây';
  if (/post|ui|overlay|label|sprite/.test(k)) return 'UI/hậu kỳ';
  return 'khác';
}

export interface Group {
  key: string;
  dc: number;
  tris: number;
  shadow: number;
}

/** Cộng draw call/tam giác theo nhóm lớn; `shadow` là số lượt đổ bóng thêm (mỗi mesh castShadow tốn thêm một lượt vẽ). */
export function bucketGroups(groups: Group[]): Record<Cat, { dc: number; tris: number; shadow: number }> {
  const out = Object.fromEntries(CATS.map((c) => [c, { dc: 0, tris: 0, shadow: 0 }])) as Record<
    Cat,
    { dc: number; tris: number; shadow: number }
  >;
  for (const g of groups) {
    const b = out[categorize(g.key)];
    b.dc += g.dc;
    b.tris += g.tris;
    b.shadow += g.shadow;
  }
  return out;
}

export const round = (n: number, d = 2): number => Math.round(n * 10 ** d) / 10 ** d;

/** Phân vị q (0..1) của mảng đã sắp tăng. */
export function quant(sorted: number[], q: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]! : 0;
}

export interface Stat {
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

export function stat(values: number[], d = 2): Stat {
  const s = [...values].sort((a, b) => a - b);
  return {
    p50: round(quant(s, 0.5), d),
    p95: round(quant(s, 0.95), d),
    max: round(s[s.length - 1] ?? 0, d),
    mean: round(s.reduce((a, v) => a + v, 0) / Math.max(1, s.length), d),
  };
}

/** Một điểm đo (một vị trí, một preset). */
export interface IsoPoint {
  /** `<mục tiêu>/<điểm>`, ví dụ `van_lam/san`. */
  id: string;
  target: string;
  kind: 'map' | 'dungeon' | 'kieu' | 'trib' | 'fight';
  preset: string;
  frames: number;
  fps: number;
  cpuMs: Stat;
  /** Thời gian từng hệ (ms trung bình mỗi khung): render, ents, vfx, terrain… */
  parts: Record<string, number>;
  /** GPU ms mỗi khung từ timestamp query; null nếu trình duyệt không có. */
  gpuMs: Stat | null;
  drawCalls: { p50: number; max: number };
  triangles: { p50: number; max: number };
  textures: number;
  textureMB: number;
  geometries: number;
  materials: number;
  /** Ước tính bộ nhớ GPU: texture + buffer hình học (byte → MB). */
  gpuMemMB: number;
  jsHeapMB: number | null;
  monsters: number;
  byCat: Record<Cat, { dc: number; tris: number; shadow: number }>;
  /** Draw call/tam giác theo loại đối tượng: skin (nhân vật/quái), instanced, basic (VFX/trời/sương), tĩnh (kiến trúc/địa hình/prop gộp). */
  kinds?: Record<'skin' | 'instanced' | 'basic' | 'static', { dc: number; tris: number; shadow: number }>;
  /** Tối đa 8 khung CPU > 12 ms (chẩn đoán spike): thời điểm, ms, thời gian từng hệ. */
  longFrames?: { at: number; dt: number; parts: Record<string, number> }[];
  /** Mesh nặng nhất theo draw call (top 6) để lần theo nguyên nhân. */
  topGroups: Group[];
}

export interface IsoRun {
  version: 1;
  date: string;
  adapter: string;
  backend: string;
  viewport: string;
  quick: boolean;
  firstLoadMB: number | null;
  points: IsoPoint[];
  errors: string[];
}

/** Điểm số "nặng" để xếp hạng: CPU p95 là chính, rồi draw call, rồi tam giác. */
export const weight = (p: IsoPoint): number => p.cpuMs.p95 + (p.gpuMs?.p95 ?? 0) + p.drawCalls.p50 / 100 + p.triangles.p50 / 1_000_000;

export function topHeavy(run: IsoRun, preset: string, n = 10): IsoPoint[] {
  return run.points
    .filter((p) => p.preset === preset)
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, n);
}

export interface Delta {
  id: string;
  preset: string;
  metric: string;
  before: number;
  after: number;
  pct: number;
}

/** So hai lần chạy cùng (id, preset): báo chỉ số đổi quá `tol` (mặc định 10%) và đủ lớn tuyệt đối. */
export function compareRuns(base: IsoRun, cur: IsoRun, tol = 0.1): Delta[] {
  const key = (p: IsoPoint) => `${p.preset}|${p.id}`;
  const b = new Map(base.points.map((p) => [key(p), p]));
  const out: Delta[] = [];
  const metrics: [string, (p: IsoPoint) => number, number][] = [
    ['draw call p50', (p) => p.drawCalls.p50, 5],
    ['tam giác p50', (p) => p.triangles.p50, 20_000],
    ['CPU p95 ms', (p) => p.cpuMs.p95, 0.3],
    ['texture MB', (p) => p.textureMB, 4],
  ];
  for (const p of cur.points) {
    const o = b.get(key(p));
    if (!o) continue;
    for (const [metric, f, minAbs] of metrics) {
      const before = f(o);
      const after = f(p);
      if (Math.abs(after - before) < minAbs) continue;
      const pct = before === 0 ? 1 : (after - before) / before;
      if (Math.abs(pct) >= tol) out.push({ id: p.id, preset: p.preset, metric, before, after, pct: round(pct * 100, 1) });
    }
  }
  return out;
}

const fmt = (n: number): string => (n >= 10_000 ? `${(n / 1000).toFixed(0)}k` : String(n));

/** Bảng markdown: mỗi hàng một điểm × preset; cột so baseline nếu có. */
export function toMarkdown(run: IsoRun, deltas: Delta[] = []): string {
  const L: string[] = [];
  L.push(`# perf:iso ${run.date}`, '', `GPU: ${run.adapter || '?'} · ${run.backend} · ${run.viewport}${run.quick ? ' · --quick' : ''}`);
  if (run.firstLoadMB !== null) L.push(`Tải lần đầu: **${run.firstLoadMB} MB**`);
  L.push('');
  for (const preset of [...new Set(run.points.map((p) => p.preset))]) {
    L.push(
      `## Preset ${preset}`,
      '',
      '| điểm | DC p50 | tam giác | CPU p50/p95 ms | GPU p95 ms | tex MB | mat | geo | GPU mem MB | render ms | ents ms | vfx ms |',
    );
    L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const p of run.points.filter((q) => q.preset === preset)) {
      L.push(
        `| ${p.id} | ${p.drawCalls.p50} | ${fmt(p.triangles.p50)} | ${p.cpuMs.p50}/${p.cpuMs.p95} | ${p.gpuMs ? p.gpuMs.p95 : '–'} | ${p.textureMB} | ${p.materials} | ${p.geometries} | ${p.gpuMemMB} | ${p.parts.render ?? '–'} | ${p.parts.ents ?? '–'} | ${p.parts.vfx ?? '–'} |`,
      );
    }
    L.push('');
  }
  if (deltas.length) {
    L.push('## So với baseline (đổi ≥ 10%)', '', '| điểm | preset | chỉ số | trước | sau | % |', '|---|---|---|---:|---:|---:|');
    for (const d of deltas) L.push(`| ${d.id} | ${d.preset} | ${d.metric} | ${d.before} | ${d.after} | ${d.pct > 0 ? '+' : ''}${d.pct} |`);
    L.push('');
  }
  if (run.errors.length) L.push('## Lỗi console', '', ...[...new Set(run.errors)].slice(0, 10).map((e) => `- ${e}`), '');
  return L.join('\n');
}
