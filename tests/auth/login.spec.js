import { test, expect } from '@playwright/test';
import { generateTestUser, setupConsoleErrorTracking } from '../helpers/test-helpers.js';

test.describe('User Login Flow', () => {
  let testUser;
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    testUser = generateTestUser();
    consoleErrors = setupConsoleErrorTracking(page);
  });

  test('should display login page correctly', async ({ page }) => {
    await page.goto('/#/auth/login');
    
    // Check page elements
    await expect(page.locator('h1')).toContainText('Sign In');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    
    // Check links (use first() to avoid strict mode violations from navbar links)
    await expect(page.locator('a[href="#/auth/reset-password"]').first()).toBeVisible();
    await expect(page.locator('a[href="#/auth/signup"]').first()).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/#/auth/login');
    
    // Try to login with non-existent user
    await page.fill('#email', 'nonexistent@example.com');
    await page.fill('#password', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    
    // Should show error
    await expect(page.locator('.alert-error')).toBeVisible({ timeout: 5000 });
  });

  test('should successfully login and redirect based on role', async ({ page, context }) => {
    // First create an account
    await page.goto('/#/auth/signup');
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.fill('#confirmPassword', testUser.password);
    await page.click('button[type="submit"]');
    
    // Wait for signup success (database trigger may take time)
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 15000 });
    
    // Sign out
    await page.click('text=Sign Out');
    await page.waitForTimeout(1000);
    
    // Now login
    await page.goto('/#/auth/login');
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.click('button[type="submit"]');
    
    // Should redirect to volunteer page (default role)
    await expect(page).toHaveURL(/.*#\/volunteer/, { timeout: 10000 });
    
    // Should see volunteer navigation
    await expect(page.locator('a[href="#/volunteer"]')).toBeVisible();
    await expect(page.locator('a[href="#/my-signups"]')).toBeVisible();
  });

  test('should disable submit button while logging in', async ({ page }) => {
    await page.goto('/#/auth/login');
    
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    
    // Button should be disabled
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toContainText('Signing in...');
  });

  test('should persist login session on page refresh', async ({ page, context }) => {
    // Create and login
    await page.goto('/#/auth/signup');
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.fill('#confirmPassword', testUser.password);
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 15000 });
    
    // Refresh page
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Should still be logged in
    await expect(page.locator('text=Sign Out')).toBeVisible();
    await expect(page.locator(`text=${testUser.email}`)).toBeVisible();
  });

  test('should navigate to password reset from login', async ({ page }) => {
    await page.goto('/#/auth/login');
    
    await page.click('a[href="#/auth/reset-password"]');
    
    await expect(page).toHaveURL(/.*#\/auth\/reset-password/);
    await expect(page.locator('h1')).toContainText('Reset Password');
  });

  test('should navigate to signup from login', async ({ page }) => {
    await page.goto('/#/auth/login');
    
    await page.click('a[href="#/auth/signup"]');
    
    await expect(page).toHaveURL(/.*#\/auth\/signup/);
    await expect(page.locator('h1')).toContainText('Create Account');
  });
});

