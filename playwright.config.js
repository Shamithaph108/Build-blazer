import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser',fullyParallel:false,workers:1,
  use:{baseURL:'http://localhost:3100',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
  webServer:{command:'node tests/browser-server.js',url:'http://localhost:3100/health',reuseExistingServer:false,timeout:30000},
});
