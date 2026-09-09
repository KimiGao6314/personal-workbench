/**
 * 外借历史面板：挂在设备台账页底部。
 * - 按时间倒序展示所有借出记录（含照片证据）
 * - 可补传照片、登记归还、删除误录
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../core/useStore'
import { loadPhoto, pickPhotos, deletePhoto } from '../../core/photo'
import { GEAR_NS, type GearState } from './model'
import {
  EMPTY_HISTORY,
  GEAR_HISTORY_NS,
  closeRecordForGear,
  fmtWhen,
  type HistoryState,
  type LendRecord
} from './historyModel'

/** 每张照片的展示缓存：name -> dataUrl */
const photoCache = new Map<string, string>()

export default function HistoryPanel(): React.JSX.Element {
  const { ready: gr, save: gsave } = useStore<GearState>(GEAR_NS)
  const { ready: hr, data: hdata, save: hsave } = useStore<HistoryState>(GEAR_HISTORY_NS)
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [viewer, setViewer] = useState<string | null>(null)
  const seeded = useRef(false)

  // 历史首启建空结构
  useEffect(() => {
    if (!hr || hdata !== null || seeded.current) return
    seeded.current = true
    hsave(EMPTY_HISTORY)
  }, [hr, hdata, hsave])

  const records = useMemo(() => {
    const list = [...(hdata?.records ?? [])]
    list.sort((a, b) => b.lentAt - a.lentAt)
    return list
  }, [hdata])

  const openCount = records.filter((r) => r.returnedAt === null).length

  // 惰性加载未展示的照片
  useEffect(() => {
    const names = new Set<string>()
    for (const r of records) for (const n of r.photos) names.add(n)
    for (const n of names) {
      if (photoCache.has(n) || photos[n] !== undefined) continue
      void (async () => {
        const d = await loadPhoto(n)
        if (d) {
          photoCache.set(n, d)
          setPhotos((prev) => ({ ...prev, [n]: d }))
        }
      })()
    }
  }, [records, photos])

  const finalize = (rec: LendRecord): void => {
    const now = Date.now()
    // 结清历史记录 + 把设备改回闲置并清备注
    hsave((prev) => ({ records: closeRecordForGear(prev.records, rec.gearId, now) }))
    gsave((prev) => ({
      items: prev.items.map((g) =>
        g.id === rec.gearId ? { ...g, status: 'idle', note: undefined } : g
      )
    }))
  }

  const deleteRec = (id: string): void => {
    const rec = (hdata?.records ?? []).find((r) => r.id === id)
    if (!rec) return

    // 借出中的记录不允许删除：会因对账被重建，且绝不能误删证据照片
    if (rec.returnedAt === null) {
      window.alert('这条记录仍在借出中。\n\n请先在记录上点「✓ 登记归还」，再删除记录；照片是证据，不会被误删。')
      return
    }

    const sure = window.confirm(
      `将删除记录「${rec.gearName} → ${rec.person}」及其 ${rec.photos.length} 张照片，确定删除？`
    )
    if (!sure) return

    // 回收照片文件后移除记录
    if (rec.photos.length) {
      void Promise.all(rec.photos.map((n) => deletePhoto(n)))
    }
    hsave((prev) => ({ records: prev.records.filter((r) => r.id !== id) }))
  }

  const addPhotos = async (rec: LendRecord, files: FileList | null): Promise<void> => {
    const picked = await pickPhotos(files)
    if (!picked.length) return
    hsave((prev) => ({
      records: prev.records.map((r) =>
        r.id === rec.id ? { ...r, photos: [...r.photos, ...picked.map((p) => p.name)] } : r
      )
    }))
  }

  const view = (name: string): void => {
    const d = photos[name]
    if (d) setViewer(d)
  }

  return (
    <div className="gh-panel">
      <div className="duo-head">
        <h2 className="section-title">
          外借记录
          {openCount > 0 && <span className="gh-badge">借出中 {openCount}</span>}
        </h2>
        {!gr && <span className="gh-note">加载中…</span>}
      </div>

      {records.length === 0 ? (
        <div className="gh-empty">
          还没有外借记录。在设备上点「借出…」登记后，这里会自动出现历史。
        </div>
      ) : (
        <div className="gh-list">
          {records.map((rec) => {
            const open = rec.returnedAt === null
            return (
              <div key={rec.id} className="gh-card">
                <div className="gh-top">
                  <div className="gh-name">
                    {rec.gearName}
                    <span className="tag tag-course">{rec.category}</span>
                  </div>
                  <span className={`tag${open ? ' tag-today' : ' tag-ok'}`}>
                    {open ? '借出中' : `已归还`}
                  </span>
                </div>
                <div className="gh-meta">
                  👤 {rec.person} · 借出 {fmtWhen(rec.lentAt)}
                  {open && rec.due ? ` · 预计 ${rec.due} 还` : ''}
                  {!open && ` → 归还 ${fmtWhen(rec.returnedAt!)}`}
                </div>
                {rec.note && <div className="gh-note">{rec.note}</div>}

                {rec.photos.length > 0 && (
                  <div className="gh-photos">
                    {rec.photos.map((n) => (
                      <button
                        key={n}
                        className="gh-thumb"
                        onClick={() => view(n)}
                        title="点击查看大图"
                      >
                        {photos[n] ? (
                          <img src={photos[n]} alt="" draggable={false} />
                        ) : (
                          <span className="gh-thumb-ph">…</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <div className="gh-actions">
                  <label className="btn btn-ghost btn-sm gh-file">
                    ＋ 补照片
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        void addPhotos(rec, e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {open && (
                    <button className="btn btn-primary btn-sm" onClick={() => finalize(rec)}>
                      ✓ 登记归还
                    </button>
                  )}
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => deleteRec(rec.id)}>
                    删除记录
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {viewer && (
        <div className="modal-mask" onMouseDown={() => setViewer(null)}>
          <div className="photo-viewer" onMouseDown={(e) => e.stopPropagation()}>
            <img src={viewer} alt="证据照片" />
            <button className="btn btn-ghost btn-sm" onClick={() => setViewer(null)}>
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
