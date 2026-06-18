import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Browser QA sweep against the live site:
//   - Screenshot the landing page.
//   - Discover every link in the nav and footer.
//   - Follow only internal links (same origin); skip external/social links.
//   - For each internal page: assert HTTP 200, no obvious error text, screenshot it.
//   - Return home and confirm the contact form blocks an empty submit (required validation).
//   - Emit a markdown report to tests/qa-report.md.

const SITE_URL = process.env.SITE_URL || 'https://arca-product.vercel.app';

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const REPORT_PATH = path.join(__dirname, 'qa-report.md');

type Row = {
  name: string;
  url: string;
  status: number | string;
  hasNav: boolean;
  hasFooter: boolean;
  screenshot: string;
};

// Turn a URL into a safe-ish file name for its screenshot.
function slug(url: string): string {
  const u = new URL(url);
  const base = (u.pathname.replace(/\/$/, '') || '/index').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return base || 'home';
}

// Obvious error markers that indicate a page failed to render properly.
const ERROR_PATTERNS = [
  /\b404\b/i,
  /\b500\b/i,
  /page not found/i,
  /not found/i,
  /something went wrong/i,
  /application error/i,
  /this page could.?n.?t be found/i,
];

test('browser QA sweep of nav/footer links + form validation', async ({ page }) => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const rows: Row[] = [];
  const origin = new URL(SITE_URL).origin;

  // ---- Landing page ----------------------------------------------------
  const homeResp = await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });
  const homeUrl = page.url();
  const homeShot = path.join(SCREENSHOT_DIR, `${slug(homeUrl)}.png`);
  await page.screenshot({ path: homeShot, fullPage: true });

  rows.push({
    name: 'Landing page',
    url: homeUrl,
    status: homeResp?.status() ?? 'no-response',
    hasNav: (await page.locator('nav').count()) > 0,
    hasFooter: (await page.locator('footer').count()) > 0,
    screenshot: path.relative(__dirname, homeShot),
  });

  // ---- Discover internal links in nav + footer -------------------------
  const hrefs = await page.locator('nav a, footer a').evaluateAll((els) =>
    els.map((e) => (e as HTMLAnchorElement).href).filter(Boolean),
  );

  const seen = new Set<string>([new URL(homeUrl).pathname]);
  const internal: string[] = [];
  for (const href of hrefs) {
    let u: URL;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    // Skip external/social links (different origin) and non-http schemes.
    if (u.origin !== origin) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    // Skip pure same-page anchors (#services etc.) — they don't load a new page.
    if (u.pathname === new URL(homeUrl).pathname && u.hash) continue;
    if (seen.has(u.pathname)) continue;
    seen.add(u.pathname);
    internal.push(u.origin + u.pathname);
  }

  console.log(`Discovered ${internal.length} internal page link(s): ${internal.join(', ') || '(none)'}`);

  // ---- Visit each internal link ----------------------------------------
  for (const link of internal) {
    const resp = await page.goto(link, { waitUntil: 'domcontentloaded' });
    const status = resp?.status() ?? 'no-response';

    const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
    const errorHit = ERROR_PATTERNS.find((re) => re.test(bodyText));
    expect(status, `${link} should return HTTP 200`).toBe(200);
    expect(errorHit, `${link} shows error text: ${errorHit}`).toBeFalsy();

    const shot = path.join(SCREENSHOT_DIR, `${slug(link)}.png`);
    await page.screenshot({ path: shot, fullPage: true });

    rows.push({
      name: (await page.title()) || slug(link),
      url: link,
      status,
      hasNav: (await page.locator('nav').count()) > 0,
      hasFooter: (await page.locator('footer').count()) > 0,
      screenshot: path.relative(__dirname, shot),
    });
  }

  // ---- Return home and test empty-form validation ----------------------
  await page.goto(SITE_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('#contact').scrollIntoViewIfNeeded();

  // Submit with everything empty; the browser's required-field validation
  // should block the submit, so the required inputs stay invalid and no
  // success status appears.
  await page.locator('form.contact-form button[type="submit"]').click();

  const nameInvalid = await page
    .locator('#contact-name')
    .evaluate((el: HTMLInputElement) => !el.validity.valid && el.validity.valueMissing);
  const emailInvalid = await page
    .locator('#contact-email')
    .evaluate((el: HTMLInputElement) => !el.validity.valid && el.validity.valueMissing);

  expect(nameInvalid, 'Empty Name field should be flagged invalid (required)').toBe(true);
  expect(emailInvalid, 'Empty Email field should be flagged invalid (required)').toBe(true);

  // The success message must NOT have appeared.
  await expect(page.locator('.form-status')).not.toHaveClass(/\bok\b/);
  console.log('✅ Empty contact form was correctly blocked by required-field validation.');

  // ---- Write the markdown report ---------------------------------------
  const header =
    '| Page name | URL | Status | Has nav | Has footer | Screenshot path |\n' +
    '| --- | --- | --- | --- | --- | --- |';
  const body = rows
    .map(
      (r) =>
        `| ${r.name} | ${r.url} | ${r.status} | ${r.hasNav ? '✅' : '❌'} | ${
          r.hasFooter ? '✅' : '❌'
        } | ${r.screenshot} |`,
    )
    .join('\n');

  const report =
    `# Browser QA Report\n\n` +
    `- **Site:** ${SITE_URL}\n` +
    `- **Internal pages checked:** ${rows.length}\n` +
    `- **Empty-form validation:** blocked submit ✅\n\n` +
    `${header}\n${body}\n`;

  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`📄 Wrote QA report to ${REPORT_PATH}`);
});
