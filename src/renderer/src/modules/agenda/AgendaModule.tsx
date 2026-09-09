/**
 * 日程板块：月历总览 + 当日日程列表（支持重复：每天/工作日/周末/自定义周几+单双周）。
 * 顶部输入栏：光标停留 → 二级字段菜单手动设置 📅日期 🕐起止时间 📍地点 👤人物（不做文字识别）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../core/useStore'
import {
  QuickFieldsMenu,
  fmtDateCN as qfFmtCN,
  qfChips,
  qfKeyList,
  type QFieldDef,
  type QFVals,
  type QFVal
} from '../../core/QuickFieldsMenu'
import {
  AGENDA_NS,
  EMPTY_AGENDA,
  createAgendaId,
  itemsOnDate,
  repeatLabel,
  todayISO,
  type AgendaItem,
  type AgendaRepeat,
  type AgendaState
} from './model'
import RepeatPicker from './RepeatPicker'
import type { CalendarEvent } from '@shared/api'

const WEEKS = ['日', '一', '二', '三', '四', '五', '六']

/* 输入栏二级菜单字段（日期/起止时间/地点/人物 —— 手动选择） */
const AGENDA_QF_FIELDS: QFieldDef[] = [
  {
    key: 'date',
    icon: '📅',
    label: '日期',
    kind: 'date',
    summary: (v) => (typeof v.date === 'string' && v.date ? qfFmtCN(v.date) : null)
  },
  {
    key: 'time',
    icon: '🕐',
    label: '时间（起止）',
    kind: 'timerange',
    summary: (v) => {
      const s = typeof v.start === 'string' && v.start ? v.start : ''
      const e = typeof v.end === 'string' && v.end ? v.end : ''
      if (!s && !e) return null
      if (s && e) return `${s} ～ ${e}`
      return s ? `${s} 开始` : `至 ${e}`
    }
  },
  {
    key: 'location',
    icon: '📍',
    label: '地点',
    kind: 'text',
    placeholder: '如：黄棚 / 48教 / 录音棚',
    summary: (v) => (typeof v.location === 'string' && v.location.trim() ? v.location.trim() : null)
  },
  {
    key: 'person',
    icon: '👤',
    label: '人物',
    kind: 'text',
    placeholder: '如：小王 / 老师',
    summary: (v) => (typeof v.person === 'string' && v.person.trim() ? v.person.trim() : null)
  }
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function fmtDateCN(isoStr: string): string {
  const [y, m, d] = isoStr.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}
function fmtTime(s: string | null): string {
  return s ?? ''
}

export default function AgendaModule(): React.JSX.Element {
  const { ready, data, error, save } = useStore<AgendaState>(AGENDA_NS)
  const state = data ?? EMPTY_AGENDA
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selected, setSelected] = useState(todayISO())
  const [edit, setEdit] = useState<AgendaItem | null | 'new'>(null)
  const [quick, setQuick] = useState('')
  const [quickMsg, setQuickMsg] = useState('')

  // 二级字段菜单状态（日期/起止/地点/人物 —— 全部手动选择）
  const [qfOpen, setQfOpen] = useState(false)
  const [qfActive, setQfActive] = useState<string | null>(null)
  const [qfVals, setQfVals] = useState<QFVals>({})
  const qfWrapRef = useRef<HTMLDivElement>(null)
  const quickRef = useRef<HTMLInputElement>(null)

  // macOS 本地日历事件（节假日/系统日历），按月拉取
  const [sysEvents, setSysEvents] = useState<Record<string, CalendarEvent[]>>({})

  const seeded = useRef(false)

  useEffect(() => {
    if (!ready || error || data !== null || seeded.current) return
    seeded.current = true
    save(EMPTY_AGENDA)
  }, [ready, error, data, save])

  useEffect(() => {
    let live = true
    const from = iso(new Date(month.getFullYear(), month.getMonth(), 1))
    const to = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0))
    void window.workbench?.calendar
      .events(from, to)
      .then((evs) => {
        if (!live) return
        const map: Record<string, CalendarEvent[]> = {}
        for (const e of evs) {
          ;(map[e.date] ??= []).push(e)
        }
        setSysEvents(map)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [month])

  const openQf = (key: string | null): void => {
    setQfActive(key)
    setQfOpen(true)
  }
  const setQfPatch = (patch: Record<string, QFVal>): void => {
    setQfVals((prev) => ({ ...prev, ...patch }))
  }
  const clearQfByChipKey = (key: string): void => {
    const def = AGENDA_QF_FIELDS.find((f) => f.key === key)
    if (!def) return
    const p: Record<string, QFVal> = {}
    for (const k of qfKeyList(def)) p[k] = def.kind === 'daily' ? false : null
    setQfPatch(p)
  }

  // 点击菜单以外 → 收起
  useEffect(() => {
    if (!qfOpen) return
    const h = (e: PointerEvent): void => {
      const t = e.target as Node
      if (qfWrapRef.current && !qfWrapRef.current.contains(t)) setQfOpen(false)
    }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [qfOpen])

  // 地点/人物历史建议（按使用次数排序）
  const qfSuggestions = (key: string): string[] => {
    if (key !== 'location' && key !== 'person') return []
    const freq = new Map<string, number>()
    for (const it of state.items) {
      const v = it[key]
      if (typeof v === 'string' && v.trim()) {
        const t = v.trim()
        freq.set(t, (freq.get(t) ?? 0) + 1)
      }
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([v]) => v)
      .slice(0, 10)
  }

  const quickAdd = (): void => {
    const text = quick.trim()
    if (!text || !ready) return
    // 日期默认 = 日历当前选中日（未在菜单里手动选日期时）
    const date = typeof qfVals.date === 'string' && qfVals.date ? qfVals.date : selected || todayISO()
    const start = typeof qfVals.start === 'string' && qfVals.start ? qfVals.start : null
    const end = typeof qfVals.end === 'string' && qfVals.end ? qfVals.end : null
    const item: AgendaItem = {
      id: createAgendaId(),
      date,
      start,
      end,
      title: text,
      location:
        typeof qfVals.location === 'string' && qfVals.location.trim() ? qfVals.location.trim() : null,
      person:
        typeof qfVals.person === 'string' && qfVals.person.trim() ? qfVals.person.trim() : null,
      note: null,
      createdAt: Date.now()
    }
    save((prev) => ({ items: [...prev.items, item] }))
    const chipText = qfChips(AGENDA_QF_FIELDS, qfVals)
      .filter((c) => c.key !== 'date')
      .map((c) => `${c.icon} ${c.text}`)
      .join(' · ')
    setQuickMsg(
      `已加入日程：${text} · ${fmtDateCN(date)}${start ? ` ${start}${end ? `–${end}` : ''}` : '（全天）'}${
        chipText ? ` · ${chipText}` : ''
      }`
    )
    setSelected(date)
    setQuick('')
    setQfVals({})
    setQfActive(null)
    quickRef.current?.focus()
    window.setTimeout(() => setQuickMsg(''), 4000)
  }

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const startPad = first.getDay()
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const arr: (Date | null)[] = []
    for (let i = 0; i < startPad; i++) arr.push(null)
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(month.getFullYear(), month.getMonth(), d))
    return arr
  }, [month])

  /** 某天实际发生的日程（含重复规则展开） */
  const evsOn = (dateStr: string): AgendaItem[] =>
    itemsOnDate(state.items, dateStr).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''))

  /** 某天的 macOS 本地日历事件（节假日等） */
  const sysOn = (dateStr: string): CalendarEvent[] => sysEvents[dateStr] ?? []

  const dayEvents = evsOn(selected)
  const sysDay = sysOn(selected)

  const saveItem = (draft: Omit<AgendaItem, 'id' | 'createdAt'>, existing: AgendaItem | null): void => {
    save((prev) => {
      const item: AgendaItem = {
        id: existing?.id ?? createAgendaId(),
        createdAt: existing?.createdAt ?? Date.now(),
        ...draft
      }
      return {
        items: existing
          ? prev.items.map((i) => (i.id === existing.id ? item : i))
          : [...prev.items, item]
      }
    })
    setEdit(null)
  }

  const remove = (id: string): void => {
    save((prev) => ({ items: prev.items.filter((i) => i.id !== id) }))
    setEdit(null)
  }

  return (
    <div className="module agenda">
      {error && <div className="banner banner-error">读取日程失败：{error}</div>}

      <div className="toolbar">
        <div className="toolbar-left">
          <button className="btn btn-ghost btn-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹ 上月</button>
          <span className="agenda-month">{month.getFullYear()} 年 {month.getMonth() + 1} 月</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>下月 ›</button>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => setEdit('new')}>＋ 添加日程</button>
        </div>
      </div>

      {/* 快捷添加：光标在输入栏内 → 二级字段菜单自动保持展开（默认日期=日历选中日） */}
      <div
        className="qf-shell agenda"
        ref={qfWrapRef}
        onFocus={() => setQfOpen(true)}
        onBlur={(e) => {
          const rt = e.relatedTarget
          if (rt instanceof Node && !e.currentTarget.contains(rt)) setQfOpen(false)
        }}
      >
        <div className="qf-bar">
          <input
            ref={quickRef}
            className="qf-input"
            value={quick}
            placeholder={`输入事件名称后回车添加；下方菜单设置 📅日期 🕐时间 📍地点 👤人物（默认 ${fmtDateCN(selected)}）`}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') quickAdd()
              if (e.key === 'Escape') {
                setQfOpen(false)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
          <button className="btn btn-primary" disabled={!ready || !quick.trim()} onClick={quickAdd}>
            添加
          </button>
        </div>

        {qfChips(AGENDA_QF_FIELDS, qfVals).length > 0 && (
          <div className="qf-chips">
            {qfChips(AGENDA_QF_FIELDS, qfVals).map((c) => (
              <span key={c.key} className="qf-chip" title="点按修改" onClick={() => openQf(c.key)}>
                {c.icon} {c.text}
                <button
                  type="button"
                  className="qf-chip-x"
                  aria-label={`清除：${c.text}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    clearQfByChipKey(c.key)
                  }}
                >
                  ✕
                </button>
              </span>
            ))}
            {qfChips(AGENDA_QF_FIELDS, qfVals).length > 1 && (
              <button type="button" className="qf-clear-all" onClick={() => setQfVals({})}>
                清空
              </button>
            )}
          </div>
        )}

        {qfOpen && (
          <QuickFieldsMenu
            key={qfActive ?? 'root'}
            fields={AGENDA_QF_FIELDS}
            vals={qfVals}
            onChange={setQfPatch}
            suggestions={qfSuggestions}
            initialActive={qfActive}
            onClose={() => {
              setQfOpen(false)
              quickRef.current?.blur()
            }}
          />
        )}
      </div>
      {quickMsg && (
        <div className="field-hint" style={{ margin: '8px 2px 0', color: 'var(--fg-faint)' }}>
          {quickMsg}
        </div>
      )}

      {/* 月历 */}
      <div className="agenda-cal">
        <div className="agenda-week-row">
          {WEEKS.map((w) => (
            <span key={w} className="agenda-week">{w}</span>
          ))}
        </div>
        <div className="agenda-grid">
          {cells.map((d, i) => {
            if (!d) return <span key={'e' + i} className="agenda-cell empty" />
            const key = iso(d)
            const isSel = key === selected
            const isToday = key === todayISO()
            const evs = evsOn(key)
            const sys = sysOn(key)
            return (
              <button
                key={key}
                className={`agenda-cell${isSel ? ' sel' : ''}${isToday ? ' today' : ''}`}
                onClick={() => setSelected(key)}
              >
                <span className="agenda-day-num">{d.getDate()}</span>
                <span className="agenda-dots">
                  {evs.slice(0, 3).map((e) => (
                    <i key={e.id} style={{ background: e.location ? '#a78bfa' : '#7c96ff' }} />
                  ))}
                  {sys.slice(0, 2).map((_s, si) => (
                    <i key={`sys-${si}`} style={{ background: '#46d69b' }} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 当日日程 */}
      <div className="agenda-day-head">
        <span className="section-title">
          {fmtDateCN(selected)}{selected === todayISO() ? ' · 今天' : ''}（{dayEvents.length + sysDay.length}）
        </span>
      </div>
      {dayEvents.length === 0 && sysDay.length === 0 ? (
        <div className="empty-note">这一天还没有日程，点「＋ 添加日程」或右上按钮。</div>
      ) : (
        <div className="k-list">
          {sysDay.map((s, si) => (
            <div key={`sys-${si}`} className="k-row sys-row">
              <span className="agenda-time">{s.allDay ? '全天' : s.time}</span>
              <div className="k-main">
                <div className="k-title-line">
                  <span className="k-title">{s.title}</span>
                  <span className="tag tag-sys">📅 系统日历</span>
                </div>
              </div>
            </div>
          ))}
          {dayEvents.map((ev) => (
            <div key={ev.id} className="k-row" onClick={() => setEdit(ev)}>
              <span className="agenda-time">
                {fmtTime(ev.start)}{ev.end ? `–${ev.end}` : ''}
              </span>
              <div className="k-main">
                <div className="k-title-line">
                  <span className="k-title">{ev.title}</span>
                  {ev.location && <span className="tag tag-course">📍 {ev.location}</span>}
                  {ev.person && <span className="tag">👤 {ev.person}</span>}
                  {ev.repeat && ev.repeat.kind !== 'none' && (
                    <span className="tag tag-repeat">🔄 {repeatLabel(ev.repeat)}</span>
                  )}
                </div>
                {ev.note && <div className="k-sub">{ev.note}</div>}
              </div>
              <button
                className="k-del"
                aria-label={`删除：${ev.title}`}
                title="快速删除"
                onClick={(e) => {
                  e.stopPropagation()
                  remove(ev.id)
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <AgendaModal
          existing={edit === 'new' ? null : edit}
          defaultDate={selected}
          onSave={(draft) => saveItem(draft, edit === 'new' ? null : edit)}
          onDelete={edit !== 'new' ? () => remove((edit as AgendaItem).id) : undefined}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  )
}

/* ---------- 新增/编辑弹窗 ---------- */
function AgendaModal({
  existing,
  defaultDate,
  onSave,
  onDelete,
  onClose
}: {
  existing: AgendaItem | null
  defaultDate: string
  onSave: (d: Omit<AgendaItem, 'id' | 'createdAt'>) => void
  onDelete?: () => void
  onClose: () => void
}): React.JSX.Element {
  const [date, setDate] = useState(existing?.date ?? defaultDate)
  const [start, setStart] = useState(existing?.start ?? '')
  const [end, setEnd] = useState(existing?.end ?? '')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [location, setLocation] = useState(existing?.location ?? '')
  const [person, setPerson] = useState(existing?.person ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [repeat, setRepeat] = useState<AgendaRepeat | null>(existing?.repeat ?? null)
  const [err, setErr] = useState('')

  const submit = (): void => {
    if (!date || !title.trim()) {
      setErr('请填写日期与事件名称')
      return
    }
    onSave({
      date,
      start: start || null,
      end: end || null,
      title: title.trim(),
      location: location.trim() || null,
      person: person.trim() || null,
      note: note.trim() || null,
      repeat
    })
  }

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="日程" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{existing ? '编辑日程' : '添加日程'}</h3>
        <div className="field-row">
          <div className="field">
            <span className="field-label">日期</span>
            <input type="date" className="text-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <span className="field-label">开始</span>
              <input type="time" className="text-input" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="field">
              <span className="field-label">结束</span>
              <input type="time" className="text-input" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="field">
          <span className="field-label">事件</span>
          <input autoFocus className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <span className="field-label">地点（可选）</span>
          <input className="text-input" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="field">
          <span className="field-label">人物（可选）</span>
          <input className="text-input" value={person} onChange={(e) => setPerson(e.target.value)} />
        </div>

        <div className="field">
          <span className="field-label">重复（可选，像“每日打卡”一样循环出现）</span>
          <RepeatPicker
            value={repeat}
            onChange={setRepeat}
            anchorDow={date ? (new Date(date + 'T00:00:00').getDay() + 6) % 7 : 0}
          />
          {repeat && repeat.kind !== 'none' && (
            <div className="field-hint">
              从 {date} 起，按「{repeatLabel(repeat)}」自动出现在对应日期的列表里。
            </div>
          )}
        </div>

        <div className="field">
          <span className="field-label">备注（可选）</span>
          <textarea className="text-input ta" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {err && <div className="field-error">{err}</div>}
        <div className="modal-actions">
          {onDelete && <button className="btn btn-danger-ghost" onClick={onDelete}>删除</button>}
          <div className="modal-actions-right">
            <button className="btn btn-ghost" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={submit}>保存</button>
          </div>
        </div>
      </div>
    </div>
  )
}
