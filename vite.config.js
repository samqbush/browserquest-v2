import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const clientRoot = fileURLToPath(new URL('./client', import.meta.url));
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = path.resolve(repoRoot, 'client/dist');

// Directories whose files are referenced by runtime-built string paths
// (sprite PNGs, audio, map JSON, tilesheets, fonts). Vite's module graph
// cannot see these, so copy them verbatim into the build output.
const staticAssetDirs = ['img', 'audio', 'maps', 'sprites', 'fonts'];

// Classic (non-module) scripts referenced directly by index.html. They run
// before the deferred ESM entry (they set the Detect/Modernizr globals the
// inline feature-detection scripts rely on), so Vite leaves them as-is and we
// copy them verbatim into the build output.
const staticAssetFiles = [
  'js/detect.js',
  'js/lib/modernizr.js',
  'js/lib/css3-mediaqueries.js',
  'css/ie.css',
];

// The shared protocol module (shared/js/gametypes.js) is a dual-runtime file:
// the Node server and the Vitest suite consume it as CommonJS (module.exports),
// so it must stay CommonJS on disk. Vite does NOT auto-interop local CommonJS
// *source* files in dev (it serves them verbatim, which throws "require is not
// defined" in the browser). This plugin rewrites only that one file to ESM for
// the client, in both dev and build, without touching the on-disk source.
function sharedCjsToEsm() {
  return {
    name: 'browserquest-shared-cjs-to-esm',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.replace(/\\/g, '/').split('?')[0];
      if (!normalizedId.endsWith('shared/js/gametypes.js')) return null;
      let out = code.replace(
        /var\s+_\s*=\s*require\(['"]underscore['"]\);?/,
        "import _ from 'underscore';"
      );
      out = out.replace(
        /if\s*\(\s*!\(\s*typeof exports === ['"]undefined['"]\s*\)\s*\)\s*\{\s*module\.exports\s*=\s*Types;?\s*\}/,
        'export default Types;'
      );
      return { code: out, map: null };
    },
  };
}

function copyStaticAssets() {
  return {
    name: 'browserquest-copy-static-assets',
    apply: 'build',
    async closeBundle() {
      for (const dir of staticAssetDirs) {
        const from = path.resolve(clientRoot, dir);
        const to = path.resolve(outDir, dir);
        await cp(from, to, { recursive: true }).catch((err) => {
          if (err.code !== 'ENOENT') throw err;
        });
      }
      for (const file of staticAssetFiles) {
        const from = path.resolve(clientRoot, file);
        const to = path.resolve(outDir, file);
        await mkdir(path.dirname(to), { recursive: true });
        await cp(from, to).catch((err) => {
          if (err.code !== 'ENOENT') throw err;
        });
      }
    },
  };
}

export default defineConfig({
  root: 'client',
  // Relative base: the client is hosted as static files by a separate web
  // server (the game server does not serve it), so avoid absolute paths.
  base: './',
  publicDir: false,
  plugins: [sharedCjsToEsm(), copyStaticAssets()],
  resolve: {
    alias: {
      // Shared protocol module lives outside the client root.
      shared: path.resolve(repoRoot, 'shared'),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    fs: {
      // Allow importing the dual-runtime shared/ module from outside root.
      allow: [clientRoot, path.resolve(repoRoot, 'shared')],
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2020',
  },
});
