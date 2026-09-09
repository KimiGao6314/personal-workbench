/**
 * 结课/项目管理 —— 数据模型。
 */

export const ASSIGN_NS = 'assignments'

export const ASSIGN_TYPES = ['结课作品', '混音项目', '创作/编曲', '论文/报告', '练习/听感', '其他'] as const

export type AssignStatus = 'todo' | 'doing' | 'done'

export interface AssignmentItem {
  id: string
  course: string
  title: string
  /** 类型：ASSIGN_TYPES 之一 */
  type: string
  /** 截止日期 'YYYY-MM-DD' */
  due: string
  status: AssignStatus
  /** 交付物路径（工程文件夹 / 成品文件） */
  deliverablePath?: string
  note?: string
  createdAt: number
  completedAt: number | null
}

export interface AssignState {
  items: AssignmentItem[]
}

export const EMPTY_ASSIGN: AssignState = { items: [] }

export function createAssignId(): string {
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 未完成数量 */
export function countOpen(state: AssignState | null): number {
  return state?.items.filter((i) => i.status !== 'done').length ?? 0
}

/** 已逾期未完成数量 */
export function countOverdue(state: AssignState | null, daysUntil: (s: string) => number | null): number {
  if (!state) return 0
  return state.items.filter((i) => {
    if (i.status === 'done') return false
    const n = daysUntil(i.due)
    return n !== null && n < 0
  }).length
}
