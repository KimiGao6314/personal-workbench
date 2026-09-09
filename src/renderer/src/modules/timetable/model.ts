/**
 * 课程表模块数据模型与工具。
 *
 * - 一天固定 12 节（第 1 节 … 第 12 节），条目用 p1/p2（开始/结束节次）描述
 * - 每个条目可带「开课周次」：weekly 周范围 + 单/双周（如 1-16周、单周、2-16周(双)）
 * - 设置里可指定「第 1 周的第一天（周一）」，据此推算今天是第几教学周，
 *   并判断当前教学周该上哪些课
 */

export const TIMETABLE_NS = 'timetable'

/** 周一为第 0 天 */
export const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

/** 一天最多 12 节 */
export const MAX_PERIOD = 12

/** 第 N 节的默认起止时间（仅作旧数据迁移 / 详情里的时间提示，不参与布局） */
export const PERIOD_TIMES: ReadonlyArray<readonly [string, string]> = [
  ['08:00', '08:45'],
  ['08:55', '09:40'],
  ['10:00', '10:45'],
  ['10:55', '11:40'],
  ['13:30', '14:15'],
  ['14:25', '15:10'],
  ['15:30', '16:15'],
  ['16:25', '17:10'],
  ['19:00', '19:45'],
  ['19:55', '20:40'],
  ['20:50', '21:35'],
  ['21:45', '22:30']
]

/** JS Date.getDay() → 本表 day 索引（0=周一） */
export function todayIndex(date: Date = new Date()): number {
  return (date.getDay() + 6) % 7
}

export interface TimetableEntry {
  id: string
  /** 0=周一 … 6=周日 */
  day: number
  /** 开始节次 1..12 */
  p1: number
  /** 结束节次 p1..12 */
  p2: number
  title: string
  location?: string
  /** 任课老师（可选） */
  teacher?: string
  /** 调色板索引，见 PALETTE */
  color: number
  /**
   * 开课周次文本。空字符串 / null = 每周都上。
   * 支持的写法：'1-16周'、'1-16周(单)'、'2-16周(双)'、'1,3,5,7周'、'单周'、'双周'、'第8周'
   */
  weeks?: string | null
  /** 旧数据（时间制）遗留字段，读取时由 migrateEntries 转为 p1/p2 */
  start?: string
  end?: string
}

export interface TimetableSettings {
  /** 第 1 周的第一天（周一）YYYY-MM-DD；null=未设置 */
  weekStart?: string | null
}

export interface TimetableState {
  entries: TimetableEntry[]
  settings: TimetableSettings
}

export const EMPTY_TIMETABLE: TimetableState = {
  entries: [],
  settings: { weekStart: null }
}

export function createEntryId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// ---------- 时间换算（旧数据迁移用） ----------

export function hmToMin(hm: string): number {
  const [h = 0, m = 0] = hm.split(':').map(Number)
  return h * 60 + m
}

export function minToHm(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 时刻 → 第几节（1..12）；不在任何节内则就近 */
function periodIndexOfTime(hm: string): number {
  const t = hmToMin(hm)
  if (!Number.isFinite(t)) return 0
  for (let i = 0; i < PERIOD_TIMES.length; i++) {
    const start = hmToMin(PERIOD_TIMES[i][0])
    if (t < start) return Math.max(0, i - 1)
  }
  return PERIOD_TIMES.length - 1
}

/** 把旧的时间制条目迁移为 节次制；已是节次制的原样返回 */
export function migrateEntry(e: TimetableEntry): TimetableEntry {
  if (typeof e.p1 === 'number' && typeof e.p2 === 'number') return e
  const p1 = periodIndexOfTime(e.start ?? '08:00') + 1
  // 结束时刻按“含头不含尾”处理：正好是下一节开始时仍属于上一节
  const endHm = e.end ?? PERIOD_TIMES[Math.min(p1 - 1, 11)][1]
  const p2 = Math.max(p1, periodIndexOfTime(minToHm(Math.min(hmToMin(endHm) - 1, 1439))) + 1)
  const { start: _s, end: _e, ...rest } = e
  return { ...rest, p1: Math.min(p1, MAX_PERIOD), p2: Math.min(p2, MAX_PERIOD) }
}

export function migrateEntries(list: TimetableEntry[]): TimetableEntry[] {
  return list.map(migrateEntry)
}

/**
 * 合并“相邻同名的同一节课”：
 * 同一星期、同名、同任课老师、同周次，且节次相接（a.p2+1 === b.p1）或重叠的条目，
 * 合并为一段完整节次（p1 = min, p2 = max），持续时间随之整合。
 * 不同周次的同名课（如同一教室不同周分段）不会被合并。
 */
export function mergeAdjacentAll(list: TimetableEntry[]): TimetableEntry[] {
  const groups = new Map<string, TimetableEntry[]>()
  for (const e of list) {
    const k = `${e.day}|${e.title}|${e.teacher ?? ''}|${e.weeks ?? ''}`
    let g = groups.get(k)
    if (!g) {
      g = []
      groups.set(k, g)
    }
    g.push(e)
  }
  const out: TimetableEntry[] = []
  for (const arr of groups.values()) {
    const sorted = [...arr].sort((a, b) => a.p1 - b.p1 || a.p2 - b.p2)
    const merged: TimetableEntry[] = []
    for (const e of sorted) {
      const last = merged[merged.length - 1]
      if (last && e.p1 <= last.p2 + 1) {
        // 相接或重叠 → 合并成一段
        last.p2 = Math.max(last.p2, e.p2)
        if (!last.location && e.location) last.location = e.location
        if (!last.teacher && e.teacher) last.teacher = e.teacher
      } else {
        merged.push({ ...e })
      }
    }
    out.push(...merged)
  }
  return out
}

// ---------- 教学周 ----------

export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const off = (d.getDay() + 6) % 7 // 周一=0
  d.setDate(d.getDate() - off)
  return d
}

function toMonday(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : mondayOf(d)
}

/**
 * 今天是第几教学周。
 * @returns 1.. 为第 N 周；0 = 还没开学（早于第 1 周）；null = 未设置开学日
 */
export function currentWeekNum(weekStart: string | null | undefined, date: Date = new Date()): number | null {
  const ws = toMonday(weekStart)
  if (!ws) return null
  const now = mondayOf(date)
  const diff = Math.floor((now.getTime() - ws.getTime()) / 86400000 / 7)
  if (diff < 0) return 0
  return Math.min(diff + 1, 60)
}

// ---------- 开课周次解析 ----------

export interface WeekRule {
  kind: 'all' | 'range' | 'list' | 'odd' | 'even'
  from: number
  to: number
  list: number[]
  parity: 'all' | 'odd' | 'even'
}

const WEEK_ALL: WeekRule = { kind: 'all', from: 1, to: 60, list: [], parity: 'all' }

export function parseWeekRule(weeksText?: string | null): WeekRule {
  const s = (weeksText ?? '').replace(/周/g, ' ').replace(/[（(]/g, ' ').replace(/[）)]/g, ' ').trim()
  if (!s || s === '每周' || s === '无' || s === '全部') return WEEK_ALL

  const nums = (s.match(/\d{1,2}/g) ?? []).map(Number)
  const hasOdd = /单|奇/.test(s)
  const hasEven = /双|偶/.test(s)
  const isRange = /[-~～—–至到]/.test(s)
  const parity: WeekRule['parity'] = hasOdd && !hasEven ? 'odd' : hasEven && !hasOdd ? 'even' : 'all'

  if (parity !== 'all' && !nums.length) return { kind: parity, from: 1, to: 60, list: [], parity }

  if (isRange && nums.length >= 2) {
    const from = Math.min(nums[0], nums[1])
    const to = Math.max(nums[0], nums[1])
    return { kind: 'range', from, to, list: [], parity }
  }

  if (nums.length) {
    const list = Array.from(new Set(nums.filter((n) => n >= 1 && n <= 60))).sort((a, b) => a - b)
    return { kind: 'list', from: list[0] ?? 1, to: list[list.length - 1] ?? 60, list, parity }
  }
  return WEEK_ALL
}

export function isRuleActive(rule: WeekRule, week: number): boolean {
  if (week < 1) return false
  const parityOk =
    rule.parity === 'all' || (rule.parity === 'odd' ? week % 2 === 1 : week % 2 === 0)
  if (!parityOk) return false
  switch (rule.kind) {
    case 'all':
    case 'odd':
    case 'even':
      return true
    case 'range':
      return week >= rule.from && week <= rule.to
    case 'list':
      return rule.list.includes(week)
  }
}

/** 该条目在第 week 周是否开课；week 为 null 表示不限定（都算） */
export function activeInWeek(e: TimetableEntry, week: number | null): boolean {
  if (week === null) return true
  return isRuleActive(parseWeekRule(e.weeks ?? ''), week)
}

/** 周次文案（胶囊展示用） */
export function weeksLabel(weeksText?: string | null): string {
  const s = (weeksText ?? '').trim()
  if (!s) return '每周'
  const rule = parseWeekRule(s)
  if (rule.kind === 'odd') return '单周'
  if (rule.kind === 'even') return '双周'
  if (rule.kind === 'range' && /单/.test(s.replace(/周/g, '')) && !/双/.test(s)) return `${rule.from}-${rule.to}周·单`
  if (rule.kind === 'range' && /双/.test(s.replace(/周/g, '')) && !/单/.test(s)) return `${rule.from}-${rule.to}周·双`
  if (rule.kind === 'range') return `${rule.from}-${rule.to}周`
  if (rule.kind === 'list') return rule.list.join(',') + '周'
  return s + '周'
}

// ---------- 颜色 ----------
export interface PaletteItem {
  name: string
  hex: string
}

export const PALETTE: PaletteItem[] = [
  { name: '蓝', hex: '#7c96ff' },
  { name: '紫', hex: '#a78bfa' },
  { name: '青', hex: '#4dd6e0' },
  { name: '绿', hex: '#46d69b' },
  { name: '橙', hex: '#f5a55f' },
  { name: '粉', hex: '#f783ac' },
  { name: '红', hex: '#f27e7e' },
  { name: '灰', hex: '#9aa3b8' }
]

export function tintOf(hex: string): string {
  return `${hex}24`
}

export function borderOf(hex: string): string {
  return `${hex}73`
}

// ---------- 统计 ----------

/** 某天某周有几节；week=null 表示不限周 */
export function countOnDay(
  state: TimetableState | null,
  day: number,
  week: number | null = null
): number {
  return (state?.entries ?? []).filter((e) => e.day === day && activeInWeek(e, week)).length
}

/** 今天有几节（若设置了开学周则按当前教学周过滤；先自修复/合并相邻同名课避免重复计数） */
export function countToday(state: TimetableState | null): number {
  const week = state ? currentWeekNum(state.settings?.weekStart) : null
  const items = state ? reconcileEntries(state.entries) : []
  return items.filter((e) => e.day === todayIndex() && activeInWeek(e, week)).length
}

/** 校验节次合法 */
export function validPeriods(p1: number, p2: number): boolean {
  return Number.isInteger(p1) && Number.isInteger(p2) && p1 >= 1 && p1 <= MAX_PERIOD && p2 >= p1 && p2 <= MAX_PERIOD
}

// ---------- 元信息解析与自修复 ----------

const PLACE_SUFFIX_RE = /(楼|馆|教|室|院|厅|场|区|路|街|号|棚|剧场|studio|校区|中心|站|南|北)$/

/** 从一段文本里剥出“周次”（如 1-16周、2-16周(双)、单周、1,3,5周） */
function stripWeeks(text: string): { rest: string; weeks: string | null } {
  const WEEK_PATTERNS = [
    /(\d{1,2}\s*[-~～—–至到]\s*\d{1,2}\s*周\s*(?:[（(]?\s*[单双]\s*[）)]?)?)/,
    /(\d{1,2}\s*[、,，]\s*\d{1,2}(?:\s*[、,，]\s*\d{1,2})*\s*周)/,
    /([单双]\s*周)/,
    /(第?\d{1,2}\s*周\s*(?:[（(]?\s*[单双]\s*[）)]?)?)/
  ]
  for (const re of WEEK_PATTERNS) {
    const m = re.exec(text)
    if (m) {
      const weeks = m[1].replace(/\s+/g, '').replace(/第/g, '')
      const rest = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)
      return { rest: rest.replace(/[（(]\s*[）)]\s*/g, ' ').replace(/\s+/g, ' ').trim(), weeks }
    }
  }
  return { rest: text.replace(/\s+/g, ' ').trim(), weeks: null }
}

/** 从元信息行解析 起止节次 / 周次 / 地点（节次以 a-b节 为准；先剥周次避免 1-17周 被当成节次） */
export function parseMetaFields(meta: string, defaultP1: number): { p1: number; p2: number; weeks: string | null; location?: string } {
  const { rest: metaRest, weeks } = stripWeeks(meta)
  let p1 = defaultP1
  let p2 = defaultP1
  const span = /第?(\d{1,2})\s*[-~～—–至到]\s*第?(\d{1,2})\s*节?/.exec(metaRest)
  if (span) {
    p1 = Number(span[1])
    p2 = Number(span[2])
  } else {
    const single = /第?(\d{1,2})\s*节/.exec(metaRest)
    if (single) {
      p1 = Number(single[1])
      p2 = p1
    }
  }
  p1 = Math.min(Math.max(p1, 1), MAX_PERIOD)
  p2 = Math.min(Math.max(p2, p1), MAX_PERIOD)

  let location: string | undefined
  const locRest = metaRest.replace(/第?\d{1,2}\s*[-~～—–至到]\s*第?\d{1,2}\s*节?/g, ' ')
  const atIdx = locRest.lastIndexOf('@')
  if (atIdx >= 0) {
    location = locRest.slice(atIdx + 1).trim() || undefined
  } else {
    const toks = locRest
      .split(/[,，、;；\s]+/)
      .map((s) => s.trim())
      .filter((s) => s && !/^(?:星期|周)([一二三四五六日天])$/.test(s) && !/^\d+$/.test(s))
    const loc = toks.filter((t) => PLACE_SUFFIX_RE.test(t))
    if (loc.length) location = loc[loc.length - 1]
    else if (toks.length && !/^(?:星期|周)/.test(toks[toks.length - 1])) location = toks[toks.length - 1]
  }
  return { p1, p2, weeks, location }
}

export function isPlaceSuffix(s: string): boolean {
  return PLACE_SUFFIX_RE.test(s)
}

/** 判断一个条目标题是否其实是“元信息文字”（旧导入污染残留） */
export function isMetaTitle(t: string): boolean {
  return /节/.test(t) && /[,，]/.test(t) && /(星期|周)/.test(t)
}

/**
 * 自修复课表：
 * 1) 把“标题被污染成元信息”的碎片条目，其节次/周次/地点回填到【同一天、节次重叠】的真实课程上；
 * 2) 删除被真实课程完整覆盖的重复条目；
 * 3) 合并相邻同名课。
 */
export function reconcileEntries(list: TimetableEntry[]): TimetableEntry[] {
  const real: TimetableEntry[] = []
  const frags: TimetableEntry[] = []
  for (const e of list) {
    if (e.title && isMetaTitle(e.title)) frags.push(e)
    else real.push({ ...e })
  }
  for (const f of frags) {
    const mf = parseMetaFields(f.title, f.p1)
    // 周次优先用碎片条目自身已存好的（标题可能已丢 “10-” 前缀）
    const fWeeks = f.weeks ?? mf.weeks
    // 找同一天、节次重叠的真实课程
    let best: TimetableEntry | null = null
    for (const r of real) {
      if (r.day !== f.day) continue
      if (r.p1 <= mf.p2 && r.p2 >= mf.p1) {
        if (!best || r.p2 - r.p1 < best.p2 - best.p1) best = r
      }
    }
    if (best) {
      best.p1 = Math.min(best.p1, mf.p1)
      best.p2 = Math.max(best.p2, mf.p2)
      if (!best.weeks && fWeeks) best.weeks = fWeeks
      if (!best.location && mf.location) best.location = mf.location
    }
    // 碎片条目本身丢弃（它描述的已并入 best）
  }
  // 删除被其它条目严格覆盖的重复（同天/同名/同老师）
  const subsumed: TimetableEntry[] = []
  for (const r of real) {
    const covered = real.some(
      (o) =>
        o !== r &&
        o.day === r.day &&
        o.title === r.title &&
        (o.teacher ?? '') === (r.teacher ?? '') &&
        o.p1 <= r.p1 &&
        o.p2 >= r.p2 &&
        (o.p1 < r.p1 || o.p2 > r.p2)
    )
    if (!covered) subsumed.push(r)
  }
  return mergeAdjacentAll(subsumed)
}
