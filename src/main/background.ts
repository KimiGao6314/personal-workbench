/**
 * 主进程：自定义背景图片。
 * - pick：原生对话框选图 → 复制到 userData/backgrounds/ 并返回文件名
 * - read：按文件名读回 dataURL 给渲染层做背景
 * 路径被复制到应用目录内，所以换电脑/移动文件后依然可用。
 */
import { app, dialog, ipcMain } from 'electron'
import { randomBytes } from 'node:crypto'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.heic', '.gif'])
const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  gif: 'image/gif'
}
const NAME_RE = /^[a-z0-9_.-]{1,120}$/i
const MAX_BG_BYTES = 30 * 1024 * 1024

function bgDir(): string {
  return join(app.getPath('userData'), 'backgrounds')
}

export function registerBackgroundIpc(): void {
  ipcMain.handle('bg:pick', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择背景图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'heic', 'gif'] }]
    })
    const src = res.canceled ? null : (res.filePaths[0] ?? null)
    if (!src) return { ok: true as const, file: null }
    const ext = (extname(src).toLowerCase() || '.jpg')
    if (!ALLOWED_EXT.has(ext)) return { ok: false as const, error: '不支持的图片格式' }
    const name = `bg_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}${ext}`
    try {
      await mkdir(bgDir(), { recursive: true })
      await copyFile(src, join(bgDir(), name))
      return { ok: true as const, file: name }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('bg:read', async (_event, name: unknown) => {
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
      return { ok: false as const, error: '文件名非法' }
    }
    try {
      const buf = await readFile(join(bgDir(), name))
      if (buf.length > MAX_BG_BYTES) return { ok: false as const, error: '图片过大' }
      const ext = name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const dataUrl = `data:${EXT_MIME[ext] ?? 'image/jpeg'};base64,${buf.toString('base64')}`
      return { ok: true as const, dataUrl }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
