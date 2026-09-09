/// <reference types="vite/client" />

import type { WorkbenchBridge } from '../../shared/api'

declare global {
  interface Window {
    /** preload 通过 contextBridge 注入；在纯浏览器里打开时不存在 */
    workbench?: WorkbenchBridge
  }
}

export {}
