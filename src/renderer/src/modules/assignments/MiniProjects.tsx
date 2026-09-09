/**
 * 概览页「正在进行的项目」：来自项目管理（原作业管理）中未完成的项目。
 */
import { useMemo } from 'react'
import { useStore } from '../../core/useStore'
import { useShell } from '../../core/shell'
import { daysUntil, dueLevel } from '../../core/dates'
import { ASSIGN_NS, type AssignState } from './model'

function dueInfo(due: string): { text: string; cls: string } {
  const n = daysUntil(due)
  if (n === null) return { text: '无期限', cls: '' }
  if (n < 0) return { text: `逾期 ${-n} 天`, cls: 'overdue' }
  if (n === 0) return { text: '今天截止', cls: 'today' }
  if (dueLevel(due) === 'soon') return { text: `剩 ${n} 天`, cls: 'soon' }
  return { text: `剩 ${n} 天`, cls: '' }
}

export default function MiniProjects(): React.JSX.Element {
  const { ready, data, error, save } = useStore<AssignState>(ASSIGN_NS)
  const { navigate } = useShell()

  const open = useMemo(() => {
    return (data?.items ?? [])
      .filter((i) => i.status !== 'done')
      .sort((a, b) => {
        const da = daysUntil(a.due) ?? 999999
        const db = daysUntil(b.due) ?? 999999
        return da - db
      })
  }, [data])
  const shown = open.slice(0, 5)

  const complete = (id: string): void => {
    save((prev) => ({
      items: prev.items.map((i) =>
        i.id === id ? { ...i, status: 'done', completedAt: Date.now() } : i
      )
    }))
  }

  return (
    <div className="ov-card">
      <div className="ov-card-main">
        {error && <div className="ov-empty">项目数据读取失败</div>}
        {!ready && !error && <div className="ov-empty">加载中…</div>}
        {ready && !error && open.length === 0 && (
          <div className="ov-empty">没有进行中的项目，可以歇口气 🎉</div>
        )}
        {ready &&
          !error &&
          shown.map((p) => {
            const due = dueInfo(p.due)
            return (
              <div
                key={p.id}
                className="ov-li"
                onClick={() => navigate('assignments')}
                title="打开项目管理"
              >
                <div className="ov-li-top">
                  <span className="ov-li-title">{p.title}</span>
                  {p.course && <span className="tag tag-course">{p.course}</span>}
                  <button
                    className="ov-act"
                    onClick={(e) => {
                      e.stopPropagation()
                      complete(p.id)
                    }}
                  >
                    ✓ 完成
                  </button>
                </div>
                <div className={`ov-li-sub${due.cls ? ' due-' + due.cls : ''}`}>
                  {due.text}
                  {p.type ? ` · ${p.type}` : ''}
                </div>
              </div>
            )
          })}
        {open.length > 5 && (
          <div className="ov-more">
            还有 {open.length - 5} 个项目 ·
            <button className="link-btn" onClick={() => navigate('assignments')}>
              去项目管理
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
