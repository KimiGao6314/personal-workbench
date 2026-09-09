import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import LicenseGate from './core/LicenseGate'
import './global.css'

// 把平台写到 <html data-platform="…">，样式可以针对 macOS 微调
// （如顶部给红绿灯让位、玻璃圆角裁剪）
document.documentElement.dataset.platform = window.workbench?.platform ?? 'web'

function Root(): React.JSX.Element {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    let live = true
    void window.workbench?.license.state().then((s) => {
      if (live) setAuthed(s.ok)
    })
    return () => {
      live = false
    }
  }, [])

  if (authed === null) return <div className="license-boot">我的工作台 · 启动中…</div>
  if (!authed) return <LicenseGate onAuthed={() => setAuthed(true)} />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
