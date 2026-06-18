import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// End-to-end test for the contact form on the live site:
//   1. Submits the form against the deployed Vercel URL.
//   2. Verifies the success message appears.
//   3. Confirms the row was actually written to the Supabase `signups` table.
//
// The browser submission and the database check live in separate test.step()s,
// so if the form *looks* like it worked but the DB write failed (or vice versa),
// the report tells you exactly which half broke.

// Read the target URL from the environment, defaulting to the live deployment.
// Root ("/") redirects to /product.html, which hosts the contact form.
const SITE_URL = process.env.SITE_URL || 'https://arca-product.vercel.app';

// A timestamp keeps each run's email unique so we never collide on prior rows.
const STAMP = Date.now();
const TEST_NAME = 'Playwright Test User';
const TEST_EMAIL = `playwright-test+${STAMP}@example.com`;
const TEST_MESSAGE = 'This is an automated test submission';

test('contact form submits and persists to Supabase', async ({ page }) => {
  await test.step('Open the live site and scroll to the contact form', async () => {
    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });

    // The form lives in the #contact section near the bottom of the page.
    const contact = page.locator('#contact');
    await contact.scrollIntoViewIfNeeded();
    await expect(page.locator('form.contact-form')).toBeVisible();
  });

  await test.step('Fill in and submit the form', async () => {
    await page.fill('#contact-name', TEST_NAME);
    await page.fill('#contact-email', TEST_EMAIL);
    await page.fill('#contact-message', TEST_MESSAGE);
    await page.click('form.contact-form button[type="submit"]');
  });

  await test.step('Verify the success message appears within 5 seconds', async () => {
    const status = page.locator('.form-status');
    // The site sets text "Thanks — we'll be in touch." and adds the .ok class on success.
    await expect(status).toHaveClass(/\bok\b/, { timeout: 5000 });
    await expect(status).toContainText(/thanks/i, { timeout: 5000 });
  });

  await test.step('Verify the row was created in Supabase', async () => {
    const url = process.env.SUPABASE_URL;
    // The anon key has INSERT-only RLS (no SELECT), so read-back must use the
    // service-role key, which bypasses RLS. Fall back to anon only if it's absent.
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    expect(url, 'SUPABASE_URL must be set in .env').toBeTruthy();
    expect(key, 'SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY) must be set in .env').toBeTruthy();

    const supabase = createClient(url!, key!);

    const { data, error } = await supabase
      .from('signups')
      .select('id, name, email, message, created_at')
      .eq('email', TEST_EMAIL)
      .order('created_at', { ascending: false })
      .limit(1);

    expect(error, error ? `Supabase query error: ${error.message}` : undefined).toBeNull();
    expect(data, 'No row found in `signups` for the test email').not.toBeNull();
    expect(data!.length, `Expected exactly 1 row for ${TEST_EMAIL}`).toBe(1);

    const row = data![0];
    expect(row.name).toBe(TEST_NAME);
    expect(row.email).toBe(TEST_EMAIL);
    expect(row.message).toBe(TEST_MESSAGE);

    console.log(`✅ Verified Supabase row ${row.id} created at ${row.created_at} for ${TEST_EMAIL}`);
  });
});
