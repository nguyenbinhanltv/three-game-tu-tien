// Đường dẫn, ngân sách và IO dùng chung cho optimize.ts / validate.ts.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Tăng khi đổi bước tối ưu để cache cũ tự mất hiệu lực. */
export const PIPELINE_VERSION = 2;

export const DEFAULTS = {
  /** GLB thô: Blender xuất (tools/blender/run.mjs) hoặc import_tripo (M2-2). Không commit. */
  rawDir: path.join(ROOT, 'assets/build/raw'),
  /** GLB đã tối ưu, tên theo hash, cùng manifest.json. Commit (nguồn lớn nằm ngoài repo). */
  outDir: path.join(ROOT, 'apps/client/public/assets'),
  cacheFile: path.join(ROOT, 'assets/build/.cache.json'),
  budgetsFile: path.join(ROOT, 'assets/budgets.json'),
  licensesFile: path.join(ROOT, 'assets/LICENSES.md'),
  sourceDir: path.join(ROOT, 'assets/source'),
  schemaFile: path.join(ROOT, 'assets/meta.schema.json'),
};

export const ASSET_ID = /^(chr|mon|boss|prop|arch|fx|anim)_[a-z0-9]+(_[a-z0-9]+)*$/;

export interface LodSpec {
  ratio: number;
  maxTriangles?: number;
}

export interface BudgetClass {
  triangles: { min: number; max: number };
  lods: LodSpec[];
  /** Cạnh lớn nhất (px): `color` cho base color/emissive, `data` cho normal/ORM. 0 = không được có texture. */
  texture: { color: number; data: number };
  bones: number;
}

const COLOR_SLOTS = new Set(['baseColorTexture', 'emissiveTexture', 'diffuseTexture', 'sheenColorTexture']);

/** Cạnh texture tối đa theo slot đang dùng (texture dùng cho cả map màu lẫn dữ liệu thì lấy mức lớn hơn). */
export function textureLimit(spec: BudgetClass, slots: string[]): number {
  const color = slots.some((s) => COLOR_SLOTS.has(s));
  const data = slots.some((s) => !COLOR_SLOTS.has(s));
  if (color && data) return Math.max(spec.texture.color, spec.texture.data);
  return color ? spec.texture.color : spec.texture.data;
}

export interface Budgets {
  version: number;
  prefixes: Record<string, string>;
  classes: Record<string, BudgetClass>;
}

export function loadBudgets(file = DEFAULTS.budgetsFile): Budgets {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Budgets;
}

/** Đọc assets/source/<loại>/<id>/meta.json nếu có. */
export function findMeta(id: string, sourceDir = DEFAULTS.sourceDir): { file: string; data: Record<string, unknown> } | null {
  if (!fs.existsSync(sourceDir)) return null;
  for (const type of fs.readdirSync(sourceDir)) {
    const file = path.join(sourceDir, type, id, 'meta.json');
    if (fs.existsSync(file)) return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  }
  return null;
}

/** Lớp ngân sách: meta.json `budgetClass`, nếu không thì suy từ tiền tố id. */
export function classify(id: string, budgets: Budgets, sourceDir?: string): string | null {
  const meta = findMeta(id, sourceDir);
  const explicit = meta?.data.budgetClass;
  if (typeof explicit === 'string' && budgets.classes[explicit]) return explicit;
  for (const [prefix, cls] of Object.entries(budgets.prefixes)) if (id.startsWith(prefix)) return cls;
  return null;
}

/**
 * Trần tam giác LOD0: `budget.faceLimit` trong meta.json (mức đã xin Tripo) nếu có, không vượt `triangles.max` của lớp.
 * optimize.ts hạ LOD0 về trần này (Tripo thường trả nhiều mặt hơn face_limit).
 */
export function lod0Cap(id: string, spec: BudgetClass, sourceDir?: string): number {
  const face = (findMeta(id, sourceDir)?.data.budget as { faceLimit?: unknown } | undefined)?.faceLimit;
  return typeof face === 'number' && face > 0 ? Math.min(face, spec.triangles.max) : spec.triangles.max;
}

/** Đích tam giác cho từng LOD (không gồm LOD0). */
export function lodTargets(lod0: number, spec: BudgetClass): number[] {
  return spec.lods.map((l) => Math.max(1, Math.round(Math.min(l.ratio * lod0, l.maxTriangles ?? Infinity))));
}

let ready: Promise<void> | null = null;
export async function meshopt() {
  ready ??= Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]).then(() => undefined);
  await ready;
  return { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier };
}

export async function createIO(): Promise<NodeIO> {
  const { MeshoptDecoder, MeshoptEncoder } = await meshopt();
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
}

export function rel(p: string): string {
  return path.relative(ROOT, p).replaceAll('\\', '/');
}
