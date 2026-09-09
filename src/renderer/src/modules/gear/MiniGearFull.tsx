/**
 * 概览页「设备台账」总览卡片：按状态统计 + 最近设备列表，点条目进完整台账。
 */
import { useMemo } from 'react'
import { useStore } from '../../core/useStore'
import { useShell } from '../../core/shell'
import { GEAR_NS, GEAR_STATUS, gearTitle, type GearState } from './model'

export default function MiniGearFull(): React.JSX.Element {
  const { ready, data, error } = useStore<GearState>(GEAR_NS)
  const { navigate } = useShell()
  const items = data?.items ?? []

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of GEAR_STATUS) c[s.key] = 0
    for (const g of items) c[g.status] = (c[g.status] ?? 0) + 1
    return c
  }, [items])

  const shown = [...items].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6)

  return (
    <div className="ov-card">
      <div className="ov-card-main">
        {error && <div className="ov-empty">设备数据读取失败</div>}
        {!ready && !error && <div className="ov-empty">加载中…</div>}
        {ready && !error && (
          <>
            <div className="gear-mini-counts">
              {GEAR_STATUS.map((s) => (
                <span key={s.key} className="gear-mini-pill">
                  {s.label} {counts[s.key]}
                </span>
              ))}
            </div>
            {items.length === 0 && <div className="ov-empty">还没有设备记录 🎙️</div>}
            {shown.map((g) => (
              <div key={g.id} className="ov-li" onClick={() => navigate('gear')} title="打开设备台账">
                <div className="ov-li-top">
                  <span className="ov-li-title">{gearTitle(g)}</span>
                  <span className="tag tag-course">{g.category}</span>
                </div>
              </div>
            ))}
            {items.length > 6 && (
              <div className="ov-more">
                还有 {items.length - 6} 件 ·
                <button className="link-btn" onClick={() => navigate('gear')}>
                  去台账
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
