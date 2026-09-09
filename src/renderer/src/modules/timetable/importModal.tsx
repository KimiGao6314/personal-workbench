/**
 * 课表导入：
 * 1) 粘贴文本：每行「周X 第a-b节 课程名 地点 周次?」
 * 2) .xlsx 课表（教务系统常见横向表：表头含 星期一..星期日，左侧为节次）：
 *    读取后自动按“横向课表”布局识别 → 生成上面的可编辑文本行，改好再导入
 * 3) 可识别开课周次：1-16周 / (单) / (双) / 单周 / 双周 / 1,3,5周
 */
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { useStore } from '../../core/useStore'
import {
  DAY_LABELS,
  MAX_PERIOD,
  PALETTE,
  PERIOD_TIMES,
  TIMETABLE_NS,
  createEntryId,
  hmToMin,
  mergeAdjacentAll,
  type TimetableEntry,
  type TimetableState
} from './model'

const DAY_CH = ['一', '二', '三', '四', '五', '六', '日', '天']
const PLACE_SUFFIX_RE = /(楼|馆|教|室|院|厅|场|区|路|街|号|棚|剧场|studio|校区|中心|站|南|北)$/

/* ============ 学校记录格式解析（三段式） ============
 * 例：
 *   星期一 3 130306-广播剧创作【01】
 *   李老师
 *   1-16周,星期一,3-4节,48教
 * 第 1 行 = 星期 + 第几节开始 + 课程编号-课程名称【班次】
 * 第 2 行 = 任课老师（可缺省）
 * 第 3 行 = 元信息：教学周，星期几，持续时间，地点
 */

/** 是否像“记录开头”行（星期 + 纯数字节次 + 含 - 或 【） */
function isRecordStart(line: string): boolean {
  const m = /^(?:星期|周)([一二三四五六日天])(?:\s+|$)/.exec(line)
  if (!m) return false
  const rest = line.slice(m[0].length).trim()
  const toks = rest.split(/\s+/)
  if (toks.length < 2 || !/^\d{1,2}$/.test(toks[0])) return false
  const title = toks.slice(1).join(' ')
  return /【/.test(title) || /[-－]/.test(title)
}

/** 去掉课程编号前缀（130306-广播剧创作【01】→ 广播剧创作【01】） */
function cleanCourseTitle(t: string): string {
  const m = /^[A-Za-z0-9]{2,12}[-－]\s*(.+)$/.exec(t.trim())
  return (m ? m[1] : t).trim()
}

/** 是否像“元信息行”（含周次 / 节次 / 地点特征） */
function looksLikeMeta(line: string): boolean {
  if (!line) return false
  if (/周/.test(line) && /\d/.test(line)) return true
  if (/节/.test(line) && /\d/.test(line)) return true
  if (/@/.test(line)) return true
  if (PLACE_SUFFIX_RE.test(line) && /\d|楼|馆|教|室|剧场|棚|studio/i.test(line)) return true
  return false
}

/** 是否像“课程标题行”。
 *  注意：必须是“课程编号-课程名称【班次】”这类，短横线后紧跟非数字（排除 10-17周、5-8节 这类元信息） */
function isCourseTitleLine(line: string): boolean {
  if (/【/.test(line) && /[A-Za-z0-9]/.test(line)) return true
  return /^[A-Za-z0-9]{2,12}[-－][^\d,，、;；\s]/.test(line)
}

/** 是否像“元信息行”（含 周次/星期/节次） */
function isMetaLine(line: string): boolean {
  return /(星期|周)/.test(line) && /\d/.test(line)
}

/** 从元信息行末尾拆一条“拼在上面的第二条课程”（如 动效录音棚-48#112101,2091030092-影视录音工艺与技巧[01]） */
function splitEmbeddedTitle(meta: string): { meta: string; title: string | null } {
  const m1 = /,([A-Za-z0-9]{2,12}[-－][^,，【】]*【[^】]*】)$/.exec(meta)
  if (m1) return { meta: meta.slice(0, m1.index).trim(), title: m1[1] }
  const m2 = /,([A-Za-z0-9]{2,12}[-－][\u4e00-\u9fa5][^,，]*)$/.exec(meta)
  if (m2) return { meta: meta.slice(0, m2.index).trim(), title: m2[1] }
  return { meta, title: null }
}

interface CellRecord {
  title: string
  teacher: string[]
  meta: string[]
}

/** 把单元格内容拆成一条条课程记录（一个格子可能叠了多条课）。
 *  以“元信息行”为每条记录结尾切分；上一条元信息末尾若拼着第二条课的标题，则将之作为下一条的标题 */
function splitCellRecords(cell: string): CellRecord[] {
  const lines = cell.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  const out: CellRecord[] = []
  let seg: string[] = []
  let pendingTitle: string | null = null
  const flush = (metaLine: string | null): void => {
    if (!seg.length && metaLine === null) return
    const titleLine = seg.find(isCourseTitleLine) ?? null
    const title = titleLine ?? pendingTitle ?? ''
    const meta = metaLine ? [metaLine] : []
    const teacher = seg.filter((l) => l !== titleLine && !isMetaLine(l))
    if (title.trim()) out.push({ title, teacher, meta })
    pendingTitle = metaLine ? splitEmbeddedTitle(metaLine).title : null
    seg = []
  }
  for (const l of lines) {
    if (isMetaLine(l)) {
      flush(l)
      continue
    }
    seg.push(l)
  }
  flush(null)
  return out.filter((r) => r.title.trim())
}

/** 从元信息行解析 起始/结束节次 / 周次 / 地点（节次以 a-b节 为准） */
function parseMetaFields(meta: string, defaultP1: number): { p1: number; p2: number; weeks: string | null; location?: string } {
  // 先把“周次”整段剥掉——否则 1-17周 的“1-17”会被误当成节次范围，钳到第12节
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

/** 把一整段“学校格式”记录解析成课程 */
function parseRecordGroup(lines: string[], colorSeed: number): TimetableEntry | null {
  const first = lines[0]?.trim() ?? ''
  const dayM = /^(?:星期|周)([一二三四五六日天])/.exec(first)
  if (!dayM) return null
  const day = Math.max(0, DAY_CH.indexOf(dayM[1]) % 7)
  const rest = first.slice(dayM[0].length).trim()
  const toks = rest.split(/\s+/)
  let p1 = Number(toks[0])
  if (!(p1 >= 1 && p1 <= MAX_PERIOD)) return null
  const title = cleanCourseTitle(toks.slice(1).join(' '))
  if (!title) return null

  // 找到元信息行，其它行拼为老师
  let meta: string | null = null
  const others: string[] = []
  for (const l of lines.slice(1)) {
    if (!meta && looksLikeMeta(l)) meta = l
    else others.push(l.trim())
  }
  const teacher = others.filter(Boolean).join(' ') || undefined
  let p2 = p1
  let weeks: string | null = null
  let location: string | undefined
  if (meta) {
    const mf = parseMetaFields(meta, p1)
    p1 = mf.p1
    p2 = mf.p2
    weeks = mf.weeks
    location = mf.location
  }

  return {
    id: createEntryId(),
    day,
    p1,
    p2,
    title,
    location,
    teacher,
    color: colorSeed % PALETTE.length,
    weeks
  }
}

/** 单元格里常见的课程文本 → { 内容(去掉周次), 周次? } */
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
      return { rest: rest.replace(/[（(（]\s*[）)）]\s*/g, ' ').replace(/\s+/g, ' ').trim(), weeks }
    }
  }
  return { rest: text.replace(/\s+/g, ' ').trim(), weeks: null }
}

/** 把一行课表文本解析成结构化（找不到则返回 null） */
function parseCourseLine(line: string, colorSeed: number): TimetableEntry | null {
  let s = line.trim()
  if (!s) return null
  const dayM = /(?:周|星期)([一二三四五六日天])/.exec(s)
  if (!dayM) return null
  const day = Math.max(0, DAY_CH.indexOf(dayM[1]) % 7)
  s = s.replace(dayM[0], ' ').trim()

  // 节次：第3节 / 3-4节 / 09:00-10:30
  let p1 = 0
  let p2 = 0
  const perM = /第?(\d{1,2})\s*[-~～—–至到]\s*第?(\d{1,2})\s*节?/.exec(s)
  const oneM = /第?(\d{1,2})\s*节/.exec(s)
  if (perM) {
    p1 = Number(perM[1])
    p2 = Number(perM[2])
    s = s.replace(perM[0], ' ')
  } else if (oneM) {
    p1 = p2 = Number(oneM[1])
    s = s.replace(oneM[0], ' ')
  } else {
    const timeM = /(\d{1,2})[:：](\d{2})\s*[-~～至到～]\s*(\d{1,2})[:：](\d{2})/.exec(s)
    if (timeM) {
      const st = `${String(Number(timeM[1])).padStart(2, '0')}:${timeM[2]}`
      const en = `${String(Number(timeM[3])).padStart(2, '0')}:${timeM[4]}`
      p1 = periodOf(st)
      p2 = periodOf(en)
      s = s.replace(timeM[0], ' ')
    }
  }
  if (!(p1 >= 1 && p1 <= MAX_PERIOD && p2 >= p1 && p2 <= MAX_PERIOD)) return null

  const { rest, weeks } = stripWeeks(s)
  if (!rest) return null
  const tokens = rest.split(/\s+/).filter(Boolean)

  // 地点：末位带地点特征词 / 含 @
  let location: string | undefined
  let titleText: string
  const atIdx = rest.lastIndexOf('@')
  if (atIdx >= 0) {
    location = rest.slice(atIdx + 1).trim() || undefined
    titleText = rest.slice(0, atIdx).trim()
  } else if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1]
    const placeLike = /(楼|馆|教|室|院|厅|场|区|街|路|号|棚|studio|Studio|studio|剧场|南|东|西|北|校区|演播)$/.test(last)
    const secondLast = tokens.length >= 3 ? tokens[tokens.length - 2] : ''
    if (placeLike && !/^(第|周|\d)/.test(last)) {
      location = last
      titleText = tokens.slice(0, -1).join(' ')
    } else if (secondLast && placeLike) {
      location = tokens.slice(-2).join(' ')
      titleText = tokens.slice(0, -2).join(' ')
    } else {
      titleText = tokens.join(' ')
    }
  } else {
    titleText = tokens.join(' ')
  }
  titleText = titleText.replace(/^[课（(]?名称[:：]?/, '').trim()
  if (!titleText) return null

  return {
    id: createEntryId(),
    day,
    p1,
    p2,
    title: titleText,
    location: location || undefined,
    color: colorSeed % PALETTE.length,
    weeks: weeks ?? null
  }
}

/** 时刻 → 节次（1..12） */
function periodOf(hm: string): number {
  const t = hmToMin(hm)
  if (!Number.isFinite(t)) return 0
  for (let i = 0; i < PERIOD_TIMES.length; i++) {
    if (t < hmToMin(PERIOD_TIMES[i][0])) return Math.max(0, i - 1) + 1
  }
  return MAX_PERIOD
}

/** 判断单元格文本是否像“星期几”表头，返回 0..6，否则 -1 */
function headerDayOf(cell: unknown): number {
  const s = String(cell ?? '').trim()
  const m = /^(?:星期|周)\s*([一二三四五六日天])$/.exec(s)
  if (m) return Math.max(0, DAY_CH.indexOf(m[1]) % 7)
  if (/^(?:星期一|周1|星期1)$/.test(s)) return 0
  const n = /^(?:星期|周)([1-7])$/.exec(s)
  if (n) return Number(n[1]) - 1
  return -1
}

/** 找表头行：返回 { row, dayCols }；找不到返回 null */
function findHeader(rows: string[][]): { row: number; dayCols: number[] } | null {
  const upTo = Math.min(rows.length, 25)
  for (let r = 0; r < upTo; r++) {
    const dayCols = Array.from({ length: 7 }, () => -1)
    let hit = 0
    rows[r].forEach((c, ci) => {
      const d = headerDayOf(c)
      if (d >= 0 && dayCols[d] === -1) {
        dayCols[d] = ci
        hit++
      }
    })
    if (hit >= 3) return { row: r, dayCols }
  }
  return null
}

/** 从左侧节次标签拿起始节（如 '3' '3-4' '第3节'） */
function periodFromLabel(cell: unknown): number {
  const s = String(cell ?? '').trim()
  const m = /第?(\d{1,2})(?:\s*[-~～—–至到]\s*第?\d{1,2})?\s*节?/.exec(s)
  return m ? Number(m[1]) : 0
}

export function ImportTimetableModal({ onDone }: { onDone: () => void }): React.JSX.Element {
  const { save } = useStore<TimetableState>(TIMETABLE_NS)
  const [tab, setTab] = useState<'text' | 'xlsx'>('text')
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const [replace, setReplace] = useState(false)

  // xlsx
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[]>([])
  const [sheetName, setSheetName] = useState('')
  const [xlsMsg, setXlsMsg] = useState('')
  const [fileName, setFileName] = useState('')

  const doImport = (): void => {
    let colorSeed = 0
    const entries: TimetableEntry[] = []
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; ) {
      const line = lines[i].trim()
      if (!line) {
        i++
        continue
      }
      if (isRecordStart(line)) {
        // 收集记录块：直到下一条记录开头（或出现新的“课程标题行”跟在元信息之后）
        const group: string[] = [line]
        i++
        while (i < lines.length) {
          const l = lines[i].trim()
          if (!l) {
            i++
            continue
          }
          if (isRecordStart(l)) break
          if (group.some(isMetaLine) && isCourseTitleLine(l)) break
          group.push(l)
          i++
        }
        const e = parseRecordGroup(group, colorSeed)
        if (e) entries.push(e)
      } else {
        const e = parseCourseLine(line, colorSeed)
        if (e) entries.push(e)
        i++
      }
      colorSeed++
    }
    // 先把相邻同名、可衔接的课合并成一段，再入库
    const merged = mergeAdjacentAll(entries)
    if (!merged.length) {
      setMsg('没有识别出课程。支持两种格式：\n① 学校格式：星期一 3 130306-广播剧创作【01】\\n老师\\n1-16周,星期一,3-4节,48教\n② 单行格式：周一 第3-4节 课程名 48教 1-16周')
      return
    }
    save((prev) => {
      const base = replace ? [] : prev?.entries ?? []
      const keyOf = (e: TimetableEntry): string =>
        `${e.day}|${e.p1}|${e.p2}|${e.title}|${e.weeks ?? ''}|${e.location ?? ''}|${e.teacher ?? ''}`
      const seen = new Set(base.map((e) => keyOf(e)))
      const mergedOut = [...base]
      for (const e of merged) {
        const k = keyOf(e)
        if (!seen.has(k)) {
          seen.add(k)
          mergedOut.push(e)
        }
      }
      return { entries: mergedOut, settings: prev?.settings ?? { weekStart: null } }
    })
    setMsg(`成功导入 ${merged.length} 条开课条目（相邻同名课已合并，重复已去重）${replace ? '，已替换旧课表' : '，已追加'}`)
    setTimeout(onDone, 1100)
  }

  const onXlsxFile = async (f: File | null | undefined): Promise<void> => {
    if (!f) return
    setFileName(f.name)
    setXlsMsg('读取中…')
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const list = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
        const rows = raw.map((r) => r.map((c) => String(c ?? '').trim()))
        return { name, rows }
      })
      setSheets(list)
      const first = list.findIndex((s) => findHeader(s.rows) !== null)
      setSheetName(first >= 0 ? list[first].name : list[0]?.name ?? '')
      setXlsMsg(first >= 0 ? '已读取文件，选择工作表后点“识别并生成”' : '已读取文件（没看到星期表头，试试其它工作表或改用文本粘贴）')
    } catch (err) {
      setXlsMsg(`读取失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const recognizeSheet = (): void => {
    const sh = sheets.find((s) => s.name === sheetName)
    if (!sh) return
    const head = findHeader(sh.rows)
    if (!head) {
      // 找不到星期表头：按“整表文本”转给文本解析（兼容学校格式的纵向列表 / 复制导出）
      const rows = sh.rows
      const nonEmpty = rows
        .map((r) => r.map((c) => String(c ?? '').trim()).filter(Boolean))
        .filter((r) => r.length)
      const oneCol = nonEmpty.every((r) => r.length === 1)
      const dump = oneCol
        ? nonEmpty.map((r) => r[0]).join('\n')
        : nonEmpty.map((r) => r.join(' ')).join('\n')
      if (dump.trim()) {
        setTab('text')
        setText(dump)
        setXlsMsg('没找到“星期X”表头，已把整张表内容转成文本；请检查并按“学校格式”修正后再导入。')
      } else {
        setXlsMsg('这张表是空的，无法识别。')
      }
      return
    }
    const lines: string[] = []
    const periodCols: number[] = []
    sh.rows[head.row].forEach((_, ci) => {
      if (!head.dayCols.includes(ci)) periodCols.push(ci)
    })
    const pCol = periodCols[0] // 一般是最左一列（节次/时间）
    for (let r = head.row + 1; r < sh.rows.length; r++) {
      const row = sh.rows[r]
      const p = row[pCol] !== undefined && String(row[pCol]).trim() ? periodFromLabel(row[pCol]) : 0
      const pp = p > 0 && p <= MAX_PERIOD ? p : Math.max(1, r - head.row)
      for (let d = 0; d < 7; d++) {
        const ci = head.dayCols[d]
        if (ci < 0) continue
        const cell = (row[ci] ?? '').trim()
        if (!cell) continue
        const dayLabel = DAY_LABELS[d].replace('周', '星期')
        // 一个格子可能叠了多条课记录：逐条切分，各自补“星期X 起始节”前缀
        const recs = splitCellRecords(cell)
        if (!recs.length) continue
        for (const rec of recs) {
          if (!rec.title.trim()) continue
          lines.push(`${dayLabel} ${pp} ${rec.title}`)
          if (rec.teacher.length) lines.push(rec.teacher.join(','))
          if (rec.meta.length) lines.push(rec.meta.join(''))
        }
      }
    }
    if (!lines.length) {
      setXlsMsg('按表头没读到内容，可能布局不同。可改用文本粘贴，或换一个工作表再试。')
      return
    }
    setTab('text')
    setText(lines.join('\n'))
    setXlsMsg(`已从「${sh.name}」生成内容，请在文本框检查/修改后点“导入课表”。`)
  }

  return (
    <div className="modal-mask" onMouseDown={onDone}>
      <div className="modal-card modal-wide" role="dialog" aria-modal="true" aria-label="导入课表" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="modal-title">导入课程表</h3>

        <div className="seg" style={{ marginBottom: 12 }}>
          <button className={`seg-btn${tab === 'text' ? ' active' : ''}`} onClick={() => setTab('text')}>文本 / .txt / .csv</button>
          <button className={`seg-btn${tab === 'xlsx' ? ' active' : ''}`} onClick={() => setTab('xlsx')}>从 .xlsx 导入</button>
        </div>

        {tab === 'text' && (
          <p className="field-hint" style={{ marginBottom: 10 }}>
            每行格式：<b>周X 第a-b节 课程名 地点 周次?</b>
            （如：周一 第3-4节 数字音频基础 48教 1-16周；周次可写 1-16周 / (单) / (双) / 单周 / 双周 / 1,3,5周）
          </p>
        )}

        {tab === 'xlsx' && (
          <div className="field-hint" style={{ marginBottom: 10 }}>
            <b>.xlsx 导入：</b>选择教务导出的课表文件 → 选工作表 → 点“识别并生成”把内容填入下方文本框，检查后再导入。
            {fileName && <span className="tag tag-ok" style={{ marginLeft: 8 }}>{fileName}</span>}
          </div>
        )}

        <div className="xls-row">
          {tab === 'xlsx' && (
            <>
              <label className="btn btn-ghost btn-sm gh-file">
                选择 .xlsx 文件…
                <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { void onXlsxFile(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              {sheets.length > 0 && (
                <>
                  <select className="text-input" style={{ width: 'auto', maxWidth: 220 }} value={sheetName} onChange={(e) => setSheetName(e.target.value)}>
                    {sheets.map((s) => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={recognizeSheet}>识别并生成 →</button>
                </>
              )}
            </>
          )}
          {tab === 'xlsx' && <span className={`xls-msg${xlsMsg.startsWith('读取失败') ? ' err' : ''}`}>{xlsMsg}</span>}
        </div>

        <textarea
          className="text-input ta"
          rows={12}
          value={text}
          placeholder={'周一 第1-2节 课程名 地点 1-16周\n周二 第5-6节 …'}
          onChange={(e) => setText(e.target.value)}
          style={{ margin: '4px 0 8px' }}
        />

        <label className="checkline" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          <span>替换现有课表（默认是追加，遇到完全相同的“天+节次+课名”会自动去重）</span>
        </label>

        {msg && (
          <div className="field-hint" style={{ color: msg.startsWith('成功') ? 'var(--ok)' : 'var(--danger)', margin: '0 0 8px' }}>
            {msg}
          </div>
        )}

        <div className="modal-actions">
          <div className="modal-actions-right">
            <button className="btn btn-ghost" onClick={onDone}>关闭</button>
            <button className="btn btn-primary" onClick={doImport} disabled={!text.trim()}>导入课表</button>
          </div>
        </div>
      </div>
    </div>
  )
}
