# Test Automation Suite

Automated end-to-end tests for the Race Volunteer Management System using Playwright.

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests with UI mode (recommended for debugging)
```bash
npm run test:ui
```

### Run tests in headed mode (see browser)
```bash
npm run test:headed
```

### Debug a specific test
```bash
npm run test:debug
```

### View test report
```bash
npm run test:report
```

## Test Structure

```
tests/
├── auth/
│   ├── signup.spec.js          # Signup flow tests
│   ├── login.spec.js           # Login flow tests
│   ├── password-reset.spec.js  # Password reset tests
│   └── email-confirmation.spec.js # Email confirmation (partial)
├── integration/
│   └── full-auth-flow.spec.js  # End-to-end user journeys
└── helpers/
    └── test-helpers.js         # Shared test utilities
```

## What's Tested

### ✅ Signup Flow
- Form validation (password mismatch, length requirements)
- Successful account creation
- Duplicate email prevention
- Button states and loading indicators
- Accessibility (labels, form structure)
- Navigation between pages

### ✅ Login Flow
- Successful login with valid credentials
- Error handling for invalid credentials
- Session persistence across page refresh
- Role-based redirect (volunteer vs admin)
- Button states during login

### ✅ Password Reset
- Email submission
- Success message display
- Button disable/enable states
- Email format validation
- Multiple submission prevention
- Navigation flows

### ✅ Integration Tests
- Complete user journey: signup → logout → login
- Sequential flows with state changes
- Cross-feature interactions

## Known Limitations

### Email Confirmation
The email confirmation tests are **partially implemented** because:
- Requires access to actual Supabase auth emails
- Tokens are dynamic and expire
- Would need email inbox integration (Mailinator, etc.) or Supabase admin API

To fully test email confirmation, you need to:
1. Set up email inbox access (e.g., Mailinator API)
2. Or use Supabase admin API to generate test tokens
3. Or mock Supabase auth responses

## Bugs Found

The tests will help identify:
- ❌ Race conditions in async operations
- ❌ Missing error handling
- ❌ Incorrect validation messages
- ❌ Navigation issues
- ❌ State management bugs
- ❌ Accessibility violations

## Configuration

Tests are configured in `playwright.config.js`:
- **Base URL**: http://localhost:5173
- **Workers**: 1 (sequential to avoid Supabase conflicts)
- **Retries**: 0 locally, 2 in CI
- **Screenshots**: On failure only
- **Trace**: On first retry

## Best Practices

1. **Each test generates unique test data** - no conflicts between runs
2. **Tests are independent** - can run in any order
3. **Cleanup is manual** - test users remain in Supabase (add cleanup script if needed)
4. **Console errors are tracked** - helps catch JS errors
5. **Accessibility checks available** - use checkAccessibility() helper

## Adding New Tests

1. Create a new `.spec.js` file in appropriate directory
2. Import helpers from `test-helpers.js`
3. Use descriptive test names
4. Follow existing patterns for consistency
5. Run `npm run test:ui` to debug new tests

## CI/CD Integration

To run in CI:
```yaml
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run tests
  run: npm test
  env:
    CI: true
```

## Troubleshooting

**Tests timing out?**
- Increase timeout in test: `{ timeout: 10000 }`
- Check dev server is running
- Verify Supabase credentials in .env

**Random failures?**
- Check Supabase rate limits
- Ensure single worker (no parallel tests)
- Add waitForTimeout() if needed

**Can't see what's happening?**
- Use `npm run test:headed`
- Or `npm run test:debug` for step-through debugging
- Check screenshots in test-results/ folder

## Future Improvements

- [ ] Add cleanup script to remove test users
- [ ] Integrate with Mailinator for email testing
- [ ] Add visual regression tests
- [ ] Add API-level tests
- [ ] Add performance benchmarks
- [ ] Add accessibility audit to all tests
- [ ] Mock Supabase for faster unit tests

