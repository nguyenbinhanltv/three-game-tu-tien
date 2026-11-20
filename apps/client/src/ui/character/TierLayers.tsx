import { useEffect, useRef, type CSSProperties } from 'react';
import { realmName } from '@dtl/content';
import { useUI } from '../store';
import { brushColumns, renderBrushName } from './brushName';
import type { PortraitPick } from './portraitPick';

/** Đường dẫn ảnh tranh/lớp (nạp lười khi mở bảng, không nằm trong tải đầu). */
export const tierUrl = (name: string): string => `${import.meta.env.BASE_URL}hoa-truc/${name}.webp`;
const url = tierUrl;

/** Vân phù: các nét "chữ" tự tạo (xác định theo seed, KHÔNG phải chữ Hán thật) xếp quanh một vành elip. */
function glyphPath(seed: number): string {
  let s = seed * 9301 + 49297;
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const segs: string[] = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x1 = 2 + r() * 8;
    const y1 = 2 + r() * 12;
    const x2 = 2 + r() * 8;
    const y2 = 2 + r() * 12;
    segs.push(
      r() < 0.5
        ? `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`
        : `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${((x1 + x2) / 2 + 3).toFixed(1)} ${((y1 + y2) / 2 - 3).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    );
  }
  return segs.join('');
}
const GLYPHS = Array.from({ length: 18 }, (_, i) => glyphPath(i + 3));

/** Dải vân phù vàng lượn quanh người (Kết Đan trở lên): hai vòng elip xoay ngược nhau, mỗi vòng 9 nét vân sáng. */
function VanPhu() {
  return (
    <div className="hoatruc-van" aria-hidden="true">
      {[0, 1].map((k) => (
        <div key={k} className="hoatruc-van-ring" data-k={k}>
          {GLYPHS.slice(k * 9, k * 9 + 9).map((d, i) => (
            <svg key={i} viewBox="0 0 12 16" className="hoatruc-van-glyph" style={{ '--a': i * 40 + 'deg' } as CSSProperties}>
              <path d={d} />
            </svg>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Lớp SAU nhân vật theo cảnh giới (hướng A: nhân vật vẫn là tranh theo bộ trang phục, cảnh giới chỉ CHỒNG hiệu ứng, mỗi tầng một màu chủ đạo). */
export function TierBack({ pick }: { pick: PortraitPick }) {
  const t = pick.tier;
  if (t < 2) return null;
  const dao = pick.dao;
  return (
    <>
      {t >= 4 && (
        <>
          <div className="hoatruc-thienmon">
            <img src={url('thien_mon')} alt="" draggable={false} />
          </div>
          <div className="hoatruc-set">
            <img src={url('set_tim_vang')} alt="" draggable={false} />
          </div>
          <div className="hoatruc-phanthan">
            {Array.from({ length: 5 }, (_, i) => (
              <img key={i} src={url(pick.char)} alt="" draggable={false} style={{ '--a': i * 72 + 'deg' } as CSSProperties} />
            ))}
          </div>
        </>
      )}
      {t === 3 && dao && (
        <div className="hoatruc-phaptuong" data-dao={dao}>
          <img
            src={url('phap_tuong_' + (dao === 'kiem' ? 'kiem_long' : dao === 'ho_phap' ? 'huyen_vu' : 'chu_tuoc'))}
            alt=""
            draggable={false}
          />
        </div>
      )}
      {t === 2 && (
        <>
          <div className="hoatruc-nguhanh">
            <img src={url('ngu_hanh')} alt="" draggable={false} />
          </div>
          <div className="hoatruc-daisen">
            <img src={url('dai_sen_may')} alt="" draggable={false} />
          </div>
          {dao === 'kiem' && (
            <div className="hoatruc-ring">
              {Array.from({ length: 9 }, (_, i) => (
                <i key={i} className="hoatruc-pk" style={{ '--a': i * 40 + 'deg' } as CSSProperties} />
              ))}
            </div>
          )}
          {dao === 'ho_phap' && (
            <div className="hoatruc-tran">
              {Array.from({ length: 6 }, (_, i) => (
                <i key={i} className="hoatruc-da" style={{ '--a': i * 60 + 'deg' } as CSSProperties} />
              ))}
              <i className="hoatruc-giap" />
            </div>
          )}
          {dao === 'dan_su' && (
            <div className="hoatruc-senlua">
              <img src={url('sen_lua')} alt="" draggable={false} />
            </div>
          )}
        </>
      )}
      {t === 2 && (
        <div className="hoatruc-na">
          <img src={url('nguyen_anh')} alt="" draggable={false} />
        </div>
      )}
    </>
  );
}

/** Lớp TRƯỚC nhân vật: kim đan + vân phù (từ Kết Đan), linh vực (Hóa Thần), tên thư pháp (Hóa Thần trở lên; Dị Biến to và rực nhất). */
export function TierFront({ pick }: { pick: PortraitPick }) {
  return (
    <>
      {pick.tier >= 1 && <div className="hoatruc-dan" />}
      {pick.tier >= 1 && <VanPhu />}
      {pick.tier >= 3 && (
        <div className="hoatruc-linhvuc">
          <img src={url('cau_linh_vuc')} alt="" draggable={false} />
        </div>
      )}
      {pick.tier >= 3 && <NameScroll big={pick.tier >= 4} />}
    </>
  );
}

/** Tên thư pháp dọc theo đạo hiệu của chính người chơi (nét cọ vẽ bằng canvas, brushName.ts) + dấu triện cảnh giới nhỏ dưới cột tên. */
function NameScroll({ big }: { big: boolean }) {
  const char = useUI((s) => s.char);
  const name = char?.name ?? '';
  const host = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = host.current;
    const out = cv.current;
    if (!name || !el || !out) return;
    let live = true;
    const family = getComputedStyle(el).fontFamily;
    void (document.fonts?.load(`700 64px ${family}`) ?? Promise.resolve()).then(() => {
      if (!live) return;
      const cs = getComputedStyle(el);
      // màu nét = `color`, màu quầng loang = `text-decoration-color` (đều từ token trong hoatruc.css)
      const src = renderBrushName(name, big ? 'gold' : 'ink', family, { main: cs.color, halo: cs.textDecorationColor });
      out.width = src.width;
      out.height = src.height;
      out.getContext('2d')?.drawImage(src, 0, 0);
    });
    return () => {
      live = false;
    };
  }, [name, big]);
  if (!char) return null;
  const cols = brushColumns(name);
  const rows = Math.max(...cols.map((c) => c.length), 1);
  return (
    <div
      ref={host}
      className="hoatruc-name"
      data-big={big ? '1' : undefined}
      data-cols={cols.length}
      style={{ '--rows': rows } as CSSProperties}
    >
      <canvas ref={cv} className="hoatruc-name-c" role="img" aria-label={name} />
      <span className="hoatruc-name-seal">{realmName(char.level)}</span>
    </div>
  );
}
