import { test, expect } from '@playwright/test';
import { BASE_URL, clickDarkToggle, isDark } from './support';

// Requirements from "Issue #1: dark-mode toggle" in SPEC.md (lines 10-11).

test("SPEC.md line 10: a button in the nav toggles a 'dark' class on <body>", async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // The spec does not say which state the page starts in, so only the flips are checked.
  const initial = await isDark(page);
  const toggle = await clickDarkToggle(page);
  expect(await isDark(page)).toBe(!initial);

  await toggle.click();
  await expect.poll(() => isDark(page), 'second click toggles back').toBe(initial);

  await toggle.click();
  await expect.poll(() => isDark(page), 'third click toggles again').toBe(!initial);
});

test('SPEC.md line 11: the choice is kept for the session', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // "Kept for the session" is not defined in the spec. It is read here as: the choice
  // survives a reload in the same tab. Nothing is asserted about other tabs, or about
  // whether the choice is forgotten when the browser is closed.
  const initial = await isDark(page);
  const toggle = await clickDarkToggle(page);

  await page.reload({ waitUntil: 'networkidle' });
  expect(await isDark(page), 'choice after reload').toBe(!initial);

  await toggle.click();
  await expect.poll(() => isDark(page)).toBe(initial);

  await page.reload({ waitUntil: 'networkidle' });
  expect(await isDark(page), 'choice after toggling back and reloading').toBe(initial);
});
