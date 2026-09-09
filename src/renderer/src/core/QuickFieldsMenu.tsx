/**
 * 「二级下拉字段菜单」：输入栏聚焦即自动展开的结构化设置菜单，待办/日程共用。
 *
 * - 第一级：列出可设置的字段（⏰提醒时间 / 📍地点 / 👤人物 / 🔄每日待办 …）
 * - 第二级：所选字段的设置面板 —— 日期一律用内嵌月历选择，不做任何快捷文案识别
 *
 * 不做任何文字自动识别：一切值都由用户手动选择/输入。
 */

import { useEffect, useState } from 'react'

export type QFVal = string | boolean | null
export type QFVals = Record<string, QFVal>

export interface QFieldDef {
  key: string
  icon: string
  label: string
  kind: 'datetime' | 'date' | 'timerange' | 'text' | 'daily'
  /** text 类第二级输入框占位 */
  placeholder?: string
  /** 依据当前值生成摘要（顶栏胶囊 / 第一级右侧）；未设置为 null */
  summary: (vals: QFVals) => string | null
}

export interface QFChip {
  key: string
  icon: string
  text: string
}

/** 已设置的字段 → 顶栏小胶囊列表 */
export function qfChips(fields: QFieldDef[], vals: QFVals): QFChip[] {
  const out: QFChip[] = []
  for (const f of fields) {
    const s = f.summary(vals)
    if (s) out.push({ key: f.key, icon: f.icon, text: s })
  }
  return out
}

/** 该字段涉及的数据键（清除/胶囊 × 用） */
export function qfKeyList(def: QFieldDef): string[] {
  if (def.kind === 'timerange') return ['start', 'end']
  if (def.kind === 'daily') return [def.key]
  return [def.key]
}

/* ---------------- 日期/时间小工具 ---------------- */

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function dISO(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return isoOf(d)
}

export function fmtDateCN(iso: string): string {
  if (iso === dISO(0)) return '今天'
  if (iso === dISO(1)) return '明天'
  if (iso === dISO(2)) return '后天'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${Number(m[2])}月${Number(m[3])}日` : iso
}

export function fmtDT(dt: string): string {
  const [date, time] = dt.split('T')
  return time ? `${fmtDateCN(date)} ${time.slice(0, 5)}` : fmtDateCN(date)
}

function patchOf(key: string, value: QFVal): Record<string, QFVal> {
  const p: Record<string, QFVal> = {}
  p[key] = value
  return p
}

/* ---------------- 内嵌月历 ---------------- */

const CAL_WEEK = ['一', '二', '三', '四', '五', '六', '日']

function CalPicker({
  selected,
  onPick
}: {
  /** YYYY-MM-DD（可为空） */
  selected: string | null
  onPick: (iso: string) => void
}): React.JSX.Element {
  const [view, setView] = useState<Date>(() => {
    const base = selected ? new Date(`${selected}T00:00:00`) : new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  const y = view.getFullYear()
  const m = view.getMonth()
  const todayIso = isoOf(new Date())
  const first = new Date(y, m, 1)
  const pad = (first.getDay() + 6) % 7 // 周一开头
  const daysInMonth = new Date(y, m + 1, 0).getDate()

  const go = (dm: number): void => {
    setView((prev) => new Date(prev.getFullYear(), prev.getMonth() + dm, 1))
  }
  const backToday = (): void => {
    const t = new Date()
    setView(new Date(t.getFullYear(), t.getMonth(), 1))
    onPick(todayIso)
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < pad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="qf-cal">
      <div className="qf-cal-head">
        <button type="button" className="qf-cal-nav" aria-label="上个月" onClick={() => go(-1)}>
          ‹
        </button>
        <span className="qf-cal-title">
          {y} 年 {m + 1} 月
        </span>
        <button type="button" className="qf-cal-nav" aria-label="下个月" onClick={() => go(1)}>
          ›
        </button>
      </div>
      <div className="qf-cal-week">
        {CAL_WEEK.map((w) => (
          <span key={w} className="qf-cal-wk">{w}</span>
        ))}
      </div>
      <div className="qf-cal-grid">
        {cells.map((d, i) => {
          if (d === null) return <span key={'e' + i} className="qf-cal-day empty" />
          const iso = `${y}-${pad2(m + 1)}-${pad2(d)}`
          const isSel = iso === selected
          const isToday = iso === todayIso
          return (
            <button
              key={iso}
              type="button"
              className={`qf-cal-day${isSel ? ' sel' : ''}${isToday ? ' today' : ''}`}
              onClick={() => onPick(iso)}
            >
              {d}
            </button>
          )
        })}
      </div>
      <div className="qf-cal-foot">
        <button type="button" className="qf-opt" onClick={backToday}>
          ◎ 回到今天
        </button>
        {selected && <span className="qf-hint">已选：{fmtDateCN(selected)}</span>}
      </div>
    </div>
  )
}

/* ---------------- 菜单组件 ---------------- */

export function QuickFieldsMenu({
  fields,
  vals,
  onChange,
  suggestions,
  initialActive,
  onClose
}: {
  fields: QFieldDef[]
  vals: QFVals
  onChange: (patch: Record<string, QFVal>) => void
  /** 历史建议（text 类字段的第二级展示用） */
  suggestions?: (key: string) => string[]
  initialActive?: string | null
  onClose: () => void
}): React.JSX.Element {
  const [active, setActive] = useState<string | null>(initialActive ?? null)

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.isComposing) return
      onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const field = fields.find((f) => f.key === active) ?? null

  const clearFor = (def: QFieldDef): void => {
    const p: Record<string, QFVal> = {}
    for (const k of qfKeyList(def)) p[k] = def.kind === 'daily' ? false : null
    onChange(p)
  }

  /* ---------- 第一级：字段列表 ---------- */
  if (!field) {
    return (
      <div className="qf-menu">
        <div className="qf-menu-tip">为这条内容设置属性（均可不选）：</div>
        <div className="qf-l1">
          {fields.map((f) => {
            const s = f.summary(vals)
            return (
              <button key={f.key} type="button" className={`qf-l1-row${s ? ' has' : ''}`} onClick={() => setActive(f.key)}>
                <span className="qf-l1-ic">{f.icon}</span>
                <span className="qf-l1-lb">{f.label}</span>
                <span className="qf-l1-val">{s ?? ''}</span>
                <span className="qf-l1-go">›</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  /* ---------- 第二级：字段设置面板 ---------- */
  const has = field.summary(vals) != null

  return (
    <div className="qf-menu">
      <div className="qf-l2-head">
        <button type="button" className="qf-back" aria-label="返回字段列表" onClick={() => setActive(null)}>
          ‹
        </button>
        <span className="qf-l2-title">
          {field.icon} {field.label}
        </span>
        {has && (
          <button type="button" className="qf-l2-clear" onClick={() => clearFor(field)}>
            清除
          </button>
        )}
      </div>
      <div className="qf-l2-body">
        {field.kind === 'datetime' && <EditorDatetime def={field} vals={vals} onChange={onChange} />}
        {field.kind === 'date' && <EditorDate def={field} vals={vals} onChange={onChange} />}
        {field.kind === 'timerange' && <EditorTimeRange vals={vals} onChange={onChange} />}
        {field.kind === 'text' && (
          <EditorText
            def={field}
            vals={vals}
            onChange={onChange}
            onDone={() => setActive(null)}
            suggestions={suggestions}
          />
        )}
        {field.kind === 'daily' && <EditorDaily vals={vals} onChange={onChange} />}
      </div>
      <button type="button" className="qf-foot" onClick={() => setActive(null)}>
        ✓ 完成（返回选择更多）
      </button>
    </div>
  )
}

/* ---------------- 各字段面板 ---------------- */

/** 快捷选项小按钮 */
function Opt({
  on,
  onClick,
  children
}: {
  on?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button type="button" className={`qf-opt${on ? ' on' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

/** 提醒时间：内嵌月历选日期 + 原生时间选择（取消快捷“常用时间”） */
function EditorDatetime({
  def,
  vals,
  onChange
}: {
  def: QFieldDef
  vals: QFVals
  onChange: (patch: Record<string, QFVal>) => void
}): React.JSX.Element {
  const cur = (vals[def.key] as string) || ''
  const curDate = cur.slice(0, 10) || null
  const curTime = cur.includes('T') ? cur.slice(11, 16) : ''

  const pickDate = (iso: string): void => {
    const t = curTime || '09:00'
    onChange(patchOf(def.key, `${iso}T${t}`))
  }

  return (
    <>
      <div className="qf-sec-label">选择日期</div>
      <CalPicker selected={curDate} onPick={pickDate} />
      <div className="qf-sec-label">时间</div>
      <input
        type="time"
        className="qf-text-input"
        value={curTime}
        onChange={(e) => {
          if (!curDate) onChange(patchOf(def.key, `${dISO(0)}T${e.target.value || '09:00'}`))
          else onChange(patchOf(def.key, `${curDate}T${e.target.value || '09:00'}`))
        }}
      />
      {cur && <div className="qf-hint">提醒时间：{fmtDT(cur)}</div>}
    </>
  )
}

/** 日期：直接内嵌月历（没有快捷日期） */
function EditorDate({
  def,
  vals,
  onChange
}: {
  def: QFieldDef
  vals: QFVals
  onChange: (patch: Record<string, QFVal>) => void
}): React.JSX.Element {
  const cur = (vals[def.key] as string) || null
  return (
    <>
      <CalPicker selected={cur} onPick={(iso) => onChange(patchOf(def.key, iso))} />
    </>
  )
}

/** 起止时间：两个原生时间输入（取消快捷“常用时间”） */
function EditorTimeRange({
  vals,
  onChange
}: {
  vals: QFVals
  onChange: (patch: Record<string, QFVal>) => void
}): React.JSX.Element {
  const start = (vals.start as string) || ''
  const end = (vals.end as string) || ''
  const isAllDay = !start && !end

  return (
    <>
      {isAllDay ? (
        <div className="qf-hint">当前为「全天」事件。</div>
      ) : (
        <div className="qf-hint">
          当前：{start || '—'}
          {end ? ` ～ ${end}` : ''}
        </div>
      )}
      <div className="qf-time-row">
        <label className="qf-time-field">
          <span className="qf-sec-label">开始</span>
          <input
            type="time"
            className="qf-text-input"
            value={start}
            onChange={(e) => onChange({ start: e.target.value })}
          />
        </label>
        <label className="qf-time-field">
          <span className="qf-sec-label">结束</span>
          <input
            type="time"
            className="qf-text-input"
            value={end}
            disabled={!start}
            onChange={(e) => onChange({ end: e.target.value })}
          />
        </label>
      </div>
      <div className="qf-chipset" style={{ marginTop: 6 }}>
        <Opt
          on={isAllDay}
          onClick={() => {
            onChange({ start: null, end: null })
          }}
        >
          ⏱ 设为全天（无起止时间）
        </Opt>
      </div>
    </>
  )
}

function EditorText({
  def,
  vals,
  onChange,
  onDone,
  suggestions
}: {
  def: QFieldDef
  vals: QFVals
  onChange: (patch: Record<string, QFVal>) => void
  onDone: () => void
  suggestions?: (key: string) => string[]
}): React.JSX.Element {
  const cur = (vals[def.key] as string) || ''
  const sug = (suggestions?.(def.key) ?? []).map((s) => s.trim()).filter(Boolean)
  const opts = Array.from(new Set([...(cur.trim() ? [cur.trim()] : []), ...sug])).slice(0, 12)

  const apply = (v: string): void => {
    const t = v.trim()
    if (!t) return
    onChange(patchOf(def.key, t))
    onDone()
  }

  return (
    <>
      {opts.length > 0 && (
        <>
          <div className="qf-sec-label">以前用过的{def.label}</div>
          <div className="qf-chipset">
            {opts.map((o) => (
              <Opt key={o} on={o === cur} onClick={() => apply(o)}>
                {o}
              </Opt>
            ))}
          </div>
        </>
      )}
      <div className="qf-sec-label">{cur ? '修改' : '自定义'}</div>
      <input
        className="qf-text-input"
        value={cur}
        placeholder={def.placeholder ?? `输入${def.label}后回车`}
        onChange={(e) => onChange(patchOf(def.key, e.target.value))}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') {
            e.preventDefault()
            apply((e.target as HTMLInputElement).value)
          }
        }}
      />
      <div className="qf-hint">点上方历史记录，或输入新名称后回车</div>
    </>
  )
}

function EditorDaily({
  vals,
  onChange
}: {
  vals: QFVals
  onChange: (patch: Record<string, QFVal>) => void
}): React.JSX.Element {
  const on = vals.daily === true
  return (
    <div className="qf-daily-cards">
      <button
        type="button"
        className={`qf-daily-card${!on ? ' on' : ''}`}
        onClick={() => onChange({ daily: false })}
      >
        <span className="qf-daily-ic">📝</span>
        <span className="qf-daily-t">普通待办</span>
        <span className="qf-daily-d">完成一次就算结束</span>
      </button>
      <button
        type="button"
        className={`qf-daily-card${on ? ' on' : ''}`}
        onClick={() => onChange({ daily: true })}
      >
        <span className="qf-daily-ic">🔄</span>
        <span className="qf-daily-t">每日待办</span>
        <span className="qf-daily-d">每天自动回到待完成，适合每日必做</span>
      </button>
    </div>
  )
}
