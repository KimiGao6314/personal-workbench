import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    // 主进程依赖（除 electron 外基本没有）不打进产物，保持 out/main 干净
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        // 渲染进程里用 @shared/xxx 引用 src/shared 下的共享类型
        '@shared': resolve('src/shared')
      }
    }
  }
})
