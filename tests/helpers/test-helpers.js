/**
 * Test helper utilities
 */

// Generate unique test email
// Using mailinator.com which accepts all emails and is test-friendly
export function generateTestEmail() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `test-${timestamp}-${random}@mailinator.com`;
}

// Generate test user data
export function generateTestUser() {
  return {
    email: generateTestEmail(),
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User'
  };
}

// Wait for navigation with timeout
export async function waitForNavigation(page, expectedPath, timeout = 5000) {
  await page.waitForURL(`**${expectedPath}`, { timeout });
}

// Clean up test user from Supabase
export async function cleanupTestUser(supabaseUrl, supabaseKey, userId) {
  // This would require admin API access
  // For now, we'll rely on manual cleanup or a separate cleanup script
  console.log(`Cleanup user: ${userId}`);
}

// Check for console errors
export function setupConsoleErrorTracking(page) {
  const errors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  page.on('pageerror', error => {
    errors.push(error.message);
  });
  
  return errors;
}

// Wait for element to be visible and ready
export async function waitForElement(page, selector, timeout = 5000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

// Fill form field with validation
export async function fillFormField(page, selector, value) {
  await page.fill(selector, value);
  await page.blur(selector); // Trigger validation
}

// Check for accessibility violations
export async function checkAccessibility(page) {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  
  return results.violations;
}

