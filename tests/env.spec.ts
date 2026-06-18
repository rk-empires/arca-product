import { test, expect } from '@playwright/test';

// Confirms dotenv loaded the Supabase env vars from .env into the config.
test('supabase env vars are loaded from .env', () => {
  expect(process.env.SUPABASE_URL, 'SUPABASE_URL should be set in .env').toBeTruthy();
  expect(process.env.SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY should be set in .env').toBeTruthy();
});
