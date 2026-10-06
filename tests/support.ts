import { expect, type Locator, type Page } from '@playwright/test';

export const BASE_URL = process.env.BASE_URL!;

export const isDark = (page: Page) => page.evaluate(() => document.body.classList.contains('dark'));

// SPEC.md line 10 does not name the button, so click each visible button in the nav
// until one flips the 'dark' class on <body>. Returns that button, already clicked once.
export async function clickDarkToggle(page: Page): Promise<Locator> {
  const buttons = page.getByRole('navigation').getByRole('button').filter({ visible: true });
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const before = await isDark(page);
    await buttons.nth(i).click();
    try {
      await expect.poll(() => isDark(page), { timeout: 1000 }).toBe(!before);
      return buttons.nth(i);
    } catch {
      // not the toggle, try the next button
    }
  }
  throw new Error(`None of the ${count} visible button(s) in the nav toggled the 'dark' class on <body>.`);
}
