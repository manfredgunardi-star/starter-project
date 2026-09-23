import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Vite 8 memakai Rolldown; manualChunks wajib berupa fungsi (plan ditulis untuk API Rollup).
        manualChunks(id) {
          const p = id.split('\\').join('/');
          if (p.includes('/node_modules/@supabase/supabase-js/')) return 'supabase';
          if (p.includes('/node_modules/antd/') || p.includes('/node_modules/@ant-design/icons/')) return 'antd';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    include: ['src/**/*.test.{js,jsx}'],
  },
});
