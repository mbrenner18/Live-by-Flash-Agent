import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  // No need to loadEnv manually for standard VITE_ variables
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // This helps debug by making the code readable in the browser console
    sourcemap: true, 
  },
});
