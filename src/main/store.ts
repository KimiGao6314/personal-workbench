/**
 * 通用 JSON 持久化存储（主进程侧）。
 *
 * 原则：
 * - 每个「模块 / 功能」对应一个 namespace，文件为 userData/data/<namespace>.json
 * - 读写都走 IPC（store:read / store:write），渲染进程不直接碰文件系统
 * - 写入采用「临时文件 + rename」的原子方式，避免写一半损坏数据
 * - 覆盖前自动备份旧文件到 userData/backups/<namespace>/（保留最近 12 份）
 */
import { app, ipcMain } from 'electron'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** namespace 白名单：只允许字母数字 _ . - 的小写名字，最长 64 位 */
const NS_PATTERN = /^[a-z0-9._-]{1,64}$/

function dataDir(): string {
  return join(app.getPath('userData'), 'data')
}

function fileFor(ns: string): string {
  return join(dataDir(), `${ns}.json`)
}

/** 写前备份旧文件到 userData/backups/<ns>/，每个 ns 保留最近 12 份 */
const BACKUP_KEEP = 12
function backupBeforeWrite(ns: string, file: string): void {
  try {
    // 旧文件存在才算“覆盖”，才需要备份
    readFileSync(file)
    const dir = join(app.getPath('userData'), 'backups', ns)
    mkdirSync(dir, { recursive: true })
    const stamp = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const name = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.json`
    copyFileSync(file, join(dir, name))
    // 裁剪旧备份
    const list = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
    while (list.length > BACKUP_KEEP) {
      const old = list.shift()
      if (old) {
        try {
          unlinkSync(join(dir, old))
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    // 没有旧文件或备份失败都静默忽略（不能影响主流程）
  }
}

export function isSafeNamespace(ns: unknown): ns is string {
  return typeof ns === 'string' && NS_PATTERN.test(ns)
}

export function registerStoreIpc(): void {
  ipcMain.handle('store:read', async (_event, ns: unknown) => {
    if (!isSafeNamespace(ns)) {
      return { ok: false as const, error: `非法的数据命名空间: ${JSON.stringify(ns)}` }
    }
    try {
      const text = readFileSync(fileFor(ns), 'utf8')
      return { ok: true as const, value: JSON.parse(text) }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: true as const, value: null }
      return {
        ok: false as const,
        error: `读取 ${ns}.json 失败: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  })

  ipcMain.handle('store:write', async (_event, ns: unknown, data: unknown) => {
    if (!isSafeNamespace(ns)) {
      return { ok: false as const, error: `非法的数据命名空间: ${JSON.stringify(ns)}` }
    }
    try {
      // 同步落盘：写完成才返回，进程被立刻退出/杀掉的窗口内也不会丢数据
      mkdirSync(dataDir(), { recursive: true })
      const file = fileFor(ns)
      backupBeforeWrite(ns, file)
      const tmp = `${file}.tmp`
      writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
      renameSync(tmp, file)
      return { ok: true as const }
    } catch (err) {
      return {
        ok: false as const,
        error: `写入 ${ns}.json 失败: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  })
}
