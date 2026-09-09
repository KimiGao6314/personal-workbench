/**
 * preload：用 contextBridge 把最小 API 暴露给渲染进程。
 * 只暴露白名单方法，渲染进程拿不到 Node / IPC 本体。
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { WorkbenchBridge } from '../shared/api'

const bridge: WorkbenchBridge = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? ''
  },
  store: {
    read: (ns) => ipcRenderer.invoke('store:read', ns),
    write: (ns, data) => ipcRenderer.invoke('store:write', ns, data)
  },
  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    pickFile: () => ipcRenderer.invoke('shell:pickFile'),
    pickDir: () => ipcRenderer.invoke('shell:pickDir'),
    getFileIcon: (p) => ipcRenderer.invoke('shell:getFileIcon', p),
    toggleFullscreen: () => ipcRenderer.invoke('shell:toggleFullscreen')
  },
  photos: {
    save: (dataUrl) => ipcRenderer.invoke('photo:save', { dataUrl }),
    read: (name) => ipcRenderer.invoke('photo:read', name),
    delete: (name) => ipcRenderer.invoke('photo:delete', name)
  },
  bg: {
    pick: () => ipcRenderer.invoke('bg:pick'),
    read: (name) => ipcRenderer.invoke('bg:read', name)
  },
  license: {
    state: () => ipcRenderer.invoke('license:state'),
    activate: (device, code) => ipcRenderer.invoke('license:activate', { device, code })
  },
  notify: {
    show: (title, body) => ipcRenderer.invoke('notify:show', { title, body })
  },
  calendar: {
    events: (from, to) => ipcRenderer.invoke('calendar:events', { from, to })
  }
}

contextBridge.exposeInMainWorld('workbench', bridge)
