import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['dotenv'] })],
    resolve: {
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared'),
        '@resources': resolve('resources')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('electron/main.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared'),
        '@resources': resolve('resources')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('electron/preload.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve('src'),
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared'),
        '@resources': resolve('resources')
      }
    },
    plugins: [react()]
  }
})
