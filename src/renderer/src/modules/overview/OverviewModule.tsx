/**
 * 概览页：问候 + 可自定义的卡片区（课表/待办/外借/项目/日程/统计）。
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useShell } from '../../core/shell'
import { useStore } from '../../core/useStore'
import { DEFAULT_UI, UI_NS, type UiSettings } from '../../core/uiSettings'
import { TODO_NS, countTodo, type TodoState } from '../todo/model'
import MiniTimetable from '../timetable/MiniTimetable'
import TodoMini from '../todo/TodoMini'
import MiniGear from '../gear/MiniGear'
import MiniProjects from '../assignments/MiniProjects'
import MiniAgenda from '../agenda/MiniAgenda'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000 * 30)
    return () => window.clearInterval(t)
  }, [])
  return now
}

interface CardDef {
  key: string
  title: string
  linkId: string
  body: ReactNode
}

export default function OverviewModule(): React.JSX.Element {
  const now = useNow()
  const { navigate } = useShell()
  const todoStore = useStore<TodoState>(TODO_NS)
  const uiStore = useStore<UiSettings>(UI_NS)
  const todo = countTodo(todoStore.data)
  const [customOpen, setCustomOpen] = useState(false)

  const CARDS: CardDef[] = [
    { key: 'timetable', title: '本周课表', linkId: 'timetable', body: <MiniTimetable /> },
    { key: 'todo', title: '待办事项', linkId: 'todo', body: <TodoMini /> },
    { key: 'lent', title: '正处于外借的器材', linkId: 'gear', body: <MiniGear /> },
    { key: 'projects', title: '正在进行的项目', linkId: 'assignments', body: <MiniProjects /> },
    { key: 'agenda', title: '日程（接下来）', linkId: 'agenda', body: <MiniAgenda /> }
  ]

  const savedOrder = uiStore.data?.overviewCards
  const order = savedOrder && savedOrder.length ? savedOrder : CARDS.map((c) => c.key)
  const shown = order.map((k) => CARDS.find((c) => c.key === k)).filter((c): c is CardDef => !!c)

  const saveOrder = (keys: string[]): void => {
    uiStore.save({
      background: uiStore.data?.background ?? DEFAULT_UI.background,
      overviewCards: keys
    })
  }

  return (
    <div className="module overview">
      <section className="overview-hero">
        <div className="overview-head-row">
          <div>
            <h1 className="overview-greeting">{greeting()} 👋</h1>
            <p className="overview-date">
              {now.getFullYear()} 年 {now.getMonth() + 1} 月 {now.getDate()} 日 · 星期{WEEKDAYS[now.getDay()]}
            </p>
          </div>
          <div className="overview-top-side">
            <div className="overview-mini-stats">
              <button className="mini-stat" onClick={() => navigate('todo')} role="button" title="打开待办">
                <span className="mini-stat-num">{todo.active}</span>
                <span className="mini-stat-label">待完成</span>
              </button>
              <button className="mini-stat" onClick={() => navigate('todo')} role="button" title="打开待办">
                <span className="mini-stat-num dim">{todo.total}</span>
                <span className="mini-stat-label">全部</span>
              </button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setCustomOpen(true)}>
              🎛 自定义卡片
            </button>
          </div>
        </div>
      </section>

      {shown.length === 0 ? (
        <div className="empty-note">
          概览卡片都隐藏了。点右上「🎛 自定义卡片」把它们加回来。
        </div>
      ) : (
        <section className="overview-blocks">
          {shown.map((card) => (
            <div key={card.key} className="ov-block">
              <div className="duo-head">
                <h2 className="section-title">{card.title}</h2>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(card.linkId)}>
                  进入 {card.title} →
                </button>
              </div>
              {card.body}
            </div>
          ))}
        </section>
      )}

      {customOpen && (
        <CustomizeModal
          order={order}
          cardTitles={Object.fromEntries(CARDS.map((c) => [c.key, c.title]))}
          onSave={(keys) => {
            saveOrder(keys)
            setCustomOpen(false)
          }}
          onClose={() => setCustomOpen(false)}
        />
      )}
    </div>
  )
}

/* ================= 概览自定义卡片 ================= */
function CustomizeModal({
  order,
  cardTitles,
  onSave,
  onClose
}: {
  order: string[]
  cardTitles: Record<string, string>
  onSave: (keys: string[]) => void
  onClose: () => void
}): React.JSX.Element {
  const [keys, setKeys] = useState([...order])
  const all = Object.keys(cardTitles)

  const toggle = (k: string): void => {
    setKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  }
  const move = (k: string, dir: -1 | 1): void => {
    setKeys((prev) => {
      const i = prev.indexOf(k)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      next[i] = next[j]
      next[j] = k
      return next
    })
  }

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="自定义概览卡片" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal-title">概览页卡片</h3>
        <p className="field-hint" style={{ marginBottom: 10 }}>勾选要显示的卡片；用 ↑↓ 调整顺序。</p>
        {all.map((k) => {
          const on = keys.includes(k)
          return (
            <div key={k} className="cust-row">
              <label className="cust-check">
                <input type="checkbox" checked={on} onChange={() => toggle(k)} />
                <span>{cardTitles[k]}</span>
              </label>
              {on && (
                <span className="cust-arrows">
                  <button className="todo-mini-btn" onClick={() => move(k, -1)} title="上移">↑</button>
                  <button className="todo-mini-btn" onClick={() => move(k, 1)} title="下移">↓</button>
                </span>
              )}
            </div>
          )
        })}
        <div className="modal-actions">
          <div className="modal-actions-right">
            <button className="btn btn-ghost" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={() => onSave(keys)}>保存布局</button>
          </div>
        </div>
      </div>
    </div>
  )
}
