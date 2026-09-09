/**
 * 读取 macOS 本地日历（Calendar.app）事件。
 * 系统默认会订阅「中国节假日」日历，因此这里能拿到 春节/国庆/中秋/清明 等
 * 以及「休 / 班」调休信息，供日程模块以「系统日历」方式叠加显示。
 */
import { ipcMain } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface CalendarEvent {
  /** YYYY-MM-DD */
  date: string
  title: string
  allDay: boolean
  /** HH:mm（全天事件为 00:00） */
  time: string
}

const SCRIPT = `on run argv
  set f to item 1 of argv
  set t to item 2 of argv
  set fD to current date
  set year of fD to (text 1 thru 4 of f) as integer
  set month of fD to (text 6 thru 7 of f) as integer
  set day of fD to (text 9 thru 10 of f) as integer
  set hours of fD to 0
  set minutes of fD to 0
  set seconds of fD to 0
  set tD to current date
  set year of tD to (text 1 thru 4 of t) as integer
  set month of tD to (text 6 thru 7 of t) as integer
  set day of tD to (text 9 thru 10 of t) as integer
  set hours of tD to 23
  set minutes of tD to 59
  set seconds of tD to 59
  set out to ""
  tell application "Calendar"
    repeat with c in calendars
      try
        set evs to (every event of c whose start date ≥ fD and start date ≤ tD)
        repeat with e in evs
          set s to start date of e
          set y to year of s as text
          set m to month of s as integer
          set dd to day of s as integer
          set m2 to text -2 thru -1 of ("0" & (m as text))
          set d2 to text -2 thru -1 of ("0" & (dd as text))
          set summ to summary of e
          set ad to allday event of e
          set hh to hours of s as integer
          set mm2 to minutes of s as integer
          set hh2 to text -2 thru -1 of ("0" & (hh as text))
          set mm3 to text -2 thru -1 of ("0" & (mm2 as text))
          set out to out & y & "-" & m2 & "-" & d2 & "|" & summ & "|" & ad & "|" & hh2 & ":" & mm3 & linefeed
        end repeat
      end try
    end repeat
  end tell
  return out
end run
`

function parseLine(line: string): CalendarEvent | null {
  const parts = line.split('|')
  const date = parts[0]
  const title = parts[1]
  if (!date || !title) return null
  return { date, title, allDay: parts[2] === 'true', time: parts[3] ?? '' }
}

export function listCalendarEvents(from: string, to: string): CalendarEvent[] {
  const dir = mkdtempSync(join(tmpdir(), 'wb-cal-'))
  const file = join(dir, 'cal.scpt')
  writeFileSync(file, SCRIPT, 'utf8')
  try {
    const out = execFileSync('/usr/bin/osascript', [file, from, to], {
      encoding: 'utf8',
      timeout: 15000
    })
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map(parseLine)
      .filter((e): e is CalendarEvent => e !== null)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

export function registerCalendarIpc(): void {
  ipcMain.handle('calendar:events', (_event, payload: unknown) => {
    const p = (payload ?? {}) as { from?: unknown; to?: unknown }
    return listCalendarEventsCached(String(p.from ?? ''), String(p.to ?? ''))
  })
}

// 缓存：按“月范围”缓存系统日历事件，避免每次进日程都重新读 Calendar.app
const calendarCache = new Map<string, { at: number; events: CalendarEvent[] }>()

export function listCalendarEventsCached(from: string, to: string): CalendarEvent[] {
  const key = `${from}|${to}`
  const hit = calendarCache.get(key)
  if (hit) return hit.events
  try {
    const events = listCalendarEvents(from, to)
    calendarCache.set(key, { at: Date.now(), events })
    // 只保留最近 24 个月的缓存，避免无限增长
    if (calendarCache.size > 24) {
      const oldest = [...calendarCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
      if (oldest) calendarCache.delete(oldest[0])
    }
    return events
  } catch {
    // 失败（无权限/日历未开）不缓存，下次进入重试
    return []
  }
}
