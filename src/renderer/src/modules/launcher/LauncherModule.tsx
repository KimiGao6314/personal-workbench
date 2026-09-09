/**
 * 工程与素材快捷启动器：常开工程/文件夹/软件/链接一键打开，最近使用优先。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEscapeClose } from '../../core/useEscapeClose'
import { useStore } from '../../core/useStore'
import { baseName, shortPath } from '../../core/dates'
import {
  EMPTY_LAUNCHER,
  LAUNCHER_NS,
  LAUNCH_KINDS,
  createLauncherId,
  type LauncherItem,
  type LauncherState,
  type LaunchKind
} from './model'

const KIND_LABEL: Record<LaunchKind, string> = { project: '工程',
  folder: '文件夹',
  app: '软件',
  url: '链接'
}

interface Draft {
  id: string | null
  name: string
  kind: LaunchKind
  target: string
  note: string
}

function blankDraft(): Draft {
  return { id: null, name: '', kind: 'project', target: '', note: '' }
}

export default function LauncherModule(): React.JSX.Element {
  const { ready, data, error, save } = useStore<LauncherState>(LAUNCHER_NS)
  const state = data ?? EMPTY_LAUNCHER
  const [kind, setKind] = useState<LaunchKind>('project')
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [shellErr, setShellErr] = useState('')
  const seeded = useRef(false)

  useEffect(() => {
    if (!ready || error || data !== null || seeded.current) return
    seeded.current = true
    save(EMPTY_LAUNCHER)
  }, [ready, error, data, save])

  const counts = useMemo(() => {
    const c: Record<LaunchKind, number> = { project: 0, folder: 0, app: 0, url: 0 }
    for (const i of state.items) c[i.kind] += 1
    return c
  }, [state])

  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return [...state.items]
      .filter((i) => i.kind === kind)
      .filter((i) =>
        kw
          ? (i.name + ' ' + i.target + ' ' + (i.note ?? '')).toLowerCase().includes(kw)
          : true
      )
      .sort((a, b) => {
        // 最近打开优先，没开过的按创建时间
        const ta = a.lastOpenedAt ?? 0
        const tb = b.lastOpenedAt ?? 0
        if (ta !== tb) return tb - ta
        return b.createdAt - a.createdAt
      })
  }, [state, kind, q])

  const touchError = (prefix: string, err?: string): void => {
    setShellErr(`${prefix}：${err ?? '失败'}`)
  }

  const openItem = async (it: LauncherItem): Promise<void> => {
    setShellErr('')
    let r: { ok: boolean; error?: string } | undefined
    if (it.kind === 'url') {
      r = await window.workbench?.shell.openExternal(it.target)
    } else {
      r = await window.workbench?.shell.openPath(it.target)
    }
    if (r && !r.ok) {
      touchError(`打不开「${it.name}」`, r.error)
      return
    }
    // 记录最近打开
    save((prev) => ({
      items: prev.items.map((i) => (i.id === it.id ? { ...i, lastOpenedAt: Date.now() } : i))
    }))
  }

  const reveal = async (it: LauncherItem): Promise<void> => {
    setShellErr('')
    const r = await window.workbench?.shell.showInFolder(it.target)
    if (r && !r.ok) touchError(`Finder 定位失败`, r.error)
  }

  const saveDraft = (d: Draft): void => {
    if (!d.name.trim() || !d.target.trim()) return
    save((prev) => {
      const item: LauncherItem = {
        id: d.id ?? createLauncherId(),
        name: d.name.trim(),
        kind: d.kind,
        target: d.target.trim(),
        note: d.note.trim() || undefined,
        lastOpenedAt: prev.items.find((i) => i.id === d.id)?.lastOpenedAt ?? null,
        createdAt: prev.items.find((i) => i.id === d.id)?.createdAt ?? Date.now()
      }
      return {
        items: d.id
          ? prev.items.map((it) => (it.id === d.id ? item : it))
          : [item, ...prev.items]
      }
    })
    setDraft(null)
  }

  const removeItem = (id: string): void => {
    save((prev) => ({ items: prev.items.filter((i) => i.id !== id) }))
    setDraft(null)
  }

  return (
    <div className="module">
      <div className="toolbar">
        <div className="seg">
          {LAUNCH_KINDS.map((k) => (
            <button
              key={k.key}
              className={`seg-btn${kind === k.key ? ' active' : ''}`}
              onClick={() => setKind(k.key)}
            >
              {k.icon} {k.label}
              <span className="seg-count">{counts[k.key]}</span>
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <input
            className="search-input"
            placeholder="搜索名称 / 路径 / 备注…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => setDraft(blankDraft())}>
            ＋ 添加快捷
          </button>
        </div>
      </div>

      {error && <div className="banner banner-error">读取数据失败：{error}</div>}
      {shellErr && <div className="banner banner-error">{shellErr}</div>}

      {ready && state.items.length === 0 && (
        <div className="empty-note">
          还没有快捷条目。把你常用的 DAW 工程、音色库文件夹、软件都加进来，一键直达。
        </div>
      )}
      {visible.length === 0 && state.items.length > 0 && (
        <div className="empty-note">没有匹配的条目。</div>
      )}

      <div className="k-list">
        {visible.map((it) => {
          const meta = LAUNCH_KINDS.find((k) => k.key === it.kind) ?? LAUNCH_KINDS[0]
          return (
            <div key={it.id} className="k-row">
              <span className="k-ic" aria-hidden>
                <span className="k-ic-emoji">{meta.icon}</span>
              </span>
              <div className="k-main">
                <div className="k-title-line">
                  <span className="k-title">{it.name}</span>
                  <span className="tag">{KIND_LABEL[it.kind]}</span>
                  {it.lastOpenedAt && <span className="k-recent">最近使用</span>}
                </div>
                <div className="k-sub k-path" title={it.target}>
                  {it.kind === 'url' ? it.target : shortPath(it.target)}
                </div>
                {it.note && <div className="k-sub">{it.note}</div>}
              </div>
              <div className="k-actions">
                <button className="btn btn-primary btn-sm" onClick={() => openItem(it)}>
                  {it.kind === 'url' ? '打开链接' : '打开'}
                </button>
                {it.kind !== 'url' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => reveal(it)} title="在 Finder 中显示">
                    Finder
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setDraft({
                      id: it.id,
                      name: it.name,
                      kind: it.kind,
                      target: it.target,
                      note: it.note ?? ''
                    })
                  }
                >
                  编辑
                </button>
                <button
                  className="btn btn-danger-ghost btn-sm"
                  onClick={() => removeItem(it.id)}
                >
                  删除
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {draft && (
        <LauncherEditor
          draft={draft}
          onSave={(d) => saveDraft(d)}
          onDelete={draft.id ? () => removeItem(draft.id!) : undefined}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  )
}

/* ================= 编辑弹窗 ================= */

function LauncherEditor({
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

  useEscapeClose(onClose)

  const pick = async (dir: boolean): Promise<void> => {
    const r = dir ? await window.workbench?.shell.pickDir() : await window.workbench?.shell.pickFile()
    if (r?.ok && r.path) setD({ ...d, target: r.path })
  }

  const submit = (): void => {
    if (!d.name.trim()) {
      setErr('名称不能为空')
      return
    }
    if (!d.target.trim()) {
      setErr('请填写路径或链接')
      return
    }
    if (d.kind === 'url' && !/^https?:\/\//i.test(d.target.trim())) {
      setErr('链接需以 http:// 或 https:// 开头')
      return
    }
    onSave(d)
  }

  const browse = d.kind === 'url'

  return (
    <div className="modal-mask" onMouseDown={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={d.id ? '编辑快捷' : '添加快捷'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{d.id ? '编辑快捷' : '添加快捷'}</h3>

        <div className="field">
          <span className="field-label">类型</span>
          <div className="chip-row">
            {LAUNCH_KINDS.map((k) => (
              <button
                key={k.key}
                className={`chip${d.kind === k.key ? ' active' : ''}`}
                onClick={() => setD({ ...d, kind: k.key, target: '' })}
              >
                {k.icon} {k.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">名称</span>
          <input
            autoFocus
            className="text-input"
            value={d.name}
            onChange={(e) => setD({ ...d, name: e.target.value })}
          />
        </label>

        <div className="field">
          <span className="field-label">
            {d.kind === 'url' ? '网址' : d.kind === 'app' ? '应用路径' : '本地路径'}
          </span>
          <div className="path-pick-row">
            <input
              className="text-input"
              value={d.target}
              onChange={(e) => setD({ ...d, target: e.target.value })}
            />
            {!browse && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => pick(false)} title="选文件">
                  {d.kind === 'app' ? '选应用…' : '文件…'}
                </button>
                {d.kind !== 'app' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => pick(true)} title="选文件夹">
                    文件夹…
                  </button>
                )}
              </>
            )}
            {!browse && d.target && (
              <span className="k-path-sm" title={d.target}>
                {baseName(d.target)}
              </span>
            )}
          </div>
        </div>

        <label className="field">
          <span className="field-label">备注（用途 / 说明，可留空）</span>
          <textarea
            className="text-input ta"
            rows={2}
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
