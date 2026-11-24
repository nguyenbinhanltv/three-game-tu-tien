// Đẩy asset lên R2: dựng lại sổ khóa từ đĩa, so với bucket, chỉ upload file thiếu hoặc lệch.
//   pnpm assets:push [--dry] [--only <đường dẫn hoặc tiền tố>] [--no-lock]
// Khóa R2 đọc từ biến môi trường / .env.local (xem r2/env.ts), không bao giờ được in ra.

import fs from 'node:fs';
import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { cacheControl, contentType, makeClient } from './r2/client.js';
import { loadR2Env } from './r2/env.js';
import { isHashedName, localPath, type Lock, pool, readLock, scanLock, writeLock } from './r2/lock.js';

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

export async function push(opts: PushOptions = {}): Promise<PushReport> {
  const env = loadR2Env();
  const s3 = makeClient(env);
  const lock: Lock = await scanLock(readLock());
  const lockChanged = opts.noLock || opts.dry ? false : writeLock(lock);

  const keys = Object.keys(lock.files).filter((k) => !opts.only || k === opts.only || k.startsWith(opts.only));
  const remote = await listBucket(s3, env.bucket);
  const todo: string[] = [];
  let present = 0;
  for (const key of keys) {
    const r = remote.get(key);
    const e = lock.files[key];
    if (!r || r.size !== e.bytes) todo.push(key);
    // Tên cố định (không hash) cùng kích thước vẫn có thể khác nội dung: so sha256 lưu trong metadata.
    else if (!isHashedName(key) && (await remoteSha(s3, env.bucket, key)) !== e.sha256) todo.push(key);
    else present++;
  }

  const report: PushReport = { total: keys.length, present, uploaded: [], uploadedBytes: 0, failed: [], lockChanged };
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
