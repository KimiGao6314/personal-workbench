/**
 * 授权注册页：未授权时显示。
 * - 把作者给的授权文件（.license）拖进来 / 选择文件 → 自动注册
 * - 也可以直接粘贴授权码
 * 成功后自动进入工作台。
 */
import { useEffect, useRef, useState } from 'react'

interface LicenseGateProps {
  onAuthed: () => void
}

export default function LicenseGate({ onAuthed }: LicenseGateProps): React.JSX.Element {
  const [device, setDevice] = useState('读取中…')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.workbench?.license.state().then((s) => setDevice(s.device))
  }, [])

  const tryActivate = async (payload: unknown): Promise<void> => {
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const p = (payload ?? {}) as { device?: unknown; code?: unknown }
      if (typeof p.device !== 'string' || typeof p.code !== 'string') {
        setErr('这不是有效的授权文件')
        return
      }
      const r = await window.workbench!.license.activate(p.device, p.code)
      if (r.ok) {
        setMsg(r.message)
        setTimeout(onAuthed, 600)
      } else {
        setErr(r.message)
      }
    } catch {
      setErr('注册失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (file: File | null | undefined): Promise<void> => {
    if (!file) return
    try {
      const text = await file.text()
      const obj = JSON.parse(text) as unknown
      await tryActivate(obj)
    } catch {
      setErr('无法读取该文件（授权文件应为 JSON 格式）')
    }
  }

  return (
    <div className="license-mask">
      <div className="license-card">
        <div className="license-logo">✦</div>
        <h1 className="license-title">我的工作台</h1>
        <p className="license-sub">请注册后使用（Beta）</p>

        <div className="license-dev">
          <span>本机设备指纹</span>
          <code>{device}</code>
        </div>

        <div
          className="license-drop"
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            e.preventDefault()
            void handleFile(e.dataTransfer.files?.[0])
          }}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
          }}
        >
          <div className="license-drop-ic">⬇️</div>
          <div className="license-drop-text">把授权文件拖到这里</div>
          <div className="license-drop-hint">或点此选择文件（*.license）</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".license,.json,text/plain,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              void handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>

        <div className="license-paste">
          <span className="license-paste-label">或粘贴授权码：</span>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const code = String(fd.get('code') ?? '').trim()
              void tryActivate({ device, code })
            }}
            style={{ display: 'flex', gap: 8, width: '100%' }}
          >
            <input
              className="text-input"
              name="code"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
              style={{ flex: 1, fontFamily: 'var(--mono)' }}
            />
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? '注册中…' : '注册'}
            </button>
          </form>
        </div>

        {err && <div className="banner banner-error">{err}</div>}
        {msg && <div className="license-ok">{msg}</div>}
        <p className="license-foot">授权文件请联系作者获取 · 仅供本机使用</p>
      </div>
    </div>
  )
}
