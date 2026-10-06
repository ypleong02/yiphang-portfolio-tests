import { test, expect, type Locator, type Page } from '@playwright/test';
import { BASE_URL, clickDarkToggle, isDark } from './support';

// Requirements from "Issue #4: visual feedback on interaction" in SPEC.md (lines 14-17).
//
// The spec asks for visible changes without saying what they look like, so every check works
// the same way: screenshot the area around an element at rest and in each state, and require
// the pictures to differ. Decisions the spec leaves open are marked "Reading:" below.

// Each element is put through several states, which takes a second or two per element.
test.describe.configure({ timeout: 180_000 });

const SETTLE_MS = 150;

type Target = { name: string; element: Locator; area: Locator };
type Snapshot = {
  shot: Buffer;
  // Length in ms (delay + duration) of each transition or animation started on the way into the state.
  motion: number[];
};
type States = Record<'rest' | 'focus' | 'hover' | 'pressed' | 'released', Snapshot>;

async function openSite(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Reading: a focus state only counts when the site styles it, so the browser's built-in focus
  // ring is switched off. :where() has zero specificity, so any outline the site sets still wins.
  await page.addStyleTag({ content: ':where(:focus-visible) { outline: none; }' });

  // Log every transition or animation the page starts; read back with __takeMotion().
  await page.evaluate(() => {
    const seen = new WeakSet<Animation>();
    const lengths: number[] = [];
    const record = () => {
      for (const animation of document.getAnimations()) {
        if (seen.has(animation)) continue;
        seen.add(animation);
        lengths.push(Number(animation.effect?.getComputedTiming().endTime ?? 0));
      }
    };
    document.addEventListener('transitionrun', record, true);
    document.addEventListener('animationstart', record, true);
    (window as any).__takeMotion = () => {
      record();
      return lengths.splice(0);
    };
  });
}

const takeMotion = (page: Page) => page.evaluate(() => (window as any).__takeMotion() as number[]);

const label = (element: Locator) =>
  element.evaluate(
    (el) =>
      (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) ||
      el.getAttribute('aria-label') ||
      el.getAttribute('href') ||
      el.tagName.toLowerCase(),
  );

// SPEC.md line 14. Reading: the spec does not say which element is a card. "Keyboard focus within
// the card" means every card holds something focusable, so a card is reached through the first
// focusable element in the section (in #repos: the first repo link, as in the line 6 test) and
// the whole section is watched for a change. A change to that element alone cannot be told
// apart from a change to the card around it.
async function findCard(page: Page, section: string): Promise<Target | null> {
  const area = page.locator(section);
  const focusable = area
    .locator('a[href], button, [tabindex]:not([tabindex="-1"])')
    .filter({ visible: true });
  if ((await focusable.count()) === 0) return null;

  let index = 0;
  if (section === '#repos') {
    index = await focusable.evaluateAll((els) =>
      els.findIndex((el) =>
        /^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+\/?$/.test((el as HTMLAnchorElement).href ?? ''),
      ),
    );
    if (index < 0) return null;
  }
  const element = focusable.nth(index);
  return { name: `card in ${section} (${await label(element)})`, element, area };
}

// SPEC.md line 15 names them: hero links, the dark-mode toggle, and nav links.
async function findControls(page: Page): Promise<{ controls: Target[]; toggle: Locator }> {
  const controls: Target[] = [];
  const groups: [string, Locator][] = [
    ['hero link', page.locator('#hero a[href]')],
    ['nav link', page.getByRole('navigation').locator('a[href]')],
  ];
  for (const [kind, group] of groups) {
    const elements = await group.filter({ visible: true }).all();
    expect(elements.length, `visible ${kind}s`).toBeGreaterThan(0);
    for (const element of elements) {
      controls.push({ name: `${kind} (${await label(element)})`, element, area: element });
    }
  }
  const toggle = await clickDarkToggle(page);
  controls.push({ name: 'dark-mode toggle', element: toggle, area: toggle });
  return { controls, toggle };
}

async function findCards(page: Page): Promise<Target[]> {
  const projects = await findCard(page, '#projects');
  expect(projects, '#projects has nothing that can take keyboard focus').not.toBeNull();
  // #repos may legitimately show a message instead of cards (SPEC.md line 6).
  const repos = await findCard(page, '#repos');
  return repos ? [projects!, repos] : [projects!];
}

// Puts the element into each state with real key presses and mouse input, and records what the
// area looks like and which transitions started on the way in.
async function captureStates(page: Page, { name, element, area }: Target): Promise<States> {
  const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(0, 0);
  await blur();
  await takeMotion(page);

  // Keyboard focus comes first: tabbing scrolls the element into view, and nothing scrolls after it.
  let focused = false;
  for (let i = 0; i < 200 && !focused; i++) {
    await page.keyboard.press('Tab');
    focused = await element.evaluate((el) => el === document.activeElement);
  }
  expect(focused, `${name}: cannot be reached with the Tab key`).toBe(true);

  const pad = 24;
  const viewport = page.viewportSize()!;
  const box = (await area.boundingBox())!;
  const left = Math.max(0, Math.floor(box.x - pad));
  const top = Math.max(0, Math.floor(box.y - pad));
  const clip = {
    x: left,
    y: top,
    width: Math.min(viewport.width, Math.ceil(box.x + box.width + pad)) - left,
    height: Math.min(viewport.height, Math.ceil(box.y + box.height + pad)) - top,
  };
  const snapshot = async (): Promise<Snapshot> => {
    await page.waitForTimeout(SETTLE_MS);
    return { motion: await takeMotion(page), shot: await page.screenshot({ clip, animations: 'disabled' }) };
  };

  const focus = await snapshot();

  await blur();
  const rest = await snapshot();
  const restAgain = await snapshot();
  expect(restAgain.shot.equals(rest.shot), `${name}: the page keeps changing on its own, so states cannot be compared`).toBe(true);

  const own = (await element.boundingBox())!;
  const point = { x: own.x + own.width / 2, y: own.y + own.height / 2 };
  const onTop = await element.evaluate((el, p) => el.contains(document.elementFromPoint(p.x, p.y)), point);
  expect(onTop, `${name}: is covered by another element`).toBe(true);

  await page.mouse.move(point.x, point.y);
  const hover = await snapshot();

  await page.mouse.down();
  const pressed = await snapshot();

  // Let go away from the element so that no click happens, then come back to a plain hover.
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.mouse.move(point.x, point.y);
  const released = await snapshot();

  await page.mouse.move(0, 0);
  await blur();
  return { rest, focus, hover, pressed, released };
}

const same = (a: Snapshot, b: Snapshot) => a.shot.equals(b.shot);

function expectCardFeedback(where: string, s: States) {
  expect.soft(same(s.hover, s.rest), `${where}: looks the same on hover as at rest`).toBe(false);
  expect.soft(same(s.focus, s.rest), `${where}: looks the same with keyboard focus as at rest`).toBe(false);
}

// Reading: "distinct" means each state differs from rest, and pressed also differs from hover
// (a press always happens while hovering). Hover and focus-visible may look alike.
function expectControlFeedback(where: string, s: States) {
  expectCardFeedback(where, s);
  expect.soft(same(s.pressed, s.rest), `${where}: looks the same pressed as at rest`).toBe(false);
  expect.soft(same(s.pressed, s.released), `${where}: looks the same pressed as hovered`).toBe(false);
}

for (const section of ['#projects', '#repos']) {
  test(`SPEC.md line 14: cards in ${section} visibly change on hover and keyboard focus`, async ({ page }) => {
    await openSite(page);

    const card = await findCard(page, section);
    if (section === '#repos') {
      test.skip(!card, '#repos shows no repo cards on this site (SPEC.md line 6 allows a message instead)');
    }
    expect(card, `${section} has nothing that can take keyboard focus`).not.toBeNull();

    expectCardFeedback(card!.name, await captureStates(page, card!));
  });
}

test('SPEC.md line 15: buttons and nav links have distinct hover, focus-visible and pressed states', async ({ page }) => {
  await openSite(page);

  const { controls } = await findControls(page);
  for (const control of controls) {
    expectControlFeedback(control.name, await captureStates(page, control));
  }
});

test('SPEC.md line 16: changes are animated with transitions of 200ms or less', async ({ page }) => {
  await openSite(page);

  // Reading: every element must start a transition on hover. Focus and pressed changes are not
  // required to be animated, but any transition they start must respect the limit too.
  const targets = [...(await findCards(page)), ...(await findControls(page)).controls];
  for (const target of targets) {
    const s = await captureStates(page, target);
    const longest = Math.max(0, ...s.focus.motion, ...s.hover.motion, ...s.pressed.motion);
    expect.soft(s.hover.motion.length, `${target.name}: transitions started on hover`).toBeGreaterThan(0);
    expect.soft(longest, `${target.name}: longest transition in ms`).toBeLessThanOrEqual(200);
  }
});

test('SPEC.md line 16: animations are off under prefers-reduced-motion: reduce', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openSite(page);

  // Reading: "turned off" allows a transition of 1ms or less, a common way of switching them off.
  const targets = [...(await findCards(page)), ...(await findControls(page)).controls];
  for (const target of targets) {
    const s = await captureStates(page, target);
    const longest = Math.max(0, ...s.focus.motion, ...s.hover.motion, ...s.pressed.motion);
    expect.soft(longest, `${target.name}: longest transition in ms`).toBeLessThanOrEqual(1);
  }
});

test('SPEC.md line 17: the effects work in both light and dark mode', async ({ page }) => {
  await openSite(page);

  // Dark mode is the 'dark' class on <body> (SPEC.md line 10); light mode is its absence.
  const cards = await findCards(page);
  const { controls, toggle } = await findControls(page);
  for (const dark of [false, true]) {
    if ((await isDark(page)) !== dark) {
      await toggle.click();
      await expect.poll(() => isDark(page)).toBe(dark);
    }
    const mode = dark ? 'dark mode' : 'light mode';
    for (const card of cards) {
      expectCardFeedback(`${mode}, ${card.name}`, await captureStates(page, card));
    }
    for (const control of controls) {
      expectControlFeedback(`${mode}, ${control.name}`, await captureStates(page, control));
    }
  }
});
