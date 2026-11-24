import { useEffect, useState } from 'react';
import { isSysIcon, SysIcon } from './u2/shell/icons';
import { SysGlyph, isSysGlyph } from './u2/SysGlyph';
import { SetMark, emblemOf } from './u2/SetMark';
import { ASSET_BASE, ASSET_CROSS_ORIGIN } from '../base/assetBase';

/** `set` (id bộ trang bị, có ở `ItemDef`) thêm dấu ấn bộ ở góc dưới trái. */
type IconDef = { icon: string; iconFallback?: string; set?: string };
type Sheet = { file: string; columns: number; rows: number };
type Atlas = {
  sheets: Record<string, Sheet>;
  icons: Record<string, { s: string; x: number; y: number }>;
};
const base = `${ASSET_BASE}assets/ui/`;
let atlas: Promise<Atlas | null> | undefined;
// undefined = đang tải; null = lỗi; Atlas = đã có manifest.
let resolved: Atlas | null | undefined;
// Bảng ảnh đã tải xong. `hud` nạp ngay sau manifest, `items` nạp lười khi có ô vật phẩm đầu tiên cần vẽ (T7).
const ready = new Set<string>();
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const EAGER = ['hud'];

function loadSheet(data: Atlas, name: string): Promise<void> {
  let p = loading.get(name);
  if (!p) {
    const sheet = data.sheets[name];
    p = new Promise<void>((resolve) => {
      if (!sheet || !/^icons-[a-z]+\.[a-f0-9]{10}\.webp$/.test(sheet.file)) return resolve();
      const image = new Image();
      image.crossOrigin = ASSET_CROSS_ORIGIN ?? null;
      image.onload = () => {
        ready.add(name);
        resolve();
      };
      image.onerror = () => resolve();
      image.src = base + sheet.file;
    }).then(() => listeners.forEach((fn) => fn()));
    loading.set(name, p);
  }
  return p;
}

function loadAtlas() {
  return (atlas ??= (async () => {
    try {
      const response = await fetch(`${base}icons.json`);
      if (!response.ok) return null;
      const data = (await response.json()) as Atlas;
      if (!data.icons || !data.sheets) return null;
      await Promise.all(EAGER.map((name) => loadSheet(data, name)));
      return data;
    } catch {
      return null;
    }
  })().then((loaded) => {
    resolved = loaded;
    return loaded;
  }));
}

/** Ô icon sẵn sàng vẽ (bảng của nó đã tải); chưa thì bắt đầu tải bảng và trả null để bên gọi dùng ký hiệu dự phòng. */
function cellOf(icon: string) {
  const data = resolved;
  const cell = data?.icons[icon];
  if (!data || !cell) return null;
  if (!ready.has(cell.s)) {
    void loadSheet(data, cell.s);
    return null;
  }
  const sheet = data.sheets[cell.s];
  return sheet ? { cell, sheet } : null;
}

function styleOf(c: NonNullable<ReturnType<typeof cellOf>>): Record<string, string> {
  const { cell, sheet } = c;
  return {
    backgroundImage: `url("${base}${sheet.file}")`,
    backgroundSize: `${sheet.columns * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${(cell.x / (sheet.columns - 1)) * 100}% ${(cell.y / (sheet.rows - 1)) * 100}%`,
  };
}

/**
 * Kiểu nền cho một ô atlas, dùng ngoài React (chỉ báo ngoài màn hình). Atlas chưa tải xong thì bắt đầu tải
 * và trả null (bên gọi dùng dấu dự phòng; lần chọn ứng viên sau sẽ có icon).
 */
export function contentIconStyle(icon: string): Record<string, string> | null {
  if (resolved === undefined) void loadAtlas();
  const c = cellOf(icon);
  return c ? styleOf(c) : null;
}

/** Decorative icon: the parent control supplies its localized name. */
export function ContentIcon({ def, className }: { def?: IconDef; className?: string }) {
  const [, bump] = useState(0);
  useEffect(() => {
    let active = true;
    const fn = () => active && bump((n) => n + 1);
    listeners.add(fn);
    if (resolved === undefined) void loadAtlas().then(fn);
    return () => {
      active = false;
      listeners.delete(fn);
    };
  }, []);
  const c = def ? cellOf(def.icon) : null;
  if (!c) {
    const fallback = def?.iconFallback ?? (def && !/^(itm_|skl_)/.test(def.icon) ? def.icon : '❔');
    // 'sys:<tên>' = icon hệ thống nét vàng (UI-1) thay emoji, ví dụ trang sức đầu 'sys:head'.
    const sys = fallback.startsWith('sys:') ? fallback.slice(4) : '';
    if (isSysIcon(sys))
      return (
        <span className={'content-icon fallback sys' + (className ? ' ' + className : '')} aria-hidden="true">
          <SysIcon name={sys} size={28} />
        </span>
      );
    return (
      <span className={'content-icon fallback' + (className ? ' ' + className : '')} aria-hidden="true">
        {fallback}
      </span>
    );
  }
  const mark = def?.set && emblemOf(def.set) ? <SetMark set={def.set} /> : null;
  // Có dấu ấn bộ: tranh nằm trong span con riêng (mặt nạ tròn chỉ áp lên tranh), huy hiệu là anh em của tranh nên không bị che.
  if (mark)
    return (
      <span className={'content-icon has-set' + (className ? ' ' + className : '')}>
        <span className="content-icon__img" style={styleOf(c)} aria-hidden="true" />
        {mark}
      </span>
    );
  return <span className={'content-icon' + (className ? ' ' + className : '')} aria-hidden="true" style={styleOf(c)} />;
}

/** Icon giao diện (nút HUD, linh căn, vai trò, tiền…): tranh trong atlas, thiếu thì dùng ký hiệu dự phòng. */
export function UiIcon({ id, fallback, className }: { id: string; fallback: string; className?: string }) {
  // Icon hệ thống nét vàng (SVG, U2-I) thay tranh/emoji khi có.
  if (isSysGlyph(id)) return <SysGlyph id={id} className={className} />;
  return <ContentIcon def={{ icon: id, iconFallback: fallback }} className={className} />;
}
