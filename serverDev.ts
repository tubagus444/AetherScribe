import { loadRuntimeEnv } from './src/server/runtimeConfig';
import { startServer } from './server';

async function main() {
  loadRuntimeEnv('development');
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  try { await startServer({ middleware: vite.middlewares }); }
  catch (error) { await vite.close(); throw error; }
}
main().catch(error => { console.error('Startup gagal:', error.message); process.exitCode = 1; });
