import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': '/src'
        }
    },
    server: {
        proxy: {
            '/ali-geo': {
                target: 'https://geo.datav.aliyun.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/ali-geo/, '')
            }
        }
    }
})
