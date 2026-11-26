// Thay `./colliders` trong bundle client (B7, apps/client/vite.config.ts): không nạp JSON collider lúc khởi động; dùng `ensureColliders` (colliders.lazy.ts).
import type { LocalShape, Shape } from '@dtl/shared';

export const COLLIDER_LIB: Record<string, LocalShape[]> = {};
export const INST_BY_LEVEL: Record<string, { ids: string[]; p: number[][] }> = {};
export const propShapesOf = (_level: string, _lib?: Record<string, LocalShape[]>): Shape[] => [];
