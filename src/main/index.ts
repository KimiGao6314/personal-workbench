/**
 * 主进程入口：负责应用生命周期与窗口创建。
 * 模块数据不在这里写死——见 store.ts（通用 JSON 持久化）。
 */
import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { registerStoreIpc } from './store'
import { registerShellIpc } from './shell'
import { registerPhotosIpc } from './photos'
import { registerBackgroundIpc } from './background'
import { maybeAutoScreenshot } from './screenshot'
import { registerLicenseIpc } from './license'
import { registerNotifyIpc } from './notify'

// 渲染优化：开启 GPU 栅格化，降低透明玻璃窗口快速滚动时的重绘抖动/闪屏
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

// 单实例：再启动一次时聚焦已有窗口
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    // 通用数据存储 IPC（每个模块一个 namespace，自动落到 userData/data/*.json）
    registerStoreIpc()
    // 本地文件能力 IPC（打开 / 显示 / 选择路径）
    registerShellIpc()
    // 证据照片存取 IPC（外借记录）
    registerPhotosIpc()
    // 授权 IPC（注册窗口用；未授权不再退出，由界面引导注册）
    registerLicenseIpc()
    registerNotifyIpc()
    // 背景图片 IPC
    registerBackgroundIpc()
    createMainWindow()
    maybeAutoScreenshot()

    // macOS：点击 Dock 图标且无窗口时重建
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  // macOS 上关闭全部窗口后应用驻留 Dock，其他平台直接退出
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
