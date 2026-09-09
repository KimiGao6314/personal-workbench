/**
 * 日程重复规则选择器（类似“每日打卡”的循环安排）：
 * 单次 / 每天 / 每工作日 / 每周末 / 自定义（每周几 + 每单周/每双周/每周）
 */
import { useState } from 'react'
import type { AgendaRepeat } from './model'

const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

export default function RepeatPicker({
  value,
  onChange,
  anchorDow
}: {
  value: AgendaRepeat | null
  onChange: (r: AgendaRepeat | null) => void
  /** 未配置自定义时默认勾选“哪一天”（按该日程首日的星期） */
  anchorDow?: number
}): React.JSX.Element {
  const kind = value?.kind ?? 'none'
  const custom = value && value.kind === 'custom' ? value : null
  const [days, setDays] = useState<number[]>(() => {
    if (custom && custom.days.length) return custom.days
    return anchorDow !== undefined && anchorDow >= 0 && anchorDow <= 6 ? [anchorDow] : []
  })

  const toggleDay = (d: number): void => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b)
    setDays(next)
    onChange({ kind: 'custom', days: next.length ? next : [anchorDow ?? 0], parity: value?.kind === 'custom' && value.parity ? value.parity : 'all' })
  }

  const setParity = (parity: 'all' | 'odd' | 'even'): void => {
    onChange({ kind: 'custom', days: days.length ? days : [anchorDow ?? 0], parity })
  }

  const pick = (key: AgendaRepeat['kind']): void => {
    if (key === 'none') {
      onChange(null)
      return
    }
    if (key === 'custom') {
      onChange({
        kind: 'custom',
        days: days.length ? days : [anchorDow ?? 0],
        parity: value?.kind === 'custom' ? value.parity : 'all'
      })
      return
    }
    if (key === 'daily') {
      onChange({ kind: 'daily' })
      return
    }
    if (key === 'weekdays') {
      onChange({ kind: 'weekdays' })
      return
    }
    onChange({ kind: 'weekends' })
  }

  const rows: { key: AgendaRepeat['kind']; icon: string; label: string; sub: string }[] = [
    { key: 'none', icon: '🎯', label: '不重复', sub: '仅当天一次' },
    { key: 'daily', icon: '📆', label: '每天', sub: '每天都出现' },
    { key: 'weekdays', icon: '💼', label: '每工作日', sub: '周一 ~ 周五' },
    { key: 'weekends', icon: '🎉', label: '每周末', sub: '周六、周日' },
    { key: 'custom', icon: '🛠️', label: '自定义', sub: '自选每周几 + 单/双周' }
  ]

  return (
    <div className="rep-wrap">
      <div className="rep-rows">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`rep-row${kind === r.key ? ' on' : ''}`}
            onClick={() => pick(r.key)}
          >
            <span className="rep-ic">{r.icon}</span>
            <span className="rep-main">
              <span className="rep-label">{r.label}</span>
              <span className="rep-sub">{r.sub}</span>
            </span>
            {kind === r.key && <span className="rep-check">✓</span>}
          </button>
        ))}
      </div>

      {kind === 'custom' && (
        <div className="rep-custom">
          <div className="field">
            <span className="field-label">每周哪几天</span>
            <div className="chip-row">
              {DAY_NAMES.map((n, i) => (
                <button
                  key={n}
                  type="button"
                  className={`chip${days.includes(i) ? ' active' : ''}`}
                  onClick={() => toggleDay(i)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">周次（相对该日程第 1 次发生那周起算）</span>
            <div className="chip-row">
              {([
                ['all', '每周'],
                ['odd', '每单周'],
                ['even', '每双周']
              ] as const).map(([k, lb]) => (
                <button
                  key={k}
                  type="button"
                  className={`chip${(value?.kind === 'custom' ? value.parity : 'all') === k ? ' active' : ''}`}
                  onClick={() => setParity(k)}
                >
                  {lb}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
