import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const geminiKey =
    env._VITE_GEMINI_API_KEY ||
    env.VITE_GEMINI_API_KEY ||
    env.GEMINI_API_KEY ||
    '';

  return {
    base: '/',

    plugins: [react(), tailwindcss()],

    define: {
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiKey),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    server: {
      host: '0.0.0.0',
      port: 8080,
    },

    preview: {
      host: '0.0.0.0',
      port: 8080,
      allowedHosts: true,
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
