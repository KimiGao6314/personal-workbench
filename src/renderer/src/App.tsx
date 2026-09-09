/**
 * 应用外壳：侧边栏 + 内容区 + 模块渲染。
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getModule, MODULES } from './core/registry'
import { ShellContext, useShell, type ShellValue } from './core/shell'
import { useStore } from './core/useStore'
import BackgroundPicker from './core/BackgroundPicker'
import { DEFAULT_UI, UI_NS, type UiSettings } from './core/uiSettings'
import { TODO_NS, type TodoState } from './modules/todo/model'
import { APP_VERSION, THANKS_LIST, THANKS_NOTE } from './core/version'

const ACTIVE_KEY = 'pw:active-module'
const FALLBACK_ID = 'overview'

function useActiveModule(): [string, (id: string) => void] {
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = localStorage.getItem(ACTIVE_KEY)
    return saved && MODULES.some((m) => m.id === saved) ? saved : FALLBACK_ID
  })
  const navigate = (id: string): void => {
    setActiveId(id)
    localStorage.setItem(ACTIVE_KEY, id)
  }
  return [activeId, navigate]
}

/** 顶栏时钟（每秒刷新） */
function useClock(): { time: string; date: string } {
  const [clock, setClock] = useState({ time: '', date: '' })
  useEffect(() => {
    const fmt = (): { time: string; date: string } => {
      const d = new Date()
      const p = (n: number): string => String(n).padStart(2, '0')
      const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
      return {
        time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
        date: `${d.getMonth() + 1}月${d.getDate()}日 周${week}`
      }
    }
    setClock(fmt())
    const t = window.setInterval(() => setClock(fmt()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return clock
}

/** 是否处于全屏（主进程通过 <html data-fullscreen> 通知） */
function useFullscreen(): boolean {
  const [fs, setFs] = useState(() => document.documentElement.dataset.fullscreen === '1')
  useEffect(() => {
    const el = document.documentElement
    const update = (): void => setFs(el.dataset.fullscreen === '1')
    const ob = new MutationObserver(update)
    ob.observe(el, { attributes: true, attributeFilter: ['data-fullscreen'] })
    return () => ob.disconnect()
  }, [])
  return fs
}

function Sidebar(): React.JSX.Element {
  const { activeId, navigate, platform } = useShell()
  const [bgOpen, setBgOpen] = useState(false)
  const [thanksOpen, setThanksOpen] = useState(false)
  const fs = useFullscreen()
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          ✦
        </div>
        <div className="brand-text">
          <div className="brand-name">
            我的工作台
            <span className="brand-beta" title="当前为测试版本">Beta</span>
            <span className="brand-ver">{APP_VERSION}</span>
          </div>
          <div className="brand-sub">personal workbench</div>
        </div>
      </div>

      <nav className="nav" aria-label="模块导航">
        {MODULES.map((m) => (
          <button
            key={m.id}
            className={`nav-item${activeId === m.id ? ' active' : ''}`}
            onClick={() => navigate(m.id)}
            title={m.description}
          >
            <span className="nav-ic">{m.icon}</span>
            <span className="nav-title">{m.title}</span>
            {m.badge ? <m.badge /> : null}
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        {fs && (
          <button
            className="btn btn-ghost btn-sm fs-exit"
            onClick={() => void window.workbench?.shell.toggleFullscreen()}
            title="退出全屏"
          >
            ⤢ 退出全屏
          </button>
        )}
        <button className="btn btn-ghost btn-sm bg-btn" onClick={() => setBgOpen(true)}>
          🖼 自定义背景…
        </button>
        <div className="foot-row">数据仅存于本机 · userData/data</div>
        <div className="foot-row">
          Electron {window.workbench?.versions.electron ?? '—'} · {platform === 'darwin' ? 'macOS' : platform}
        </div>
        <div className="foot-row foot-thanks">
          <button className="foot-link" onClick={() => setThanksOpen(true)} title="查看致谢名单">
            致谢名单
          </button>
        </div>
      </div>

      {thanksOpen &&
        createPortal(
          <div className="modal-mask" onMouseDown={() => setThanksOpen(false)}>
            <div className="modal-card modal-sm" role="dialog" aria-modal="true" aria-label="致谢名单" onMouseDown={(e) => e.stopPropagation()}>
              <h3 className="modal-title">🎉 致谢名单</h3>
              <p className="field-hint" style={{ marginBottom: 12 }}>{THANKS_NOTE}：</p>
              <ul className="thanks-list">
                {THANKS_LIST.map((n) => (
                  <li key={n} className="thanks-item">{n}</li>
                ))}
              </ul>
              <div className="modal-actions">
                <div className="modal-actions-right">
                  <button className="btn btn-primary" onClick={() => setThanksOpen(false)}>好的</button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {bgOpen && createPortal(<BackgroundPicker onClose={() => setBgOpen(false)} />, document.body)}
    </aside>
  )
}

/** 内容区顶栏：当前模块图标/标题/描述 + 时钟；整条可拖拽移动窗口 */
function ContentHeader(): React.JSX.Element {
  const { activeId } = useShell()
  const clock = useClock()
  const m = getModule(activeId)
  return (
    <header className="content-head">
      <div className="head-icon">{m.icon}</div>
      <div className="head-text">
        <h2 className="head-title">{m.title}</h2>
        <p className="head-desc">{m.description}</p>
      </div>
      <div className="head-clock">
        <span className="clk-time">{clock.time}</span>
        <span className="clk-date">{clock.date}</span>
      </div>
    </header>
  )
}

export default function App(): React.JSX.Element {
  const [activeId, navigate] = useActiveModule()
  const Active = getModule(activeId).component
  const platform = window.workbench?.platform ?? 'web'

  // 自定义背景：读 ui 设置 → 载入图片 → 应用到整个 shell
  const uiStore = useStore<UiSettings>(UI_NS)
  const bg = uiStore.data?.background ?? DEFAULT_UI.background
  const [bgUrl, setBgUrl] = useState<string | null>(null)

  useEffect(() => {
    const file = bg.file
    if (!file) {
      setBgUrl(null)
      return
    }
    let live = true
    void (async () => {
      const r = await window.workbench?.bg.read(file)
      if (live && r?.ok && r.dataUrl) setBgUrl(r.dataUrl)
    })()
    return () => {
      live = false
    }
  }, [bg.file])

  const todoSt = useStore<TodoState>(TODO_NS)

  // 待办提醒调度：只要 App 运行，到点弹系统通知（每 20 秒检查一次）
  useEffect(() => {
    const items = todoSt.data?.items ?? []
    const check = (): void => {
      const now = Date.now()
      let due = 0
      for (const it of items) {
        if (it.done) continue
        if (it.reminded) continue
        if (!it.remindAt) continue
        const t = new Date(it.remindAt).getTime()
        if (Number.isFinite(t) && t <= now) {
          due++
          void window.workbench?.notify.show(
            '待办提醒',
            `「${it.text}」到时间啦${due > 1 ? `（还有 ${due - 1} 条稍后提醒）` : ''}`
          )
        }
      }
      if (due) {
        todoSt.save((prev) => ({
          items: prev.items.map((it) =>
            !it.done && !it.reminded && it.remindAt && new Date(it.remindAt).getTime() <= Date.now()
              ? { ...it, reminded: true }
              : it
          )
        }))
      }
    }
    check()
    const t = window.setInterval(check, 20000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todoSt.data])

  const bgStyle =
    bgUrl && bg.blur > 0
      ? {
          backgroundImage: `url(${bgUrl})`,
          filter: `blur(${bg.blur}px)`
        }
      : { backgroundImage: bgUrl ? `url(${bgUrl})` : undefined }

  // ⌘/Ctrl + 数字键 快速切换模块（输入框聚焦时不触发）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const idx = Number(e.key) - 1
      if (idx >= 0 && idx < MODULES.length) {
        e.preventDefault()
        navigate(MODULES[idx].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  // 全局：弹窗 Tab 焦点圈闭（避免焦点跳到弹窗外）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.modal-card')).filter(
        (el) => el.getClientRects().length > 0
      )
      if (!cards.length) return
      const card = cards[cards.length - 1]
      const focusables = Array.from(
        card.querySelectorAll<HTMLElement>(
          'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0)
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      const inside = active !== null && card.contains(active)
      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (!inside || active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const value: ShellValue = { activeId, navigate, platform }

  return (
    <ShellContext.Provider value={value}>
      <div className={`shell${bgUrl ? ' bg-on' : ''}`}>
        {/* 背景图（+模糊）与压暗层，位于内容之下 */}
        <div className="bg-layer" style={bgStyle} />
        {bgUrl && <div className="bg-scrim" style={{ opacity: bg.dim }} />}
        <Sidebar />
        <main className="content">
          <ContentHeader />
          <div className="page">
            <Active key={activeId} />
          </div>
        </main>
      </div>
    </ShellContext.Provider>
  )
}
