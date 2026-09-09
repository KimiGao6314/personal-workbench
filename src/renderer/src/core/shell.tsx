/**
 * Shell 上下文：当前激活模块 + 切换导航。
 * 模块组件（任意深度）用 useShell() 读取/跳转。
 */
import { createContext, useContext } from 'react'

export interface ShellValue {
  activeId: string
  navigate: (id: string) => void
  platform: string
}

export const ShellContext = createContext<ShellValue | null>(null)

export function useShell(): ShellValue {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell 必须在 App 的 ShellContext.Provider 内使用')
  return ctx
}
