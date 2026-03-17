import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Look in .env files AND the actual system environment variables
  const geminiKey = env.VITE_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || env._VITE_GEMINI_API_KEY || '';

  return {
    // Changing this to '/' fixes the MIME type issue for Express-served apps
    base: '/', 
    
    plugins: [react(), tailwindcss()],
    
    define: {
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiKey),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiKey),
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Helps debug if the key was actually baked in
      sourcemap: true, 
    }
  };
});
