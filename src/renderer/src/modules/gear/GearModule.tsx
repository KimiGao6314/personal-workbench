/**
 * 设备/录音小台账：话筒、声卡、监听等设备清单 + 状态（在用/闲置/外借/维修）。
 * 命名规则：添加时填「品牌 + 型号 + 设备类型」，显示名 = 品牌 + 型号。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEscapeClose } from '../../core/useEscapeClose'
import { useStore } from '../../core/useStore'
import { pickPhotos, deletePhoto, type PickedPhoto } from '../../core/photo'
import HistoryPanel from './HistoryPanel'
import {
  EMPTY_GEAR,
  GEAR_CATEGORIES,
  GEAR_NS,
  GEAR_STATUS,
  createGearId,
  gearTitle,
  isLegacyGear,
  splitLegacy,
  statusLabel,
  type GearItem,
  type GearState,
  type GearStatus
} from './model'
import {
  EMPTY_HISTORY,
  GEAR_HISTORY_NS,
  closeRecordForGear,
  createRecordId,
  type HistoryState
} from './historyModel'

interface Draft {
  id: string | null
  brand: string
  model: string
  category: string
  /** 选了「其他」时自定义的类型名 */
  custom: string
  status: GearStatus
  note: string
}

/** 借出登记信息（弹窗收集后交给 submitBorrow） */
interface BorrowInfo {
  person: string
  due: string
  note: string
  photos: PickedPhoto[]
}

/** 从设备备注里猜借给谁（“借给 xxx …” → xxx） */
function personFromNote(note?: string): string {
  if (!note) return '未填写'
  const m = /^借给\s*([^\s，,。；;]+)/.exec(note)
  return m ? m[1] : note.slice(0, 20)
}

function blankDraft(): Draft {
  return {
    id: null,
    brand: '',
    model: '',
    category: GEAR_CATEGORIES[0],
    custom: '',
    status: 'inuse',
    note: ''
  }
}

function draftFromItem(g: GearItem): Draft {
  const std = (GEAR_CATEGORIES as readonly string[]).includes(g.category)
  return {
    id: g.id,
    brand: g.brand,
    model: g.model,
    category: std ? g.category : '其他',
    custom: std ? '' : g.category,
    status: g.status,
    note: g.note ?? ''
  }
}

/** 保存时的实际类型：选了「其他」就用自定义名（空则退回「其他」） */
function categoryOf(d: Draft): string {
  return d.category === '其他' ? d.custom.trim() || '其他' : d.category
}

export default function GearModule(): React.JSX.Element {
  const { ready, data, error, save } = useStore<GearState>(GEAR_NS)
  const { ready: hr, data: hdata, save: hsave } = useStore<HistoryState>(GEAR_HISTORY_NS)
  const state = data ?? EMPTY_GEAR
  const [cat, setCat] = useState('all')
  const [status, setStatus] = useState<'all' | GearStatus>('all')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [borrow, setBorrow] = useState<GearItem | null>(null)
  const seeded = useRef(false)
  const seededH = useRef(false)

  useEffect(() => {
    if (!ready || error || data !== null || seeded.current) return
    seeded.current = true
    save(EMPTY_GEAR)
  }, [ready, error, data, save])

  useEffect(() => {
    if (!hr || hdata !== null || seededH.current) return
    seededH.current = true
    hsave(EMPTY_HISTORY)
  }, [hr, hdata, hsave])

  // 旧数据迁移：把 name + brandModel 拆成 brand/model（只跑一次）
  const migrated = useRef(false)
  useEffect(() => {
    if (!ready || error || !data || migrated.current) return
    if (!data.items.some(isLegacyGear)) return
    migrated.current = true
    save((prev) => ({ items: prev.items.map(splitLegacy) }))
  }, [ready, error, data, save])

  // —— 外借记录对账（无论用弹窗/编辑/快捷改状态都不会漏）——
  // 设备=外借 但没有「借出中」记录 → 自动补一条
  // 设备已不是外借（归还/删除）但有挂着的记录 → 自动结清
  useEffect(() => {
    if (!ready || error || data === null || !hr || hdata === null) return
    const lentIds = new Set(data.items.filter((g) => g.status === 'lent').map((g) => g.id))
    let changed = false

    const records = hdata.records.map((r) => {
      if (r.returnedAt === null && !lentIds.has(r.gearId)) {
        changed = true
        return { ...r, returnedAt: Date.now() }
      }
      return r
    })

    for (const g of data.items) {
      if (g.status !== 'lent') continue
      if (records.some((r) => r.gearId === g.id && r.returnedAt === null)) continue
      changed = true
      records.unshift({
        id: createRecordId(),
        gearId: g.id,
        gearName: gearTitle(g),
        category: g.category,
        person: personFromNote(g.note),
        lentAt: Date.now(),
        returnedAt: null,
        photos: []
      })
    }

    if (changed) hsave({ records })
  }, [ready, error, data, hr, hdata, hsave])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: state.items.length }
    for (const g of state.items) {
      c[g.category] = (c[g.category] ?? 0) + 1
    }
    return c
  }, [state])

  // 分类 chips：内置类型 + 曾经用过的自定义类型
  const catOptions = useMemo(() => {
    const set = new Set<string>(GEAR_CATEGORIES)
    for (const g of state.items) set.add(g.category)
    return [...set]
  }, [state])

  const visible = useMemo(() => {
    return [...state.items]
      .filter((g) => (cat === 'all' ? true : g.category === cat))
      .filter((g) => (status === 'all' ? true : g.status === status))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [state, cat, status])

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: state.items.length }
    for (const s of GEAR_STATUS) c[s.key] = state.items.filter((g) => g.status === s.key).length
    return c
  }, [state])

  const saveDraft = (d: Draft): void => {
    if (!d.brand.trim() && !d.model.trim()) return
    save((prev) => {
      const item: GearItem = {
        id: d.id ?? createGearId(),
        brand: d.brand.trim(),
        model: d.model.trim(),
        category: categoryOf(d),
        status: d.status,
        note: d.note.trim() || undefined,
        createdAt: prev.items.find((i) => i.id === d.id)?.createdAt ?? Date.now()
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

  const setQuick = (id: string, next: GearStatus): void => {
    save((prev) => ({
      items: prev.items.map((i) => (i.id === id ? { ...i, status: next } : i))
    }))
  }

  /** 归还：设备改闲置 + 清备注 + 结清未归还记录 */
  const finalizeLent = (gearId: string): void => {
    const now = Date.now()
    save((prev) => ({
      items: prev.items.map((g) =>
        g.id === gearId ? { ...g, status: 'idle', note: undefined } : g
      )
    }))
    hsave((prev) => ({ records: closeRecordForGear(prev.records, gearId, now) }))
  }

  /** 借出登记：设备标外借 + 写一条未归还历史（历史为空时必须显式写入首份） */
  const submitBorrow = (g: GearItem, info: BorrowInfo): void => {
    const personText = `借给 ${info.person}${info.due ? `，预计 ${info.due} 还` : ''}`
    save((prev) => ({
      items: prev.items.map((x) => (x.id === g.id ? { ...x, status: 'lent', note: personText } : x))
    }))
    const record = {
      id: createRecordId(),
      gearId: g.id,
      gearName: gearTitle(g),
      category: g.category,
      person: info.person,
      lentAt: Date.now(),
      due: info.due.trim() || undefined,
      returnedAt: null,
      note: info.note.trim() || undefined,
      photos: info.photos.map((p) => p.name)
    }
    // 显式写入完整新列表：基于当前已加载记录 + 新记录，不走函数式更新，
    // 避免空数据/时序问题导致记录不落盘
    const base = hdata?.records ?? []
    hsave({ records: [record, ...base] })
    setBorrow(null)
  }

  return (
    <div className="module">
      <div className="toolbar toolbar-wrap">
        <div className="seg">
          <button className={`seg-btn${status === 'all' ? ' active' : ''}`} onClick={() => setStatus('all')}>
            全部
            <span className="seg-count">{statusCounts.all}</span>
          </button>
          {GEAR_STATUS.map((s) => (
            <button
              key={s.key}
              className={`seg-btn${status === s.key ? ' active' : ''}`}
              onClick={() => setStatus(s.key)}
            >
              {s.label}
              <span className="seg-count">{statusCounts[s.key]}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setDraft(blankDraft())}>
          ＋ 添加设备
        </button>
      </div>

      <div className="chip-row cat-chips">
        <button className={`chip${cat === 'all' ? ' active' : ''}`} onClick={() => setCat('all')}>
          全部 <span className="seg-count">{counts.all ?? 0}</span>
        </button>
        {catOptions.map((c) => (
          <button key={c} className={`chip${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>
            {c} {counts[c] != null && <span className="seg-count">{counts[c]}</span>}
          </button>
        ))}
      </div>

      {error && <div className="banner banner-error">读取设备数据失败：{error}</div>}

      {ready && state.items.length === 0 && (
        <div className="empty-note">还没有设备记录。把你的话筒、声卡、监听都记下来吧。</div>
      )}
      {visible.length === 0 && state.items.length > 0 && (
        <div className="empty-note">这个筛选下暂无设备。</div>
      )}

      <div className="k-list">
        {visible.map((g) => (
          <div key={g.id} className="k-row">
            <span className={`status-dot st-${g.status}`} title={statusLabel(g.status)} />
            <div className="k-main">
              <div className="k-title-line">
                <span className="k-title">{gearTitle(g)}</span>
                <span className="tag tag-course">{g.category}</span>
                <span
                  className={`tag tag-${g.status === 'lent' ? 'overdue' : g.status === 'repair' ? 'today' : g.status === 'idle' ? 'soon' : 'ok'}`}
                >
                  {statusLabel(g.status)}
                </span>
              </div>
              {g.note && <div className="k-sub">{g.note}</div>}
            </div>
            <div className="k-actions">
              {g.status === 'lent' ? (
                <button className="btn btn-primary btn-sm" onClick={() => finalizeLent(g.id)}>
                  归还
                </button>
              ) : (
                <>
                  {g.status !== 'inuse' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setQuick(g.id, 'inuse')}>
                      在用
                    </button>
                  )}
                  {g.status === 'inuse' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setQuick(g.id, 'idle')}>
                      闲置
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setBorrow(g)}>
                    借出…
                  </button>
                </>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setDraft(draftFromItem(g))}
              >
                编辑
              </button>
              <button className="btn btn-danger-ghost btn-sm" onClick={() => removeItem(g.id)}>
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      <HistoryPanel />

      {borrow && (
        <BorrowModal
          gear={borrow}
          onSubmit={(info) => submitBorrow(borrow, info)}
          onClose={() => setBorrow(null)}
        />
      )}

      {draft && (
        <GearEditor
          draft={draft}
          onSave={(d) => saveDraft(d)}
          onDelete={draft.id ? () => removeItem(draft.id!) : undefined}
          onClose={() => setDraft(null)}
        />
      )}
    </div>
  )
}

/* ================= 编辑弹窗：品牌 + 型号 + 设备类型 ================= */

function GearEditor({
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

  const submit = (): void => {
    if (!d.brand.trim() && !d.model.trim()) {
      setErr('请至少填写品牌或型号')
      return
    }
    if (d.category === '其他' && !d.custom.trim()) {
      setErr('已选「其他」，请填写自定义设备类型（或改选一个已有类型）')
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
        aria-label={d.id ? '编辑设备' : '添加设备'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{d.id ? '编辑设备' : '添加设备'}</h3>

        <div className="field-row">
          <div className="field">
            <span className="field-label">品牌</span>
            <input
              autoFocus
              className="text-input"
              value={d.brand}
              onChange={(e) => setD({ ...d, brand: e.target.value })}
            />
          </div>
          <div className="field">
            <span className="field-label">型号</span>
            <input
              className="text-input"
              value={d.model}
              onChange={(e) => setD({ ...d, model: e.target.value })}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter') submit()
              }}
            />
          </div>
        </div>

        <div className="field">
          <span className="field-label">设备类型</span>
          <select
            className="text-input"
            value={d.category}
            onChange={(e) => setD({ ...d, category: e.target.value })}
          >
            {GEAR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="field-hint">
            显示名将自动按「{d.brand.trim() || '品牌'} {d.model.trim() || '型号'}」生成
          </span>
        </div>

        {/* 选了「其他」→ 出现自定义类型输入 */}
        {d.category === '其他' && (
          <div className="field">
            <span className="field-label">自定义设备类型</span>
            <input
              autoFocus
              className="text-input"
              value={d.custom}
              onChange={(e) => setD({ ...d, custom: e.target.value })}
            />
          </div>
        )}

        <div className="field">
          <span className="field-label">状态</span>
          <div className="chip-row">
            {GEAR_STATUS.map((s) => (
              <button
                key={s.key}
                className={`chip${d.status === s.key ? ' active' : ''}`}
                onClick={() => setD({ ...d, status: s.key })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">备注（接线 / 外借给了谁 / 特点…）</span>
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

/* ================= 借出登记弹窗（含证据照片） ================= */

function BorrowModal({
  gear,
  onSubmit,
  onClose
}: {
  gear: GearItem
  onSubmit: (info: BorrowInfo) => void
  onClose: () => void
}): React.JSX.Element {
  const [person, setPerson] = useState('')
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  /** 取消：回收本次刚上传的照片文件，再关闭弹窗 */
  const cancelAndClean = (): void => {
    void Promise.all(photos.map((p) => deletePhoto(p.name))).finally(onClose)
  }

  useEscapeClose(cancelAndClean)

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files?.length) return
    setBusy(true)
    try {
      const picked = await pickPhotos(files)
      setPhotos((prev) => [...prev, ...picked])
    } finally {
      setBusy(false)
    }
  }

  const submit = (): void => {
    if (!person.trim()) {
      setErr('请填写借给谁')
      return
    }
    onSubmit({ person: person.trim(), due, note, photos })
  }

  return (
    <div className="modal-mask" onMouseDown={cancelAndClean}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={`借出：${gearTitle(gear)}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">
          借出登记：{gearTitle(gear)}
          <span className="tag tag-course" style={{ marginLeft: 8 }}>
            {gear.category}
          </span>
        </h3>

        <label className="field">
          <span className="field-label">借给谁（必填）</span>
          <input
            autoFocus
            className="text-input"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field-label">预计归还日期（可选）</span>
          <input
            type="date"
            className="text-input"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>

        <label className="field">
          <span className="field-label">备注（可选）</span>
          <input
            className="text-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field-label">证据照片（聊天截图等，可选）</span>
          <div className="gh-photos">
            {photos.map((p, i) => (
              <span key={p.name} className="gh-thumb">
                <img src={p.dataUrl} alt="" draggable={false} />
                <button
                  className="gh-thumb-x"
                  aria-label="移除"
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </span>
            ))}
            <label className="gh-add">
              {busy ? '…' : '＋'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  void addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <span className="field-hint">建议保留借出前的聊天/状态截图，损坏时可作证据</span>
        </div>

        {err && <div className="field-error">{err}</div>}

        <div className="modal-actions">
          <div className="modal-actions-right">
            <button className="btn btn-ghost" onClick={cancelAndClean}>
              取消
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              确认借出
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
