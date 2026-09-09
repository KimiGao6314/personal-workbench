/**
 * 主进程：本地文件 / 系统能力（打开、显示、选择路径）。
 * 渲染进程经 preload 白名单访问（见 src/shared/api.ts 的 WorkbenchShell）。
 */
import { app, dialog, ipcMain, nativeImage, shell } from 'electron'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 允许 openExternal 的协议白名单 */
const EXTERNAL_URL_RE = /^(https?:|mailto:)/i

function requireString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const ICON_CACHE_VERSION = 2

/** .app 包：读 Info.plist 声明的 CFBundleIconFile，找不到再按常见命名回退 */
async function pickAppIcns(p: string): Promise<string | null> {
  try {
    const resDir = join(p, 'Contents', 'Resources')
    const names = (await readdir(resDir)).filter((n) => n.toLowerCase().endsWith('.icns'))
    if (!names.length) return null

    // 1) Info.plist 里明确声明了哪个 icns
    let preferred: string | null = null
    try {
      const out = execFileSync(
        '/usr/libexec/PlistBuddy',
        ['-c', 'Print :CFBundleIconFile', join(p, 'Contents', 'Info.plist')],
        { encoding: 'utf8', timeout: 3000 }
      )
      preferred = String(out).trim()
      if (preferred && !/\.icns$/i.test(preferred)) preferred += '.icns'
    } catch {
      /* 读不到 plist 就走启发式 */
    }
    if (preferred && names.includes(preferred)) return join(resDir, preferred)

    // 2) 启发式：AppIcon/icon 开头，或排除 generic 后取第一个
    const byPattern = names.find((n) => /^appicon/i.test(n) || /^icon/i.test(n))
    if (byPattern) return join(resDir, byPattern)
    const nonGeneric = names.find((n) => !/generic/i.test(n))
    return join(resDir, nonGeneric ?? names[0])
  } catch {
    return null
  }
}

/** 读取文件/文件夹/App 的真实图标（App 走 icns，其余走系统） */
async function loadRealIcon(p: string): Promise<string | null> {
  const fromIcns = await pickAppIcns(p)
  if (fromIcns) {
    const img = nativeImage.createFromPath(fromIcns)
    if (!img.isEmpty()) return img.resize({ width: 64 }).toDataURL()
  }
  const image = await app.getFileIcon(p, { size: 'small' })
  if (image.isEmpty()) return null
  return image.toDataURL()
}

export function registerShellIpc(): void {
  ipcMain.handle('shell:openPath', async (_event, value: unknown) => {
    const p = requireString(value)
    if (!p) return { ok: false as const, error: '路径无效' }
    const err = await shell.openPath(p)
    return err ? { ok: false as const, error: err } : { ok: true as const }
  })

  ipcMain.handle('shell:showInFolder', async (_event, value: unknown) => {
    const p = requireString(value)
    if (!p) return { ok: false as const, error: '路径无效' }
    shell.showItemInFolder(p)
    return { ok: true as const }
  })

  ipcMain.handle('shell:openExternal', async (_event, value: unknown) => {
    const url = requireString(value)
    if (!url || !EXTERNAL_URL_RE.test(url)) {
      return { ok: false as const, error: '仅支持 http/https/mailto 链接' }
    }
    await shell.openExternal(url)
    return { ok: true as const }
  })

  ipcMain.handle('shell:pickFile', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择文件',
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return { ok: true as const, path: null }
    return { ok: true as const, path: res.filePaths[0] }
  })

  ipcMain.handle('shell:pickDir', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择文件夹',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return { ok: true as const, path: null }
    return { ok: true as const, path: res.filePaths[0] }
  })

  // 文件/App 的系统图标（跟随文件本身：换图标、更新版本后自动同步）
  // 磁盘缓存：userData/icons/<sha1(路径)>.json，按目标文件的 mtime 失效，
  // 命中缓存就不碰系统 API（省时、省内存，也避开并发读取的原生风险）
  ipcMain.handle('shell:getFileIcon', async (_event, value: unknown) => {
    const p = typeof value === 'string' && value.trim() ? value.trim() : null
    if (!p) return { ok: false as const, error: '路径无效' }
    try {
      const st = await stat(p).catch(() => null)
      const mtime = st ? st.mtimeMs : 0

      const cacheFile = join(
        app.getPath('userData'),
        'icons',
        `${createHash('sha1').update(p).digest('hex')}.json`
      )

      // 1) 磁盘缓存命中且目标未变 → 直接返回（版本号不符会作废旧缓存）
      try {
        const cached = JSON.parse(await readFile(cacheFile, 'utf8')) as {
          v?: number
          mtime?: number
          dataUrl?: string
        }
        if (
          cached &&
          cached.v === ICON_CACHE_VERSION &&
          cached.mtime === mtime &&
          typeof cached.dataUrl === 'string' &&
          cached.dataUrl
        ) {
          return { ok: true as const, dataUrl: cached.dataUrl }
        }
      } catch {
        /* 无缓存或损坏，走系统读取 */
      }

      // 2) 未命中 → 读取真实图标（.app 直接读 icns，避免通用占位图标）并写入缓存
      const dataUrl = await loadRealIcon(p)
      if (!dataUrl) return { ok: false as const, error: '无图标' }
      await mkdir(join(app.getPath('userData'), 'icons'), { recursive: true })
      await writeFile(
        cacheFile,
        JSON.stringify({ v: ICON_CACHE_VERSION, mtime, dataUrl }),
        'utf8'
      )
      return { ok: true as const, dataUrl }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })
}
