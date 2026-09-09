/**
 * 待办模块数据模型：支持普通待办 + 每日打卡 + 提醒 + 地点/人物。
 */
export const TODO_NS = 'todo'

export function createTodoId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
  /** 创建时间戳（ms） */
  createdAt: number
  /** 完成时间戳；未完成时为 null */
  completedAt: number | null
  /** 提醒时间（datetime-local：YYYY-MM-DDTHH:mm），null=不提醒 */
  remindAt?: string | null
  /** 已提醒过（防止重复弹） */
  reminded?: boolean
  /** 地点（可选） */
  location?: string | null
  /** 人物（可选） */
  person?: string | null
  /** 每日打卡模式 */
  daily?: boolean
  /** 打卡历史（YYYY-MM-DD 完成日期列表） */
  doneDates?: string[]
}

export interface TodoState {
  items: TodoItem[]
}

export const EMPTY_TODO: TodoState = { items: [] }

export function dayStr(ts?: number | null): string {
  const d = ts ? new Date(ts) : new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 打卡完成日期集合（最近 90 天） */
export function todayStr(): string {
  return dayStr()
}

/** 该条今天是否视为“已完成”（每日任务只在当天完成才算；普通任务看 done） */
export function isDoneForToday(item: TodoItem, today = todayStr()): boolean {
  if (!item.done) return false
  if (item.daily) return dayStr(item.completedAt) === today
  return true
}

/** 该条今天是否属于“待完成/待打卡” */
export function isActiveForToday(item: TodoItem, today = todayStr()): boolean {
  return !isDoneForToday(item, today)
}

export interface TodoCounts {
  total: number
  active: number
  done: number
}

export function countTodo(state: TodoState | null): TodoCounts {
  const items = state?.items ?? []
  let active = 0
  let done = 0
  for (const it of items) {
    if (isDoneForToday(it)) done++
    else active++
  }
  return { total: items.length, active, done }
}

export function fmtRemind(remindAt: string): string {
  return remindAt.replace('T', ' ')
}

/** 统一创建待办 */
export function createTodo(opts: {
  text: string
  remindAt?: string | null
  location?: string | null
  person?: string | null
  daily?: boolean
}): TodoItem {
  return {
    id: createTodoId(),
    text: opts.text,
    done: false,
    createdAt: Date.now(),
    completedAt: null,
    remindAt: opts.remindAt ?? null,
    reminded: false,
    location: opts.location ?? null,
    person: opts.person ?? null,
    daily: opts.daily ?? false,
    doneDates: []
  }
}

/** 完成/取消（感知每日打卡：每日任务记录当天日期，跨天自动视为未打卡） */
export function toggleItemDone(it: TodoItem): TodoItem {
  if (it.daily) {
    const t = todayStr()
    const rest = (it.doneDates ?? []).filter((d) => d !== t)
    if (isDoneForToday(it, t)) {
      // 取消今天的打卡
      return { ...it, done: false, completedAt: null, doneDates: rest, reminded: false }
    }
    // 完成今天的打卡
    return { ...it, done: true, completedAt: Date.now(), doneDates: [...rest, t], reminded: false }
  }
  const done = !it.done
  return {
    ...it,
    done,
    completedAt: done ? Date.now() : null,
    remindAt: done ? null : it.remindAt,
    reminded: false
  }
}
