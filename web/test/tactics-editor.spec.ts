/**
 * tactics-editor.spec.ts — E2E test for the tactics editor page.
 *
 * Skips when no live API/match data is available (development placeholder).
 */

import { test, expect } from '@playwright/test';
import { test as baseTest } from './fixtures';

const testWithMatch = baseTest;

testWithMatch.describe('Tactics Editor', () => {
  testWithMatch('PAGE_LOADS - /matches/[id]/tactics page renders without console errors', async ({ page, testMatchId }) => {
    if (testMatchId === 'test-match-placeholder') {
      testWithMatch.skip();
      return;
    }

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/en/matches/${testMatchId}/tactics`);
    await page.waitForLoadState('networkidle');

    // Page header is visible
    await expect(page.getByRole('heading', { level: 1, name: /tactics editor/i })).toBeVisible();

    // 18 pitch slots + 6 bench slots are rendered
    const pitchSlots = page.locator('[data-slot]:not([data-slot^="BENCH_"])');
    const benchSlots = page.locator('[data-slot^="BENCH_"]');
    await expect(pitchSlots).toHaveCount(18);
    await expect(benchSlots).toHaveCount(6);

    // No critical console errors (favicon/hydration noise excluded)
    const critical = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('hydration'),
    );
    expect(critical).toEqual([]);
  });

  testWithMatch('DIMENSIONS - tempo segmented control toggles between values', async ({ page, testMatchId }) => {
    if (testMatchId === 'test-match-placeholder') {
      testWithMatch.skip();
      return;
    }

    await page.goto(`/en/matches/${testMatchId}/tactics`);
    await page.waitForLoadState('networkidle');

    const fast = page.locator('[data-testid="dimension-fast"]');
    const balanced = page.locator('[data-testid="dimension-balanced"]');
    await expect(fast).toBeVisible();
    await expect(balanced).toBeVisible();

    // Click fast
    await fast.click();
    await expect(fast).toHaveClass(/bg-primary/);
  });

  testWithMatch('SUBMIT_DISABLED - submit button is disabled when lineup is empty', async ({ page, testMatchId }) => {
    if (testMatchId === 'test-match-placeholder') {
      testWithMatch.skip();
      return;
    }

    await page.goto(`/en/matches/${testMatchId}/tactics`);
    await page.waitForLoadState('networkidle');

    const submit = page.locator('[data-testid="submit-tactics"]');
    await expect(submit).toBeVisible();
    // Should be disabled because validation is invalid
    await expect(submit).toBeDisabled();
  });
});

test.describe('Tactics Editor (no API)', () => {
  test('SMOKE - placeholder mode does not crash', async ({ page }) => {
    // Use a synthetic ID — page will fail to load and show error state, which is OK
    await page.goto('/en/matches/synthetic-id/tactics');
    await page.waitForLoadState('domcontentloaded');
    // Either editor loads (no-op) or error state shows; both are acceptable
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});
