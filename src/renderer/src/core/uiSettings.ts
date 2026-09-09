/**
 * 全局 UI 设置（目前含自定义背景）。
 * 存 userData/data/ui.json。
 */

export const UI_NS = 'ui'

export interface BgSettings {
  /** userData/backgrounds 下的文件名；null = 不使用图片背景 */
  file: string | null
  /** 压暗程度 0–0.85（保证前景文字可读） */
  dim: number
  /** 模糊像素 0–30 */
  blur: number
}

export interface UiSettings {
  background: BgSettings
  /** 概览页显示的卡片 key（默认全部，缺省表示用默认顺序） */
  overviewCards?: string[]
  /** 概览页卡片缩放：小 / 中 / 大 */
  overviewCardScale?: 'sm' | 'md' | 'lg'
}

export const DEFAULT_UI: UiSettings = {
  background: { file: null, dim: 0.45, blur: 0 },
  overviewCards: undefined,
  overviewCardScale: 'md'
}
