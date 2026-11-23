import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // Bundle and tree-shake all lightweight pure-JS dependencies into out/main/index.js
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@ghostery/adblocker-electron', 'dotenv', 'zod']
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
        },
        onwarn(warning, warn) {
          if (warning.code === 'INVALID_ANNOTATION') return
          warn(warning)
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
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        input: {
          index: resolve('src/index.html')
        },
        onwarn(warning, warn) {
          if (warning.code === 'INVALID_ANNOTATION') return
          warn(warning)
        },
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-motion': ['framer-motion'],
            'vendor-icons': ['lucide-react']
          }
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
