/**
 * 系统通知（待办提醒等）。
 */
import { ipcMain, Notification } from 'electron'

export function registerNotifyIpc(): void {
  ipcMain.handle('notify:show', (_event, payload: unknown) => {
    const p = (payload ?? {}) as { title?: unknown; body?: unknown }
    try {
      if (!Notification.isSupported()) return { ok: false as const, error: '不支持通知' }
      const n = new Notification({
        title: typeof p.title === 'string' ? p.title : '我的工作台',
        body: typeof p.body === 'string' ? p.body : ''
      })
      n.show()
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
