import { useEffect } from 'react'

/**
 * 弹窗 ESC 关闭逻辑：
 * - 输入框/文本域正在编辑（含中文输入法组词）时按 ESC → 只收起候选/取消当前输入，
 *   并让输入框失焦，【不关闭弹窗、不清空已填内容】
 * - 焦点不在输入框时按 ESC → 关闭弹窗
 */
export function useEscapeClose(onClose: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (e.isComposing) return // 输入法组词中的 ESC 交给输入法
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        ;(el as HTMLInputElement).blur()
        return
      }
      onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
}
