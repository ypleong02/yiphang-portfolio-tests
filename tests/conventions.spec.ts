import { test, expect } from '@playwright/test';

// Requirements from the "Conventions" section of SPEC.md (lines 4-7).

const BASE_URL = process.env.BASE_URL!;

test('SPEC.md line 4: all six sections exist', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // "Sections" is read as "elements with these ids"; the spec does not name a tag.
  for (const id of ['hero', 'about', 'skills', 'projects', 'repos', 'contact']) {
    expect.soft(await page.locator(`#${id}`).count(), `element with id "${id}"`).toBe(1);
  }
});

test('SPEC.md line 5: no horizontal scroll at a viewport width of 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  const { innerWidth, scrollWidth, clientWidth } = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(innerWidth).toBe(375);
  expect(scrollWidth, 'page content is wider than the viewport').toBeLessThanOrEqual(clientWidth);
});

test('SPEC.md line 6: #repos shows repo cards or a plain message', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  const repos = page.locator('#repos');
  await expect(repos).toBeAttached();

  // The spec does not say what a card looks like or what the message says, so:
  // - a card is counted as a link inside #repos to a GitHub repo (github.com/<owner>/<repo>);
  // - a message is counted as any text inside #repos other than its headings.
  // Either one satisfies the requirement. Which case applies depends on the live site,
  // so the "no repos" and "fetch fails" branches are not forced here.
  await expect(async () => {
    const cards = await repos.locator('a[href]').evaluateAll(
      (links) =>
        links.filter((a) =>
          /^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+\/?$/.test((a as HTMLAnchorElement).href),
        ).length,
    );
    const message = await repos.evaluate((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => h.remove());
      return (copy.textContent ?? '').trim();
    });
    expect(cards > 0 || message.length > 0, '#repos has neither repo cards nor a message').toBe(true);
  }).toPass({ timeout: 10_000 });
});

test('SPEC.md line 7: #hero and #contact link to email, GitHub and LinkedIn', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Read as: each of the two sections contains all three links.
  const links = {
    email: 'a[href^="mailto:"]',
    GitHub: 'a[href*="github.com"]',
    LinkedIn: 'a[href*="linkedin.com"]',
  };
  for (const section of ['#hero', '#contact']) {
    for (const [name, selector] of Object.entries(links)) {
      const count = await page.locator(section).locator(selector).count();
      expect.soft(count, `${name} link in ${section}`).toBeGreaterThan(0);
    }
  }
});
