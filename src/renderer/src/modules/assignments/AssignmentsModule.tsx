/**
 * 结课/项目管理：按课程记录项目，含截止倒计时与交付物路径（一键打开）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEscapeClose } from '../../core/useEscapeClose'
import { useStore } from '../../core/useStore'
import { daysUntil, dueLevel, shortPath, toDateStr } from '../../core/dates'
import {
  ASSIGN_NS,
  ASSIGN_TYPES,
  EMPTY_ASSIGN,
  createAssignId,
  type AssignState,
  type AssignStatus,
  type AssignmentItem
} from './model'

type StatusFilter = 'all' | AssignStatus

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'todo', label: '未开始' },
  { key: 'doing', label: '进行中' },
  { key: 'done', label: '已完成' }
]

interface Draft {
  id: string | null
  course: string
  title: string
  type: string
  due: string
  status: AssignStatus
  deliverablePath: string
  note: string
}

function blankDraft(): Draft {
  return {
    id: null,
    course: '',
    title: '',
    type: ASSIGN_TYPES[0],
    due: toDateStr(),
    status: 'todo',
    deliverablePath: '',
    note: ''
  }
}

export default function AssignmentsModule(): React.JSX.Element {
  const { ready, data, error, save } = useStore<AssignState>(ASSIGN_NS)
  const state = data ?? EMPTY_ASSIGN
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [shellErr, setShellErr] = useState('')
  const seeded = useRef(false)

  useEffect(() => {
    if (!ready || error || data !== null || seeded.current) return
    seeded.current = true
    save(EMPTY_ASSIGN)
  }, [ready, error, data, save])

  const courses = useMemo(
    () => Array.from(new Set(state.items.map((i) => i.course).filter(Boolean))).sort(),
    [state]
  )

  const counts = useMemo(() => {
    const c = { all: 0, todo: 0, doing: 0, done: 0 } as Record<StatusFilter, number>
    for (const i of state.items) c[i.status] += 1
    c.all = state.items.length
    return c
  }, [state])

  const visible = useMemo(() => {
    let list = filter === 'all' ? state.items : state.items.filter((i) => i.status === filter)
    const kw = q.trim().toLowerCase()
    if (kw) {
      list = list.filter((i) =>
        (i.title + ' ' + i.course + ' ' + i.type + ' ' + (i.note ?? '')).toLowerCase().includes(kw)
      )
    }
    // 未完成在前（按截止日升序），已完成沉底
    return [...list].sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1
      if (a.status !== 'done' && b.status === 'done') return -1
      if (a.status !== 'done') {
        const da = daysUntil(a.due) ?? 999999
        const db = daysUntil(b.due) ?? 999999
        return da - db
      }
      return (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt)
    })
  }, [state, filter, q])

  const saveDraft = (d: Draft): void => {
    if (!d.title.trim()) return
    save((prev) => {
      const item: AssignmentItem = {
        id: d.id ?? createAssignId(),
        course: d.course.trim(),
        title: d.title.trim(),
        type: d.type,
        due: d.due,
        status: d.status,
        deliverablePath: d.deliverablePath.trim() || undefined,
        note: d.note.trim() || undefined,
        createdAt: prev.items.find((i) => i.id === d.id)?.createdAt ?? Date.now(),
        completedAt: d.status === 'done' ? Date.now() : null
      }
      return {
        items: d.id
          ? prev.items.map((it) => (it.id === d.id ? item : it))
          : [...prev.items, item]
      }
    })
    setDraft(null)
  }

  const removeItem = (id: string): void => {
    save((prev) => ({ items: prev.items.filter((i) => i.id !== id) }))
    setDraft(null)
  }

  const setStatus = (id: string, status: AssignStatus): void => {
    save((prev) => ({
      items: prev.items.map((i) =>
        i.id === id ? { ...i, status, completedAt: status === 'done' ? Date.now() : null } : i
      )
    }))
  }

  const openPath = async (p: string): Promise<void> => {
    setShellErr('')
    const r = await window.workbench?.shell.openPath(p)
    if (r && !r.ok) setShellErr(`打不开 ${shortPath(p, 48)}：${r.error ?? '未知错误'}`)
  }

  const dueChip = (it: AssignmentItem): { text: string; cls: string } => {
    if (it.status === 'done') return { text: '✓ 已完成', cls: 'ok' }
    const n = daysUntil(it.due)
    if (n === null) return { text: '无期限', cls: '' }
    if (n < 0) return { text: `逾期 ${-n} 天`, cls: 'overdue' }
    if (n === 0) return { text: '今天截止', cls: 'today' }
    return { text: `剩 ${n} 天`, cls: dueLevel(it.due) === 'soon' ? 'soon' : '' }
  }

  return (
    <div className="module">
      <div className="toolbar">
        <div className="seg">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`seg-btn${filter === f.key ? ' active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="seg-count">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <input className="search-input" placeholder="搜索项目 / 课程 / 类型…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn btn-primary" onClick={() => setDraft(blankDraft())}>
            ＋ 新项目
          </button>
        </div>
      </div>

      {error && <div className="banner banner-error">读取项目数据失败：{error}</div>}
      {shellErr && <div className="banner banner-error">{shellErr}</div>}

      {ready && state.items.length === 0 && (
        <div className="empty-note">还没有项目记录。把结课作品、混音项目都收进来吧～</div>
      )}

      {visible.length === 0 && state.items.length > 0 && (
        <div className="empty-note">这个分类下暂无项目。</div>
      )}

      <div className="k-list">
        {visible.map((it) => {
          const chip = dueChip(it)
          return (
            <div key={it.id} className={`k-row${it.status === 'done' ? ' done' : ''}`}>
              <div className="k-main">
                <div className="k-title-line">
                  <span className="k-title">{it.title}</span>
                  {it.course && <span className="tag tag-course">{it.course}</span>}
                  <span className={`tag${chip.cls ? ' tag-' + chip.cls : ''}`}>{chip.text}</span>
                </div>
                {it.note && <div className="k-sub">{it.note}</div>}
                {it.deliverablePath && (
                  <div className="k-sub k-path" title={it.deliverablePath}>
                    📎 {shortPath(it.deliverablePath)}
                  </div>
                )}
              </div>
              <div className="k-actions">
                {it.status !== 'done' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setStatus(it.id, 'done')}
                    title="标记为已完成"
                  >
                    ✓ 完成
                  </button>
                )}
                {it.status === 'done' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setStatus(it.id, 'doing')}
                    title="重新打开"
                  >
                    ↺ 重开
                  </button>
                )}
                {it.deliverablePath && (
                  <button className="btn btn-ghost btn-sm" onClick={() => openPath(it.deliverablePath!)}>
                    打开交付物
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setDraft({
                      id: it.id,
                      course: it.course,
                      title: it.title,
                      type: it.type,
                      due: it.due,
                      status: it.status,
                      deliverablePath: it.deliverablePath ?? '',
                      note: it.note ?? ''
                    })
                  }
                >
                  编辑
                </button>
                <button
                  className="btn btn-danger-ghost btn-sm"
                  onClick={() => removeItem(it.id)}
                  title="删除"
                >
                  删除
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {draft && (
        <AssignEditor
          draft={draft}
          courses={courses}
          onSave={(d) => saveDraft(d)}
          onDelete={draft.id ? () => removeItem(draft.id!) : undefined}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  )
}

/* ================= 编辑弹窗 ================= */

function AssignEditor({
  draft,
  courses,
  onSave,
  onDelete,
  onClose
}: {
  draft: Draft
  courses: string[]
  onSave: (d: Draft) => void
  onDelete?: () => void
  onClose: () => void
}): React.JSX.Element {
  const [d, setD] = useState<Draft>(draft)
  const [err, setErr] = useState('')

  useEscapeClose(onClose)

  const pick = async (dir: boolean): Promise<void> => {
    const r = dir ? await window.workbench?.shell.pickDir() : await window.workbench?.shell.pickFile()
    if (r?.ok && r.path) setD({ ...d, deliverablePath: r.path })
  }

  const submit = (): void => {
    if (!d.title.trim()) {
      setErr('项目名称不能为空')
      return
    }
    onSave(d)
  }

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={d.id ? '编辑项目' : '新建项目'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{d.id ? '编辑项目' : '新项目'}</h3>

        <label className="field">
          <span className="field-label">课程（可输入新课程名）</span>
          <input
            className="text-input"
            list="assign-courses"
            value={d.course}
            onChange={(e) => setD({ ...d, course: e.target.value })}
          />
          <datalist id="assign-courses">
            {courses.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label className="field">
          <span className="field-label">项目名称</span>
          <input
            autoFocus
            className="text-input"
            value={d.title}
            onChange={(e) => setD({ ...d, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') submit()
            }}
          />
        </label>

        <div className="field">
          <span className="field-label">类型</span>
          <div className="chip-row">
            {ASSIGN_TYPES.map((t) => (
              <button
                key={t}
                className={`chip${d.type === t ? ' active' : ''}`}
                onClick={() => setD({ ...d, type: t })}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <span className="field-label">状态</span>
            <div className="chip-row">
              {(['todo', 'doing', 'done'] as const).map((s) => (
                <button
                  key={s}
                  className={`chip${d.status === s ? ' active' : ''}`}
                  onClick={() => setD({ ...d, status: s })}
                >
                  {s === 'todo' ? '未开始' : s === 'doing' ? '进行中' : '已完成'}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field-label">截止日期</span>
            <input
              type="date"
              className="text-input"
              value={d.due}
              onChange={(e) => setD({ ...d, due: e.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <span className="field-label">交付物路径（工程 / 成品，可留空）</span>
          <div className="path-pick-row">
            <input
              className="text-input"
              value={d.deliverablePath}
              onChange={(e) => setD({ ...d, deliverablePath: e.target.value })}
            />
            <button className="btn btn-ghost btn-sm" onClick={() => pick(false)} title="选文件">
              文件…
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => pick(true)} title="选文件夹">
              文件夹…
            </button>
            {d.deliverablePath && (
              <button className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, deliverablePath: '' })}>
                清除
              </button>
            )}
          </div>
        </div>

        <label className="field">
          <span className="field-label">备注</span>
          <textarea
            className="text-input ta"
            rows={3}
            value={d.note}
            onChange={(e) => setD({ ...d, note: e.target.value })}
          />
        </label>

        {err && <div className="field-error">{err}</div>}

        <div className="modal-actions">
          {onDelete && (
            <button className="btn btn-danger-ghost" onClick={onDelete}>
              删除
            </button>
          )}
          <div className="modal-actions-right">
            <button className="btn btn-ghost" onClick={onClose}>
              取消
            </button>
            <button className="btn btn-primary" onClick={submit}>
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
