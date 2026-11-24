// Đẩy asset lên R2: dựng lại sổ khóa từ đĩa, so với bucket, chỉ upload file thiếu hoặc lệch.
//   pnpm assets:push [--dry] [--only <đường dẫn hoặc tiền tố>] [--no-lock]
// R2 BẤT BIẾN: push TỪ CHỐI (không upload gì cả) nếu một khóa đã có trên R2 với kích thước hoặc sha256 khác sổ khóa; không có cờ ghi đè.
//   Đổi nội dung = đổi tên: `<tên>.<hash10>.<đuôi>` (xem docs/handbook/assets.md).
// Khóa R2 đọc từ biến môi trường / .env.local (xem r2/env.ts), không bao giờ được in ra.

import fs from 'node:fs';
import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { cacheControl, contentType, makeClient } from './r2/client.js';
import { loadR2Env } from './r2/env.js';
import { BINARY_EXT, isHashedName, localPath, type Lock, pool, readLock, scanLock, writeLock } from './r2/lock.js';

export interface PushOptions {
  dry?: boolean;
  only?: string;
  /** Không ghi lại sổ khóa (dùng khi chỉ thử một file). */
  noLock?: boolean;
}

export interface PushReport {
  total: number;
  present: number;
  uploaded: string[];
  uploadedBytes: number;
  failed: { key: string; error: string }[];
  lockChanged: boolean;
  /** Khóa đã có trên R2 với nội dung khác sổ khóa (push từ chối). */
  conflicts: PushConflict[];
}

export interface PushConflict {
  key: string;
  reason: string;
}

export class PushConflictError extends Error {
  constructor(readonly conflicts: PushConflict[]) {
    super(
      `TỪ CHỐI ghi đè ${conflicts.length} khóa đã có trên R2 với nội dung khác (R2 bất biến: main và các nhánh khác đang tải các khóa này):\n` +
        conflicts.map((c) => `  - ${c.key}: ${c.reason}`).join('\n') +
        '\nCách sửa: đóng file ra tên MỚI theo hash nội dung `<tên>.<hash10>.<đuôi>` (hash10 = sha256sum <file> | cut -c1-10), sửa chỗ tham chiếu, chạy lại `pnpm assets:lock` và push khóa mới; ' +
        'hoặc đưa file đang ở đĩa về đúng bản của sổ khóa main nếu bạn chỉ vô tình đổi nội dung.',
    );
  }
}

export async function listBucket(s3: S3Client, bucket: string, prefix?: string): Promise<Map<string, { size: number; modified?: Date }>> {
  const out = new Map<string, { size: number; modified?: Date }>();
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of r.Contents ?? []) if (o.Key) out.set(o.Key, { size: o.Size ?? 0, modified: o.LastModified });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function remoteSha(s3: S3Client, bucket: string, key: string): Promise<string | undefined> {
  try {
    const h = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return h.Metadata?.sha256;
  } catch {
    return undefined;
  }
}

export interface PlanInput {
  keys: string[];
  lock: Lock;
  remote: Map<string, { size: number }>;
  /** sha256 lưu trong metadata của đối tượng R2 (undefined nếu đối tượng cũ không có metadata). */
  remoteSha: (key: string) => Promise<string | undefined>;
}

export interface PushPlan {
  todo: string[];
  present: number;
  conflicts: PushConflict[];
  /** Tên cố định cùng kích thước nhưng R2 không có metadata sha: không kiểm được, coi như đã có. */
  unverified: string[];
  /** Khóa văn bản/json tên cố định (không phải nhị phân) đã có trên R2 nhưng khác sổ khóa: được GHI ĐÈ có chủ đích (nằm trong `todo`). */
  overwrites: string[];
}

/** Khóa MUTABLE: không phải nhị phân (manifest.json, json cấu hình…), đổi nội dung mỗi lần thêm asset nên được ghi đè; cache 60 s (xem `cacheControl`). Nhị phân thì luôn bất biến. */
export const isMutableKey = (key: string): boolean => !BINARY_EXT.test(key);

/** Phân loại từng khóa: chưa có → upload; có và khớp → bỏ qua; có nhưng khác kích thước/sha → XUNG ĐỘT (không bao giờ ghi đè). */
export async function planPush({ keys, lock, remote, remoteSha: shaOf }: PlanInput): Promise<PushPlan> {
  const plan: PushPlan = { todo: [], present: 0, conflicts: [], unverified: [], overwrites: [] };
  for (const key of keys) {
    const r = remote.get(key);
    const e = lock.files[key]!;
    if (!r) plan.todo.push(key);
    else if (isMutableKey(key)) {
      // manifest/json tên cố định: khớp (kích thước + sha) thì bỏ qua, lệch thì ghi đè (không phải xung đột)
      if (r.size === e.bytes && (await shaOf(key)) === e.sha256) plan.present++;
      else {
        plan.todo.push(key);
        plan.overwrites.push(key);
      }
    } else if (r.size !== e.bytes) plan.conflicts.push({ key, reason: `R2 có ${r.size} byte, sổ khóa ${e.bytes} byte` });
    // Tên cố định (không hash) cùng kích thước vẫn có thể khác nội dung: so sha256 lưu trong metadata.
    else if (!isHashedName(key)) {
      const sha = await shaOf(key);
      if (sha === undefined) {
        plan.unverified.push(key);
        plan.present++;
      } else if (sha !== e.sha256) plan.conflicts.push({ key, reason: 'cùng kích thước nhưng sha256 trên R2 khác sổ khóa' });
      else plan.present++;
    } else plan.present++;
  }
  return plan;
}

export async function push(opts: PushOptions = {}): Promise<PushReport> {
  const env = loadR2Env();
  const s3 = makeClient(env);
  const lock: Lock = await scanLock(readLock());
  const lockChanged = opts.noLock || opts.dry ? false : writeLock(lock);

  const keys = Object.keys(lock.files).filter((k) => !opts.only || k === opts.only || k.startsWith(opts.only));
  const remote = await listBucket(s3, env.bucket);
  const { todo, present, conflicts, unverified, overwrites } = await planPush({
    keys,
    lock,
    remote,
    remoteSha: (k) => remoteSha(s3, env.bucket, k),
  });
  if (unverified.length)
    console.warn(
      `[push] cảnh báo: ${unverified.length} khóa tên cố định cùng kích thước nhưng R2 không có metadata sha256, không kiểm được nội dung`,
    );

  const report: PushReport = { total: keys.length, present, uploaded: [], uploadedBytes: 0, failed: [], lockChanged, conflicts };
  if (overwrites.length) console.log(`[push] ghi đè ${overwrites.length} khóa json/văn bản tên cố định: ${overwrites.join(', ')}`);
  // R2 bất biến: có xung đột thì không upload gì cả (kể cả file không xung đột), để người chạy sửa rồi chạy lại.
  if (conflicts.length && !opts.dry) throw new PushConflictError(conflicts);
  if (opts.dry) {
    report.uploaded = todo;
    report.uploadedBytes = todo.reduce((n, k) => n + lock.files[k].bytes, 0);
    return report;
  }
  let done = 0;
  await pool(todo, 6, async (key) => {
    const e = lock.files[key];
    const file = localPath(key)!;
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: env.bucket,
          Key: key,
          Body: fs.createReadStream(file),
          ContentLength: e.bytes,
          ContentType: contentType(key),
          CacheControl: cacheControl(key),
          Metadata: { sha256: e.sha256 },
        }),
      );
      report.uploaded.push(key);
      report.uploadedBytes += e.bytes;
    } catch (err) {
      report.failed.push({ key, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    }
    done++;
    if (done % 25 === 0 || done === todo.length) console.log(`[push] ${done}/${todo.length}`);
  });
  return report;
}
