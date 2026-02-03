# Testing Strategy

This document outlines the testing approach to ensure functionality is maintained even when data flow changes.

## Test Coverage

### Critical Paths Protected by Tests

1. **XML Parser Date Normalization** (`src/data/parsers/__tests__/XMLStreamParser.test.ts`)
   - Ensures dates are correctly normalized for mobile Safari compatibility
   - Preserves valid dates (desktop functionality)
   - Handles various date formats (space-separated, timezone formats)
   - **Why it matters**: Prevents regression when date parsing logic changes

2. **Sleep Data Processing** (`src/utils/__tests__/sleepDataProcessor.test.ts`)
   - Validates sleep session splitting logic
   - Ensures overnight sessions are correctly attributed
   - Prevents duplicate sleep data issues
   - **Why it matters**: Critical for accurate sleep analysis

3. **Report Parsers** (`src/utils/reportParsers/__tests__/`)
   - Validates DEXA and bloodwork parsing
   - Ensures structured data extraction
   - **Why it matters**: Prevents loss of health report data

## Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- XMLStreamParser

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage
```

## Test Execution in CI/CD

Tests are automatically run:

- **Before builds**: `pnpm build` includes `pnpm test`
- **Before commits**: Pre-commit hooks (via husky) run linting and type-checking
- **On PR**: Should be configured in GitHub Actions/CI

## Adding New Tests

When adding new functionality or fixing bugs:

1. **Write tests first** (TDD approach) or immediately after fixing
2. **Test the critical path**: Focus on data parsing, transformations, and business logic
3. **Test edge cases**: Mobile vs desktop, different date formats, empty data, etc.
4. **Keep tests fast**: Unit tests should run quickly (< 1s per test)

### Example: Adding a Test for Date Normalization

```typescript
test("normalizes dates with space separator (mobile Safari format)", () => {
  const parser = createParser();
  const xml = `<HealthData>
    <Record 
      type="HKQuantityTypeIdentifierHeartRate"
      startDate="2025-08-17 17:38:00 -0400"
      endDate="2025-08-17 17:38:00 -0400"
      value="72"
      unit="count/min"
      sourceName="Apple Watch"
      device="Apple Watch"
    />
  </HealthData>`;

  const results = parser.parseString(xml);
  expect(results["HKQuantityTypeIdentifierHeartRate"]).toHaveLength(1);
  const record = results["HKQuantityTypeIdentifierHeartRate"][0];
  // Ensure date is valid and record is extracted
  expect(record.startDate).toBeTruthy();
  expect(new Date(record.startDate).getTime()).not.toBeNaN();
});
```

## Test Maintenance

- **Update tests when behavior changes**: If you change how dates are parsed, update the tests
- **Don't delete tests**: Even if they seem redundant, they protect against regressions
- **Review test failures carefully**: A failing test might indicate a real bug, not just a test issue

## Areas Needing More Tests

Consider adding tests for:

1. **HealthDataProcessor**: Data aggregation and processing logic
2. **CoordinatorService**: Multi-agent analysis orchestration
3. **HealthDataContextWrapper**: Context state management
4. **CSV parsing**: Similar to XML parser tests
5. **Integration tests**: Full data flow from upload to visualization

## Best Practices

1. **Test behavior, not implementation**: Focus on what the code does, not how
2. **Use descriptive test names**: "normalizes dates with space separator" is better than "test1"
3. **Keep tests isolated**: Each test should be independent
4. **Mock external dependencies**: Don't rely on network, file system, or browser APIs in unit tests
5. **Test edge cases**: Empty data, invalid formats, boundary conditions

## Continuous Improvement

- Review test coverage periodically
- Add tests when bugs are found (regression tests)
- Refactor tests when code changes
- Document why tests exist (especially for complex logic)
