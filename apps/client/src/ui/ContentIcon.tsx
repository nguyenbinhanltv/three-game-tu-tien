import { useEffect, useState } from 'react';

type IconDef = { icon: string; iconFallback?: string };
type Atlas = {
  file: string;
  columns: number;
  rows: number;
  icons: Record<string, { x: number; y: number }>;
};
const base = `${import.meta.env.BASE_URL}assets/ui/`;
let atlas: Promise<Atlas | null> | undefined;
// undefined = still loading; null = failed; Atlas = ready for synchronous mounts.
let resolved: Atlas | null | undefined;
function loadAtlas() {
  return atlas ??= (async () => {
    try {
      const response = await fetch(`${base}icons.json`);
      if (!response.ok) return null;
      const data = await response.json() as Atlas;
      if (!/^icons\.[a-f0-9]{10}\.webp$/.test(data.file) || !data.icons || data.columns < 2 || data.rows < 2) return null;
      const loaded = await new Promise<boolean>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = base + data.file;
      });
      return loaded ? data : null;
    } catch { return null; }
  })().then((loaded) => {
    resolved = loaded;
    return loaded;
  });
}

/**
 * Kiểu nền cho một ô atlas, dùng ngoài React (chỉ báo ngoài màn hình). Atlas chưa tải xong thì bắt đầu tải
 * và trả null (bên gọi dùng dấu dự phòng; lần chọn ứng viên sau sẽ có icon).
 */
export function contentIconStyle(icon: string): Record<string, string> | null {
  if (resolved === undefined) void loadAtlas();
  const cell = resolved?.icons[icon];
  if (!resolved || !cell) return null;
  return {
    backgroundImage: `url("${base}${resolved.file}")`,
    backgroundSize: `${resolved.columns * 100}% ${resolved.rows * 100}%`,
    backgroundPosition: `${cell.x / (resolved.columns - 1) * 100}% ${cell.y / (resolved.rows - 1) * 100}%`,
  };
}

/** Decorative icon: the parent control supplies its localized name. */
export function ContentIcon({ def, className }: { def?: IconDef; className?: string }) {
  const [sheet, setSheet] = useState<Atlas | null>(() => resolved ?? null);
  useEffect(() => {
    // Also cover a load that completed between this render and its effect.
    if (resolved !== undefined) {
      setSheet(resolved);
      return;
    }
    let active = true;
    loadAtlas().then((loaded) => { if (active) setSheet(loaded); });
    return () => { active = false; };
  }, []);
  const cell = def && sheet?.icons[def.icon];
  if (!sheet || !cell) {
    const fallback = def?.iconFallback ?? (def && !/^(itm|skl)_/.test(def.icon) ? def.icon : '\u2754');
    return <span className={'content-icon fallback' + (className ? ' ' + className : '')} aria-hidden="true">{fallback}</span>;
  }
  return <span className={'content-icon' + (className ? ' ' + className : '')} aria-hidden="true" style={{
    backgroundImage: `url("${base}${sheet.file}")`,
    backgroundSize: `${sheet.columns * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${cell.x / (sheet.columns - 1) * 100}% ${cell.y / (sheet.rows - 1) * 100}%`,
  }} />;
}

/** Icon giao diện (nút HUD, linh căn, vai trò, tiền…): tranh trong atlas, thiếu thì dùng ký hiệu dự phòng. */
export function UiIcon({ id, fallback, className }: { id: string; fallback: string; className?: string }) {
  return <ContentIcon def={{ icon: id, iconFallback: fallback }} className={className} />;
}
