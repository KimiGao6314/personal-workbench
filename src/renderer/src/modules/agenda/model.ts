/** 日程（单日事件）—— 与课程表（每周循环）区分 */
export const AGENDA_NS = 'agenda'

/**
 * 重复规则（类似于“每日打卡”的循环安排）。
 * 以该日程自身的日期为第 1 次发生，之后按规则顺延：
 * - daily      每天
 * - weekdays   每工作日（周一 ~ 周五）
 * - weekends   每周末（周六、周日）
 * - custom     自定义：自选每周几 + 每单周 / 每双周 / 每周
 *              （days 里 0=周一 … 6=周日）
 */
export type AgendaRepeat =
  | { kind: 'none' }
  | { kind: 'daily' }
  | { kind: 'weekdays' }
  | { kind: 'weekends' }
  | { kind: 'custom'; days: number[]; parity: 'all' | 'odd' | 'even' }

export interface AgendaItem {
  id: string
  /** YYYY-MM-DD（首次发生日期） */
  date: string
  /** HH:mm 开始（可空） */
  start: string | null
  /** HH:mm 结束（可空） */
  end: string | null
  title: string
  location?: string | null
  person?: string | null
  note?: string | null
  repeat?: AgendaRepeat | null
  createdAt: number
}

export interface AgendaState {
  items: AgendaItem[]
}

export const EMPTY_AGENDA: AgendaState = { items: [] }

export function createAgendaId(): string {
  return `ag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function todayISO(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ---------- 重复规则工具 ----------

export const REPEAT_NONE: AgendaRepeat = { kind: 'none' }

function parseISO(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(Number.NaN)
}

/** 两个 ISO 日期之间的整天数（dateB - dateA） */
function diffDays(aISO: string, bISO: string): number {
  const a = parseISO(aISO)
  const b = parseISO(bISO)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** 该日程在第 target 天是否发生（含首日；target 早于首日则 false） */
export function occursOnDate(it: Pick<AgendaItem, 'date' | 'repeat'>, target: string): boolean {
  const d = diffDays(it.date, target)
  if (d < 0) return false
  if (d === 0) return true
  const r = it.repeat
  if (!r || r.kind === 'none') return false
  if (r.kind === 'daily') return true

  const dow = (parseISO(target).getDay() + 6) % 7 // 0=周一
  if (r.kind === 'weekdays') return dow <= 4
  if (r.kind === 'weekends') return dow >= 5

  // custom：日期必须在自选周几里，且（若设了单/双周）周次奇偶匹配
  if (!r.days.includes(dow)) return false
  if (r.parity !== 'all') {
    const weekNo = Math.floor(d / 7) + 1 // 以首次发生所在周为第 1 周
    const odd = weekNo % 2 === 1
    if (r.parity === 'odd' && !odd) return false
    if (r.parity === 'even' && odd) return false
  }
  return true
}

export function itemsOnDate(items: AgendaItem[], dateStr: string): AgendaItem[] {
  return items.filter((it) => occursOnDate(it, dateStr))
}

/** 从某天开始，往后取该日程接下来 max 个发生日期（YYYY-MM-DD） */
export function nextOccurrenceDates(
  it: Pick<AgendaItem, 'date' | 'repeat'>,
  fromISO: string,
  max = 30
): string[] {
  const out: string[] = []
  let cursor = parseISO(fromISO)
  for (let i = 0; i < 120 && out.length < max; i++) {
    const iso = toISOLocal(cursor)
    if (occursOnDate(it, iso)) out.push(iso)
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

function toISOLocal(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 重复规则的简短文案（如 每天 / 工作日 / 周末 / 每周二·双周） */
export function repeatLabel(r: AgendaRepeat | null | undefined): string {
  if (!r || r.kind === 'none') return ''
  switch (r.kind) {
    case 'daily':
      return '每天'
    case 'weekdays':
      return '每工作日'
    case 'weekends':
      return '每周末'
    case 'custom': {
      const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      const ds = [...r.days].sort((a, b) => a - b).map((d) => names[d])
      const p = r.parity === 'odd' ? '单周' : r.parity === 'even' ? '双周' : '每周'
      return `${p}·${ds.join('')}`
    }
  }
}
