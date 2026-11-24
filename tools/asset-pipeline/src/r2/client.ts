import { S3Client } from '@aws-sdk/client-s3';
import type { R2Env } from './env.js';
import { isHashedName } from './lock.js';

export function makeClient(env: R2Env): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
    forcePathStyle: true,
  });
}

const TYPES: Record<string, string> = {
  glb: 'model/gltf-binary',
  ktx2: 'image/ktx2',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  json: 'application/json',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  woff2: 'font/woff2',
  bin: 'application/octet-stream',
};

export function contentType(rel: string): string {
  return TYPES[rel.slice(rel.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';
}

/** Tên có hash → bất biến; tên cố định (manifest, ice_crack.ktx2…) chỉ cache ngắn để cập nhật nhanh. */
export function cacheControl(rel: string): string {
  return isHashedName(rel) ? 'public, max-age=31536000, immutable' : 'public, max-age=60, must-revalidate';
}
