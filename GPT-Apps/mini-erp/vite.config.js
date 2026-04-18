import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('@firebase/firestore') || id.includes('firebase/firestore')) {
            return 'firebase-firestore';
          }
          if (id.includes('@firebase/auth') || id.includes('firebase/auth')) {
            return 'firebase-auth';
          }
          if (id.includes('@firebase/app') || id.includes('firebase/app')) {
            return 'firebase-app';
          }
          if (id.includes('xlsx')) {
            return 'xlsx-export';
          }
          if (id.includes('jspdf') || id.includes('fflate')) {
            return 'pdf-export';
          }
          if (id.includes('react-router-dom') || id.includes('react-router') || id.includes('@remix-run/router')) {
            return 'router';
          }
          if (id.includes('lucide-react')) {
            return 'ui-icons';
          }
          if (id.includes('react') || id.includes('scheduler')) {
            return 'react';
          }

          return 'vendor';
        },
      },
    },
  },
});
