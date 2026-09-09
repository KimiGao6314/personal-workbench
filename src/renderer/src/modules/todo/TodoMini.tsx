/**
 * 概览页用的「待办事项」迷你面板：
 * - 展示进行中的任务（最多 6 条，最近添加在前）
 * - 可直接勾选完成 / 快捷添加新任务 / 点条目进完整待办
 */
import { useRef, useState } from 'react'
import { useStore } from '../../core/useStore'
import { useShell } from '../../core/shell'
import { TODO_NS, countTodo, createTodo, isDoneForToday, toggleItemDone, type TodoState } from './model'

const MAX_SHOW = 6

export default function TodoMini(): React.JSX.Element {
  const { ready, data, error, save } = useStore<TodoState>(TODO_NS)
  const { navigate } = useShell()
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const counts = countTodo(data)
  const active = (data?.items ?? [])
    .filter((it) => !isDoneForToday(it))
    .sort((a, b) => b.createdAt - a.createdAt)
  const shown = active.slice(0, MAX_SHOW)
  const hiddenMore = active.length - shown.length

  const toggle = (id: string): void => {
    save((prev) => ({ items: prev.items.map((it) => (it.id === id ? toggleItemDone(it) : it)) }))
  }

  const add = (): void => {
    const text = draft.trim()
    if (!text || !ready) return
    const item = createTodo({ text })
    if (data === null) {
      save({ items: [item] })
    } else {
      save((prev) => ({ items: [item, ...prev.items] }))
    }
    setDraft('')
    inputRef.current?.focus()
  }

  /** 一键完成当前所有未完成待办 */
  const completeAll = (): void => {
    save((prev) => ({ items: prev.items.map((it) => (isDoneForToday(it) ? it : toggleItemDone(it))) }))
  }

  return (
    <div className="todo-mini">
      <div className="todo-mini-main">
        {error && <div className="mini-sched-msg">待办数据读取失败</div>}

        {!ready && !error && <div className="mini-sched-msg">待办加载中…</div>}

        {ready && !error &&
          (active.length === 0 ? (
            <div className="mini-sched-msg">
              <span>没有进行中的任务 🌱</span>
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <button className="btn btn-primary btn-sm mini-all-btn" onClick={completeAll}>
                  ✓ 全部完成
                </button>
              )}
              <ul className="todo-mini-list">
                {shown.map((it) => (
                  <li key={it.id} className="todo-mini-row" onClick={() => toggle(it.id)}>
                    <button
                      className="todo-check"
                      aria-label={`完成：${it.text}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(it.id)
                      }}
                    />
                    <span
                      className="todo-mini-text"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate('todo')
                      }}
                      title="打开完整待办"
                    >
                      {it.daily && '🔄 '}{it.text}{it.person ? `（${it.person}）` : ''}
                    </span>
                  </li>
                ))}
              </ul>

              {hiddenMore > 0 && (
                <div className="todo-mini-more">
                  还有 {hiddenMore} 项未显示 ·
                  <button className="link-btn" onClick={() => navigate('todo')}>
                    查看全部
                  </button>
                </div>
              )}
            </>
          ))}
      </div>

      <div className="todo-mini-add">
        <input
          ref={inputRef}
          className="todo-mini-input"
          value={draft}
          disabled={!ready}
          placeholder="加一条待办，回车确认…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') add()
          }}
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={!ready || !draft.trim()}
          onClick={add}
        >
          添加
        </button>
      </div>

      {ready && counts.total > 0 && (
        <div className="todo-mini-foot">共 {counts.total} 项</div>
      )}
    </div>
  )
}
