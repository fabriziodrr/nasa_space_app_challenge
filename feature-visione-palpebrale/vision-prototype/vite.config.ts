import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const base = env.VITE_APP_BASE_PATH?.trim() || '/';

  if (!/^\/(?:[^?#\\]*\/)?$/.test(base) || base.startsWith('//')) {
    throw new Error('VITE_APP_BASE_PATH deve essere un percorso locale che inizia e finisce con /.');
  }

  return {
    base,
    plugins: [react()],
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
  };
});
