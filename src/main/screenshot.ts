/**
 * 开发自检工具：设置 WB_SHOT_PATH=/tmp/foo.png 启动时，
 * 页面加载约 1.6s 后把当前窗口内容存成 PNG 并自动退出。
 * 仅用于本地视觉检查（capturePage 不含原生玻璃层，玻璃观感需肉眼看屏）。
 */
import { app, BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'

export function maybeAutoScreenshot(): void {
  const path = process.env['WB_SHOT_PATH']
  if (!path) return
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) {
      app.quit()
      return
    }
    try {
      const image = await win.webContents.capturePage()
      await writeFile(path, image.toPNG())
      console.log(`[shot] 已保存: ${path}`)
    } catch (err) {
      console.error('[shot] 失败', err)
    } finally {
      app.quit()
    }
  }, 1600)
}
