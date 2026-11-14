import { createServer } from 'vite';
import { startServer } from '../server';
import { loadRuntimeEnv } from '../src/server/runtimeConfig';

loadRuntimeEnv('development');
// Do not share optimizer files or HMR sockets with the user's dev server.
async function main() {
  const vite = await createServer({
    cacheDir: 'node_modules/.vite-e2e',
    server: { middlewareMode: true, hmr: { port: 4178 } },
    appType: 'spa',
  });
  try { await startServer({ middleware: vite.middlewares }); }
  catch (error) { await vite.close(); throw error; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
