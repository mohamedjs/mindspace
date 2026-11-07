import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

export function getHostPermissionFromUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    return `${url.origin}/*`;
  } catch {
    return `${apiUrl.replace(/\/+$/, '')}/*`;
  }
}

export function generateManifest(rawManifest: any, apiUrl: string) {
  const hostPermission = getHostPermissionFromUrl(apiUrl);
  return {
    ...rawManifest,
    manifest_version: 3,
    permissions: ['tabCapture', 'offscreen', 'storage', 'activeTab'],
    host_permissions: [hostPermission],
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
  };
}

export default defineConfig(({ mode }) => {
  const apiUrl = process.env.VITE_API_URL || 'http://localhost:8080';

  return {
    plugins: [
      react(),
      {
        name: 'vite-plugin-extension-manifest',
        closeBundle() {
          const manifestPath = path.resolve(__dirname, 'manifest.json');
          const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          const finalManifest = generateManifest(raw, apiUrl);
          const outDir = path.resolve(__dirname, 'dist');
          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
          }
          fs.writeFileSync(
            path.resolve(outDir, 'manifest.json'),
            JSON.stringify(finalManifest, null, 2)
          );
        },
      },
    ],
    define: {
      'process.env.VITE_API_URL': JSON.stringify(apiUrl),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: path.resolve(__dirname, 'popup.html'),
          offscreen: path.resolve(__dirname, 'offscreen.html'),
          background: path.resolve(__dirname, 'src/background.ts'),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'background') {
              return 'background.js';
            }
            return 'assets/[name].js';
          },
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
  };
});
