// Phần hiển thị thuần của tab Thiên Lộ (TN-7), tách khỏi `Kieu.tsx` để không kéo engine/store khi nạp (test nhanh).
// Tab Thiên Lộ ở Dẫn Kiều Nhân (TN-7): xin vào cầu Cửu Kiều kế tiếp (`C.KIEU`), chọn MỘT nguồn Cực nguyên sau chín cầu (`C.DAP`), xem Bảng Thiên Lộ (`C.KIEU_BOARD`).
// Client chỉ hiển thị `CharView` (`kieu`, `dap`, `level`) và gửi ý định; điều kiện (cấp, thứ tự, đứng cạnh NPC, vé một lần, chờ cấp lại) do server phán.
import { C, type CharView, DAP_BONUS, DAP_IDS, KIEU_COUNT, type KieuBoardMsg, kieuMinLevel } from '@dtl/shared';
import { t } from '@dtl/content';
import { Button, Divider } from './u2/win';

/** Phần thưởng của một nguồn Cực nguyên, dạng chữ ("+9% công, +3% thủ"). */
export function dapSummary(id: (typeof DAP_IDS)[number]): string {
  const b = DAP_BONUS[id];
  const parts: string[] = [];
  if (b.hp) parts.push(t('ui.kieu.stat.hp', { n: Math.round(b.hp * 100) }));
  if (b.mp) parts.push(t('ui.kieu.stat.mp', { n: Math.round(b.mp * 100) }));
  if (b.atk) parts.push(t('ui.kieu.stat.atk', { n: Math.round(b.atk * 100) }));
  if (b.def) parts.push(t('ui.kieu.stat.def', { n: Math.round(b.def * 100) }));
  return parts.join(', ');
}

/** Phần hiển thị (thuần, nhận dữ liệu và hàm gửi qua props để test được): `KieuTab` nối nó với store và `Game`. */
export function KieuView({
  char,
  board,
  send,
  onCredits,
}: {
  char: Pick<CharView, 'kieu' | 'dap' | 'level'>;
  board: KieuBoardMsg | null;
  send: (type: string, msg?: unknown) => void;
  /** Mở bảng ghi công (lời cảm ơn sau khi Đạp Thiên). */
  onCredits?: () => void;
}) {
  const done = Math.min(KIEU_COUNT, Math.max(0, char.kieu));
  const next = done + 1;
  const all = done >= KIEU_COUNT;
  const lowLevel = !all && char.level < kieuMinLevel(next);
  return (
    <div className="shop-list" data-testid="kieu-tab">
      <Divider label={t('ui.kieu.title')} />
      <div className="k-dim">{t('ui.kieu.progress', { n: done, max: KIEU_COUNT })}</div>
      {all ? (
        <>
          <div className="item-name">{t('ui.kieu.title_dap')}</div>
          <div className="k-dim" data-testid="kieu-epilogue">
            {t('ui.kieu.epilogue')}
          </div>
          {onCredits && <Button onClick={onCredits}>{t('ui.kieu.credits_open')}</Button>}
        </>
      ) : (
        <div className="k-card shop-row" data-kieu-next={next}>
          <div className="shop-info">
            <div className="item-name">{t(`dungeon.kieu_${next}.name`)}</div>
            <div className="k-dim">{lowLevel ? t('ui.kieu.low', { realm: t(`realm.${kieuMinLevel(next)}`) }) : t('ui.kieu.next_desc')}</div>
          </div>
          <Button variant="primary" disabled={lowLevel} onClick={() => send(C.KIEU, { n: next })}>
            {t('ui.kieu.enter')}
          </Button>
        </div>
      )}
      {all && (
        <>
          <Divider label={t('ui.kieu.dap_title')} />
          <div className="k-dim">{t(char.dap ? 'ui.kieu.dap_chosen' : 'ui.kieu.dap_desc')}</div>
          {DAP_IDS.map((id) => (
            <div key={id} className="k-card shop-row" data-dap={id}>
              <div className="shop-info">
                <div className="item-name">{t(`origin.${id}.name`)}</div>
                <div className="k-dim">{t(`origin.${id}.desc`)}</div>
                <div className="k-dim">{dapSummary(id)}</div>
              </div>
              <Button variant="primary" disabled={!!char.dap} onClick={() => send(C.DAP, { id })}>
                {char.dap === id ? t('ui.kieu.dap_current') : t('ui.kieu.dap_pick')}
              </Button>
            </div>
          ))}
        </>
      )}
      <Divider label={t('ui.kieu.board_title')} />
      {!board ? (
        <div className="k-dim">{t('ui.kieu.board_loading')}</div>
      ) : board.rows.length === 0 ? (
        <div className="k-dim">{t('ui.kieu.board_empty')}</div>
      ) : (
        <ol className="kieu-board" data-testid="kieu-board">
          {board.rows.map((r, i) => (
            <li key={`${r.name}-${i}`} data-name={r.name}>
              <span className="item-name">{r.name}</span> <span className="k-dim">{new Date(r.ts).toLocaleDateString('vi-VN')}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="k-dim">{t('ui.kieu.board_total', { n: board?.total ?? 0 })}</div>
    </div>
  );
}
