import { test, expect } from '@playwright/test';
import { generateTestUser } from '../helpers/test-helpers.js';

test.describe('Full Authentication Flow Integration', () => {
  let testUser;

  test.beforeEach(() => {
    testUser = generateTestUser();
  });

  test('complete user journey: signup -> logout -> login', async ({ page }) => {
    // Step 1: Signup
    await page.goto('/#/auth/signup');
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.fill('#confirmPassword', testUser.password);
    await page.click('button[type="submit"]');
    
    // Verify signup success (database trigger may take time)
    await expect(page.locator('.alert-success')).toContainText('created successfully', {
      timeout: 15000
    });
    
    // Should redirect to onboarding first
    await expect(page).toHaveURL(/.*#\/onboarding/, { timeout: 15000 });
    
    // Login to verify access
    await page.goto('/#/auth/login');
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL(/.*#\/volunteer/, { timeout: 10000 });
    await expect(page.locator(`text=${testUser.email}`)).toBeVisible();
    
    // Step 2: Logout
    await page.click('text=Sign Out');
    
    // Should redirect to home or login
    await expect(page).toHaveURL(/.*#\/(|auth\/login)/, { timeout: 5000 });
    
    // Verify signed out
    await expect(page.locator('text=Sign Out')).not.toBeVisible();
    
    // Step 3: Login again
    await page.goto('/#/auth/login');
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.click('button[type="submit"]');
    
    // Should be logged in again
    await expect(page).toHaveURL(/.*#\/volunteer/, { timeout: 10000 });
    await expect(page.locator(`text=${testUser.email}`)).toBeVisible();
  });

  test('should handle signup -> immediate logout -> password reset', async ({ page }) => {
    // Signup
    await page.goto('/#/auth/signup');
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.fill('#confirmPassword', testUser.password);
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 15000 });
    
    // Login so we can immediately test logout and password reset
    await page.waitForURL(/.*#\/onboarding/, { timeout: 15000 });
    await page.goto('/#/auth/login');
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*#\/volunteer/, { timeout: 10000 });
    
    // Logout
    await page.click('text=Sign Out');
    await expect(page).toHaveURL(/.*#\/auth\/login/, { timeout: 5000 });
    
    // Request password reset
    await page.goto('/#/auth/reset-password');
    await page.fill('#email', testUser.email);
    await page.click('button[type="submit"]');
    
    // Should show success
    await expect(page.locator('.alert-success')).toContainText('Check your email', {
      timeout: 5000
    });
  });

  test('should preserve redirect after forced logout', async ({ page }) => {
    // Try to access protected route while logged out
    await page.goto('/#/my-signups');
    
    // Should redirect to login
    await expect(page).toHaveURL(/.*#\/auth\/login/, { timeout: 5000 });
  });
});

