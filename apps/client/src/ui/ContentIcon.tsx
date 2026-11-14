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
  })();
}

/** Decorative icon: the parent control supplies its localized name. */
export function ContentIcon({ def }: { def?: IconDef }) {
  const [sheet, setSheet] = useState<Atlas | null>(null);
  useEffect(() => {
    let active = true;
    loadAtlas().then((loaded) => { if (active) setSheet(loaded); });
    return () => { active = false; };
  }, []);
  const cell = def && sheet?.icons[def.icon];
  if (!sheet || !cell) {
    const fallback = def?.iconFallback ?? (def && !/^(itm|skl)_/.test(def.icon) ? def.icon : '\u2754');
    return <span className="content-icon fallback" aria-hidden="true">{fallback}</span>;
  }
  return <span className="content-icon" aria-hidden="true" style={{
    backgroundImage: `url("${base}${sheet.file}")`,
    backgroundSize: `${sheet.columns * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${cell.x / (sheet.columns - 1) * 100}% ${cell.y / (sheet.rows - 1) * 100}%`,
  }} />;
}
