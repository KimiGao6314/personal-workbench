/**
 * 侧边栏里的待办徽标：实时显示「进行中」数量。
 * 通过 useStore 订阅 todo namespace，模块里任何改动这里都会跟着刷新。
 */
import { useStore } from '../../core/useStore'
import { TODO_NS, countTodo, type TodoState } from './model'

export default function TodoBadge(): React.JSX.Element | null {
  const { data } = useStore<TodoState>(TODO_NS)
  const active = countTodo(data).active
  if (active <= 0) return null
  return <span className="nav-badge">{active > 99 ? '99+' : active}</span>
}
