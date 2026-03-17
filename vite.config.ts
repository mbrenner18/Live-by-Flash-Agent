import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env vars from the current working directory.
  // The third parameter '' allows us to load variables that don't start with VITE_
  const env = loadEnv(mode, process.cwd(), '');

  // Determine the key by checking common naming variations in Cloud Build
  const geminiKey = env._VITE_GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY;

  return {
    // Ensures relative paths for assets to avoid MIME type errors
    base: './',
    
    plugins: [react(), tailwindcss()],
    
    define: {
      // Maps the key to both access methods to prevent "undefined" errors
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiKey),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiKey),
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      host: '0.0.0.0',
      port: 8080,
    },

    preview: {
      host: '0.0.0.0',
      port: 8080,
      allowedHosts: true
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
    }
  };
});
