/**
 * 侧边栏课程表徽标：今天有几节课。
 */
import { useStore } from '../../core/useStore'
import { TIMETABLE_NS, countToday, type TimetableState } from './model'

export default function ScheduleBadge(): React.JSX.Element | null {
  const { data } = useStore<TimetableState>(TIMETABLE_NS)
  const n = countToday(data)
  if (n <= 0) return null
  return <span className="nav-badge">{n}</span>
}
