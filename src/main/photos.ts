/**
 * 主进程：证据照片存取（借出记录用）。
 * - save：接收 dataURL，解码后存到 userData/photos/<name>，返回文件名
 * - read：按文件名读回 dataURL（渲染层展示用）
 * - delete：删除前自动备份到 userData/backups/photos/（证据安全网）
 * 文件名为主进程生成（时间戳+随机），渲染层只传图片数据，防路径注入。
 */
import { app, ipcMain } from 'electron'
import { randomBytes } from 'node:crypto'
import { copyFileSync, mkdirSync } from 'node:fs'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
}

const NAME_RE = /^[a-z0-9_.-]{1,120}$/i
const MAX_PHOTO_BYTES = 15 * 1024 * 1024

function photosDir(): string {
  return join(app.getPath('userData'), 'photos')
}

export function registerPhotosIpc(): void {
  ipcMain.handle('photo:save', async (_event, payload: unknown) => {
    const dataUrl = (payload as { dataUrl?: unknown } | null)?.dataUrl
    if (typeof dataUrl !== 'string') return { ok: false as const, error: '数据无效' }
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl)
    if (!m) return { ok: false as const, error: '仅支持 png/jpg/webp/gif 图片' }
    const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64')
    if (!buf.length || buf.length > MAX_PHOTO_BYTES) {
      return { ok: false as const, error: '图片过大或为空' }
    }
    const ext = MIME_EXT[m[1]]
    const name = `p_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}.${ext}`
    try {
      await mkdir(photosDir(), { recursive: true })
      await writeFile(join(photosDir(), name), buf)
      return { ok: true as const, name }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('photo:read', async (_event, name: unknown) => {
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
      return { ok: false as const, error: '文件名非法' }
    }
    try {
      const buf = await readFile(join(photosDir(), name))
      const ext = name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const dataUrl = `data:${EXT_MIME[ext] ?? 'image/jpeg'};base64,${buf.toString('base64')}`
      return { ok: true as const, dataUrl }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 删除照片（取消借出 / 删除记录时回收孤儿文件）
  // 证据安全：删除前先备份一份到 userData/backups/photos/
  ipcMain.handle('photo:delete', async (_event, name: unknown) => {
    if (typeof name !== 'string' || !NAME_RE.test(name)) {
      return { ok: false as const, error: '文件名非法' }
    }
    try {
      const file = join(photosDir(), name)
      try {
        const bkDir = join(app.getPath('userData'), 'backups', 'photos')
        mkdirSync(bkDir, { recursive: true })
        copyFileSync(file, join(bkDir, name))
      } catch {
        /* 备份失败不阻塞删除 */
      }
      await unlink(file)
      return { ok: true as const }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: true as const } // 本来就不存在，视为成功
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
