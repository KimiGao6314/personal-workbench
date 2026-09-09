/**
 * 概览页「本周课表」缩略图（节次制）：
 * 一天 12 节纵向小格 × 7 天；按当前教学周只显示开课的课程，
 * 点课程块或头部按钮跳转完整课表。
 */
import { useStore } from '../../core/useStore'
import { useShell } from '../../core/shell'
import {
  DAY_LABELS,
  MAX_PERIOD,
  PALETTE,
  TIMETABLE_NS,
  activeInWeek,
  borderOf,
  countToday,
  currentWeekNum,
  migrateEntries,
  reconcileEntries,
  todayIndex,
  type TimetableState
} from '../timetable/model'

/** 迷你图里每节高度（px），由缩放档位决定 */
export default function MiniTimetable({ scale = 'md' }: { scale?: 'sm' | 'md' | 'lg' }): React.JSX.Element {
  const { ready, data, error } = useStore<TimetableState>(TIMETABLE_NS)
  const { navigate } = useShell()
  const raw = data
  const entries = raw ? reconcileEntries(migrateEntries(raw.entries)) : []
  const settings = raw?.settings ?? { weekStart: null }
  const week = currentWeekNum(settings.weekStart)
  const viewWeek = week !== null && week > 0 ? week : null
  const today = todayIndex()
  const todayCount = countToday(raw)
  const ROW = scale === 'sm' ? 11 : scale === 'lg' ? 16 : 13
  const totalPx = MAX_PERIOD * ROW
  const goFull = (): void => navigate('timetable')
  const showAll = viewWeek === null // 未设置开学周：无法过滤周次，全部显示

  return (
    <div className="mini-sched">
      {error && <div className="mini-sched-msg">课表数据读取失败</div>}
      {!ready && !error && <div className="mini-sched-msg">课表加载中…</div>}
      {ready && !error && entries.length === 0 && (
        <div className="mini-sched-msg">
          还没有课程
          <button
            className="btn btn-primary btn-sm mini-add-btn"
            onClick={(e) => {
              e.stopPropagation()
              goFull()
            }}
          >
            去添加 →
          </button>
        </div>
      )}

      {ready && !error && entries.length > 0 && (
        <>
          <div className="mini-head" style={{ gridTemplateColumns: `repeat(7, minmax(0, 1fr))` }}>
            {DAY_LABELS.map((label, i) => (
              <span key={label} className={`mini-day-name${i === today ? ' is-today' : ''}`}>
                {label.replace('周', '')}
              </span>
            ))}
          </div>

          <div className="mini-body" style={{ gridTemplateColumns: `repeat(7, minmax(0, 1fr))`, height: totalPx }}>
            {DAY_LABELS.map((_label, day) => (
              <div key={day} className={`mini-col${day === today ? ' is-today' : ''}`} style={{ height: totalPx }}>
                {Array.from({ length: MAX_PERIOD }, (_, i) => (
                  <span key={i} className="mini-row-line" style={{ top: i * ROW }} />
                ))}
                {entries
                  .filter((e) => e.day === day && (showAll || activeInWeek(e, viewWeek)))
                  .map((e) => {
                    const top = (e.p1 - 1) * ROW
                    const height = (e.p2 - e.p1 + 1) * ROW - 1
                    const palette = PALETTE[e.color % PALETTE.length]
                    return (
                      <span
                        key={e.id}
                        className="mini-block"
                        title={`第${e.p1}–${e.p2}节 ${e.title}${e.location ? ' · ' + e.location : ''}${e.teacher ? ' · ' + e.teacher : ''}`}
                        style={{
                          top,
                          height,
                          background: `${palette.hex}A6`,
                          borderLeftColor: palette.hex,
                          borderColor: borderOf(palette.hex)
                        }}
                      >
                        {height >= 15 && <span className="mini-block-text">{e.title}</span>}
                      </span>
                    )
                  })}
              </div>
            ))}
          </div>

          <div className="mini-foot">
            {week === null ? (
              <button className="link-btn" onClick={goFull}>未设置第1周日期 · 去设置 →</button>
            ) : (
              <>
                第 {Math.max(week, 1)} 周
                {week === 0 && '（未开学）'}
                {todayCount > 0 ? ` · 今天 ${todayCount} 节` : ' · 今天没课'}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
