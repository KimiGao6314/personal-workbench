/**
 * 设备/录音小台账 —— 数据模型。
 * 命名规则：显示名 = 品牌 + 型号；编辑时只维护 品牌 / 型号 / 设备类型 三个要素。
 */

export const GEAR_NS = 'gear'

export const GEAR_CATEGORIES = [
  '话筒',
  '声卡/接口',
  '话放',
  '监听音箱',
  '监听耳机',
  '乐器',
  '调音台',
  '效果器/插件授权',
  '线材/配件',
  '其他'
] as const

export type GearStatus = 'inuse' | 'idle' | 'lent' | 'repair'

export const GEAR_STATUS: { key: GearStatus; label: string }[] = [
  { key: 'inuse', label: '在用' },
  { key: 'idle', label: '闲置' },
  { key: 'lent', label: '外借' },
  { key: 'repair', label: '维修' }
]

export interface GearItem {
  id: string
  /** 品牌，如 Focusrite / Shure */
  brand: string
  /** 型号，如 4i4 / SM57 */
  model: string
  /** 设备类型（GEAR_CATEGORIES 之一） */
  category: string
  status: GearStatus
  /** 借给谁了 / 在哪 / 接线备忘 / 音色特点等 */
  note?: string
  createdAt: number
}

export interface GearState {
  items: GearItem[]
}

export const EMPTY_GEAR: GearState = { items: [] }

export function createGearId(): string {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function statusLabel(key: GearStatus): string {
  return GEAR_STATUS.find((s) => s.key === key)?.label ?? key
}

/** 显示名：品牌 + 型号 */
export function gearTitle(item: Pick<GearItem, 'brand' | 'model'> & { name?: unknown }): string {
  const joined = [item.brand, item.model].filter((s) => s && s.trim()).join(' ').trim()
  if (joined) return joined
  // 旧数据兜底：只有旧 name 字段时直接显示它
  return typeof item.name === 'string' ? item.name : ''
}

/** 旧数据（没有 brand/model）判据 */
export function isLegacyGear(item: GearItem): boolean {
  const brand = (item as { brand?: unknown }).brand
  const model = (item as { model?: unknown }).model
  return typeof brand !== 'string' || typeof model !== 'string'
}

/** 把旧条目（name + brandModel）拆成 brand / model */
export function splitLegacy(item: GearItem): GearItem {
  if (!isLegacyGear(item)) return item
  const old = item as GearItem & { name?: string; brandModel?: string }
  const name = (old.name ?? '').trim()
  const legacyModel = (old.brandModel ?? '').trim()
  let brand = ''
  let model = ''

  if (legacyModel && name.endsWith(legacyModel) && name !== legacyModel) {
    brand = name.slice(0, name.length - legacyModel.length).trim()
    model = legacyModel
  } else if (name) {
    // 兜底：首词当品牌
    const sp = name.indexOf(' ')
    if (sp > 0) {
      brand = name.slice(0, sp).trim()
      model = name.slice(sp + 1).trim()
    } else {
      brand = name
    }
  } else if (legacyModel) {
    model = legacyModel
  }

  return {
    id: item.id,
    brand,
    model,
    category: item.category,
    status: item.status,
    note: item.note,
    createdAt: item.createdAt
  }
}
