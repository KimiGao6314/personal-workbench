/**
 * 设备外借历史 —— 数据模型与纯函数工具。
 * 独立命名空间 gearHistory，数据落盘 userData/data/gearHistory.json。
 */

export const GEAR_HISTORY_NS = 'gearHistory'

export interface LendRecord {
  id: string
  /** 对应设备 id（设备删除后记录仍在） */
  gearId: string
  /** 借出时的设备显示名快照（品牌+型号） */
  gearName: string
  category: string
  /** 借给了谁 */
  person: string
  /** 借出时间戳 */
  lentAt: number
  /** 预计归还日期 'YYYY-MM-DD'（可空） */
  due?: string
  /** 实际归还时间戳；null = 仍在借 */
  returnedAt: number | null
  note?: string
  /** 证据照片文件名（存于 userData/photos） */
  photos: string[]
}

export interface HistoryState {
  records: LendRecord[]
}

export const EMPTY_HISTORY: HistoryState = { records: [] }

export function createRecordId(): string {
  return `hr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 某设备是否有未归还的记录 */
export function hasOpenRecord(state: HistoryState | null, gearId: string): boolean {
  return (state?.records ?? []).some((r) => r.gearId === gearId && r.returnedAt === null)
}

/** 把某个设备未归还的记录标记为已归还 */
export function closeRecordForGear(
  records: LendRecord[],
  gearId: string,
  at: number
): LendRecord[] {
  return records.map((r) =>
    r.gearId === gearId && r.returnedAt === null ? { ...r, returnedAt: at } : r
  )
}

/** 展示时间：MM-DD HH:mm */
export function fmtWhen(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 展示日期：YYYY-MM-DD */
export function fmtDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
