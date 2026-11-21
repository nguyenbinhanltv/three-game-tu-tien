import { isQuality, type QUALITIES } from '../../base/quality';

type Quality = (typeof QUALITIES)[number];

/** Trần cạnh texture của một bản nạp model (`AcquireOptions.maxTexture`/`maxNormal`); Infinity = giữ nguyên tệp. */
export interface TexCap {
  maxTexture: number;
  maxNormal: number;
}

/**
 * Giới hạn số nhân vật v3 chi tiết cao (N-7). Model bậc cao (`player_v3_hi`) mang 3 texture 4096²: ~130 MB GPU mỗi model trên WebGPU
 * (normal map giải ra RGBA8 85 MB, màu + RM nén khối ~22 MB mỗi cái), model cơ bản 2048² ~33 MB. Đo 50 người mặc đủ 12 bộ × 2 giới ở sân
 * tông môn: 2,4 GB texture (ngân sách 512 MB), heap JS 3,3 GB. Nên chỉ nhân vật của mình giữ texture đầy đủ; model của người khác bị chặn
 * cạnh lúc nạp (bỏ các mức mip lớn, không tốn CPU lọc ảnh): vài model đầu tiên ở `others`, phần còn lại ở `crowd` (1024² = cỡ texture
 * nhân vật v1 cũ; normal thấp hơn một bậc vì RGBA8). Trần quyết định lúc nạp model; đổi preset có tác dụng từ lần vào room kế tiếp.
 */
export interface V3TexturePolicy {
  self: TexCap;
  /** Số model khác nhau của người khác được nạp ở cỡ `others`. */
  othersCount: number;
  others: TexCap;
  /** Mọi model còn lại. */
  crowd: TexCap;
}

const cap = (maxTexture: number, maxNormal = maxTexture): TexCap => ({ maxTexture, maxNormal });
const FULL = cap(Infinity);

const POLICY: Record<Quality, V3TexturePolicy> = {
  low: { self: cap(1024), othersCount: 0, others: cap(512), crowd: cap(512) },
  medium: { self: cap(2048), othersCount: 0, others: cap(1024, 512), crowd: cap(1024, 512) },
  high: { self: FULL, othersCount: 3, others: cap(2048, 1024), crowd: cap(1024, 512) },
  ultra: { self: FULL, othersCount: 3, others: cap(2048, 1024), crowd: cap(1024, 512) },
};

export function v3TexturePolicy(quality: string): V3TexturePolicy {
  return POLICY[isQuality(quality) ? quality : 'medium'];
}

/** Preset đồ họa đã lưu (`dtl.quality`, cùng khóa với `ui/store.ts`); không có `localStorage` (test node) hoặc giá trị lạ thì Vừa. */
export function storedQuality(): Quality {
  const v = typeof localStorage === 'undefined' ? null : localStorage.getItem('dtl.quality');
  return isQuality(v) ? v : 'medium';
}

/**
 * Cấp trần texture cho từng model v3 trong một room. Nhân vật mình luôn theo `self`; model của người khác: `othersCount` model đầu tiên
 * (theo thứ tự xuất hiện) ở `others`, còn lại `crowd`. Model người khác trùng với model mình đang dùng thì dùng chung bản của mình
 * (không nạp thêm bản thứ hai). Kết quả ổn định theo id: gọi lại cùng id trả cùng trần.
 */
export class V3TextureBudget {
  private selfIds = new Set<string>();
  private others = new Map<string, TexCap>();
  constructor(readonly policy: V3TexturePolicy) {}

  capOf(assetId: string, self: boolean): TexCap {
    if (self) {
      this.selfIds.add(assetId);
      return this.policy.self;
    }
    const cur = this.others.get(assetId);
    if (cur) return cur;
    if (this.selfIds.has(assetId)) return this.policy.self;
    const c = this.others.size < this.policy.othersCount ? this.policy.others : this.policy.crowd;
    this.others.set(assetId, c);
    return c;
  }
}
