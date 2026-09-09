/**
 * 生成 App 图标（1024×1024 PNG）：
 * 品牌渐变底（与界面 brand-mark 一致）+ 白色 ✦。
 * 用法：electron scripts/gen-icon.js <out.png>
 * 说明：纯本地离屏渲染，不依赖任何图片库。
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')

const outPath = process.argv[2]
if (!outPath) {
  console.error('用法: electron scripts/gen-icon.js <out.png>')
  app.exit(1)
  return
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true }
  })
  win.webContents.setBackgroundThrottling(false)

  const html = `<!doctype html><html><body style="margin:0">
    <div id="box"
      style="width:1024px;height:1024px;
             background:linear-gradient(150deg,#7c96ff 0%,#9a7bff 55%,#b18cff 100%);
             display:flex;align-items:center;justify-content:center;
             position:relative;overflow:hidden">
      <div style="position:absolute;left:-180px;top:-220px;width:700px;height:700px;border-radius:50%;
                  background:radial-gradient(circle,rgba(255,255,255,.34),rgba(255,255,255,0) 65%)"></div>
      <div style="position:absolute;right:-160px;bottom:-200px;width:640px;height:640px;border-radius:50%;
                  background:radial-gradient(circle,rgba(255,255,255,.18),rgba(255,255,255,0) 60%)"></div>
      <div style="font-family:-apple-system,'PingFang SC',sans-serif;font-size:560px;font-weight:300;
                  color:#fff;line-height:1;text-shadow:0 10px 40px rgba(40,50,110,.45);transform:translateY(-18px)">✦</div>
    </div></body></html>`

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 600))

  const image = await win.webContents.capturePage()
  const png = image.toPNG()
  if (!png || png.length < 1000) {
    console.error('图标渲染失败（截图为空）')
    app.exit(1)
    return
  }
  writeFileSync(outPath, png)
  console.log('icon 已生成: ' + outPath + ' (' + png.length + ' B)')
  app.exit(0)
})
