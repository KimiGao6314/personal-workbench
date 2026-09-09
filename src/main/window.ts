/**
 * 主窗口创建。
 *
 * 玻璃引擎（按系统自动选择，兼容 macOS 15 与 26）：
 * - Darwin >= 25（macOS 26 Tahoe）：native —— electron-liquid-glass →
 *   NSGlassEffectView 原版 Liquid Glass；需 transparent 窗口
 * - Darwin < 25（macOS 15 等）：vibrancy —— 传统 NSVisualEffectView 毛玻璃，
 *   且【不会】加载 macOS 26 专属原生库，避免旧系统崩溃
 * - 其它平台：none（普通不透明窗口）
 * 可用 WB_GLASS_ENGINE=native|vibrancy|none 强制指定。
 */
import {
  BrowserWindow,
  Menu,
  ipcMain,
  shell,
  type BrowserWindowConstructorOptions,
  type MenuItemConstructorOptions
} from 'electron'
import { createRequire } from 'node:module'
import { release } from 'node:os'
import { join } from 'node:path'

const nodeRequire = createRequire(__filename)

/** 设置 macOS 红绿灯位置（类型定义未收录，运行时存在，故做类型断言） */
function setTrafficLight(win: BrowserWindow, x: number, y: number): void {
  ;(win as unknown as { setTrafficLightPosition(p: { x: number; y: number }): void }).setTrafficLightPosition({ x, y })
}

type GlassEngine = 'native' | 'vibrancy' | 'none'

interface GlassModule {
  isGlassSupported(): boolean
  addView(handle: Buffer, options?: { cornerRadius?: number }): number
  unstable_setVariant(id: number, variant: number): void
}

const isMac = process.platform === 'darwin'
/** Darwin 主版本：macOS 15 = 24，macOS 26 = 25 */
const darwinMajor = Number(release().split('.')[0] || 0)

/** 惰性加载原生玻璃库（只在真正需要时 require，旧系统不加载） */
function loadGlass(): GlassModule | null {
  try {
    const mod = nodeRequire('electron-liquid-glass') as unknown
    const m = (mod as { default?: unknown }).default ?? mod
    return (typeof m === 'object' && m !== null ? m : null) as GlassModule | null
  } catch {
    return null
  }
}

function pickEngine(): GlassEngine {
  const forced = process.env['WB_GLASS_ENGINE']
  if (forced === 'native' || forced === 'vibrancy' || forced === 'none') return forced
  if (!isMac) return 'none'
  // macOS 26 以下没有原生 Liquid Glass：直接走 vibrancy，绝不加载原生库
  if (!(darwinMajor >= 25)) return 'vibrancy'
  try {
    const glass = loadGlass()
    return glass && glass.isGlassSupported() ? 'native' : 'vibrancy'
  } catch {
    return 'vibrancy'
  }
}

/** 可选 vibrancy 材质（macOS 15 上是传统毛玻璃；26 上为系统玻璃观感） */
const VIBRANCY_CHOICES: BrowserWindowConstructorOptions['vibrancy'][] = [
  'under-window',
  'under-page',
  'window',
  'content',
  'sidebar',
  'header',
  'hud',
  'popover',
  'menu',
  'fullscreen-ui',
  'selection',
  'tooltip',
  'sheet',
  'titlebar'
]

function pickVibrancy(): BrowserWindowConstructorOptions['vibrancy'] {
  const requested = process.env['WB_VIBRANCY']
  return VIBRANCY_CHOICES.includes(requested as never)
    ? (requested as BrowserWindowConstructorOptions['vibrancy'])
    : 'under-window'
}

export function createMainWindow(): BrowserWindow {
  const engine = pickEngine()
  // 页面缩放：用 Electron 官方 setZoomFactor（替代 CSS zoom，避免透明窗口缩放闪烁）
  const zoomFactor = Number(process.env['WB_ZOOM']) || 1.2

  // —— 正式版菜单：不给开发者工具/重载入口，只保留必需项 ——
  if (process.platform === 'darwin') {
    const menu: MenuItemConstructorOptions[] = [
      { role: 'appMenu' }, // 关于 / 退出（⌘Q）
      { role: 'editMenu' } // 撤销/复制/粘贴/全选（输入框必需）
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(menu))
  } else {
    Menu.setApplicationMenu(null)
  }

  const common: BrowserWindowConstructorOptions = {
    width: 1240,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: '我的工作台'
  }

  const macChrome = isMac
    ? {
        titleBarStyle: 'hiddenInset' as const,
        trafficLightPosition: { x: 18, y: 18 }
      }
    : {}

  let win: BrowserWindow

  if (engine === 'native') {
    win = new BrowserWindow({
      ...common,
      ...macChrome,
      transparent: true,
      hasShadow: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
  } else if (engine === 'vibrancy') {
    win = new BrowserWindow({
      ...common,
      ...macChrome,
      ...(isMac
        ? {
            backgroundColor: '#00000000',
            vibrancy: pickVibrancy(),
            visualEffectState: 'followWindow' as const
          }
        : { backgroundColor: '#0d1017' }),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
  } else {
    win = new BrowserWindow({
      ...common,
      backgroundColor: '#0d1017',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
  }

  win.once('ready-to-show', () => win.show())

  // 页面加载完成后应用缩放（刷新/重载后仍保持）
  win.webContents.once('did-finish-load', () => {
    win.webContents.setZoomFactor(zoomFactor)
  })

  // 原生玻璃在内容首次加载完成后挂到窗口背后
  if (engine === 'native') {
    win.webContents.once('did-finish-load', () => {
      try {
        const glass = loadGlass()
        if (!glass) return
        const id = glass.addView(win.getNativeWindowHandle(), { cornerRadius: 12 })
        if (id >= 0) {
          const variant = Number(process.env['WB_GLASS_VARIANT'])
          if (Number.isInteger(variant)) glass.unstable_setVariant(id, variant)
          console.log(`[glass] native Liquid Glass 已启用 (view ${id})`)
        } else {
          console.warn('[glass] addView 返回 -1，未应用原生玻璃')
        }
      } catch (err) {
        console.error('[glass] 原生玻璃接入失败，请用 WB_GLASS_ENGINE=vibrancy 回退', err)
      }
    })
  }

  // 页面里打开的 external 链接一律丢给系统浏览器，绝不在应用内新开窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 屏蔽调试快捷键（⌘⌥I / ⌘⌥J / ⌘⇧C / ⌥⌘U 等），正式版不开开发者工具
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const k = (input.key || '').toLowerCase()
    const metaAlt = (input.meta || input.control) && input.alt
    if (metaAlt && ['i', 'j', 'c', 'u', 'k'].includes(k)) event.preventDefault()
    if ((input.meta || input.control) && input.shift && k === 'c') event.preventDefault()
  })


  // —— macOS 全屏红绿灯修复 ——
  // 进/出全屏时切换 data-fullscreen，CSS 据此关闭顶栏拖拽区（否则挡住红绿灯点击/悬停唤出）
  const setFs = (on: boolean): void => {
    void win.webContents.executeJavaScript(
      `document.documentElement.dataset.fullscreen = ${on ? '1' : '0'}`
    ).catch(() => undefined)
  }
  // 全屏时强制红绿灯可见并重置其位置（透明原生玻璃窗口在全屏下容易点不到绿色按钮）
  // 并给渲染层一个可靠退出全屏的通道：界面内的“退出全屏”按钮会走这里
  // 注意：macOS 关闭全部窗口后 activate 会重建窗口，需先移除旧 handler 再注册，避免重复注册报错
  ipcMain.removeHandler('shell:toggleFullscreen')
  ipcMain.handle('shell:toggleFullscreen', () => {
    win.setFullScreen(!win.isFullScreen())
  })
  // 启动后确保红绿灯可见
  try {
    win.setWindowButtonVisibility(true)
  } catch {
    /* 旧系统忽略 */
  }
  win.on('enter-full-screen', () => {
    setFs(true)
    try {
      win.setWindowButtonVisibility(true)
      setTrafficLight(win, 12, 12)
    } catch {
      /* 旧系统忽略 */
    }
  })
  win.on('leave-full-screen', () => {
    setFs(false)
    try {
      setTrafficLight(win, 18, 18)
    } catch {
      /* 旧系统忽略 */
    }
  })
  // 兜底：⌃⌘F 手动切换全屏（菜单被精简后系统快捷键不生效，这里补上）
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if ((input.control || input.meta) && input.control && input.meta && (input.key || '').toLowerCase() === 'f') {
      event.preventDefault()
      win.setFullScreen(!win.isFullScreen())
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
