/**
 * 模块注册表 —— 工作台的「加模块入口」。
 *
 * 新增一个模块只需三步：
 *   1. 在 src/renderer/src/modules/<name>/ 下写组件
 *   2. 在这里 import 并追加一条 WorkbenchModule 记录
 *   3. 需要数据就用 useStore('<namespace>')（自动落盘到 userData/data/）
 * 侧边栏、概览页会全部自动出现，不用改其它代码。
 */
import type { ComponentType } from 'react'
import OverviewModule from '../modules/overview/OverviewModule'
import TodoModule from '../modules/todo/TodoModule'
import TodoBadge from '../modules/todo/TodoBadge'
import ScheduleModule from '../modules/timetable/ScheduleModule'
import ScheduleBadge from '../modules/timetable/ScheduleBadge'
import AssignmentsModule from '../modules/assignments/AssignmentsModule'
import AgendaModule from '../modules/agenda/AgendaModule'
import LauncherModule from '../modules/launcher/LauncherModule'
import GearModule from '../modules/gear/GearModule'

export interface WorkbenchModule {
  id: string
  title: string
  icon: string
  description: string
  component: ComponentType
  /** 可选：渲染在侧边栏条目右侧的小徽标（如待办进行中数量） */
  badge?: ComponentType
}

export const MODULES: WorkbenchModule[] = [
  {
    id: 'overview',
    title: '概览',
    icon: '🏠',
    description: '今日概况与模块入口',
    component: OverviewModule
  },
  {
    id: 'todo',
    title: '待办清单',
    icon: '📋',
    description: '轻量任务管理，数据保存在本机',
    component: TodoModule,
    badge: TodoBadge
  },
  {
    id: 'timetable',
    title: '课程表',
    icon: '🗓️',
    description: '一周课程 / 日程总览',
    component: ScheduleModule,
    badge: ScheduleBadge
  },
  {
    id: 'assignments',
    title: '项目管理',
    icon: '📚',
    description: '作品 / 项目交付跟踪',
    component: AssignmentsModule
  },
  {
    id: 'launcher',
    title: '快捷启动器',
    icon: '🚀',
    description: '常用工程 / 文件夹 / 软件一键直达',
    component: LauncherModule
  },
  {
    id: 'gear',
    title: '设备台账',
    icon: '🎙️',
    description: '话筒 / 声卡 / 监听等设备记录',
    component: GearModule
  },
  {
    id: 'agenda',
    title: '日程',
    icon: '📆',
    description: '单日日程 / 月历总览',
    component: AgendaModule
  }
]

export function getModule(id: string): WorkbenchModule {
  return MODULES.find((m) => m.id === id) ?? MODULES[0]
}
