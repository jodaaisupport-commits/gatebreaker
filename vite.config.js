import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
const built = new Date().toISOString();
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_TIME__: JSON.stringify(built) },
  plugins: [{ name: 'version-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version, built }) }); } }],
});
