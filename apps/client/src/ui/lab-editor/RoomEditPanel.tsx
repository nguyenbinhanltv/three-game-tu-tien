// Bảng "Chỉnh phòng" của Diễn Võ Trường (V3): bật chế độ kéo thả, thêm / xoay / phóng / xóa đạo cụ, đèn và điểm gọi quái, lưu vào file
// bố cục, và nhật ký dữ liệu vừa nạp lại tức thì. Dùng lớp CSS của bảng F3 (`debug-row`) nên nhúng thẳng được vào tab Diễn Võ; khi chưa
// nhúng thì mở bằng F4 (`mount.tsx`). Chỉ có ở bản dev.
import { useMemo, useState, useSyncExternalStore } from 'react';
import { t } from '@dtl/content';
import { DIEN_VO_PROPS, HAND_PROPS, PROP_LIB } from '@dtl/shared';
import { labAuto, roomEditor, zoneOverlay } from '../../game/editor/boot';
import { hotEntries, onHotData } from '../../game/editor/hotData';
import type { RoomEditState } from '../../game/editor/roomEdit';
import { Button } from '../u2/win';

const LAMP = 'prop_den_da';
const OFF: RoomEditState = {
  on: false,
  dirty: false,
  saving: false,
  sel: null,
  selInfo: null,
  props: 0,
  lamps: 0,
  spawns: { arena: 0, boss: 0 },
  undo: 0,
  msg: null,
};
const noop = () => () => {};
const hhmmss = (ms: number) => new Date(ms).toTimeString().slice(0, 8);

/**
 * Nút bật/tắt lớp vẽ VÙNG TRÚNG THẬT (viền mảnh trên sàn: đòn vùng của quái/boss đúng hình server phán định, chiêu vùng và đòn quét của
 * người chơi). Component riêng để tab Diễn Võ gắn vào nhóm Cân bằng / sân boss.
 */
export function ZoneOverlayToggle() {
  const z = zoneOverlay();
  const on = useSyncExternalStore(z?.subscribe ?? noop, z?.isOn ?? (() => false));
  return (
    <Button size="s" pressed={on} disabled={!z} data-act="zones" title={t('ui.gm.lab.zones.hint')} onClick={() => z?.toggle()}>
      {t('ui.gm.lab.zones.toggle')}
    </Button>
  );
}

export function RoomEditPanel() {
  const ed = roomEditor();
  const st = useSyncExternalStore(ed?.subscribe ?? noop, ed?.state ?? (() => OFF));
  const hot = useSyncExternalStore(onHotData, hotEntries);
  const [propId, setPropId] = useState('prop_da_dung');
  const [replay, setReplay] = useState(labAuto.fxReplay);
  // Danh sách chọn: món đang có trong phòng trước, rồi tới prop đặt tay của các bản đồ và thư viện prop.
  const ids = useMemo(() => [...new Set([...DIEN_VO_PROPS, ...HAND_PROPS, ...PROP_LIB].map((p) => p.id))].filter((id) => id !== LAMP), []);
  const sel = st.selInfo;
  return (
    <div className="lab-edit" data-on={st.on ? '1' : '0'} data-dirty={st.dirty ? '1' : '0'}>
      <div className="debug-row wrap">
        <Button size="s" variant="primary" pressed={st.on} disabled={!ed} data-act="toggle" onClick={() => ed?.toggle()}>
          {st.on ? t('ui.gm.lab.edit.off') : t('ui.gm.lab.edit.on')}
        </Button>
        <span className="lab-edit-count">
          {t('ui.gm.lab.edit.count', { props: st.props, lamps: st.lamps, arena: st.spawns.arena, boss: st.spawns.boss })}
        </span>
      </div>
      {st.on && (
        <>
          <div className="debug-row wrap">
            <select value={propId} onChange={(e) => setPropId(e.target.value)} data-act="propId">
              {ids.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <Button size="s" data-act="addProp" onClick={() => ed?.addProp(propId)}>
              {t('ui.gm.lab.edit.addProp')}
            </Button>
            <Button size="s" data-act="addLamp" onClick={() => ed?.addProp(LAMP)}>
              {t('ui.gm.lab.edit.addLamp')}
            </Button>
          </div>
          <div className="debug-row wrap">
            <Button size="s" data-act="addArena" onClick={() => ed?.addSpawn('arena')}>
              {t('ui.gm.lab.edit.addSpawn', { zone: t('dienvo.zone.arena') })}
            </Button>
            <Button size="s" data-act="addBoss" onClick={() => ed?.addSpawn('boss')}>
              {t('ui.gm.lab.edit.addSpawn', { zone: t('dienvo.zone.boss') })}
            </Button>
          </div>
          <div className="debug-row wrap lab-edit-sel">
            {sel && st.sel?.kind === 'prop' && (
              <span>{t('ui.gm.lab.edit.sel', { id: sel.id, x: sel.x, z: sel.z, yaw: sel.yawDeg, s: sel.s })}</span>
            )}
            {sel && st.sel?.kind === 'spawn' && (
              <span>{t('ui.gm.lab.edit.selSpawn', { n: st.sel.i + 1, zone: t('dienvo.zone.' + st.sel.zone), x: sel.x, z: sel.z })}</span>
            )}
            {!sel && <span>{t('ui.gm.lab.edit.none')}</span>}
          </div>
          {sel && (
            <div className="debug-row wrap">
              {st.sel?.kind === 'prop' && (
                <>
                  <Button size="s" data-act="rotL" onClick={() => ed?.rotateSel(-1)}>
                    {t('ui.gm.lab.edit.rotL')}
                  </Button>
                  <Button size="s" data-act="rotR" onClick={() => ed?.rotateSel(1)}>
                    {t('ui.gm.lab.edit.rotR')}
                  </Button>
                  <Button size="s" data-act="smaller" onClick={() => ed?.scaleSel(1 / 1.1)}>
                    {t('ui.gm.lab.edit.smaller')}
                  </Button>
                  <Button size="s" data-act="bigger" onClick={() => ed?.scaleSel(1.1)}>
                    {t('ui.gm.lab.edit.bigger')}
                  </Button>
                  <Button size="s" pressed={sel.r > 0} data-act="collide" onClick={() => ed?.toggleCollideSel()}>
                    {sel.r > 0 ? t('ui.gm.lab.edit.collideOn', { r: sel.r }) : t('ui.gm.lab.edit.collideOff')}
                  </Button>
                </>
              )}
              <Button size="s" variant="danger" data-act="del" onClick={() => ed?.removeSel()}>
                {t('ui.gm.lab.edit.del')}
              </Button>
            </div>
          )}
          <div className="debug-row wrap">
            <Button size="s" disabled={!st.undo} data-act="undo" onClick={() => ed?.undo()}>
              {t('ui.gm.lab.edit.undo', { n: st.undo })}
            </Button>
            <Button size="s" variant="primary" disabled={!st.dirty || st.saving} data-act="save" onClick={() => void ed?.save()}>
              {t('ui.gm.lab.edit.save')}
            </Button>
            <Button size="s" disabled={!st.dirty || st.saving} data-act="revert" onClick={() => void ed?.revert()}>
              {t('ui.gm.lab.edit.revert')}
            </Button>
            <span className="lab-edit-dirty">{st.dirty ? t('ui.gm.lab.edit.dirty') : t('ui.gm.lab.edit.clean')}</span>
          </div>
          <div className="debug-row wrap lab-edit-hint">
            <span>{t('ui.gm.lab.edit.hintSpawn')}</span>
          </div>
        </>
      )}
      {st.msg && (
        <div className="debug-row wrap lab-edit-msg" data-msg={st.msg.key}>
          <span>{t(st.msg.key, st.msg.p)}</span>
        </div>
      )}
      <div className="debug-row wrap">
        <ZoneOverlayToggle />
        <span className="lab-edit-hint">{t('ui.gm.lab.zones.hint')}</span>
      </div>
      <div className="debug-row wrap">
        <span>{t('ui.gm.lab.edit.hotTitle')}</span>
        <Button
          size="s"
          pressed={replay}
          data-act="replay"
          onClick={() => {
            labAuto.fxReplay = !replay;
            setReplay(!replay);
          }}
        >
          {t('ui.gm.lab.edit.hotReplay')}
        </Button>
      </div>
      <div className="lab-edit-hot">
        {hot.length === 0 && <div>{t('ui.gm.lab.edit.hotNone')}</div>}
        {hot.slice(0, 5).map((e) => (
          <div key={e.at + e.path} data-ok={e.ok ? '1' : '0'}>
            {hhmmss(e.at)} {e.ok ? '✓' : '✗'} {e.path.split('/').pop()}
            {e.note ? ` · ${e.note}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
