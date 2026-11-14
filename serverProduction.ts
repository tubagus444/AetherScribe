import { loadRuntimeEnv } from './src/server/runtimeConfig';
import { startServer } from './server';

loadRuntimeEnv('production');
startServer({ distPath: __dirname }).catch(error => {
  console.error('Startup gagal:', error.message);
  process.exitCode = 1;
});
