/**
 * 背景选择弹窗：选图（导入应用目录）、实时预览、调压暗/模糊、移除还原玻璃。
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from './useStore'
import { DEFAULT_UI, UI_NS, type UiSettings } from './uiSettings'

export default function BackgroundPicker({
  onClose
}: {
  onClose: () => void
}): React.JSX.Element {
  const { ready, data, error, save } = useStore<UiSettings>(UI_NS)
  const settings = data ?? DEFAULT_UI

  // 编辑态（未保存前不影响全局）
  const [file, setFile] = useState<string | null>(settings.background.file)
  const [dim, setDim] = useState<number>(settings.background.dim)
  const [blur, setBlur] = useState<number>(settings.background.blur)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const seeded = useRef(false)

  // 首启建默认设置结构
  useEffect(() => {
    if (!ready || error || data !== null || seeded.current) return
    seeded.current = true
    save(DEFAULT_UI)
  }, [ready, error, data, save])

  // 载入当前背景预览
  useEffect(() => {
    const load = async (): Promise<void> => {
      if (!file) {
        setPreview(null)
        return
      }
      const r = await window.workbench?.bg.read(file)
      setPreview(r?.ok && r.dataUrl ? r.dataUrl : null)
    }
    void load()
  }, [file])

  const pick = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await window.workbench?.bg.pick()
      if (r?.ok && r.file) setFile(r.file)
      if (r && !r.ok) setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  const hasBg = settings.background.file !== null
  const hasChange = file !== settings.background.file || dim !== settings.background.dim || blur !== settings.background.blur

  const apply = (): void => {
    if (file) {
      save({ background: { file, dim, blur } })
    } else {
      save({ background: { file: null, dim: 0.45, blur: 0 } })
    }
    onClose()
  }

  const removeBg = (): void => {
    setFile(null)
    setDim(0.45)
    setBlur(0)
  }

  return createPortal(
    <div className="modal-mask" onMouseDown={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="背景设置"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">自定义背景</h3>

        {/* 实时预览（压暗/模糊即时生效） */}
        <div
          className="bg-preview"
          style={{
            backgroundImage: preview ? `url(${preview})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: preview && blur > 0 ? `blur(${blur}px)` : undefined
          }}
        >
          {preview && <div className="bg-preview-scrim" style={{ opacity: dim }} />}
          {!preview && (
            <span className="bg-preview-empty">
              {file ? '预览加载中…' : '当前为系统玻璃背景'}
            </span>
          )}
        </div>

        <div className="field">
          <span className="field-label">背景图</span>
          <div className="toolbar-right" style={{ width: '100%' }}>
            <button className="btn btn-primary btn-sm" onClick={() => void pick()} disabled={busy}>
              {busy ? '导入中…' : file ? '更换图片…' : '选择图片…'}
            </button>
            {(file || hasBg) && (
              <button className="btn btn-ghost btn-sm" onClick={removeBg}>
                不使用图片（还原系统玻璃）
              </button>
            )}
            {file && <span className="bg-file-name">{file}</span>}
          </div>
          <span className="field-hint">图片会自动复制到应用目录，路径变了也不丢</span>
        </div>

        <div className="field">
          <span className="field-label">压暗（保证文字清晰） · {Math.round(dim * 100)}%</span>
          <input
            type="range"
            min={0}
            max={0.85}
            step={0.05}
            value={dim}
            onChange={(e) => setDim(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div className="field">
          <span className="field-label">模糊 · {blur}px</span>
          <input
            type="range"
            min={0}
            max={30}
            step={2}
            value={blur}
            onChange={(e) => setBlur(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div className="modal-actions">
          <div className="modal-actions-right">
            <button className="btn btn-ghost" onClick={onClose}>
              取消
            </button>
            <button className="btn btn-primary" onClick={apply} disabled={!hasChange}>
              保存背景
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
