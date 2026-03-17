import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env vars regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // CRITICAL: Set base to './' so that index.html 
    // looks for assets in the same folder, preventing MIME type errors.
    base: './',
    
    plugins: [react(), tailwindcss()],
    
    define: {
      // This maps the env variable so your code can access it via process.env
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
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
      // Ensures the output directory is clean
      outDir: 'dist',
      emptyOutDir: true,
    }
  };
});
