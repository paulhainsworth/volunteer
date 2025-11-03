import { test, expect } from '@playwright/test';
import { generateTestUser, setupConsoleErrorTracking } from '../helpers/test-helpers.js';

test.describe('Password Reset Flow', () => {
  let testUser;
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    testUser = generateTestUser();
    consoleErrors = setupConsoleErrorTracking(page);
  });

  test('should display password reset page correctly', async ({ page }) => {
    await page.goto('/#/auth/reset-password');
    
    // Check page elements
    await expect(page.locator('h1')).toContainText('Reset Password');
    await expect(page.locator('p.subtitle')).toContainText('send you a link');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    
    // Check back to login link (use first() to avoid strict mode violations from navbar)
    await expect(page.locator('a[href="#/auth/login"]').first()).toBeVisible();
  });

  test('should send reset email for existing user', async ({ page }) => {
    // First create a test user
    await page.goto('/#/auth/signup');
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.fill('#confirmPassword', testUser.password);
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 15000 });
    
    // Now test password reset
    await page.goto('/#/auth/reset-password');
    await page.fill('#email', testUser.email);
    await page.click('button[type="submit"]');
    
    // Should show success message
    await expect(page.locator('.alert-success')).toContainText('Check your email', {
      timeout: 5000
    });
  });

  test('should handle non-existent email gracefully', async ({ page }) => {
    await page.goto('/#/auth/reset-password');
    
    await page.fill('#email', 'nonexistent@example.com');
    await page.click('button[type="submit"]');
    
    // Supabase returns success even for non-existent emails (security practice)
    // So we should still see success message
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 });
  });

  test('should disable button after submission', async ({ page }) => {
    await page.goto('/#/auth/reset-password');
    
    await page.fill('#email', testUser.email);
    
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    
    // Button should be disabled
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toContainText('Sending...');
  });

  test('should prevent multiple submissions', async ({ page }) => {
    await page.goto('/#/auth/reset-password');
    
    await page.fill('#email', testUser.email);
    
    const submitButton = page.locator('button[type="submit"]');
    
    // Click once
    await submitButton.click();
    
    // Button should be disabled immediately
    await expect(submitButton).toBeDisabled();
    
    // Wait for success
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 5000 });
    
    // Button should remain disabled after success (preventing multiple submissions)
    await expect(submitButton).toBeDisabled();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/#/auth/reset-password');
    
    // Try invalid email format
    await page.fill('#email', 'not-an-email');
    await page.click('button[type="submit"]');
    
    // HTML5 validation should prevent submission
    const emailInput = page.locator('#email');
    const validationMessage = await emailInput.evaluate((el) => el.validationMessage);
    expect(validationMessage).toBeTruthy();
  });

  test('should navigate back to login', async ({ page }) => {
    await page.goto('/#/auth/reset-password');
    
    await page.click('a[href="#/auth/login"]');
    
    await expect(page).toHaveURL(/.*#\/auth\/login/);
    await expect(page.locator('h1')).toContainText('Sign In');
  });

  test('should require email field', async ({ page }) => {
    await page.goto('/#/auth/reset-password');
    
    // Try to submit without email
    await page.click('button[type="submit"]');
    
    // HTML5 required validation should prevent submission
    const emailInput = page.locator('#email');
    const validationMessage = await emailInput.evaluate((el) => el.validationMessage);
    expect(validationMessage).toContain('fill');
  });
});

