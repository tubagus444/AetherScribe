import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4177',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } }],
  webServer: {
    command: 'node --import tsx e2e/server.ts',
    url: 'http://127.0.0.1:4177',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: '4177', NODE_ENV: 'development', DISABLE_HMR: 'true',
      GEMINI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '',
      CLAUDE_API_KEY: '', HF_API_KEY: '', HUGGINGFACE_API_KEY: '', OPENAI_API_KEY: '',
    },
  },
});
