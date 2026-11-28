// usage: (cd frontend && node start-vite.mjs <viteport> <apiport>)
import { createRequire } from 'node:module'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const fe = process.cwd(); const req = createRequire(path.join(fe, 'package.json'));
const dir = path.dirname(req.resolve('vite/package.json'));
const { createServer } = await import(pathToFileURL(path.join(dir, 'dist/node/index.js')).href);
const [,, vp, ap] = process.argv;
const s = await createServer({ root: fe, configFile: path.join(fe, 'vite.config.ts'), cacheDir: path.join(process.env.TEMP, 'nolyx-vite-' + vp), server: { port: +vp, strictPort: true, proxy: { '/api': { target: `http://localhost:${ap}`, changeOrigin: true } } } });
await s.listen(); console.log('vite', vp, '->', ap);
