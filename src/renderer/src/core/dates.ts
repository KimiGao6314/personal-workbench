/**
 * 通用日期 / 路径小工具（渲染层）。
 */

/** Date → 'YYYY-MM-DD'（本地时区） */
export function toDateStr(d: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 今天 0 点的时间戳 */
export function todayMidnight(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 解析 'YYYY-MM-DD' 为本地 0 点时间戳；格式不对返回 null */
export function parseDateStr(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime()
  return Number.isNaN(t) ? null : t
}

/** 距今还有几天（正数=还有 N 天，0=今天，负数=已逾期 |N| 天） */
export function daysUntil(dateStr: string): number | null {
  const due = parseDateStr(dateStr)
  if (due === null) return null
  return Math.round((due - todayMidnight()) / 86400000)
}

/** 截止状态：overdue | today | soon(≤3天) | later | done */
export type DueLevel = 'overdue' | 'today' | 'soon' | 'later'

export function dueLevel(dateStr: string): DueLevel {
  const n = daysUntil(dateStr)
  if (n === null) return 'later'
  if (n < 0) return 'overdue'
  if (n === 0) return 'today'
  if (n <= 3) return 'soon'
  return 'later'
}

/** 路径的简短展示（太长截断中间） */
export function shortPath(p: string, max = 64): string {
  if (p.length <= max) return p
  const head = p.slice(0, Math.floor(max * 0.45))
  const tail = p.slice(-Math.floor(max * 0.45))
  return `${head}…${tail}`
}

/** 取路径最后一段（文件名/文件夹名） */
export function baseName(p: string): string {
  const clean = p.replace(/\/+$/, '')
  const i = clean.lastIndexOf('/')
  return i >= 0 ? clean.slice(i + 1) : clean
}
