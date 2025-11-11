import { test, expect } from '@playwright/test';
import { generateTestUser, setupConsoleErrorTracking, waitForNavigation } from '../helpers/test-helpers.js';

test.describe('User Signup Flow', () => {
  let testUser;
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    testUser = generateTestUser();
    consoleErrors = setupConsoleErrorTracking(page);
    await page.goto('/');
  });

  test('should display signup page correctly', async ({ page }) => {
    // Navigate to signup
    await page.click('a[href="#/auth/signup"]');
    
    // Wait for signup page to load
    await expect(page.locator('h1')).toContainText('Create Account');
    
    // Check all form fields exist
    await expect(page.locator('#firstName')).toBeVisible();
    await expect(page.locator('#lastName')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
    
    // Check submit button exists
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should validate password mismatch', async ({ page }) => {
    await page.goto('/#/auth/signup');
    
    // Fill form with mismatched passwords
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.fill('#confirmPassword', 'DifferentPassword123!');
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should show error message
    await expect(page.locator('.alert-error')).toContainText('Passwords do not match');
  });

  test('should validate password length', async ({ page }) => {
    await page.goto('/#/auth/signup');
    
    // Fill form with short password
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', '12345');
    await page.fill('#confirmPassword', '12345');
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should show error message
    await expect(page.locator('.alert-error')).toContainText('at least 6 characters');
  });

  test('should successfully create account', async ({ page }) => {
    await page.goto('/#/auth/signup');
    
    // Fill all fields correctly
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.fill('#confirmPassword', testUser.password);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should show success message (wait longer for database trigger to complete)
    await expect(page.locator('.alert-success')).toContainText('Account created successfully', {
      timeout: 15000
    });
    
    // Should redirect to onboarding page
    await waitForNavigation(page, '/#/onboarding', 15000);
    
    // Check no console errors occurred
    expect(consoleErrors.filter(e => !e.includes('Download the'))).toHaveLength(0);
  });

  test('should prevent duplicate email signup', async ({ page }) => {
    // First signup
    await page.goto('/#/auth/signup');
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.fill('#confirmPassword', testUser.password);
    await page.click('button[type="submit"]');
    
    // Wait for success (database trigger may take time)
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 15000 });
    
    await page.waitForURL(/.*#\/onboarding/, { timeout: 15000 });
    
    // Try to signup again with same email
    await page.goto('/#/auth/signup');
    await page.fill('#firstName', 'Another');
    await page.fill('#lastName', 'User');
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.fill('#confirmPassword', testUser.password);
    await page.click('button[type="submit"]');
    
    // Should show error
    await expect(page.locator('.alert-error')).toBeVisible({ timeout: 10000 });
  });

  test('should disable submit button while creating account', async ({ page }) => {
    await page.goto('/#/auth/signup');
    
    // Fill form
    await page.fill('#firstName', testUser.firstName);
    await page.fill('#lastName', testUser.lastName);
    await page.fill('#email', testUser.email);
    await page.fill('#password', testUser.password);
    await page.fill('#confirmPassword', testUser.password);
    
    // Click submit
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    
    // Button should be disabled immediately
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toContainText('Creating account...');
  });

  test('should have accessible form labels', async ({ page }) => {
    await page.goto('/#/auth/signup');
    
    // Check all inputs have associated labels
    const inputs = ['firstName', 'lastName', 'email', 'password', 'confirmPassword'];
    
    for (const id of inputs) {
      const input = page.locator(`#${id}`);
      const label = page.locator(`label[for="${id}"]`);
      
      await expect(input).toBeVisible();
      await expect(label).toBeVisible();
    }
  });

  test('should navigate to login page from signup', async ({ page }) => {
    await page.goto('/#/auth/signup');
    
    // Click "sign in" link
    await page.click('a[href="#/auth/login"]');
    
    // Should navigate to login page
    await expect(page).toHaveURL(/.*#\/auth\/login/);
    await expect(page.locator('h1')).toContainText('Sign In');
  });
});

