import { test, expect } from '@playwright/test';

test('App startet ohne JS-Fehler', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.locator('body')).not.toBeEmpty();
  expect(errors).toHaveLength(0);
});

test('Root-Element wird gerendert', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('#root');
  await expect(root).toBeAttached();
  // React hat etwas in #root gemountet
  await expect(root).not.toBeEmpty();
});
