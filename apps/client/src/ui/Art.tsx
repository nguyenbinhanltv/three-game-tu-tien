import { useEffect, useState } from 'react';

/** Ảnh lớn nạp lười (chân dung, màn tải, chất liệu UI): chỉ tải khi chỗ dùng xuất hiện, không nằm trong tải đầu. */
type ArtManifest = { files: Record<string, Record<string, { file: string }>> };
const base = `${import.meta.env.BASE_URL}assets/art/`;
let manifest: Promise<ArtManifest | null> | undefined;
let resolved: ArtManifest | null | undefined;

function loadManifest() {
  return (manifest ??= fetch(`${base}art.json`)
    .then((r) => (r.ok ? (r.json() as Promise<ArtManifest>) : null))
    .catch(() => null)
    .then((m) => {
      resolved = m;
      return m;
    }));
}

/** Đường dẫn ảnh, hoặc null khi chưa có manifest / thiếu ảnh (chỗ dùng tự bỏ qua, không lỗi). */
export function artUrl(group: string, id: string): string | null {
  if (resolved === undefined) void loadManifest();
  const e = resolved?.files[group]?.[id];
  return e ? base + e.file : null;
}

export function useArtUrl(group: string, id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? artUrl(group, id) : null));
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let live = true;
    void loadManifest().then(() => live && setUrl(artUrl(group, id)));
    return () => {
      live = false;
    };
  }, [group, id]);
  return url;
}

/** Chân dung khung dọc 3:4 (NPC, boss, tinh anh). Thiếu ảnh thì không vẽ gì. Hiện dần khi ảnh tải xong. */
export function Portrait({ id, className }: { id: string | undefined; className?: string }) {
  const url = useArtUrl('portraits', id);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(false), [url]);
  if (!url) return null;
  return <img className={'portrait' + (className ? ' ' + className : '') + (ready ? ' ready' : '')} src={url} alt="" draggable={false} decoding="async" onLoad={() => setReady(true)} />;
}

/** Chờ manifest rồi trả đường dẫn ảnh (null nếu thiếu). Dùng ngoài React (màn tải, nền màn tiêu đề). */
export function loadArtUrl(group: string, id: string): Promise<string | null> {
  return loadManifest().then(() => artUrl(group, id));
}

/**
 * Chất liệu UI (nền giấy, hoa văn góc, triện, nền bản đồ): đặt thành biến CSS `--art-*` sau khi manifest về.
 * CSS dùng `var(--art-paper, none)`, thiếu ảnh thì giữ giao diện thuần CSS như cũ.
 */
export async function applyUiArt(): Promise<void> {
  const m = await loadManifest();
  if (!m?.files.ui) return;
  const style = document.documentElement.style;
  for (const [id, prop] of [['paper_tile', '--art-paper'], ['corner_ornament', '--art-corner'], ['seal_red', '--art-seal'], ['map_bg', '--art-map']] as const) {
    const e = m.files.ui[id];
    if (e) style.setProperty(prop, `url("${base}${e.file}")`);
  }
}
