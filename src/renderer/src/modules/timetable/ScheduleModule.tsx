/**
 * 课程表模块（节次制 + 教学周）。
 *
 * - 时间轴：一天固定 12 节（第 1 节 … 第 12 节）
 * - 教学周：设置「第 1 周的第一天」后自动推算本周是第几周；可查看任意第 N 周的课表，
 *   只显示该周开课的课程（识别 1-16周 / 单周 / 双周 / 指定周次）
 * - 空白节点击直接添加；点课程块可编辑/删除
 * - 支持粘贴文本 与 导入 .xlsx 两种方式
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { toDateStr } from '../../core/dates'
import { useStore } from '../../core/useStore'
import {
  DAY_LABELS,
  EMPTY_TIMETABLE,
  MAX_PERIOD,
  PALETTE,
  PERIOD_TIMES,
  TIMETABLE_NS,
  activeInWeek,
  borderOf,
  countOnDay,
  createEntryId,
  currentWeekNum,
  mondayOf,
  migrateEntries,
  parseWeekRule,
  reconcileEntries,
  todayIndex,
  validPeriods,
  weeksLabel,
  type TimetableEntry,
  type TimetableState
} from './model'
import { ImportTimetableModal } from './importModal'

/** 每节高度（px） */
const ROW_PX = 42

interface Draft {
  id: string | null
  day: number
  p1: number
  p2: number
  title: string
  location: string
  teacher: string
  color: number
  weeks: string
}

function emptyDraft(day: number, p: number): Draft {
  return { id: null, day, p1: p, p2: p, title: '', location: '', teacher: '', color: 0, weeks: '' }
}

export default function ScheduleModule(): React.JSX.Element {
  const { ready, data, error, save } = useStore<TimetableState>(TIMETABLE_NS)
  const rawState = data ?? EMPTY_TIMETABLE
  const settings = rawState.settings ?? { weekStart: null }

  // 旧数据（时间制）读取时一次性迁移为节次制；并自修复碎片/合并相邻同名课
  const state = useMemo<TimetableState>(
    () => ({ entries: reconcileEntries(migrateEntries(rawState.entries)), settings }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawState]
  )

  const [draft, setDraft] = useState<Draft | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [setWkOpen, setSetWkOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  /** null = 跟随本周 */
  const [viewWeek, setViewWeek] = useState<number | null>(null)

  const seeded = useRef(false)
  useEffect(() => {
    if (!ready || error || data !== null || seeded.current) return
    seeded.current = true
    save(EMPTY_TIMETABLE)
  }, [ready, error, data, save])

  // 旧数据（时间制）读取时一次性迁移为节次制并落盘（仅迁移，不做可能有损的“自修复合并”）
  useEffect(() => {
    if (!ready || !data) return
    const migrated = migrateEntries(data.entries)
    const changed =
      migrated.length !== data.entries.length ||
      migrated.some((e, i) => e.p1 !== data.entries[i]?.p1 || e.p2 !== data.entries[i]?.p2)
    if (changed) save({ entries: migrated, settings: data.settings ?? { weekStart: null } })
  }, [ready, data, save])

  const curWeek = currentWeekNum(settings.weekStart)
  const week = viewWeek ?? (curWeek !== null ? Math.max(curWeek, 1) : 1)
  const today = todayIndex()

  const saveDraft = (d: Draft): void => {
    const text = d.title.trim()
    if (!text || !validPeriods(d.p1, d.p2)) return
    const weeksText = d.weeks.trim() || null
    save((prev) => {
      const entry: TimetableEntry = {
        id: d.id ?? createEntryId(),
        day: d.day,
        p1: d.p1,
        p2: d.p2,
        title: text,
        location: d.location.trim() || undefined,
        teacher: d.teacher.trim() || undefined,
        color: d.color,
        weeks: weeksText
      }
      const items = d.id
        ? (prev.entries ?? []).map((it) => (it.id === d.id ? entry : it))
        : [...(prev.entries ?? []), entry]
      return { entries: items, settings: prev.settings ?? { weekStart: null } }
    })
    setDraft(null)
  }

  const removeEntry = (id: string): void => {
    save((prev) => ({
      entries: (prev.entries ?? []).filter((it) => it.id !== id),
      settings: prev.settings ?? { weekStart: null }
    }))
    setDraft(null)
  }

  const clearAll = (): void => {
    save((prev) => ({
      entries: [],
      settings: prev.settings ?? { weekStart: null }
    }))
    setClearOpen(false)
  }

  const openCell = (day: number, p: number): void => {
    setDraft(emptyDraft(day, p))
  }

  const visible = state.entries.filter((e) => activeInWeek(e, week))

  const dayCounts = useMemo(
    () => Array.from({ length: 7 }, (_, i) => countOnDay(state, i, week)),
    [state, week]
  )

  const totalPx = MAX_PERIOD * ROW_PX
  const hint = curWeek === null ? '未设置第 1 周日期，无法推算本周；可手动翻看周次。' : curWeek === 0 ? '本学期还没开学（今天早于第 1 周）。' : `今天是第 ${curWeek} 教学周`

  return (
    <div className="module schedule">
      <div className="tt-bar">
        <div className="tt-week-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => setViewWeek((w) => Math.max(1, (w ?? curWeek ?? 1) - 1))} aria-label="上一周">‹</button>
          <span className="tt-week-label">第 {week} 周</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setViewWeek((w) => Math.min(52, (w ?? curWeek ?? 1) + 1))} aria-label="下一周">›</button>
          {curWeek !== null && viewWeek !== null && viewWeek !== curWeek && (
            <button className="btn btn-ghost btn-sm" onClick={() => setViewWeek(null)}>回到本周（第{Math.max(curWeek, 1)}周）</button>
          )}
          <span className={`tt-week-hint${curWeek === null ? ' warn' : ''}`}>{hint}</span>
        </div>
        <div className="tt-bar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => setSetWkOpen(true)} title="设置第 1 周的第一天，用于推算教学周">
            📅 设置第1周…
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)} title="粘贴文本或导入 .xlsx 课表">
            导入课表…
          </button>
          <button
            className="btn btn-danger-ghost btn-sm"
            disabled={state.entries.length === 0}
            onClick={() => setClearOpen(true)}
            title="一键清空全部课程"
          >
            清空课表…
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setDraft(emptyDraft(today, 1))}
            title="添加课程（贴右缘）"
          >
            ＋ 添加课程
          </button>
        </div>
      </div>

      {error && <div className="banner banner-error">读取课程数据失败：{error}</div>}

      <div className="tt-grid">
        {/* 表头 */}
        <div className="tt-head">
          <div className="tt-corner">
            <span>节次</span>
            <span className="tt-corner-sub">第{week}周</span>
          </div>
          {DAY_LABELS.map((label, i) => (
            <div key={label} className={`tt-day-head${i === today ? ' is-today' : ''}`}>
              <span className="tt-day-name">{label}</span>
              {dayCounts[i] > 0 && <span className="tt-day-count">{dayCounts[i]}节</span>}
            </div>
          ))}
        </div>

        <div className="tt-body">
          {/* 左侧节次轴 */}
          <div className="tt-gutter" style={{ height: totalPx }}>
            {Array.from({ length: MAX_PERIOD }, (_, i) => (
              <div key={i} className="tt-period-mark" style={{ height: ROW_PX }}>
                <span className="tt-period-no">第{i + 1}节</span>
                <span className="tt-period-time">{PERIOD_TIMES[i][0]}</span>
              </div>
            ))}
          </div>

          {DAY_LABELS.map((_label, day) => (
            <div key={day} className={`tt-day${day === today ? ' is-today' : ''}`} style={{ height: totalPx }}>
              {Array.from({ length: MAX_PERIOD }, (_, i) => (
                <div
                  key={i}
                  className="tt-cell"
                  style={{ height: ROW_PX }}
                  onClick={() => ready && openCell(day, i + 1)}
                  title={`${DAY_LABELS[day]} · 第${i + 1}节：添加课程`}
                />
              ))}

              {/* 本周开课的课程块 */}
              {visible
                .filter((e) => e.day === day)
                .map((e) => {
                  const top = (e.p1 - 1) * ROW_PX + 2
                  const height = (e.p2 - e.p1 + 1) * ROW_PX - 4
                  const palette = PALETTE[e.color % PALETTE.length]
                  const wk = weeksLabel(e.weeks)
                  return (
                    <button
                      key={e.id}
                      className="tt-entry"
                      style={{
                        top,
                        height,
                        background: `${palette.hex}A6`,
                        borderColor: borderOf(palette.hex),
                        borderLeftColor: palette.hex
                      }}
                      onClick={() =>
                        setDraft({
                          id: e.id,
                          day: e.day,
                          p1: e.p1,
                          p2: e.p2,
                          title: e.title,
                          location: e.location ?? '',
                          teacher: e.teacher ?? '',
                          color: e.color,
                          weeks: e.weeks ?? ''
                        })
                      }
                    >
                      <span className="tt-entry-title">
                        {e.title}
                        {e.p2 > e.p1 && <em className="tt-entry-span">（{e.p1}–{e.p2}节）</em>}
                      </span>
                      {e.location && <span className="tt-entry-loc">📍 {e.location}</span>}
                      {(e.teacher || wk !== '每周') && (
                        <span className="tt-entry-weeks">
                          {[e.teacher ? `👨‍🏫 ${e.teacher}` : '', wk !== '每周' ? wk : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </button>
                  )
                })}
            </div>
          ))}
        </div>
      </div>

      {visible.length === 0 && state.entries.length > 0 && (
        <div className="tt-empty-tip">第 {week} 周没有开课；试试切换到其它周次。</div>
      )}

      {importOpen && <ImportTimetableModal onDone={() => setImportOpen(false)} />}

      {setWkOpen && (
        <WeekStartModal
          weekStart={settings.weekStart ?? null}
          onSave={(iso: string | null) => {
            save((prev) => ({
              entries: prev.entries ?? [],
              settings: { ...(prev.settings ?? {}), weekStart: iso }
            }))
            setSetWkOpen(false)
          }}
          onClose={() => setSetWkOpen(false)}
        />
      )}

      {clearOpen && (
        <div className="modal-mask" onMouseDown={() => setClearOpen(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-label="清空课表" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="modal-title">🗑 清空全部课程？</h3>
            <p className="field-hint" style={{ marginBottom: 12 }}>
              将<b>删除全部 {state.entries.length} 节课</b>（含各自的开课周次信息），且无法恢复。
              教学周设置（第 1 周日期）会保留。
            </p>
            <div className="modal-actions">
              <div className="modal-actions-right">
                <button className="btn btn-ghost" onClick={() => setClearOpen(false)}>取消</button>
                <button className="btn btn-danger-ghost" onClick={clearAll}>一键清空所有课表</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {draft && (
        <EntryEditor
          draft={draft}
          onSave={(d) => saveDraft(d)}
          onDelete={draft.id ? () => removeEntry(draft.id!) : undefined}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  )
}

/* ================= 第 1 周日期设置 ================= */

function WeekStartModal({
  weekStart,
  onSave,
  onClose
}: {
  weekStart: string | null
  onSave: (iso: string | null) => void
  onClose: () => void
}): React.JSX.Element {
  const [iso, setIso] = useState(weekStart ?? toDateStr(mondayOf(new Date())))
  const thisMonday = toDateStr(mondayOf(new Date()))
  const cur = weekStart ? currentWeekNum(weekStart) : null

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="设置第1周" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal-title">📅 教学周同步设置</h3>
        <p className="field-hint" style={{ marginBottom: 10 }}>
          填写<b>第 1 周的第一天（周一）</b>的日期，应用会据此自动推算“今天是第几教学周”，
          并按周显示哪些课开课。
        </p>
        <label className="field">
          <span className="field-label">第 1 周周一日期</span>
          <input type="date" className="text-input" value={iso} onChange={(e) => setIso(e.target.value)} />
        </label>
        <div className="chip-row" style={{ marginBottom: 10 }}>
          <button className={`chip${iso === thisMonday ? ' active' : ''}`} onClick={() => setIso(thisMonday)}>
            本周一（{thisMonday}）
          </button>
          {weekStart && (
            <button className="chip" onClick={() => setIso(weekStart)}>
              恢复：{weekStart}
            </button>
          )}
        </div>
        {weekStart ? (
          <p className="field-hint">
            当前设置：第 1 周 = {weekStart}（{cur !== null ? cur > 0 ? `今天为第 ${cur} 周` : '尚未开学' : '未知'}）
          </p>
        ) : (
          <p className="field-hint">当前未设置（无法推算本周）。</p>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => onSave(null)}>清除设置</button>
          <div className="modal-actions-right">
            <button className="btn btn-ghost" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={() => iso && onSave(iso)}>保存</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================= 课程编辑弹窗（节次 + 周次） ================= */

function EntryEditor({
  draft,
  onSave,
  onDelete,
  onClose
}: {
  draft: Draft
  onSave: (d: Draft) => void
  onDelete?: () => void
  onClose: () => void
}): React.JSX.Element {
  const [d, setD] = useState<Draft>(draft)
  const [err, setErr] = useState('')

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.isComposing) onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const set = (patch: Partial<Draft>): void => setD((prev) => ({ ...prev, ...patch }))

  const submit = (): void => {
    if (!d.title.trim()) {
      setErr('课程名称不能为空')
      return
    }
    if (!validPeriods(d.p1, d.p2)) {
      setErr('结束节次需要 ≥ 开始节次（1–12）')
      return
    }
    onSave(d)
  }

  const rule = parseWeekRule(d.weeks || '')
  const ruleMode =
    rule.kind === 'odd' ? 'odd' : rule.kind === 'even' ? 'even' : rule.kind === 'range' ? 'range' : rule.kind === 'list' ? 'list' : 'all'

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={d.id ? '编辑课程' : '添加课程'} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal-title">{d.id ? '编辑课程' : '添加课程'}</h3>

        <label className="field">
          <span className="field-label">课程名称</span>
          <input autoFocus className="text-input" value={d.title} onChange={(e) => set({ title: e.target.value })} onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') submit() }} />
        </label>

        <label className="field">
          <span className="field-label">星期</span>
          <div className="chip-row">
            {DAY_LABELS.map((label, i) => (
              <button key={label} className={`chip${d.day === i ? ' active' : ''}`} onClick={() => set({ day: i })}>
                {label}
              </button>
            ))}
          </div>
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">从第几节</span>
            <select className="text-input" value={d.p1} onChange={(e) => { const v = Number(e.target.value); set({ p1: v, p2: Math.max(d.p2, v) }) }}>
              {Array.from({ length: MAX_PERIOD }, (_, i) => (
                <option key={i + 1} value={i + 1}>第 {i + 1} 节</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">到第几节</span>
            <select className="text-input" value={d.p2} onChange={(e) => set({ p2: Number(e.target.value) })}>
              {Array.from({ length: MAX_PERIOD - d.p1 + 1 }, (_, i) => (
                <option key={d.p1 + i} value={d.p1 + i}>第 {d.p1 + i} 节</option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          <span className="field-label">开课周次（用于“第 N 周看什么课”）</span>
          <div className="chip-row">
            {([
              ['all', '每周'],
              ['odd', '单周'],
              ['even', '双周']
            ] as const).map(([k, lb]) => (
              <button key={k} className={`chip${ruleMode === k ? ' active' : ''}`} onClick={() => set({ weeks: k === 'all' ? '' : k === 'odd' ? '单周' : '双周' })}>
                {lb}
              </button>
            ))}
            <button className={`chip${ruleMode === 'range' ? ' active' : ''}`} onClick={() => set({ weeks: `1-${Math.max(1, 16)}周` })}>
              第 1–16 周
            </button>
            <button className={`chip${ruleMode === 'list' ? ' active' : ''}`} onClick={() => set({ weeks: '1,3,5,7周' })}>
              指定周次
            </button>
          </div>
          {ruleMode === 'range' && (
            <div className="field-row" style={{ marginTop: 8 }}>
              <label className="field">
                <span className="field-label">起始周</span>
                <input type="number" min={1} max={52} className="text-input" value={rule.from} onChange={(e) => set({ weeks: `${e.target.value || 1}-${rule.to}周` })} />
              </label>
              <label className="field">
                <span className="field-label">结束周</span>
                <input type="number" min={1} max={52} className="text-input" value={rule.to} onChange={(e) => set({ weeks: `${rule.from}-${e.target.value || rule.from}周` })} />
              </label>
            </div>
          )}
          {ruleMode === 'list' && (
            <input
              className="text-input"
              style={{ marginTop: 8 }}
              placeholder="如：1,3,5,7周 / 第8周"
              value={d.weeks}
              onChange={(e) => set({ weeks: e.target.value })}
            />
          )}
          <div className="field-hint">
            当前：{weeksLabel(d.weeks)}。也可手填，如 2-16周(双)、1,3,5周。
          </div>
        </div>

        <label className="field">
          <span className="field-label">地点（可选）</span>
          <input className="text-input" value={d.location} onChange={(e) => set({ location: e.target.value })} />
        </label>

        <label className="field">
          <span className="field-label">任课老师（可选）</span>
          <input className="text-input" value={d.teacher} onChange={(e) => set({ teacher: e.target.value })} />
        </label>

        <div className="field">
          <span className="field-label">颜色</span>
          <div className="swatch-row">
            {PALETTE.map((p, i) => (
              <button key={p.name} className={`swatch${d.color === i ? ' active' : ''}`} style={{ background: p.hex }} title={p.name} aria-label={`颜色 ${p.name}`} onClick={() => set({ color: i })} />
            ))}
          </div>
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
