/**
 * 概览页：问候 + 可自定义的卡片区（课表/待办/外借/设备台账/项目/启动器/日程）。
 * 支持：显示/隐藏、可视化拖拽排序、卡片大小缩放。
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useShell } from '../../core/shell'
import { useStore } from '../../core/useStore'
import { DEFAULT_UI, UI_NS, type UiSettings } from '../../core/uiSettings'
import { TODO_NS, countTodo, type TodoState } from '../todo/model'
import MiniTimetable from '../timetable/MiniTimetable'
import TodoMini from '../todo/TodoMini'
import MiniGear from '../gear/MiniGear'
import MiniGearFull from '../gear/MiniGearFull'
import MiniProjects from '../assignments/MiniProjects'
import MiniLauncher from '../launcher/MiniLauncher'
import MiniAgenda from '../agenda/MiniAgenda'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 各档位：网格单列最小宽度（让列数真正不同，宽度才随档位变化） */
const SCALE_COL: Record<'sm' | 'md' | 'lg', number> = { sm: 280, md: 340, lg: 460 }
/** 各档位：网格行高（≈课程表卡片高度；固定行高，卡片内部滚动，待办不随数量长高） */
const SCALE_ROW: Record<'sm' | 'md' | 'lg', number> = { sm: 212, md: 264, lg: 276 }

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
  const scale = uiStore.data?.overviewCardScale ?? 'md'

  const CARDS: CardDef[] = [
    { key: 'timetable', title: '本周课表', linkId: 'timetable', body: <MiniTimetable scale={scale} /> },
    { key: 'todo', title: '待办事项', linkId: 'todo', body: <TodoMini /> },
    { key: 'agenda', title: '日程（接下来）', linkId: 'agenda', body: <MiniAgenda /> },
    { key: 'projects', title: '正在进行的项目', linkId: 'assignments', body: <MiniProjects /> },
    { key: 'lent', title: '正处于外借的器材', linkId: 'gear', body: <MiniGear /> },
    { key: 'gear', title: '设备台账', linkId: 'gear', body: <MiniGearFull /> },
    { key: 'launcher', title: '快捷启动器', linkId: 'launcher', body: <MiniLauncher /> }
  ]

  const savedOrder = uiStore.data?.overviewCards
  const order = savedOrder && savedOrder.length ? savedOrder : CARDS.map((c) => c.key)
  const shown = order.map((k) => CARDS.find((c) => c.key === k)).filter((c): c is CardDef => !!c)

  const saveOrder = (keys: string[], nextScale: 'sm' | 'md' | 'lg'): void => {
    uiStore.save({
      background: uiStore.data?.background ?? DEFAULT_UI.background,
      overviewCards: keys,
      overviewCardScale: nextScale
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
        <section
          className="overview-blocks"
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(${SCALE_COL[scale]}px, 1fr))`,
            gridAutoRows: `${SCALE_ROW[scale]}px`
          }}
        >
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
          scale={scale}
          cardTitles={Object.fromEntries(CARDS.map((c) => [c.key, c.title]))}
          onSave={(keys, s) => {
            saveOrder(keys, s)
            setCustomOpen(false)
          }}
          onClose={() => setCustomOpen(false)}
        />
      )}
    </div>
  )
}

/* ================= 概览自定义卡片（显示/隐藏 + 拖拽排序 + 大小缩放） ================= */
function CustomizeModal({
  order,
  scale,
  cardTitles,
  onSave,
  onClose
}: {
  order: string[]
  scale: 'sm' | 'md' | 'lg'
  cardTitles: Record<string, string>
  onSave: (keys: string[], scale: 'sm' | 'md' | 'lg') => void
  onClose: () => void
}): React.JSX.Element {
  const [keys, setKeys] = useState([...order])
  const [nextScale, setNextScale] = useState<'sm' | 'md' | 'lg'>(scale)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const all = Object.keys(cardTitles)
  const hidden = all.filter((k) => !keys.includes(k))

  const move = (from: number, to: number): void => {
    if (from === null || to === from || from < 0 || from >= keys.length || to < 0 || to >= keys.length) return
    setKeys((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const removeKey = (k: string): void => setKeys((prev) => prev.filter((x) => x !== k))
  const addKey = (k: string): void => setKeys((prev) => (prev.includes(k) ? prev : [...prev, k]))

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div className="modal-card modal-wide" role="dialog" aria-modal="true" aria-label="自定义概览卡片" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal-title">概览页卡片</h3>

        <div className="field">
          <span className="field-label">卡片大小</span>
          <div className="seg">
            {([
              ['sm', '小'],
              ['md', '中'],
              ['lg', '大']
            ] as const).map(([k, lb]) => (
              <button key={k} className={`seg-btn${nextScale === k ? ' active' : ''}`} onClick={() => setNextScale(k)}>
                {lb}
              </button>
            ))}
          </div>
        </div>

        <p className="field-hint" style={{ margin: '4px 0 6px' }}>已显示的卡片（拖动 ⋮⋮ 排序）：</p>
        <div className="cust-drag-list">
          {keys.map((k, i) => (
            <div
              key={k}
              className={`cust-drag-row${dragIdx === i ? ' dragging' : ''}`}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragEnd={() => setDragIdx(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                move(dragIdx ?? -1, i)
                setDragIdx(null)
              }}
            >
              <span className="cust-drag" aria-hidden>⋮⋮</span>
              <label className="cust-check">
                <input type="checkbox" checked onChange={() => removeKey(k)} />
                <span>{cardTitles[k]}</span>
              </label>
            </div>
          ))}
          {keys.length === 0 && <div className="field-hint">（没有显示的卡片，可在下方勾选添加）</div>}
        </div>

        {hidden.length > 0 && (
          <>
            <p className="field-hint" style={{ margin: '10px 0 6px' }}>未显示的卡片（勾选即加入）：</p>
            <div className="cust-list">
              {hidden.map((k) => (
                <div key={k} className="cust-check-row">
                  <label className="cust-check">
                    <input type="checkbox" checked={false} onChange={() => addKey(k)} />
                    <span>{cardTitles[k]}</span>
                  </label>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal-actions">
          <div className="modal-actions-right">
            <button className="btn btn-ghost" onClick={onClose}>取消</button>
            <button className="btn btn-primary" onClick={() => onSave(keys, nextScale)}>保存布局</button>
          </div>
        </div>
      </div>
    </div>
  )
}
