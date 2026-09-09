/**
 * 待办清单模块（每日打卡/提醒/地点人物/快捷搜索）。
 * - 整行点击 = 完成/取消；每日任务按当天打卡处理，跨天自动回到“待打卡”
 * - 顶部输入栏：点 ⚙ / 输入框展开“二级字段菜单”，手动设置 ⏰提醒时间 / 📍地点 / 👤人物 / 🔄每日待办
 *   （不做任何文字自动识别）
 * - ⚙ 详情：地点/人物（带历史可选项）/提醒时间/每日打卡
 */
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../core/useStore'
import {
  QuickFieldsMenu,
  fmtDT,
  qfChips,
  qfKeyList,
  type QFieldDef,
  type QFVals,
  type QFVal
} from '../../core/QuickFieldsMenu'
import {
  EMPTY_TODO,
  TODO_NS,
  countTodo,
  createTodo,
  isDoneForToday,
  todayStr,
  toggleItemDone,
  type TodoItem,
  type TodoState
} from './model'

type Filter = 'all' | 'active' | 'done'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'done', label: '已完成' }
]

/* 输入栏二级菜单字段：全部手动选择（不做文字识别） */
const TODO_QF_FIELDS: QFieldDef[] = [
  {
    key: 'remind',
    icon: '⏰',
    label: '提醒时间',
    kind: 'datetime',
    summary: (v) => (typeof v.remind === 'string' && v.remind ? fmtDT(v.remind) : null)
  },
  {
    key: 'location',
    icon: '📍',
    label: '地点',
    kind: 'text',
    placeholder: '如：黄棚 / 48教 / 图书馆',
    summary: (v) => (typeof v.location === 'string' && v.location.trim() ? v.location.trim() : null)
  },
  {
    key: 'person',
    icon: '👤',
    label: '人物',
    kind: 'text',
    placeholder: '如：小王 / 老师',
    summary: (v) => (typeof v.person === 'string' && v.person.trim() ? v.person.trim() : null)
  },
  {
    key: 'daily',
    icon: '🔄',
    label: '每日待办',
    kind: 'daily',
    summary: (v) => (v.daily === true ? '每日待办' : null)
  }
]

function fmtClock(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function smartRemind(remindAt: string): string {
  const t = remindAt.replace('T', ' ')
  const date = t.slice(0, 10)
  return date === todayStr() ? `今天 ${t.slice(11)}` : t
}

export default function TodoModule(): React.JSX.Element {
  const { ready, data, error, save } = useStore<TodoState>(TODO_NS)
  const state = data ?? EMPTY_TODO

  const [filter, setFilter] = useState<Filter>('all')
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [detail, setDetail] = useState<TodoItem | null>(null)
  const [msg, setMsg] = useState('')

  // 二级字段菜单状态（提醒时间/地点/人物/每日待办 —— 全部手动选择）
  const [qfOpen, setQfOpen] = useState(false)
  const [qfActive, setQfActive] = useState<string | null>(null)
  const [qfVals, setQfVals] = useState<QFVals>({})
  const qfWrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLInputElement>(null)

  const counts = countTodo(state)
  const qfChipsNow = qfChips(TODO_QF_FIELDS, qfVals)

  const seeded = useRef(false)
  useEffect(() => {
    if (!ready || error || data !== null || seeded.current) return
    seeded.current = true
    save(EMPTY_TODO)
  }, [ready, error, data, save])

  useEffect(() => {
    if (editingId) editRef.current?.focus()
  }, [editingId])

  // 菜单开合
  const openQf = (key: string | null): void => {
    setQfActive(key)
    setQfOpen(true)
  }
  const setQfPatch = (patch: Record<string, QFVal>): void => {
    setQfVals((prev) => ({ ...prev, ...patch }))
  }
  const clearQfByChipKey = (key: string): void => {
    const def = TODO_QF_FIELDS.find((f) => f.key === key)
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

  // 地点/人物历史建议（按历史使用次数排序，仅作菜单候选项）
  const qfSuggestions = (key: string): string[] => {
    if (key !== 'location' && key !== 'person') return []
    const field = key
    const freq = new Map<string, number>()
    for (const it of state.items) {
      const v = it[field]
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

  // 快捷添加：标题 = 输入文字；属性一律来自二级菜单手动选择
  const addQuick = (): void => {
    const text = draft.trim()
    if (!text || !ready) return
    const remind = typeof qfVals.remind === 'string' && qfVals.remind ? qfVals.remind : null
    save((prev) => ({
      items: [
        createTodo({
          text,
          remindAt: remind,
          location:
            typeof qfVals.location === 'string' && qfVals.location.trim() ? qfVals.location.trim() : null,
          person:
            typeof qfVals.person === 'string' && qfVals.person.trim() ? qfVals.person.trim() : null,
          daily: qfVals.daily === true
        }),
        ...prev.items
      ]
    }))
    const chipsText = qfChipsNow.map((c) => `${c.icon} ${c.text}`).join(' · ')
    setMsg(chipsText ? `已加入「待办」：${text}（${chipsText}）` : `已加入「待办」：${text}`)
    setDraft('')
    setQfVals({})
    setQfActive(null)
    inputRef.current?.focus()
    window.setTimeout(() => setMsg(''), 4000)
  }

  const toggle = (id: string): void => {
    save((prev) => ({ items: prev.items.map((it) => (it.id === id ? toggleItemDone(it) : it)) }))
  }

  const removeTodo = (id: string): void => {
    save((prev) => ({ items: prev.items.filter((it) => it.id !== id) }))
  }

  const commitEdit = (): void => {
    if (editingId == null) return
    const text = editText.trim()
    save((prev) => ({
      items: prev.items
        .map((it) => (it.id === editingId ? { ...it, text: text || it.text } : it))
        .filter((it) => it.text !== '')
    }))
    setEditingId(null)
  }

  const completeAllActive = (): void => {
    save((prev) => ({
      items: prev.items.map((it) => (isDoneForToday(it) ? it : toggleItemDone(it)))
    }))
  }

  const clearDone = (): void => {
    // 只清除普通已完成的条目，保留每日打卡模板
    save((prev) => ({ items: prev.items.filter((it) => !(it.daily ? false : it.done)) }))
  }

  const saveDetail = (id: string, patch: Partial<TodoItem>): void => {
    save((prev) => ({
      items: prev.items.map((it) => (it.id === id ? { ...it, ...patch, reminded: false } : it))
    }))
    setDetail(null)
  }

  const visible = state.items
    .filter((it) => {
      if (filter === 'active') return !isDoneForToday(it)
      if (filter === 'done') return isDoneForToday(it)
      return true
    })
    .filter((it) => {
      const kw = q.trim().toLowerCase()
      if (!kw) return true
      return (it.text + ' ' + (it.location ?? '') + ' ' + (it.person ?? '')).toLowerCase().includes(kw)
    })

  return (
    <div className="module todo">
      {error && <div className="banner banner-error">读取待办数据失败：{error}</div>}

      {/* 快捷添加区：光标在输入栏内 → 二级字段菜单自动保持展开 */}
      <div
        className="qf-shell"
        ref={qfWrapRef}
        onFocus={() => setQfOpen(true)}
        onBlur={(e) => {
          const rt = e.relatedTarget
          if (rt instanceof Node && !e.currentTarget.contains(rt)) setQfOpen(false)
        }}
      >
        <div className="qf-bar">
          <input
            ref={inputRef}
            className="qf-input"
            value={draft}
            disabled={!ready}
            placeholder="输入待办内容后回车添加；光标停留时下方菜单可选 ⏰提醒 📍地点 👤人物 🔄每日待办"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') addQuick()
              if (e.key === 'Escape') {
                setQfOpen(false)
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
          <button className="btn btn-primary" disabled={!ready || !draft.trim()} onClick={addQuick}>
            添加
          </button>
        </div>

        {qfChipsNow.length > 0 && (
          <div className="qf-chips">
            {qfChipsNow.map((c) => (
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
            {qfChipsNow.length > 1 && (
              <button type="button" className="qf-clear-all" onClick={() => setQfVals({})}>
                清空
              </button>
            )}
          </div>
        )}

        {qfOpen && (
          <QuickFieldsMenu
            key={qfActive ?? 'root'}
            fields={TODO_QF_FIELDS}
            vals={qfVals}
            onChange={setQfPatch}
            suggestions={qfSuggestions}
            initialActive={qfActive}
            onClose={() => {
              setQfOpen(false)
              inputRef.current?.blur()
            }}
          />
        )}
      </div>
      {msg && (
        <div className="field-hint" style={{ margin: '8px 2px 0', color: 'var(--fg-faint)' }}>
          {msg}
        </div>
      )}

      {/* 过滤 + 搜索 + 批量 */}
      <div className="todo-toolbar">
        <div className="seg" role="tablist">
          {FILTERS.map((f) => {
            const n = f.key === 'all' ? counts.total : f.key === 'active' ? counts.active : counts.done
            return (
              <button
                key={f.key}
                role="tab"
                className={`seg-btn${filter === f.key ? ' active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <span className="seg-count">{n}</span>
              </button>
            )
          })}
        </div>
        <div className="toolbar-right">
          <input
            className="search-input"
            placeholder="搜索待办 / 地点 / 人物…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {counts.done > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={clearDone}>
              清除已完成
            </button>
          )}
          {counts.active > 0 && (
            <button className="btn btn-primary btn-sm" onClick={completeAllActive}>
              ✓ 全部完成
            </button>
          )}
        </div>
      </div>

      {/* 列表 */}
      {visible.length === 0 ? (
        <div className="todo-empty">
          <div className="todo-empty-icon">{state.items.length === 0 ? '🌱' : '🍃'}</div>
          <div className="todo-empty-text">
            {state.items.length === 0
              ? '还没有任务。输入内容后按回车即可添加；光标停在输入栏时，下方菜单可设置提醒时间、地点、人物或每日待办。'
              : '没有符合筛选/搜索的结果。'}
          </div>
        </div>
      ) : (
        <ul className="todo-list">
          {visible.map((it) =>
            editingId === it.id ? (
              <li key={it.id} className="todo-item todo-item-editing">
                <input
                  ref={editRef}
                  className="todo-input todo-edit-input"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter') commitEdit()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={commitEdit}
                />
              </li>
            ) : (
              <li
                key={it.id}
                className={`todo-item clickable${isDoneForToday(it) ? ' done' : ''}`}
                onClick={() => toggle(it.id)}
                title="点击完成 / 取消"
              >
                <span className={`todo-check${isDoneForToday(it) ? ' checked' : ''}`} aria-hidden>
                  {isDoneForToday(it) ? '✓' : ''}
                </span>

                <div className="todo-main">
                  <span className="todo-text">{it.text}</span>
                  <span className="todo-meta">
                    {it.daily && <span className="todo-chip daily">每日</span>}
                    {it.person && <span className="todo-chip">👤 {it.person}</span>}
                    {it.location && <span className="todo-chip">📍 {it.location}</span>}
                    {it.remindAt && (
                      <span className="todo-chip remind" title="修改提醒" onClick={(e) => { e.stopPropagation(); setDetail(it) }}>
                        ⏰ {smartRemind(it.remindAt)}
                      </span>
                    )}
                    <span className="todo-time">{fmtClock(it.createdAt)}</span>
                  </span>
                </div>

                <button className="todo-mini-btn" aria-label="编辑文字" title="编辑文字"
                  onClick={(e) => { e.stopPropagation(); if (isDoneForToday(it)) return; setEditingId(it.id); setEditText(it.text) }}>✎</button>
                <button className="todo-mini-btn" aria-label="详情" title="地点/人物/提醒/每日打卡"
                  onClick={(e) => { e.stopPropagation(); setDetail(it) }}>⚙</button>
                <button className="todo-del" aria-label="删除" title="删除"
                  onClick={(e) => { e.stopPropagation(); removeTodo(it.id) }}>✕</button>
              </li>
            )
          )}
        </ul>
      )}

      {/* 底部统计 */}
      <div className="todo-footer">
        <span>
          共 {counts.total} 项 · 待完成 <b>{counts.active}</b> · 已完成/今日打卡 {counts.done}
        </span>
        <span className="todo-footer-hint">点击任务完成 · 每日任务每天自动回到待打卡</span>
      </div>

      {detail && (
        <TodoDetailModal
          item={detail}
          all={state.items}
          onSave={(patch: Partial<TodoItem>) => saveDetail(detail.id, patch)}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}

/* ================= 详情（地点/人物/提醒/每日） ================= */

function TodoDetailModal({
  item,
  all,
  onSave,
  onClose
}: {
  item: TodoItem
  all: TodoItem[]
  onSave: (patch: Partial<TodoItem>) => void
  onClose: () => void
}): React.JSX.Element {
  const [person, setPerson] = useState(item.person ?? '')
  const [location, setLocation] = useState(item.location ?? '')
  const [remindAt, setRemindAt] = useState(item.remindAt ?? '')
  const [daily, setDaily] = useState(!!item.daily)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (e.isComposing) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        ;(el as HTMLInputElement).blur()
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const persons = Array.from(new Set(all.map((i) => i.person).filter(Boolean))).sort() as string[]
  const places = Array.from(new Set(all.map((i) => i.location).filter(Boolean))).sort() as string[]

  const submit = (): void => {
    onSave({
      person: person.trim() || null,
      location: location.trim() || null,
      remindAt: remindAt || null,
      daily
    })
  }

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="待办详情"
        onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal-title">⚙ 待办详情 · {item.text}</h3>

        <label className="field">
          <span className="field-label">地点（可选）</span>
          <input className="text-input" list="todo-places" value={location} placeholder="如：图书馆 / 48教" onChange={(e) => setLocation(e.target.value)} />
          <datalist id="todo-places">{places.map((p) => <option key={p} value={p} />)}</datalist>
        </label>

        <label className="field">
          <span className="field-label">人物（可选）</span>
          <input className="text-input" list="todo-persons" value={person} placeholder="如：小王 / 老师" onChange={(e) => setPerson(e.target.value)} />
          <datalist id="todo-persons">{persons.map((p) => <option key={p} value={p} />)}</datalist>
        </label>

        <label className="field">
          <span className="field-label">提醒时间（可选）</span>
          <input type="datetime-local" className="text-input" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
          <span className="field-hint">应用运行时到点会弹系统通知</span>
        </label>

        <label className="checkline">
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
          <span>每日打卡：每天自动回到“待打卡”状态</span>
        </label>

        <div className="modal-actions">
          <div className="modal-actions-right">
            <button className="btn btn-ghost" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={submit}>保存</button>
          </div>
        </div>
      </div>
    </div>
  )
}
