/**
 * 概览页「快捷启动器」卡片：最近使用优先，点条目直接打开，点「去启动器」进完整模块。
 */
import { useMemo } from 'react'
import { useStore } from '../../core/useStore'
import { useShell } from '../../core/shell'
import { LAUNCHER_NS, LAUNCH_KINDS, type LauncherItem, type LauncherState } from './model'

function kindOf(kind: LauncherItem['kind']): { icon: string; label: string } {
  const k = LAUNCH_KINDS.find((x) => x.key === kind)
  return { icon: k?.icon ?? '📁', label: k?.label ?? '' }
}

export default function MiniLauncher(): React.JSX.Element {
  const { ready, data, error, save } = useStore<LauncherState>(LAUNCHER_NS)
  const { navigate } = useShell()

  const items = useMemo(
    () =>
      (data?.items ?? []).sort(
        (a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.createdAt - a.createdAt
      ),
    [data]
  )
  const shown = items.slice(0, 8)

  const open = async (it: LauncherItem): Promise<void> => {
    const r =
      it.kind === 'url'
        ? await window.workbench?.shell.openExternal(it.target)
        : await window.workbench?.shell.openPath(it.target)
    if (r && !r.ok) return
    save((prev) => ({
      items: prev.items.map((i) => (i.id === it.id ? { ...i, lastOpenedAt: Date.now() } : i))
    }))
  }

  return (
    <div className="ov-card">
      <div className="ov-card-main">
        {error && <div className="ov-empty">启动器数据读取失败</div>}
        {!ready && !error && <div className="ov-empty">加载中…</div>}
        {ready && !error && items.length === 0 && <div className="ov-empty">还没有快捷项 🚀</div>}
        {ready &&
          !error &&
          shown.map((it) => {
            const k = kindOf(it.kind)
            return (
              <div key={it.id} className="ov-li" title={it.target} onClick={() => void open(it)}>
                <div className="ov-li-top">
                  <span className="ov-li-ic">{k.icon}</span>
                  <span className="ov-li-title">{it.name}</span>
                  <span className="tag tag-course">{k.label}</span>
                </div>
                {it.note && <div className="ov-li-sub">{it.note}</div>}
              </div>
            )
          })}
        {items.length > shown.length && (
          <div className="ov-more">
            还有 {items.length - shown.length} 项 ·
            <button className="link-btn" onClick={() => navigate('launcher')}>
              去启动器
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
