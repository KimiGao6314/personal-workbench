/**
 * 工程与素材快捷启动器 —— 数据模型。
 */

export const LAUNCHER_NS = 'launcher'

/** 条目类型：工程(文件或文件夹) / 文件夹 / 应用 / 链接 */
export type LaunchKind = 'project' | 'folder' | 'app' | 'url'

export const LAUNCH_KINDS: { key: LaunchKind; label: string; icon: string }[] = [
  { key: 'project', label: '工程', icon: '🎛️' },
  { key: 'folder', label: '文件夹', icon: '📁' },
  { key: 'app', label: '软件', icon: '⚙️' },
  { key: 'url', label: '链接', icon: '🔗' }
]

export interface LauncherItem {
  id: string
  name: string
  kind: LaunchKind
  /** 本地路径（project/folder/app）或网址（url） */
  target: string
  /** 备注（用途 / 说明） */
  note?: string
  /** 上次打开时间戳，用于「最近使用」排序 */
  lastOpenedAt: number | null
  createdAt: number
}

export interface LauncherState {
  items: LauncherItem[]
}

export const EMPTY_LAUNCHER: LauncherState = { items: [] }

export function createLauncherId(): string {
  return `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
