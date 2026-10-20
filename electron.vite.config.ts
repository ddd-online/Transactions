import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    // 没有原生模块：把 main 的依赖（zod）一起打进 bundle，打包产物不依赖 node_modules。
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') },
        external: ['electron'],
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
        external: ['electron'],
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    server: {
      port: 16000,
      strictPort: true,
      fs: {
        // 渲染层会 import ../shared（IPC 目录与配置类型），把仓库根放行。
        allow: [resolve(__dirname)],
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/index.html') },
      },
    },
  },
})
