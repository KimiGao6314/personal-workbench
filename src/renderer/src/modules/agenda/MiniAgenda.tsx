/**
 * 概览页「日程」缩略图：把“接下来要发生”的日程（含重复规则展开）列成列表，
 * 点条目跳到完整日程模块。
 */
import { useMemo } from 'react'
import { useStore } from '../../core/useStore'
import { useShell } from '../../core/shell'
import {
  AGENDA_NS,
  nextOccurrenceDates,
  repeatLabel,
  todayISO,
  type AgendaItem,
  type AgendaState
} from './model'

function dateLabel(isoStr: string): string {
  const today = todayISO()
  if (isoStr === today) return '今天'
  const d = new Date(isoStr + 'T00:00:00')
  const t = new Date(today + 'T00:00:00')
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  if (diff === 1) return '明天'
  if (diff === 2) return '后天'
  const now = new Date()
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return '今天'
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export default function MiniAgenda(): React.JSX.Element {
  const { ready, data, error } = useStore<AgendaState>(AGENDA_NS)
  const { navigate } = useShell()

  const upcoming = useMemo(() => {
    const from = todayISO()
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    const items = data?.items ?? []
    const flat: { it: AgendaItem; date: string; passed: boolean }[] = []
    for (const it of items) {
      const ds = nextOccurrenceDates(it, from, 8)
      for (const date of ds) {
        const minutes = date === from && it.start ? Number(it.start.slice(0, 2)) * 60 + Number(it.start.slice(3, 5)) : -1
        flat.push({ it, date, passed: date === from && it.start ? minutes < nowMin : false })
      }
    }
    return flat
      .filter((x) => !x.passed)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.it.start ?? '').localeCompare(b.it.start ?? ''))
      .slice(0, 6)
  }, [data])

  return (
    <div className="ov-card">
      <div className="ov-card-main">
        {error && <div className="ov-empty">日程读取失败</div>}
        {!ready && !error && <div className="ov-empty">加载中…</div>}
        {ready && !error && upcoming.length === 0 && (
          <div className="ov-empty">接下来没有日程安排 🎈</div>
        )}
        {upcoming.map(({ it, date }) => {
          const repeat = it.repeat && it.repeat.kind !== 'none' ? repeatLabel(it.repeat) : ''
          return (
            <div key={it.id + date} className="ov-li" onClick={() => navigate('agenda')} title="打开日程">
              <div className="ov-li-top">
                <span className="mini-date-chip">{dateLabel(date)}</span>
                <span className="mini-time-chip">{it.start ?? '全天'}</span>
                <span className="ov-li-title">{it.title}</span>
                {repeat && <span className="ov-li-repeat">🔄{repeat}</span>}
              </div>
              <div className="ov-li-sub">
                {it.location && <span>📍 {it.location}</span>}
                {it.person && <span> 👤 {it.person}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
