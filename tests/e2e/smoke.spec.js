import { test, expect } from '@playwright/test';

// End-to-end smoke test for the Vite/ESM client (Phase 2).
//
// Boots the production `dist/` build (served by `vite preview`) against a live
// Phase-1 game server and asserts real signals rather than "a canvas exists":
//   - no uncaught page errors and no console errors while loading + starting,
//   - the WebSocket transport actually connects,
//   - the game reaches the "started" state (server welcome received),
//   - the rendering pipeline draws non-transparent pixels onto the canvases.

const PLAYER_NAME = 'E2ESmoke';

test('client builds, boots, connects and renders against a live server', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];

  // The upstream repo does not ship the licensed background-music assets
  // (only audio/sounds/* exist), so a missing-music load error is expected and
  // environmental rather than a client regression. Everything else is strict.
  const isBenignError = (text) =>
    /audio\/music\/.*could not be loaded/i.test(text);

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isBenignError(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  let wsConnected = false;
  page.on('websocket', () => {
    wsConnected = true;
  });

  // Start from a clean slate so the "first time playing" / stored-name paths
  // don't change the start flow.
  await page.goto('/');
  await page.evaluate(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
  });
  await page.reload();

  // Wait until the ESM entry graph has wired up the UI.
  const nameInput = page.locator('#nameinput');
  await expect(nameInput).toBeVisible({ timeout: 30_000 });

  await nameInput.fill(PLAYER_NAME);

  // The play button enables once a name is present (watched on an interval).
  const playButton = page.locator('#createcharacter .play div');
  await expect(page.locator('#createcharacter .play')).not.toHaveClass(/disabled/, {
    timeout: 10_000,
  });
  await playButton.click();

  // The server welcome callback adds the "started" class to <body>.
  await expect(page.locator('body')).toHaveClass(/started/, { timeout: 45_000 });

  // The WebSocket must have actually opened to reach "started".
  expect(wsConnected, 'expected a WebSocket connection to be opened').toBe(true);

  // Give the renderer a moment to draw the map + entities after spawn.
  await page.waitForTimeout(3_000);

  const hasPixels = async (canvasId) =>
    page.evaluate((id) => {
      const canvas = document.getElementById(id);
      if (!canvas || !canvas.width || !canvas.height) return false;
      const ctx = canvas.getContext('2d');
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0) return true; // any non-transparent pixel
      }
      return false;
    }, canvasId);

  // Background tilesheet must have rendered.
  expect(await hasPixels('background'), 'background canvas should have pixels').toBe(true);
  // Entities layer (player/mobs) must have rendered after spawn.
  expect(await hasPixels('entities'), 'entities canvas should have pixels').toBe(true);

  expect(pageErrors, `unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
  expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});
