/**
 * 概览页「正处于外借的器材」：来自设备台账中 status = 外借 的条目。
 */
import { useMemo } from 'react'
import { useStore } from '../../core/useStore'
import { useShell } from '../../core/shell'
import { GEAR_NS, gearTitle, type GearState } from './model'
import {
  GEAR_HISTORY_NS,
  closeRecordForGear,
  type HistoryState
} from './historyModel'

export default function MiniGear(): React.JSX.Element {
  const { ready, data, error, save } = useStore<GearState>(GEAR_NS)
  const { save: hsave } = useStore<HistoryState>(GEAR_HISTORY_NS)
  const { navigate } = useShell()

  const lent = useMemo(
    () =>
      (data?.items ?? [])
        .filter((g) => g.status === 'lent')
        .sort((a, b) => b.createdAt - a.createdAt),
    [data]
  )
  const shown = lent.slice(0, 5)

  const returned = (id: string): void => {
    const now = Date.now()
    save((prev) => ({
      items: prev.items.map((g) =>
        g.id === id ? { ...g, status: 'idle', note: undefined } : g
      )
    }))
    hsave((prev) => ({ records: closeRecordForGear(prev.records, id, now) }))
  }

  return (
    <div className="ov-card">
      <div className="ov-card-main">
        {error && <div className="ov-empty">设备数据读取失败</div>}
        {!ready && !error && <div className="ov-empty">加载中…</div>}
        {ready && !error && lent.length === 0 && (
          <div className="ov-empty">没有外借中的器材 🎧</div>
        )}
        {ready &&
          !error &&
          shown.map((g) => (
            <div
              key={g.id}
              className="ov-li"
              onClick={() => navigate('gear')}
              title="打开设备台账"
            >
              <div className="ov-li-top">
                <span className="ov-li-title">{gearTitle(g)}</span>
                <span className="tag tag-course">{g.category}</span>
                <button
                  className="ov-act"
                  onClick={(e) => {
                    e.stopPropagation()
                    returned(g.id)
                  }}
                >
                  已归还
                </button>
              </div>
              {g.note && <div className="ov-li-sub">{g.note}</div>}
            </div>
          ))}
        {lent.length > 5 && (
          <div className="ov-more">
            还有 {lent.length - 5} 件 ·
            <button className="link-btn" onClick={() => navigate('gear')}>
              去台账
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
