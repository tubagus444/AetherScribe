import { config } from 'dotenv';

export function loadRuntimeEnv(mode: 'development' | 'production') {
  // Environment proses menang atas .env di working directory; mode ditentukan entry point.
  config({ quiet: true });
  process.env.NODE_ENV = mode;
}

export function runtimePort(value: string | undefined): number {
  if (value === undefined) return 3000;
  if (!/^[0-9]+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('PORT harus berupa bilangan bulat 1-65535.');
  }
  return Number(value);
}
