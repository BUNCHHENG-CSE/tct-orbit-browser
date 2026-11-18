import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // Bundle and tree-shake all lightweight pure-JS dependencies into out/main/index.js
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@ghostery/adblocker-electron', 'cross-fetch', 'dotenv', 'zod']
      })
    ],
    resolve: {
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared'),
        '@resources': resolve('resources')
      }
    },
    build: {
      minify: 'esbuild',
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve('electron/main.ts')
        }
      }
    }
  },
  preload: {
    // Bundle lightweight helpers into out/preload/index.js without external dependencies
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared'),
        '@resources': resolve('resources')
      }
    },
    build: {
      minify: 'esbuild',
      sourcemap: false,
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
      minify: 'esbuild',
      sourcemap: false,
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
